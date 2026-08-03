/**
 * Orçamento por chamada real (F6D). A verificação é autoritativa no servidor e
 * atômica: a reserva acontece no banco, dentro de uma transação com lock da
 * execução. Sem reserva, nenhuma chamada externa é disparada.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Cliente = SupabaseClient<Database>;

/** Reserva o orçamento publicado do papel desta etapa. Idempotente pela chave. */
export async function reservarOrcamentoEtapa(
  supabase: Cliente,
  args: { execucaoId: string; etapaId: string; tentativa: number },
): Promise<{ reservado: boolean; chave: string }> {
  const chave = `etapa:${args.etapaId}:${args.tentativa}`;
  const { data: etapa } = await supabase
    .from("execucao_etapas")
    .select("registry_versao_id")
    .eq("id", args.etapaId)
    .maybeSingle();
  if (!etapa) return { reservado: false, chave };

  const { data: versao } = await supabase
    .from("registry_versoes")
    .select("orcamento_estimado")
    .eq("id", etapa.registry_versao_id)
    .maybeSingle();

  const { data: ok } = await supabase.rpc("reservar_custo", {
    _execucao_id: args.execucaoId,
    _etapa_id: args.etapaId,
    _chave: chave,
    _custo: Number(versao?.orcamento_estimado ?? 0),
  });
  return { reservado: ok === true, chave };
}

/** Substitui o valor reservado pelo custo real informado pelo provedor. */
export async function reconciliarOrcamento(
  supabase: Cliente,
  args: { execucaoId: string; chave: string; custoReal: number },
): Promise<void> {
  await supabase.rpc("reconciliar_custo", {
    _execucao_id: args.execucaoId,
    _chave: args.chave,
    _custo_real: args.custoReal,
  });
}