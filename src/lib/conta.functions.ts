import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Verificação de papel administrativo feita no servidor, sempre sobre a sessão autenticada. */
export const verificarAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("tem_papel", { _role: "admin_tecnico" });
    return { ehAdmin: Boolean(data) };
  });

/** Perfil e papéis do usuário autenticado. A decisão de papel é sempre do servidor. */
export const obterConta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: perfil } = await context.supabase
      .from("profiles")
      .select("id, nome_exibicao")
      .eq("id", context.userId)
      .maybeSingle();

    const { data: ehAdmin } = await context.supabase.rpc("tem_papel", { _role: "admin_tecnico" });

    return {
      userId: context.userId,
      nomeExibicao: perfil?.nome_exibicao ?? "",
      email: (context.claims["email"] as string | undefined) ?? "",
      ehAdmin: Boolean(ehAdmin),
    };
  });
