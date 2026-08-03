/**
 * Porta única de leitura da versão fixada do Registry (F6D).
 *
 * O Registry é configuração de plataforma: por RLS só `admin_tecnico` lê
 * `registry_versoes`. A execução de uma conta comum precisa da versão já fixada
 * na etapa, então a leitura acontece pelo cliente privilegiado — sempre depois
 * de confirmar, pelo cliente do usuário (com RLS), que a etapa/execução pertence
 * a quem chamou. Nenhum identificador vem do cliente: só o que já está
 * persistido em `execucao_etapas` / `execucao_registry_versoes`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Cliente = SupabaseClient<Database>;

export const PROVEDORES_REAIS = ["openai", "anthropic"] as const;
export const PROVEDORES_VALIDOS = ["simulado", ...PROVEDORES_REAIS] as const;

export interface VersaoFixada {
  id: string;
  provedor: string;
  modelo: string;
  instrucoesSistema: string;
  parametros: Record<string, unknown>;
  limiteEntrada: number;
  limiteSaida: number;
  timeoutMs: number;
  orcamentoEstimado: number;
}

const COLUNAS =
  "id, estado, ativo, provedor, modelo, instrucoes_sistema, parametros, limite_entrada, limite_saida, timeout_ms, orcamento_estimado";

/** Leitura privilegiada, já restrita ao id fixado e ao vínculo verificado. */
async function lerVersaoPublicada(registryVersaoId: string): Promise<VersaoFixada | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("registry_versoes")
    .select(COLUNAS)
    .eq("id", registryVersaoId)
    .maybeSingle();
  if (!data) return null;

  // Versão precisa estar publicada, ativa, com provedor conhecido e modelo presente.
  if (data.estado !== "publicada" || data.ativo !== true) return null;
  if (!PROVEDORES_VALIDOS.includes(data.provedor as (typeof PROVEDORES_VALIDOS)[number])) return null;
  if (!data.modelo || !data.modelo.trim()) return null;

  return {
    id: data.id,
    provedor: data.provedor,
    modelo: data.modelo,
    instrucoesSistema: data.instrucoes_sistema ?? "",
    parametros: (data.parametros ?? {}) as Record<string, unknown>,
    limiteEntrada: data.limite_entrada,
    limiteSaida: data.limite_saida,
    timeoutMs: data.timeout_ms,
    orcamentoEstimado: Number(data.orcamento_estimado ?? 0),
  };
}

/** Versão fixada na etapa. A leitura da etapa passa por RLS: confirma o dono. */
export async function lerVersaoDaEtapa(
  supabase: Cliente,
  etapaId: string,
): Promise<VersaoFixada | null> {
  const { data: etapa } = await supabase
    .from("execucao_etapas")
    .select("registry_versao_id")
    .eq("id", etapaId)
    .maybeSingle();
  if (!etapa?.registry_versao_id) return null;
  return lerVersaoPublicada(etapa.registry_versao_id);
}

/** Versão fixada para um papel desta execução. A leitura do vínculo passa por RLS. */
export async function lerVersaoDaExecucao(
  supabase: Cliente,
  execucaoId: string,
  papel: string,
): Promise<VersaoFixada | null> {
  const { data: vinculo } = await supabase
    .from("execucao_registry_versoes")
    .select("registry_versao_id")
    .eq("execucao_id", execucaoId)
    .eq("papel", papel)
    .maybeSingle();
  if (!vinculo?.registry_versao_id) return null;
  return lerVersaoPublicada(vinculo.registry_versao_id);
}