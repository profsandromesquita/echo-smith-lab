import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const nomePasta = z.string().trim().min(1).max(80);
const tituloChat = z.string().trim().min(1).max(120);
const textoMensagem = z.string().trim().min(1).max(8000);

function erro(mensagem: string): never {
  throw new Error(mensagem);
}

/** Árvore completa de organização do usuário autenticado. */
export const listarHistorico = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: pastas, error: erroPastas }, { data: chats, error: erroChats }] =
      await Promise.all([
        context.supabase
          .from("pastas")
          .select("id, nome, criado_em, perfil_marca_id")
          .order("nome", { ascending: true }),
        context.supabase
          .from("chats")
          .select("id, titulo, pasta_id, ultima_atividade_em")
          .order("ultima_atividade_em", { ascending: false }),
      ]);

    if (erroPastas) erro(erroPastas.message);
    if (erroChats) erro(erroChats.message);

    return { pastas: pastas ?? [], chats: chats ?? [] };
  });

export const criarPasta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ nome: nomePasta }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: pasta, error } = await context.supabase
      .from("pastas")
      .insert({ nome: data.nome, user_id: context.userId })
      .select("id, nome")
      .single();
    if (error) erro(error.message);
    return pasta;
  });

export const renomearPasta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, nome: nomePasta }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("pastas")
      .update({ nome: data.nome })
      .eq("id", data.id);
    if (error) erro(error.message);
    return { ok: true };
  });

/** Exclui a pasta. Os chats vinculados são preservados e ficam sem pasta. */
export const excluirPasta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("pastas").delete().eq("id", data.id);
    if (error) erro(error.message);
    return { ok: true };
  });

/**
 * Cria o chat e, quando há primeira mensagem, grava-a em seguida.
 * Se a mensagem falhar, o chat recém-criado é removido para não sobrar chat vazio.
 */
export const criarChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        pastaId: uuid.nullish(),
        titulo: tituloChat.optional(),
        primeiraMensagem: textoMensagem.optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: chat, error } = await context.supabase
      .from("chats")
      .insert({
        user_id: context.userId,
        pasta_id: data.pastaId ?? null,
        ...(data.titulo ? { titulo: data.titulo } : {}),
      })
      .select("id, titulo, pasta_id")
      .single();
    if (error || !chat) erro(error?.message ?? "Não foi possível criar o chat.");

    if (data.primeiraMensagem) {
      const { data: mensagem, error: erroMensagem } = await context.supabase
        .from("mensagens")
        .insert({
          user_id: context.userId,
          chat_id: chat.id,
          autor: "usuario",
          texto: data.primeiraMensagem,
        })
        .select("id")
        .single();
      if (erroMensagem || !mensagem) {
        await context.supabase.from("chats").delete().eq("id", chat.id);
        erro(erroMensagem?.message ?? "Não foi possível registrar o briefing.");
      }
      return { ...chat, mensagemId: mensagem.id as string };
    }

    return { ...chat, mensagemId: null as string | null };
  });

export const renomearChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, titulo: tituloChat }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("chats")
      .update({ titulo: data.titulo })
      .eq("id", data.id);
    if (error) erro(error.message);
    return { ok: true };
  });

export const moverChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, pastaId: uuid.nullable() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("chats")
      .update({ pasta_id: data.pastaId })
      .eq("id", data.id);
    if (error) erro(error.message);
    return { ok: true };
  });

export const excluirChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("chats").delete().eq("id", data.id);
    if (error) erro(error.message);
    return { ok: true };
  });

/** Chat + mensagens. Retorna null quando o chat não existe ou é de outra conta. */
export const obterChat = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: chat } = await context.supabase
      .from("chats")
      .select("id, titulo, pasta_id, criado_em, ultima_atividade_em")
      .eq("id", data.id)
      .maybeSingle();

    if (!chat) return null;

    const { data: mensagens, error } = await context.supabase
      .from("mensagens")
      .select("id, autor, texto, criado_em")
      .eq("chat_id", chat.id)
      .order("criado_em", { ascending: true });
    if (error) erro(error.message);

    return { chat, mensagens: mensagens ?? [] };
  });

export const enviarMensagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        chatId: uuid,
        texto: textoMensagem,
        autor: z.enum(["usuario", "plataforma"]).default("usuario"),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: mensagem, error } = await context.supabase
      .from("mensagens")
      .insert({
        user_id: context.userId,
        chat_id: data.chatId,
        autor: data.autor,
        texto: data.texto,
      })
      .select("id, autor, texto, criado_em")
      .single();
    if (error) erro(error.message);
    return mensagem;
  });

/** Busca restrita aos dados do próprio usuário: título do chat e texto das mensagens. */
export const buscarHistorico = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ termo: z.string().trim().min(1).max(120) }).parse(d))
  .handler(async ({ context, data }) => {
    const termo = data.termo.replace(/[%_,()]/g, " ").trim();
    if (!termo) return { chats: [] };

    const [{ data: porTitulo }, { data: porMensagem }] = await Promise.all([
      context.supabase
        .from("chats")
        .select("id, titulo, pasta_id, ultima_atividade_em")
        .ilike("titulo", `%${termo}%`)
        .order("ultima_atividade_em", { ascending: false })
        .limit(30),
      context.supabase
        .from("mensagens")
        .select("chat_id")
        .ilike("texto", `%${termo}%`)
        .limit(100),
    ]);

    const idsTitulo = new Set((porTitulo ?? []).map((c) => c.id));
    const idsExtras = [
      ...new Set((porMensagem ?? []).map((m) => m.chat_id).filter((id) => !idsTitulo.has(id))),
    ];

    let extras: typeof porTitulo = [];
    if (idsExtras.length > 0) {
      const { data } = await context.supabase
        .from("chats")
        .select("id, titulo, pasta_id, ultima_atividade_em")
        .in("id", idsExtras)
        .order("ultima_atividade_em", { ascending: false })
        .limit(30);
      extras = data ?? [];
    }

    const chats = [...(porTitulo ?? []), ...(extras ?? [])].sort((a, b) =>
      a.ultima_atividade_em < b.ultima_atividade_em ? 1 : -1,
    );

    return { chats };
  });