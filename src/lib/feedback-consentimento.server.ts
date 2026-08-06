import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { CATEGORIA_FEEDBACK, ETAPA_FEEDBACK, PROVEDOR_FEEDBACK } from "@/lib/feedback";

/** Regras de consentimento da captura de feedback no modo híbrido autorizado. */
export const FINALIDADE_FEEDBACK =
  "Guardar na sua conta o feedback, as edições e os exemplos de referência dos textos entregues";

export function erroFb(msg: string): never {
  throw new Error(msg);
}

export async function consentimentoFeedback(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("consentimentos")
    .select("estado")
    .eq("user_id", userId)
    .eq("escopo", "conta")
    .eq("categoria", CATEGORIA_FEEDBACK)
    .eq("provedor", PROVEDOR_FEEDBACK)
    .eq("etapa", ETAPA_FEEDBACK)
    .maybeSingle();
  return data?.estado === "concedido";
}

/** Bloqueia qualquer gravação sem consentimento vigente. Nunca grava em silêncio. */
export async function garantirConsentimentoFeedback(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  if (!(await consentimentoFeedback(supabase, userId)))
    erroFb("Autorização necessária para guardar feedback na sua conta.");
}
