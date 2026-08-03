/**
 * Teste administrativo de uma versão de rascunho com provedor real.
 * Usa briefing sintético, não cria execução de usuário nem fotografia de consentimento.
 */

import { executarGatekeeperReal } from "@/lib/agentes/gatekeeper.server";

const BRIEFING_SINTETICO =
  "Psicóloga clínica atende adultos com burnout. Quer anúncios para agendamento de primeira sessão.";

export interface VersaoParaTeste {
  provedor: string;
  modelo: string;
  instrucoes_sistema: string | null;
  parametros: unknown;
  limite_entrada: number;
  limite_saida: number;
  timeout_ms: number;
}

export async function testarGatekeeperSintetico(versao: VersaoParaTeste) {
  const parametros = (versao.parametros ?? {}) as Record<string, unknown>;
  const esforco = String(parametros['reasoning_effort'] ?? "low") === "medium" ? "medium" : "low";

  const resultado = await executarGatekeeperReal(
    {
      modelo: versao.modelo,
      instrucoesSistema: versao.instrucoes_sistema ?? "",
      esforcoRaciocinio: esforco as "low" | "medium",
      limiteEntrada: versao.limite_entrada,
      limiteSaida: versao.limite_saida,
      timeoutMs: versao.timeout_ms,
    },
    {
      formato: "hook",
      briefing: BRIEFING_SINTETICO,
      parametros: { formato: "hook" },
      contextoConversa: [],
    },
    `teste-admin:${Date.now()}`,
  );

  return {
    ok: resultado.ok,
    provedor: versao.provedor,
    modelo: versao.modelo,
    duracao_ms: resultado.duracaoMs,
    tokens_entrada: resultado.uso.tokensEntrada,
    tokens_saida: resultado.uso.tokensSaida,
    custo_usd: resultado.uso.custoUsd,
    saidas: resultado.ok ? 1 : 0,
    codigo_erro: resultado.ok ? null : resultado.codigo,
  };
}