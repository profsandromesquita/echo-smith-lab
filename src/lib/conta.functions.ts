
/** Verificação de papel administrativo feita no servidor. */
export const verificarAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin_tecnico",
    });
    return { ehAdmin: Boolean(data) };
  });
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Perfil e papéis do usuário autenticado. A decisão de papel é sempre do servidor. */
export const obterConta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: perfil } = await context.supabase
      .from("profiles")
      .select("id, nome_exibicao")
      .eq("id", context.userId)
      .maybeSingle();

    const { data: ehAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin_tecnico",
    });

    return {
      userId: context.userId,
      nomeExibicao: perfil?.nome_exibicao ?? "",
      email: (context.claims["email"] as string | undefined) ?? "",
      ehAdmin: Boolean(ehAdmin),
    };
  });