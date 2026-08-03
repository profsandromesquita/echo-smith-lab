/**
 * Adaptador direto da API oficial da Anthropic (Messages API).
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

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const VERSAO_API = "2023-06-01";

/** Preço oficial por 1M de tokens (Claude Fable 5). */
const PRECO: Record<string, { entrada: number; saida: number }> = {
  "claude-fable-5": { entrada: 10, saida: 50 },
};

function calcularCusto(modelo: string, entrada: number, saida: number): number {
  const p = PRECO[modelo];
  if (!p) return 0;
  return Number(((entrada * p.entrada + saida * p.saida) / 1_000_000).toFixed(6));
}

function lerUso(modelo: string, uso: unknown): UsoProvedor {
  const u = (uso ?? {}) as { input_tokens?: number; output_tokens?: number };
  const entrada = Number(u.input_tokens ?? 0);
  const saida = Number(u.output_tokens ?? 0);
  return { tokensEntrada: entrada, tokensSaida: saida, custoUsd: calcularCusto(modelo, entrada, saida) };
}

function classificarHttp(status: number, codigo: string): CodigoErroProvedor {
  if (status === 401 || status === 403) return "credencial_invalida";
  if (status === 429) return "rate_limit";
  if (status === 404) return "modelo_indisponivel";
  if (status === 400 && /model/i.test(codigo)) return "modelo_indisponivel";
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

/** Concatena apenas blocos de texto da resposta. Raciocínio do modelo é ignorado. */
function lerTexto(corpo: unknown): string {
  const c = corpo as { content?: Array<{ type?: string; text?: string }> };
  return (c.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
}

export function criarProvedorAnthropic(): ProvedorLLM {
  return {
    nome: "anthropic",
    async gerarEstruturado(config: ConfiguracaoChamada): Promise<RespostaProvedor> {
      const inicio = Date.now();
      const chave = process.env['ANTHROPIC_API_KEY'];
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
            "x-api-key": chave,
            "anthropic-version": VERSAO_API,
            "Idempotency-Key": config.chaveIdempotencia,
          },
          body: JSON.stringify({
            model: config.modelo,
            // instruções do sistema separadas do conteúdo do usuário
            system: config.instrucoesSistema,
            messages: [{ role: "user", content: config.conteudoUsuario }],
            max_tokens: config.limiteSaida,
            output_config: {
              effort: config.esforcoRaciocinio,
              format: {
                type: "json_schema",
                name: config.nomeSchema,
                schema: config.schemaSaida,
              },
            },
          }),
        });

        const duracaoMs = Date.now() - inicio;
        const corpo = (await resposta.json().catch(() => null)) as Record<string, unknown> | null;

        if (!resposta.ok) {
          const erro = (corpo?.['error'] ?? {}) as { type?: string; message?: string };
          return falha(classificarHttp(resposta.status, String(erro.type ?? "")), duracaoMs);
        }

        const uso = lerUso(config.modelo, corpo?.['usage']);
        const motivo = String(corpo?.['stop_reason'] ?? "");

        if (motivo === "refusal") return falha("provider_refusal", duracaoMs, uso);
        // max_tokens invalida o JSON estruturado: descartamos sem tentar reparar
        if (motivo === "max_tokens") return falha("saida_truncada", duracaoMs, uso);
        if (motivo !== "end_turn" && motivo !== "stop_sequence") {
          return falha("stop_reason_inesperado", duracaoMs, uso);
        }

        const texto = lerTexto(corpo);
        if (!texto) return falha("resposta_invalida", duracaoMs, uso);

        try {
          return { ok: true, dados: JSON.parse(texto) as unknown, uso, duracaoMs };
        } catch {
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