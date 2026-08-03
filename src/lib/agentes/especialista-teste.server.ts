/**
 * Teste administrativo de um rascunho de especialista com provedor real.
 * Usa briefing sintético, não cria execução de usuário nem fotografia de consentimento.
 * Permite comparar dois níveis de esforço na mesma versão.
 */

import { executarHeadlineArchitect } from "@/lib/agentes/headline-architect.server";
import { executarHookMaster } from "@/lib/agentes/hook-master.server";
import { executarCtaSpecialist } from "@/lib/agentes/cta-specialist.server";
import type { EntradaEspecialista } from "@/lib/agentes/especialista-base.server";
import { normalizarEsforco } from "@/lib/agentes/especialista-etapa.server";
import type { NivelEsforco } from "@/lib/provedores/tipos";

const ENTRADA_SINTETICA: EntradaEspecialista = {
  formato: "hook",
  briefing:
    "Psicóloga clínica atende adultos com burnout. Quer anúncios para agendamento de primeira sessão.",
  diretrizPsicologica:
    "Nomear o conflito entre a necessidade de descanso e a crença de que parar é falhar.",
  vozMarca: null,
  parametros: { formato: "hook" },
};

export interface VersaoEspecialistaParaTeste {
  provedor: string;
  modelo: string;
  instrucoes_sistema: string | null;
  parametros: unknown;
  limite_entrada: number;
  limite_saida: number;
  timeout_ms: number;
}

type PapelTestavel = "hook_master" | "headline_architect" | "cta_specialist";

async function rodar(
  papel: PapelTestavel,
  versao: VersaoEspecialistaParaTeste,
  esforco: NivelEsforco,
  formato: string,
) {
  const config = {
    modelo: versao.modelo,
    instrucoesSistema: versao.instrucoes_sistema ?? "",
    esforco,
    limiteEntrada: versao.limite_entrada,
    limiteSaida: versao.limite_saida,
    timeoutMs: versao.timeout_ms,
  };
  const entrada = { ...ENTRADA_SINTETICA, formato, parametros: { formato } };
  const args = { config, entrada, chaveIdempotencia: `teste-admin:${esforco}:${Date.now()}` };
  if (papel === "cta_specialist") {
    const r = await executarCtaSpecialist(args);
    return {
      esforco,
      ok: r.ok,
      duracao_ms: r.duracaoMs,
      tokens_entrada: r.uso.tokensEntrada,
      tokens_saida: r.uso.tokensSaida,
      custo_usd: r.uso.custoUsd,
      saidas: r.ok ? r.dados.variacoes.length : 0,
      codigo_erro: r.ok ? null : r.codigo,
    };
  }

  const r =
    papel === "hook_master"
      ? await executarHookMaster(args)
      : await executarHeadlineArchitect(args);

  return {
    esforco,
    ok: r.ok,
    duracao_ms: r.duracaoMs,
    tokens_entrada: r.uso.tokensEntrada,
    tokens_saida: r.uso.tokensSaida,
    custo_usd: r.uso.custoUsd,
    saidas: r.ok ? r.variacoes.length : 0,
    codigo_erro: r.ok ? null : r.codigo,
  };
}

export async function testarEspecialistaSintetico(
  papel: PapelTestavel,
  versao: VersaoEspecialistaParaTeste,
  esforcoComparado: NivelEsforco | null,
) {
  const parametros = (versao.parametros ?? {}) as Record<string, unknown>;
  const principal = normalizarEsforco(parametros['effort']);
  const formato =
    papel === "hook_master" ? "hook" : papel === "cta_specialist" ? "cta" : "headline_video";

  const execucoes = [await rodar(papel, versao, principal, formato)];
  if (esforcoComparado && esforcoComparado !== principal) {
    execucoes.push(await rodar(papel, versao, esforcoComparado, formato));
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