/**
 * Orçamento por chamada real (F6D). A verificação é autoritativa no servidor e
 * atômica: a reserva acontece no banco, dentro de uma transação com lock da
 * execução. Sem reserva, nenhuma chamada externa é disparada.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { lerVersaoDaEtapa } from "@/lib/agentes/registry-etapa.server";

type Cliente = SupabaseClient<Database>;

/** Reserva o orçamento publicado do papel desta etapa. Idempotente pela chave. */
export async function reservarOrcamentoEtapa(
  supabase: Cliente,
  args: { execucaoId: string; etapaId: string; tentativa: number },
): Promise<{ reservado: boolean; chave: string }> {
  const chave = `etapa:${args.etapaId}:${args.tentativa}`;
  const versao = await lerVersaoDaEtapa(supabase, args.etapaId);
  if (!versao) return { reservado: false, chave };

  const { data: ok } = await supabase.rpc("reservar_custo", {
    _execucao_id: args.execucaoId,
    _etapa_id: args.etapaId,
    _chave: chave,
    _custo: versao.orcamentoEstimado,
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