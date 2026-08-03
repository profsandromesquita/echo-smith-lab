import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const modo = z.enum(["local_estrita", "hibrido_autorizado"]);
const uuid = z.string().uuid();

function erro(mensagem: string): never {
  throw new Error(mensagem);
}

export const PREFERENCIAS_PADRAO = {
  modo_padrao: "local_estrita" as const,
  alerta_dados_pessoais: true,
  bloquear_envio_com_alerta: false,
  retencao_logs_dias: 90,
  retencao_conteudo: "indefinida" as const,
};

/** Preferências de privacidade da conta. Sem linha ainda, devolve os padrões seguros. */
export const obterPreferencias = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("preferencias_privacidade")
      .select(
        "modo_padrao, alerta_dados_pessoais, bloquear_envio_com_alerta, retencao_logs_dias, retencao_conteudo",
      )
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) erro(error.message);
    return data ?? PREFERENCIAS_PADRAO;
  });

export const salvarPreferencias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        modo_padrao: modo.optional(),
        alerta_dados_pessoais: z.boolean().optional(),
        bloquear_envio_com_alerta: z.boolean().optional(),
        retencao_logs_dias: z.union([z.literal(30), z.literal(90), z.literal(180)]).optional(),
        retencao_conteudo: z.enum(["indefinida", "12_meses", "6_meses"]).optional(),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("preferencias_privacidade")
      .upsert({ ...PREFERENCIAS_PADRAO, ...data, user_id: context.userId }, { onConflict: "user_id" });
    if (error) erro(error.message);
    return { ok: true };
  });

/** Define ou limpa o modo específico de um chat. Nulo volta a herdar o padrão da conta. */
export const definirModoChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ chatId: uuid, modo: modo.nullable() }).strict().parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("chats")
      .update({ modo_privacidade: data.modo })
      .eq("id", data.chatId)
      .eq("user_id", context.userId);
    if (error) erro(error.message);
    return { ok: true };
  });

/** Modo efetivo de um chat, com a origem da decisão. */
export const resolverModo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ chatId: uuid.nullable() }).strict().parse(d))
  .handler(async ({ context, data }) => {
    const { data: prefs } = await context.supabase
      .from("preferencias_privacidade")
      .select("modo_padrao")
      .eq("user_id", context.userId)
      .maybeSingle();

    const padrao = (prefs?.modo_padrao ?? PREFERENCIAS_PADRAO.modo_padrao) as z.infer<typeof modo>;

    if (!data.chatId) return { modo: padrao, origem: "padrao" as const };

    const { data: chat } = await context.supabase
      .from("chats")
      .select("modo_privacidade")
      .eq("id", data.chatId)
      .eq("user_id", context.userId)
      .maybeSingle();

    const doChat = chat?.modo_privacidade as z.infer<typeof modo> | null | undefined;
    return doChat
      ? { modo: doChat, origem: "chat" as const }
      : { modo: padrao, origem: "padrao" as const };
  });