import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function erro(mensagem: string): never {
  throw new Error(mensagem);
}

/** Exportação completa dos dados da própria conta. Nunca inclui dados de terceiros nem segredos. */
export const exportarDados = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = context.supabase;
    const [
      perfil,
      pastas,
      chats,
      mensagens,
      perfisMarca,
      exemplos,
      preferencias,
      consentimentos,
      historico,
    ] = await Promise.all([
      s.from("profiles").select("*").eq("id", context.userId).maybeSingle(),
      s.from("pastas").select("*"),
      s.from("chats").select("*"),
      s.from("mensagens").select("*"),
      s.from("perfis_marca").select("*"),
      s.from("exemplos_marca").select("*"),
      s.from("preferencias_privacidade").select("*").maybeSingle(),
      s.from("consentimentos").select("*"),
      s.from("consentimentos_historico").select("*"),
    ]);

    return {
      gerado_em: new Date().toISOString(),
      conta: { id: context.userId, perfil: perfil.data ?? null },
      pastas: pastas.data ?? [],
      chats: chats.data ?? [],
      mensagens: mensagens.data ?? [],
      voz_de_marca: { perfis: perfisMarca.data ?? [], exemplos: exemplos.data ?? [] },
      privacidade: {
        preferencias: preferencias.data ?? null,
        consentimentos: consentimentos.data ?? [],
        historico: historico.data ?? [],
      },
    };
  });

export const solicitarAcaoConta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ tipo: z.enum(["exportacao", "exclusao_conta"]) }).strict().parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: id, error } = await context.supabase.rpc("criar_solicitacao_conta", {
      _tipo: data.tipo,
    });
    if (error) erro("Não foi possível registrar a solicitação.");
    return { id };
  });

export const cancelarSolicitacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).strict().parse(d))
  .handler(async ({ context, data }) => {
    const { data: ok } = await context.supabase.rpc("cancelar_solicitacao_conta", { _id: data.id });
    return { ok: Boolean(ok) };
  });

export const listarSolicitacoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("solicitacoes_conta")
      .select("id, tipo, estado, criado_em, confirmado_em, concluido_em")
      .order("criado_em", { ascending: false })
      .limit(20);
    return data ?? [];
  });

/**
 * Exclusão definitiva da conta.
 * Apaga todos os dados pessoais e operacionais e, por fim, a identidade de autenticação.
 * Nenhum registro permanece vinculado ao user_id: enquanto não houver política jurídica
 * aprovada, o padrão é exclusão — não presumimos obrigação de retenção.
 */
export const excluirConta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ confirmacao: z.literal("EXCLUIR") }).strict().parse(d))
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;

    const tabelas = [
      "mensagens",
      "chats",
      "exemplos_marca",
      "pastas",
      "perfis_marca",
      "eventos_tecnicos",
      "fotografias_consentimento",
      "consentimentos_historico",
      "consentimentos",
      "preferencias_privacidade",
      "solicitacoes_conta",
      "user_roles",
    ] as const;

    for (const tabela of tabelas) {
      const { error } = await supabaseAdmin.from(tabela).delete().eq("user_id", uid);
      if (error) erro(`Falha ao remover dados (${tabela}).`);
    }

    await supabaseAdmin.from("profiles").delete().eq("id", uid);

    const { error: erroAuth } = await supabaseAdmin.auth.admin.deleteUser(uid);
    if (erroAuth) erro("Falha ao remover a identidade de autenticação.");

    return { ok: true };
  });