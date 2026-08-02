import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

const listaTermos = z
  .array(z.string().trim().min(1).max(60))
  .max(60)
  .default([]);

const texto = (max: number) => z.string().trim().max(max).default("");

const campos = z.object({
  nome: z.string().trim().min(1).max(80),
  descricao: texto(1000),
  publico: texto(600),
  posicionamento: texto(1000),
  personalidade: texto(600),
  tom_de_voz: texto(300),
  preferidas: listaTermos,
  evitadas: listaTermos,
  principios: texto(1500),
  orientacoes: texto(2000),
});

const SELECAO =
  "id, nome, descricao, publico, posicionamento, personalidade, tom_de_voz, preferidas, evitadas, principios, orientacoes, padrao, criado_em, atualizado_em";

const LIMITE_EXEMPLOS = 30;

function erro(mensagem: string): never {
  throw new Error(mensagem);
}

/** Perfis do usuário autenticado, com uso em pastas e chats. */
export const listarPerfis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: perfis, error }, { data: pastas }, { data: chats }, { data: exemplos }] =
      await Promise.all([
        context.supabase.from("perfis_marca").select(SELECAO).order("nome", { ascending: true }),
        context.supabase.from("pastas").select("perfil_marca_id"),
        context.supabase.from("chats").select("perfil_marca_id"),
        context.supabase.from("exemplos_marca").select("perfil_id"),
      ]);
    if (error) erro(error.message);

    const conta = (linhas: { [k: string]: string | null }[], chave: string, id: string) =>
      linhas.filter((l) => l[chave] === id).length;

    return (perfis ?? []).map((p) => ({
      ...p,
      pastas: conta(pastas ?? [], "perfil_marca_id", p.id),
      chats: conta(chats ?? [], "perfil_marca_id", p.id),
      exemplos: conta(exemplos ?? [], "perfil_id", p.id),
    }));
  });

/** Perfil + exemplos. Retorna null quando não existe ou é de outra conta. */
export const obterPerfil = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: perfil } = await context.supabase
      .from("perfis_marca")
      .select(SELECAO)
      .eq("id", data.id)
      .maybeSingle();
    if (!perfil) return null;

    const { data: exemplos } = await context.supabase
      .from("exemplos_marca")
      .select("id, titulo, texto, criado_em")
      .eq("perfil_id", perfil.id)
      .order("criado_em", { ascending: true });

    return { perfil, exemplos: exemplos ?? [] };
  });

export const criarPerfil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => campos.extend({ padrao: z.boolean().default(false) }).parse(d))
  .handler(async ({ context, data }) => {
    const { padrao, ...resto } = data;

    const { count } = await context.supabase
      .from("perfis_marca")
      .select("id", { count: "exact", head: true });
    const primeiro = (count ?? 0) === 0;
    const seraPadrao = padrao || primeiro;

    if (seraPadrao) {
      await context.supabase.from("perfis_marca").update({ padrao: false }).eq("padrao", true);
    }

    const { data: perfil, error } = await context.supabase
      .from("perfis_marca")
      .insert({ ...resto, padrao: seraPadrao, user_id: context.userId })
      .select("id, nome, padrao")
      .single();
    if (error) erro(error.message);
    return perfil;
  });

export const atualizarPerfil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => campos.extend({ id: uuid }).parse(d))
  .handler(async ({ context, data }) => {
    const { id, ...resto } = data;
    const { error } = await context.supabase.from("perfis_marca").update(resto).eq("id", id);
    if (error) erro(error.message);
    return { ok: true };
  });

export const renomearPerfil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: uuid, nome: z.string().trim().min(1).max(80) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("perfis_marca")
      .update({ nome: data.nome })
      .eq("id", data.id);
    if (error) erro(error.message);
    return { ok: true };
  });

/** Duplica o perfil e seus exemplos. A cópia nunca nasce como padrão. */
export const duplicarPerfil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: origem } = await context.supabase
      .from("perfis_marca")
      .select(SELECAO)
      .eq("id", data.id)
      .maybeSingle();
    if (!origem) erro("Perfil indisponível.");

    const { id: _id, criado_em: _c, atualizado_em: _a, padrao: _p, nome, ...resto } = origem;

    const { data: copia, error } = await context.supabase
      .from("perfis_marca")
      .insert({
        ...resto,
        nome: `${nome} (cópia)`.slice(0, 80),
        padrao: false,
        user_id: context.userId,
      })
      .select("id, nome")
      .single();
    if (error || !copia) erro(error?.message ?? "Não foi possível duplicar o perfil.");

    const { data: exemplos } = await context.supabase
      .from("exemplos_marca")
      .select("titulo, texto")
      .eq("perfil_id", data.id);

    if (exemplos && exemplos.length > 0) {
      await context.supabase.from("exemplos_marca").insert(
        exemplos.map((e) => ({
          user_id: context.userId,
          perfil_id: copia.id,
          titulo: e.titulo,
          texto: e.texto,
        })),
      );
    }

    return copia;
  });

/** Troca o perfil padrão. Limpa o anterior antes de marcar o novo. */
export const definirPadrao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: alvo } = await context.supabase
      .from("perfis_marca")
      .select("id")
      .eq("id", data.id)
      .maybeSingle();
    if (!alvo) erro("Perfil indisponível.");

    await context.supabase
      .from("perfis_marca")
      .update({ padrao: false })
      .eq("padrao", true)
      .neq("id", data.id);

    const { error } = await context.supabase
      .from("perfis_marca")
      .update({ padrao: true })
      .eq("id", data.id);
    if (error) erro(error.message);
    return { ok: true };
  });

/** Quantas pastas e chats usam o perfil. Base do diálogo de exclusão. */
export const impactoPerfil = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ context, data }) => {
    const [{ count: pastas }, { count: chats }] = await Promise.all([
      context.supabase
        .from("pastas")
        .select("id", { count: "exact", head: true })
        .eq("perfil_marca_id", data.id),
      context.supabase
        .from("chats")
        .select("id", { count: "exact", head: true })
        .eq("perfil_marca_id", data.id),
    ]);
    return { pastas: pastas ?? 0, chats: chats ?? 0 };
  });

/**
 * Exclui o perfil. Com `substitutoId`, reatribui pastas e chats antes.
 * Sem substituto, os vínculos ficam nulos e os itens voltam à herança seguinte.
 */
export const excluirPerfil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: uuid, substitutoId: uuid.nullish() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    if (data.substitutoId) {
      if (data.substitutoId === data.id) erro("Escolha um perfil diferente.");
      const { data: substituto } = await context.supabase
        .from("perfis_marca")
        .select("id")
        .eq("id", data.substitutoId)
        .maybeSingle();
      if (!substituto) erro("Perfil substituto indisponível.");

      await Promise.all([
        context.supabase
          .from("pastas")
          .update({ perfil_marca_id: data.substitutoId })
          .eq("perfil_marca_id", data.id),
        context.supabase
          .from("chats")
          .update({ perfil_marca_id: data.substitutoId })
          .eq("perfil_marca_id", data.id),
      ]);
    }

    const { error } = await context.supabase.from("perfis_marca").delete().eq("id", data.id);
    if (error) erro(error.message);
    return { ok: true };
  });

export const salvarExemplo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.nullish(),
        perfilId: uuid,
        titulo: z.string().trim().max(120).default(""),
        texto: z.string().trim().min(1).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    if (data.id) {
      const { error } = await context.supabase
        .from("exemplos_marca")
        .update({ titulo: data.titulo, texto: data.texto })
        .eq("id", data.id);
      if (error) erro(error.message);
      return { ok: true };
    }

    const { count } = await context.supabase
      .from("exemplos_marca")
      .select("id", { count: "exact", head: true })
      .eq("perfil_id", data.perfilId);
    if ((count ?? 0) >= LIMITE_EXEMPLOS)
      erro(`Limite de ${LIMITE_EXEMPLOS} exemplos por perfil atingido.`);

    const { error } = await context.supabase.from("exemplos_marca").insert({
      user_id: context.userId,
      perfil_id: data.perfilId,
      titulo: data.titulo,
      texto: data.texto,
    });
    if (error) erro(error.message);
    return { ok: true };
  });

export const excluirExemplo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("exemplos_marca").delete().eq("id", data.id);
    if (error) erro(error.message);
    return { ok: true };
  });

export const definirPerfilPasta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ pastaId: uuid, perfilId: uuid.nullable() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("pastas")
      .update({ perfil_marca_id: data.perfilId })
      .eq("id", data.pastaId);
    if (error) erro(error.message);
    return { ok: true };
  });

/** Substituição explícita no chat. `null` remove a substituição e volta à herança. */
export const definirPerfilChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ chatId: uuid, perfilId: uuid.nullable() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("chats")
      .update({ perfil_marca_id: data.perfilId })
      .eq("id", data.chatId);
    if (error) erro(error.message);
    return { ok: true };
  });

/**
 * Resolve o perfil ativo. Prioridade: chat > pasta > padrão do usuário > nenhum.
 * Sem chatId (novo chat), começa pela pasta indicada, se houver.
 */
export const resolverPerfil = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ chatId: uuid.nullish(), pastaId: uuid.nullish() }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    let perfilChat: string | null = null;
    let pastaId: string | null = data.pastaId ?? null;

    if (data.chatId) {
      const { data: chat } = await context.supabase
        .from("chats")
        .select("perfil_marca_id, pasta_id")
        .eq("id", data.chatId)
        .maybeSingle();
      if (chat) {
        perfilChat = chat.perfil_marca_id;
        pastaId = chat.pasta_id;
      }
    }

    let pastaNome: string | null = null;
    let perfilPasta: string | null = null;
    if (pastaId) {
      const { data: pasta } = await context.supabase
        .from("pastas")
        .select("nome, perfil_marca_id")
        .eq("id", pastaId)
        .maybeSingle();
      if (pasta) {
        pastaNome = pasta.nome;
        perfilPasta = pasta.perfil_marca_id;
      }
    }

    const { data: padrao } = await context.supabase
      .from("perfis_marca")
      .select("id")
      .eq("padrao", true)
      .maybeSingle();

    const origem: "chat" | "pasta" | "padrao" | "nenhum" = perfilChat
      ? "chat"
      : perfilPasta
        ? "pasta"
        : padrao?.id
          ? "padrao"
          : "nenhum";

    const alvo = perfilChat ?? perfilPasta ?? padrao?.id ?? null;
    if (!alvo) return { perfil: null, origem: "nenhum" as const, pastaNome, substituido: false };

    const { data: perfil } = await context.supabase
      .from("perfis_marca")
      .select("id, nome, tom_de_voz, posicionamento")
      .eq("id", alvo)
      .maybeSingle();

    if (!perfil)
      return { perfil: null, origem: "nenhum" as const, pastaNome, substituido: false };

    return { perfil, origem, pastaNome, substituido: Boolean(perfilChat) };
  });
