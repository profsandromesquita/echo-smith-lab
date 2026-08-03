/**
 * Adaptador direto da API oficial da OpenAI (endpoint /v1/responses).
 * Executa somente no servidor. A credencial vive em Cloud Secrets e nunca sai daqui:
 * não é registrada em log, não vai para o banco e não é devolvida ao cliente.
 */

import {
  MENSAGEM_SEGURA,
  USO_ZERO,
  type CodigoErroProvedor,
  type ConfiguracaoChamada,
  type ProvedorLLM,
  type RespostaProvedor,
  type UsoProvedor,
} from "@/lib/provedores/tipos";

const ENDPOINT = "https://api.openai.com/v1/responses";

/** Preço oficial por 1M de tokens (GPT-5.6 Sol). */
const PRECO: Record<string, { entrada: number; cache: number; saida: number }> = {
  "gpt-5.6": { entrada: 5, cache: 0.5, saida: 30 },
  "gpt-5.6-sol": { entrada: 5, cache: 0.5, saida: 30 },
};

function calcularCusto(modelo: string, entrada: number, cache: number, saida: number): number {
  const p = PRECO[modelo];
  if (!p) return 0;
  const naoCache = Math.max(entrada - cache, 0);
  const total = (naoCache * p.entrada + cache * p.cache + saida * p.saida) / 1_000_000;
  return Number(total.toFixed(6));
}

function lerUso(modelo: string, uso: unknown): UsoProvedor {
  const u = (uso ?? {}) as {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
  const entrada = Number(u.input_tokens ?? 0);
  const saida = Number(u.output_tokens ?? 0);
  const cache = Number(u.input_tokens_details?.cached_tokens ?? 0);
  return { tokensEntrada: entrada, tokensSaida: saida, custoUsd: calcularCusto(modelo, entrada, cache, saida) };
}

function classificarHttp(status: number, codigo: string): CodigoErroProvedor {
  if (status === 401 || status === 403) return "credencial_invalida";
  if (status === 429) return "rate_limit";
  if (status === 404) return "modelo_indisponivel";
  if (status === 400 && /model/i.test(codigo)) return "modelo_indisponivel";
  if (status === 400 || status === 422) return "provider_error";
  return "provider_error";
}

function falha(
  codigo: CodigoErroProvedor,
  duracaoMs: number,
  uso: UsoProvedor = USO_ZERO,
  incerto = false,
): RespostaProvedor {
  return { ok: false, codigo, mensagemSegura: MENSAGEM_SEGURA[codigo], uso, duracaoMs, incerto };
}

/** Extrai texto estruturado ou recusa explícita da resposta do endpoint /v1/responses. */
function lerSaida(corpo: unknown): { texto?: string; recusa?: string } {
  const c = corpo as {
    output_text?: string;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
  };
  for (const item of c.output ?? []) {
    for (const parte of item.content ?? []) {
      if (parte.type === "refusal" && parte.refusal) return { recusa: parte.refusal };
      if (parte.type === "output_text" && parte.text) return { texto: parte.text };
    }
  }
  if (typeof c.output_text === "string" && c.output_text.length > 0) return { texto: c.output_text };
  return {};
}

export function criarProvedorOpenAI(): ProvedorLLM {
  return {
    nome: "openai",
    async gerarEstruturado(config: ConfiguracaoChamada): Promise<RespostaProvedor> {
      const inicio = Date.now();
      const chave = process.env['OPENAI_API_KEY'];
      if (!chave) return falha("credencial_ausente", 0);

      const controlador = new AbortController();
      const relogio = setTimeout(() => controlador.abort(), config.timeoutMs);
      const abortarExterno = () => controlador.abort();
      config.sinal?.addEventListener("abort", abortarExterno);

      try {
        const resposta = await fetch(ENDPOINT, {
          method: "POST",
          signal: controlador.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${chave}`,
            "Idempotency-Key": config.chaveIdempotencia,
          },
          body: JSON.stringify({
            model: config.modelo,
            // instruções do sistema separadas do conteúdo do usuário
            instructions: config.instrucoesSistema,
            input: [{ role: "user", content: config.conteudoUsuario }],
            // escala de esforço repassada como configurada na versão publicada
            reasoning: { effort: config.esforcoRaciocinio },
            max_output_tokens: config.limiteSaida,
            text: {
              format: {
                type: "json_schema",
                name: config.nomeSchema,
                strict: true,
                schema: config.schemaSaida,
              },
            },
            store: false,
          }),
        });

        const duracaoMs = Date.now() - inicio;
        const corpo = (await resposta.json().catch(() => null)) as Record<string, unknown> | null;

        if (!resposta.ok) {
          const erro = (corpo?.['error'] ?? {}) as { code?: string; type?: string };
          return falha(classificarHttp(resposta.status, String(erro.code ?? erro.type ?? "")), duracaoMs);
        }

        const uso = lerUso(config.modelo, corpo?.['usage']);
        const status = String(corpo?.['status'] ?? "");
        const { texto, recusa } = lerSaida(corpo);

        if (recusa) return falha("provider_refusal", duracaoMs, uso);
        if (status === "incomplete" || !texto) return falha("resposta_invalida", duracaoMs, uso);

        try {
          return { ok: true, dados: JSON.parse(texto) as unknown, uso, duracaoMs };
        } catch {
          // nunca tentamos reparar JSON manualmente
          return falha("resposta_invalida", duracaoMs, uso);
        }
      } catch (e) {
        const duracaoMs = Date.now() - inicio;
        const abortado = (e as { name?: string } | null)?.name === "AbortError";
        if (abortado && config.sinal?.aborted) return falha("cancelado", duracaoMs);
        if (abortado) return falha("timeout", duracaoMs);
        return falha("provider_error", duracaoMs);
      } finally {
        clearTimeout(relogio);
        config.sinal?.removeEventListener("abort", abortarExterno);
      }
    },
  };
}