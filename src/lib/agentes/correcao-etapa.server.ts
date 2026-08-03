/**
 * Correção única (F6D): cada variação reprovada volta ao especialista de origem
 * no provedor Anthropic. O servidor decide quem é elegível, em que ordem e com
 * que orçamento; o modelo apenas reescreve o texto dos identificadores enviados.
 */

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  executarEstruturadoAnthropic,
  type ConfigEspecialista,
} from "@/lib/agentes/especialista-base.server";
import { normalizarEsforco } from "@/lib/agentes/especialista-etapa.server";
import { MAX_CARACTERES_HOOK } from "@/lib/agentes/hook-master.server";
import { MAX_CARACTERES_HEADLINE } from "@/lib/agentes/headline-architect.server";
import { MAX_CARACTERES_CTA } from "@/lib/agentes/cta-specialist.server";
import { USO_ZERO, type CodigoErroProvedor, type UsoProvedor } from "@/lib/provedores/tipos";
import { lerVersaoDaExecucao } from "@/lib/agentes/registry-etapa.server";

type Cliente = SupabaseClient<Database>;

export const LIMITE_CARACTERES: Record<string, number> = {
  hook_master: MAX_CARACTERES_HOOK,
  headline_architect: MAX_CARACTERES_HEADLINE,
  cta_specialist: MAX_CARACTERES_CTA,
};

const INSTRUCOES_CORRECAO = [
  "Você é o especialista que escreveu as variações reprovadas por uma auditoria independente.",
  "Aplique UMA única correção em cada variação recebida, resolvendo apenas o problema apontado.",
  "Preserve a intenção, o formato e o sentido original; não troque o ângulo por outro.",
  "Devolva exatamente os mesmos identificadores recebidos, sem inventar, omitir ou duplicar nenhum.",
  "Não avalie, não atribua notas e não crie variações novas.",
].join(" ");

function schemaCorrecao(ids: string[], maxCaracteres: number): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["correcoes"],
    properties: {
      correcoes: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["variacao_id", "texto", "motivo"],
          properties: {
            variacao_id: { type: "string", enum: ids },
            texto: { type: "string", maxLength: maxCaracteres },
            motivo: { type: "string" },
          },
        },
      },
    },
  };
}

function validador(ids: string[], maxCaracteres: number) {
  const esperado = [...ids].sort().join("|");
  return z
    .object({
      correcoes: z
        .array(
          z
            .object({
              variacao_id: z.string().trim().min(1).max(80),
              texto: z.string().trim().min(1).max(maxCaracteres),
              motivo: z.string().trim().max(400),
            })
            .strict(),
        )
        .min(1)
        .max(20),
    })
    .strict()
    .refine(
      (d) => d.correcoes.map((c) => c.variacao_id).sort().join("|") === esperado,
      "identificadores corrigidos diferentes dos enviados",
    );
}

interface Reprovada {
  variacao_id: string;
  papel: string;
  formato: string;
  texto: string;
  observacao: string;
  nota: number;
}

export interface DesfechoCorrecao {
  ok: boolean;
  resultados: Array<Record<string, unknown>>;
  uso: UsoProvedor;
  duracaoMs: number;
  codigo: CodigoErroProvedor | null;
  mensagemSegura: string | null;
  lotesTotal: number;
  lotesFalhos: number;
  semOrcamento: number;
  modelos: string[];
}

async function idsDasEtapas(supabase: Cliente, execucaoId: string): Promise<string[]> {
  const { data } = await supabase.from("execucao_etapas").select("id").eq("execucao_id", execucaoId);
  return (data ?? []).map((e) => e.id);
}

/** Estado autoritativo do servidor: quem foi reprovado e ainda não teve correção. */
async function lerReprovadas(
  supabase: Cliente,
  execucaoId: string,
  formatoExec: string,
): Promise<Reprovada[]> {
  const etapas = await idsDasEtapas(supabase, execucaoId);
  const { data } = await supabase
    .from("execucao_resultados")
    .select("tipo, payload, versao, aprovado, nota_final")
    .in("etapa_id", etapas)
    .order("criado_em");

  const variacoes = new Map<string, { papel: string; formato: string; texto: string }>();
  const reprovadas = new Map<string, { observacao: string; nota: number; papel: string }>();
  const jaCorrigidas = new Set<string>();

  for (const r of data ?? []) {
    const p = (r.payload ?? {}) as Record<string, unknown>;
    const id = String(p['variacao_id'] ?? p['id'] ?? "");
    if (!id) continue;
    if (r.tipo === "variacao") {
      variacoes.set(id, {
        papel: String(p['papel'] ?? ""),
        formato: String(p['formato'] ?? formatoExec),
        texto: String(p['texto'] ?? ""),
      });
    } else if (r.tipo === "correcao") {
      jaCorrigidas.add(id);
    } else if (r.tipo === "auditoria" && r.versao === "original") {
      if (p['nao_auditada'] === true) {
        reprovadas.delete(id);
        continue;
      }
      if (r.aprovado === false) {
        reprovadas.set(id, {
          observacao: String(p['observacao'] ?? ""),
          nota: Number(r.nota_final ?? 0),
          papel: String(p['papel'] ?? ""),
        });
      } else {
        reprovadas.delete(id);
      }
    }
  }

  const lista: Reprovada[] = [];
  for (const [id, a] of reprovadas) {
    if (jaCorrigidas.has(id)) continue;
    const v = variacoes.get(id);
    if (!v || !v.texto) continue;
    lista.push({
      variacao_id: id,
      papel: v.papel || a.papel,
      formato: v.formato,
      texto: v.texto,
      observacao: a.observacao,
      nota: a.nota,
    });
  }
  // ordem determinística: pior nota primeiro, desempate pelo identificador
  lista.sort((x, y) => x.nota - y.nota || x.variacao_id.localeCompare(y.variacao_id));
  return lista;
}

/** Configuração publicada do especialista de origem, vinculada a esta execução. */
async function configuracaoDoEspecialista(
  supabase: Cliente,
  execucaoId: string,
  papel: string,
): Promise<{ provedor: string; config: ConfigEspecialista; orcamento: number } | null> {
  const versao = await lerVersaoDaExecucao(supabase, execucaoId, papel);
  if (!versao) return null;

  return {
    provedor: versao.provedor,
    orcamento: versao.orcamentoEstimado,
    config: {
      modelo: versao.modelo,
      instrucoesSistema: versao.instrucoesSistema,
      esforco: normalizarEsforco(versao.parametros['effort']),
      limiteEntrada: versao.limiteEntrada,
      limiteSaida: versao.limiteSaida,
      timeoutMs: versao.timeoutMs,
    },
  };
}

/**
 * Uma correção por variação reprovada, agrupada pelo especialista de origem.
 * A falha de um grupo nunca apaga os grupos já corrigidos.
 */
export async function executarEtapaCorrecao(
  supabase: Cliente,
  args: {
    execucaoId: string;
    formato: string;
    etapaId: string;
    tentativa: number;
    diretrizPsicologica: string | null;
    sinal?: AbortSignal;
  },
): Promise<DesfechoCorrecao> {
  const reprovadas = await lerReprovadas(supabase, args.execucaoId, args.formato);

  const resultados: Array<Record<string, unknown>> = [];
  const modelos = new Set<string>();
  let uso = USO_ZERO;
  let duracaoMs = 0;
  let lotesTotal = 0;
  let lotesFalhos = 0;
  let lotesOk = 0;
  let semOrcamento = 0;
  let ultimoCodigo: CodigoErroProvedor | null = null;
  let ultimaMensagem: string | null = null;

  const porPapel = new Map<string, Reprovada[]>();
  for (const r of reprovadas) {
    const lista = porPapel.get(r.papel) ?? [];
    lista.push(r);
    porPapel.set(r.papel, lista);
  }

  for (const [papel, lista] of [...porPapel.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const cfg = await configuracaoDoEspecialista(supabase, args.execucaoId, papel);
    if (!cfg || cfg.provedor !== "anthropic") continue;
    modelos.add(cfg.config.modelo);

    const limite = LIMITE_CARACTERES[papel] ?? MAX_CARACTERES_HEADLINE;
    const custo = Number(((cfg.orcamento / 5) * lista.length).toFixed(4));
    const chave = `correcao:${papel}:${args.etapaId}:${args.tentativa}`;

    // reserva atômica e autoritativa no servidor: sem orçamento, sem chamada
    const { data: reservado } = await supabase.rpc("reservar_custo", {
      _execucao_id: args.execucaoId,
      _etapa_id: args.etapaId,
      _chave: chave,
      _custo: custo,
    });
    if (reservado !== true) {
      semOrcamento += lista.length;
      for (const r of lista) {
        resultados.push({
          tipo: "correcao" as const,
          versao: "corrigida" as const,
          payload: {
            variacao_id: r.variacao_id,
            papel,
            provedor: "anthropic",
            texto_antes: r.texto,
            texto: r.texto,
            aplicada: false,
            motivo: "Orçamento da execução esgotado. A correção não foi executada.",
            correcao_esgotada: true,
            tentativa: 1,
          },
        });
      }
      continue;
    }

    const ids = lista.map((r) => r.variacao_id);
    lotesTotal += 1;

    const r = await executarEstruturadoAnthropic<{
      correcoes: Array<{ variacao_id: string; texto: string; motivo: string }>;
    }>({
      config: cfg.config,
      conteudoUsuario: `<conteudo_usuario>\n${JSON.stringify({
        formato_solicitado: args.formato,
        diretriz_psicologica: args.diretrizPsicologica,
        limite_caracteres: limite,
        variacoes_reprovadas: lista.map((v) => ({
          variacao_id: v.variacao_id,
          texto: v.texto,
          observacao_da_auditoria: v.observacao,
        })),
      }).slice(0, Math.max(Math.min(cfg.config.limiteEntrada, 40000), 500))}\n</conteudo_usuario>`,
      instrucoesPapel: INSTRUCOES_CORRECAO,
      nomeSchema: "correcao_unica_especialista",
      schema: schemaCorrecao(ids, limite),
      validador: validador(ids, limite),
      chaveIdempotencia: chave,
      ...(args.sinal ? { sinal: args.sinal } : {}),
    });

    uso = {
      tokensEntrada: uso.tokensEntrada + r.uso.tokensEntrada,
      tokensSaida: uso.tokensSaida + r.uso.tokensSaida,
      custoUsd: Number((uso.custoUsd + r.uso.custoUsd).toFixed(6)),
    };
    duracaoMs += r.duracaoMs;
    await supabase.rpc("reconciliar_custo", {
      _execucao_id: args.execucaoId,
      _chave: chave,
      _custo_real: r.uso.custoUsd,
    });

    if (!r.ok) {
      lotesFalhos += 1;
      ultimoCodigo = r.codigo;
      ultimaMensagem = r.mensagemSegura;
      continue;
    }
    lotesOk += 1;

    for (const c of r.dados.correcoes) {
      const antes = lista.find((v) => v.variacao_id === c.variacao_id);
      resultados.push({
        tipo: "correcao" as const,
        versao: "corrigida" as const,
        payload: {
          variacao_id: c.variacao_id,
          papel,
          provedor: "anthropic",
          modelo: cfg.config.modelo,
          texto_antes: antes?.texto ?? "",
          texto: c.texto.slice(0, limite),
          motivo: c.motivo,
          aplicada: true,
          tentativa: 1,
        },
      });
    }
  }

  return {
    ok: lotesTotal === 0 || lotesOk > 0,
    resultados,
    uso,
    duracaoMs,
    codigo: lotesOk > 0 ? null : ultimoCodigo,
    mensagemSegura: lotesOk > 0 ? null : ultimaMensagem,
    lotesTotal,
    lotesFalhos,
    semOrcamento,
    modelos: [...modelos],
  };
}