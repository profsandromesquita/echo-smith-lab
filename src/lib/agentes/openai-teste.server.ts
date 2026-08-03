/**
 * Teste administrativo dos papéis OpenAI de F6C (análise psicológica e auditoria).
 * Usa conteúdo sintético, não cria execução de usuário nem fotografia de consentimento.
 */

import { auditarLote, type ItemParaAuditoria } from "@/lib/agentes/auditor.server";
import { executarAnalisePsicologica } from "@/lib/agentes/psicologia.server";
import { normalizarEsforcoOpenAI } from "@/lib/agentes/openai-etapa.server";
import type { ConfigOpenAI } from "@/lib/agentes/openai-base.server";
import type { NivelEsforco } from "@/lib/provedores/tipos";

const BRIEFING_SINTETICO =
  "Psicóloga clínica atende adultos com burnout. Quer anúncios para agendamento de primeira sessão.";

const VARIACOES_SINTETICAS: ItemParaAuditoria[] = [
  {
    variacao_id: "teste-1",
    papel: "hook_master",
    formato: "hook",
    texto: "Você não está sem disciplina. Você está sem permissão.",
  },
  {
    variacao_id: "teste-2",
    papel: "hook_master",
    formato: "hook",
    texto: "O cansaço que não passa dormindo tem outro nome.",
  },
];

export interface VersaoOpenAIParaTeste {
  provedor: string;
  modelo: string;
  instrucoes_sistema: string | null;
  parametros: unknown;
  limite_entrada: number;
  limite_saida: number;
  timeout_ms: number;
}

function montarConfig(versao: VersaoOpenAIParaTeste, esforco: NivelEsforco): ConfigOpenAI {
  return {
    modelo: versao.modelo,
    instrucoesSistema: versao.instrucoes_sistema ?? "",
    esforco,
    limiteEntrada: versao.limite_entrada,
    limiteSaida: versao.limite_saida,
    timeoutMs: versao.timeout_ms,
  };
}

async function rodar(
  papel: "analise_psicologica" | "auditor",
  versao: VersaoOpenAIParaTeste,
  esforco: NivelEsforco,
) {
  const config = montarConfig(versao, esforco);
  const chave = `teste-admin:${papel}:${esforco}:${Date.now()}`;

  if (papel === "analise_psicologica") {
    const r = await executarAnalisePsicologica({
      config,
      entrada: {
        formato: "hook",
        briefing: BRIEFING_SINTETICO,
        resumoGatekeeper: "Público, dor e promessa identificados no briefing.",
        briefingEstruturado: null,
      },
      chaveIdempotencia: chave,
    });
    return {
      esforco,
      ok: r.ok,
      duracao_ms: r.duracaoMs,
      tokens_entrada: r.uso.tokensEntrada,
      tokens_saida: r.uso.tokensSaida,
      custo_usd: r.uso.custoUsd,
      saidas: r.ok ? 1 : 0,
      codigo_erro: r.ok ? null : r.codigo,
    };
  }

  const r = await auditarLote({
    config,
    contexto: {
      formato: "hook",
      diretrizPsicologica:
        "Nomear o conflito entre a necessidade de descanso e a crença de que parar é falhar.",
      vozMarca: null,
    },
    itens: VARIACOES_SINTETICAS,
    versao: "original",
    chaveIdempotencia: chave,
  });
  return {
    esforco,
    ok: r.ok,
    duracao_ms: r.duracaoMs,
    tokens_entrada: r.uso.tokensEntrada,
    tokens_saida: r.uso.tokensSaida,
    custo_usd: r.uso.custoUsd,
    saidas: r.ok ? r.dados.avaliacoes.length : 0,
    codigo_erro: r.ok ? null : r.codigo,
  };
}

export async function testarPapelOpenAISintetico(
  papel: "analise_psicologica" | "auditor",
  versao: VersaoOpenAIParaTeste,
  esforcoComparado: NivelEsforco | null,
) {
  const parametros = (versao.parametros ?? {}) as Record<string, unknown>;
  const principal = normalizarEsforcoOpenAI(
    parametros['reasoning_effort'],
    papel === "auditor" ? "high" : "medium",
  );

  const execucoes = [await rodar(papel, versao, principal)];
  if (esforcoComparado && esforcoComparado !== principal) {
    execucoes.push(await rodar(papel, versao, esforcoComparado));
  }

  const total = execucoes.reduce(
    (acc, e) => ({
      duracao_ms: acc.duracao_ms + e.duracao_ms,
      custo_usd: Number((acc.custo_usd + e.custo_usd).toFixed(6)),
      tokens_entrada: acc.tokens_entrada + e.tokens_entrada,
      tokens_saida: acc.tokens_saida + e.tokens_saida,
    }),
    { duracao_ms: 0, custo_usd: 0, tokens_entrada: 0, tokens_saida: 0 },
  );

  return {
    ok: execucoes.every((e) => e.ok),
    provedor: versao.provedor,
    modelo: versao.modelo,
    duracao_ms: total.duracao_ms,
    tokens_entrada: total.tokens_entrada,
    tokens_saida: total.tokens_saida,
    custo_usd: total.custo_usd,
    saidas: execucoes[0]?.saidas ?? 0,
    codigo_erro: execucoes.find((e) => !e.ok)?.codigo_erro ?? null,
    comparacao: execucoes,
  };
}