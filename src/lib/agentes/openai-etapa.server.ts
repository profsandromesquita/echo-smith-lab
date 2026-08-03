/**
 * Roteamento das etapas Análise Psicológica e Auditoria com provedor OpenAI real (F6C).
 * Revalida consentimento no servidor, monta apenas a entrada autorizada e converte a
 * saída no formato de resultados já usado pelo pipeline.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ConfigOpenAI, ResultadoOpenAI } from "@/lib/agentes/openai-base.server";
import { somarUso } from "@/lib/agentes/openai-base.server";
import {
  auditarLote,
  corrigirLote,
  lotesDe,
  type Avaliacao,
  type ContextoAuditoria,
  type ItemParaAuditoria,
} from "@/lib/agentes/auditor.server";
import { executarAnalisePsicologica, type SaidaPsicologia } from "@/lib/agentes/psicologia.server";
import { MAX_CARACTERES_HEADLINE } from "@/lib/agentes/headline-architect.server";
import { MAX_CARACTERES_HOOK } from "@/lib/agentes/hook-master.server";
import { USO_ZERO, type CodigoErroProvedor, type NivelEsforco, type UsoProvedor } from "@/lib/provedores/tipos";
import type { FatoresRanking } from "@/lib/ranking";

type Cliente = SupabaseClient<Database>;

const ESFORCOS: readonly NivelEsforco[] = ["low", "medium", "high", "xhigh", "max"];

export function normalizarEsforcoOpenAI(valor: unknown, padrao: NivelEsforco): NivelEsforco {
  const v = String(valor ?? padrao) as NivelEsforco;
  return ESFORCOS.includes(v) ? v : padrao;
}

export interface ConfiguracaoEtapaOpenAI {
  provedor: string;
  config: ConfigOpenAI;
}

/** Lê a configuração publicada vinculada à etapa. Nunca lê credenciais do banco. */
export async function lerConfiguracaoOpenAI(
  supabase: Cliente,
  registryVersaoId: string | null,
  esforcoPadrao: NivelEsforco,
): Promise<ConfiguracaoEtapaOpenAI | null> {
  if (!registryVersaoId) return null;
  const { data } = await supabase
    .from("registry_versoes")
    .select("provedor, modelo, instrucoes_sistema, parametros, limite_entrada, limite_saida, timeout_ms")
    .eq("id", registryVersaoId)
    .maybeSingle();
  if (!data) return null;

  const parametros = (data.parametros ?? {}) as Record<string, unknown>;
  return {
    provedor: data.provedor,
    config: {
      modelo: data.modelo,
      instrucoesSistema: data.instrucoes_sistema ?? "",
      esforco: normalizarEsforcoOpenAI(parametros['reasoning_effort'], esforcoPadrao),
      limiteEntrada: data.limite_entrada,
      limiteSaida: data.limite_saida,
      timeoutMs: data.timeout_ms,
    },
  };
}

async function idsDasEtapas(supabase: Cliente, execucaoId: string): Promise<string[]> {
  const { data } = await supabase.from("execucao_etapas").select("id").eq("execucao_id", execucaoId);
  return (data ?? []).map((e) => e.id);
}

/** Diretrizes já persistidas nesta execução (saída do Gatekeeper). */
async function lerDiretrizes(supabase: Cliente, execucaoId: string) {
  const { data } = await supabase
    .from("execucao_resultados")
    .select("payload")
    .in("etapa_id", await idsDasEtapas(supabase, execucaoId))
    .eq("tipo", "diretriz")
    .order("criado_em");

  let resumoGatekeeper: string | null = null;
  let briefingEstruturado: Record<string, string> | null = null;
  let diretrizPsicologica: string | null = null;
  for (const d of data ?? []) {
    const p = (d.payload ?? {}) as Record<string, unknown>;
    if (p['campo'] === "gatekeeper") {
      if (p['resumo']) resumoGatekeeper = String(p['resumo']);
      if (p['briefing_estruturado']) {
        briefingEstruturado = p['briefing_estruturado'] as Record<string, string>;
      }
    }
    if (p['campo'] === "diretriz_estrategica") diretrizPsicologica = String(p['texto'] ?? "");
  }
  return { resumoGatekeeper, briefingEstruturado, diretrizPsicologica };
}

async function lerBriefing(supabase: Cliente, chatId: string | null): Promise<string> {
  if (!chatId) return "";
  const { data } = await supabase
    .from("mensagens")
    .select("texto")
    .eq("chat_id", chatId)
    .eq("autor", "usuario")
    .order("criado_em", { ascending: false })
    .limit(1);
  return data?.[0]?.texto ?? "";
}

// ------------------------------- Análise psicológica -------------------------------

export async function executarEtapaPsicologia(
  supabase: Cliente,
  args: {
    configuracao: ConfiguracaoEtapaOpenAI;
    execucaoId: string;
    chatId: string | null;
    formato: string;
    etapaId: string;
    tentativa: number;
    sinal?: AbortSignal;
  },
): Promise<{ resultado: ResultadoOpenAI<SaidaPsicologia>; modelo: string }> {
  const [briefing, diretrizes] = await Promise.all([
    lerBriefing(supabase, args.chatId),
    lerDiretrizes(supabase, args.execucaoId),
  ]);

  const resultado = await executarAnalisePsicologica({
    config: args.configuracao.config,
    entrada: {
      formato: args.formato,
      briefing,
      resumoGatekeeper: diretrizes.resumoGatekeeper,
      briefingEstruturado: diretrizes.briefingEstruturado,
    },
    chaveIdempotencia: `${args.etapaId}:${args.tentativa}`,
    ...(args.sinal ? { sinal: args.sinal } : {}),
  });

  return { resultado, modelo: args.configuracao.config.modelo };
}

/** Payload persistido: diretriz e leitura psicológica, sem briefing bruto e sem raciocínio. */
export function resultadosDaPsicologia(saida: SaidaPsicologia, modelo: string) {
  return [
    {
      tipo: "diretriz" as const,
      payload: {
        campo: "diretriz_estrategica",
        provedor: "openai",
        modelo,
        texto: saida.diretriz_estrategica,
        publico_profundo: saida.publico_profundo,
        conflito_inconsciente: saida.conflito_inconsciente,
        medo_central: saida.medo_central,
        desejo_central: saida.desejo_central,
        crenca_limitante: saida.crenca_limitante,
        gatilho_emocional: saida.gatilho_emocional,
        objecao_provavel: saida.objecao_provavel,
        sinalizadores: saida.sinalizadores,
      },
    },
  ];
}

// ------------------------------------ Auditoria ------------------------------------

const LIMITE_POR_PAPEL: Record<string, number> = {
  hook_master: MAX_CARACTERES_HOOK,
  headline_architect: MAX_CARACTERES_HEADLINE,
};

function fatoresDaAvaliacao(a: Avaliacao): FatoresRanking {
  return {
    nota_auditor: a.nota_geral,
    objetivo: a.aderencia_objetivo,
    formato: a.adequacao_formato,
    voz_marca: a.adequacao_voz_marca ?? 0,
    sem_cliches: a.ausencia_clicheses,
    confianca: a.confianca,
  };
}

function resultadoAuditoria(
  a: Avaliacao,
  papel: string,
  modelo: string,
  versao: "original" | "corrigida",
  extra: Record<string, unknown> = {},
) {
  return {
    tipo: "auditoria" as const,
    versao,
    aprovado: a.aprovado,
    nota_final: Number(a.nota_geral.toFixed(2)),
    payload: {
      variacao_id: a.variacao_id,
      papel,
      provedor: "openai",
      modelo,
      criterios: fatoresDaAvaliacao(a),
      voz_marca_avaliavel: a.voz_marca_avaliavel,
      adequacao_voz_marca: a.adequacao_voz_marca,
      observacao: a.observacao,
      alertas: a.alertas,
      ...extra,
    },
  };
}

export interface DesfechoAuditoria {
  ok: boolean;
  resultados: Array<Record<string, unknown>>;
  uso: UsoProvedor;
  duracaoMs: number;
  codigo: CodigoErroProvedor | null;
  mensagemSegura: string | null;
  lotesTotal: number;
  lotesFalhos: number;
}

/**
 * Audita em lotes de até 5 variações por formato. A falha de um lote nunca apaga
 * os lotes concluídos; as variações não auditadas ficam fora da entrega e são
 * registradas como tal, sem avaliação inventada.
 */
export async function executarEtapaAuditor(
  supabase: Cliente,
  args: {
    configuracao: ConfiguracaoEtapaOpenAI;
    execucaoId: string;
    formato: string;
    vozAutorizada: boolean;
    etapaId: string;
    tentativa: number;
    sinal?: AbortSignal;
  },
): Promise<{ desfecho: DesfechoAuditoria; modelo: string }> {
  const modelo = args.configuracao.config.modelo;
  const etapas = await idsDasEtapas(supabase, args.execucaoId);
  const { data: variacoes } = await supabase
    .from("execucao_resultados")
    .select("payload")
    .in("etapa_id", etapas)
    .eq("tipo", "variacao")
    .order("criado_em");

  const itens: ItemParaAuditoria[] = (variacoes ?? []).map((r) => {
    const p = (r.payload ?? {}) as Record<string, unknown>;
    return {
      variacao_id: String(p['variacao_id'] ?? p['id'] ?? ""),
      papel: String(p['papel'] ?? ""),
      formato: String(p['formato'] ?? args.formato),
      texto: String(p['texto'] ?? ""),
    };
  }).filter((i) => i.variacao_id && i.texto);

  const diretrizes = await lerDiretrizes(supabase, args.execucaoId);

  let vozMarca: ContextoAuditoria["vozMarca"] = null;
  if (args.vozAutorizada) {
    const { data: perfil } = await supabase
      .from("perfis_marca")
      .select("nome, tom_de_voz, posicionamento")
      .eq("padrao", true)
      .maybeSingle();
    vozMarca = perfil ?? null;
  }

  const contexto: ContextoAuditoria = {
    formato: args.formato,
    diretrizPsicologica: diretrizes.diretrizPsicologica,
    vozMarca,
  };

  const resultados: Array<Record<string, unknown>> = [];
  let uso = USO_ZERO;
  let duracaoMs = 0;
  let lotesTotal = 0;
  let lotesFalhos = 0;
  let lotesOk = 0;
  let ultimoCodigo: CodigoErroProvedor | null = null;
  let ultimaMensagem: string | null = null;
  const auditados = new Set<string>();

  // agrupa por papel (formato) e depois em lotes de 5
  const porPapel = new Map<string, ItemParaAuditoria[]>();
  for (const i of itens) {
    const lista = porPapel.get(i.papel) ?? [];
    lista.push(i);
    porPapel.set(i.papel, lista);
  }

  for (const [papel, lista] of porPapel) {
    const limite = LIMITE_POR_PAPEL[papel] ?? MAX_CARACTERES_HEADLINE;
    let indice = 0;

    for (const lote of lotesDe(lista)) {
      indice += 1;
      lotesTotal += 1;
      const r = await auditarLote({
        config: args.configuracao.config,
        contexto,
        itens: lote,
        versao: "original",
        chaveIdempotencia: `${args.etapaId}:${args.tentativa}:${papel}:${indice}`,
        ...(args.sinal ? { sinal: args.sinal } : {}),
      });
      uso = somarUso(uso, r.uso);
      duracaoMs += r.duracaoMs;

      if (!r.ok) {
        lotesFalhos += 1;
        ultimoCodigo = r.codigo;
        ultimaMensagem = r.mensagemSegura;
        continue;
      }
      lotesOk += 1;

      for (const a of r.dados.avaliacoes) {
        auditados.add(a.variacao_id);
        resultados.push(resultadoAuditoria(a, papel, modelo, "original"));
      }

      // correção única das reprovadas do lote, seguida de uma única reauditoria
      const reprovadas = r.dados.avaliacoes.filter((a) => !a.aprovado);
      if (reprovadas.length === 0) continue;

      const paraCorrigir = reprovadas
        .map((a) => {
          const item = lote.find((i) => i.variacao_id === a.variacao_id);
          return item ? { ...item, observacao: a.observacao } : null;
        })
        .filter((i): i is ItemParaAuditoria & { observacao: string } => i !== null);
      if (paraCorrigir.length === 0) continue;

      const c = await corrigirLote({
        config: args.configuracao.config,
        contexto,
        itens: paraCorrigir,
        maxCaracteres: limite,
        chaveIdempotencia: `${args.etapaId}:${args.tentativa}:${papel}:${indice}:correcao`,
        ...(args.sinal ? { sinal: args.sinal } : {}),
      });
      uso = somarUso(uso, c.uso);
      duracaoMs += c.duracaoMs;
      if (!c.ok) continue;

      for (const cor of c.dados.correcoes) {
        const antes = paraCorrigir.find((i) => i.variacao_id === cor.variacao_id);
        resultados.push({
          tipo: "correcao" as const,
          versao: "corrigida" as const,
          payload: {
            variacao_id: cor.variacao_id,
            papel,
            provedor: "openai",
            modelo,
            texto_antes: antes?.texto ?? "",
            texto: cor.texto,
            motivo: cor.motivo,
            tentativa: 1,
          },
        });
      }

      const corrigidos: ItemParaAuditoria[] = c.dados.correcoes.map((cor) => ({
        variacao_id: cor.variacao_id,
        papel,
        formato: paraCorrigir.find((i) => i.variacao_id === cor.variacao_id)?.formato ?? args.formato,
        texto: cor.texto,
      }));

      const re = await auditarLote({
        config: args.configuracao.config,
        contexto,
        itens: corrigidos,
        versao: "corrigida",
        chaveIdempotencia: `${args.etapaId}:${args.tentativa}:${papel}:${indice}:reauditoria`,
        ...(args.sinal ? { sinal: args.sinal } : {}),
      });
      uso = somarUso(uso, re.uso);
      duracaoMs += re.duracaoMs;
      if (!re.ok) continue;

      for (const a of re.dados.avaliacoes) {
        resultados.push(
          resultadoAuditoria(a, papel, modelo, "corrigida", { correcao_esgotada: !a.aprovado }),
        );
      }
    }
  }

  // variações que ficaram sem auditoria por falha de lote: nunca recebem nota inventada
  for (const i of itens) {
    if (auditados.has(i.variacao_id)) continue;
    resultados.push({
      tipo: "auditoria" as const,
      versao: "original" as const,
      aprovado: false,
      payload: {
        variacao_id: i.variacao_id,
        papel: i.papel,
        provedor: "openai",
        modelo,
        nao_auditada: true,
        observacao:
          "Lote de auditoria falhou. A variação não foi avaliada e fica fora da curadoria desta execução.",
      },
    });
  }

  return {
    modelo,
    desfecho: {
      ok: lotesTotal === 0 || lotesOk > 0,
      resultados,
      uso,
      duracaoMs,
      codigo: lotesOk > 0 ? null : ultimoCodigo,
      mensagemSegura: lotesOk > 0 ? null : ultimaMensagem,
      lotesTotal,
      lotesFalhos,
    },
  };
}