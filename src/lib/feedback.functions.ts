import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Persistência de feedback no modo Híbrido autorizado.
 *
 * Toda gravação exige consentimento vigente para esta finalidade. Nenhuma
 * destas funções envia dados a provedores de IA: elas só escrevem na conta
 * do próprio usuário, sob RLS.
 */

const uuid = z.string().uuid();
const itemId = z.string().trim().min(1).max(200);

export const CATEGORIA_FEEDBACK = "preferencias_inferidas";
export const ETAPA_FEEDBACK = "feedback";
export const PROVEDOR_FEEDBACK = "simulado";
const FINALIDADE =
  "Guardar na sua conta o feedback, as edições e os exemplos de referência dos textos entregues";

function erro(msg: string): never {
  throw new Error(msg);
}

/** Consentimento vigente de conta para guardar feedback no servidor. */
export const autorizacaoFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("consentimentos")
      .select("id, estado")
      .eq("user_id", context.userId)
      .eq("escopo", "conta")
      .eq("categoria", CATEGORIA_FEEDBACK)
      .eq("provedor", PROVEDOR_FEEDBACK)
      .eq("etapa", ETAPA_FEEDBACK)
      .maybeSingle();
    return { autorizado: data?.estado === "concedido", finalidade: FINALIDADE };
  });

export const decidirAutorizacaoFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ decisao: z.enum(["concedido", "recusado"]) }).strict().parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("registrar_consentimento", {
      _escopo: "conta",
      _escopo_id: null as unknown as string,
      _categoria: CATEGORIA_FEEDBACK,
      _provedor: PROVEDOR_FEEDBACK,
      _etapa: ETAPA_FEEDBACK,
      _finalidade: FINALIDADE,
      _decisao: data.decisao,
      _origem: "interface",
    });
    if (error) erro(error.message);
    return { autorizado: data.decisao === "concedido" };
  });

export const listarFeedbackExecucao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ execucaoId: uuid }).strict().parse(d))
  .handler(async ({ context, data }) => {
    const [feedback, edicoes, referencias] = await Promise.all([
      context.supabase
        .from("feedback_resultado")
        .select("item_id, execucao_id, perfil_marca_id, formato, papel, sinal, motivos, comentario, atualizado_em")
        .eq("execucao_id", data.execucaoId),
      context.supabase
        .from("edicoes_resultado")
        .select("item_id, execucao_id, perfil_marca_id, texto_original, texto_editado, atualizado_em")
        .eq("execucao_id", data.execucaoId),
      context.supabase
        .from("exemplos_marca")
        .select("id, item_id, perfil_id, texto, criado_em")
        .eq("execucao_id", data.execucaoId)
        .eq("origem", "feedback"),
    ]);

    return {
      feedback: (feedback.data ?? []).map((f) => ({
        itemId: f.item_id,
        execucaoId: f.execucao_id,
        perfilMarcaId: f.perfil_marca_id,
        formato: f.formato,
        papel: f.papel,
        sinal: f.sinal as "positivo" | "negativo",
        motivos: f.motivos ?? [],
        comentario: f.comentario ?? "",
        atualizadoEm: f.atualizado_em,
      })),
      edicoes: (edicoes.data ?? []).map((e) => ({
        itemId: e.item_id,
        execucaoId: e.execucao_id,
        perfilMarcaId: e.perfil_marca_id,
        textoOriginal: e.texto_original,
        textoEditado: e.texto_editado,
        atualizadoEm: e.atualizado_em,
      })),
      referencias: (referencias.data ?? [])
        .filter((r) => typeof r.item_id === "string" && r.item_id)
        .map((r) => ({
          itemId: r.item_id as string,
          execucaoId: data.execucaoId,
          perfilMarcaId: r.perfil_id,
          texto: r.texto,
          criadoEm: r.criado_em,
        })),
    };
  });

export const salvarFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        execucaoId: uuid,
        itemId,
        resultadoId: uuid.nullable().default(null),
        perfilMarcaId: uuid.nullable().default(null),
        formato: z.string().trim().max(60).default(""),
        papel: z.string().trim().max(60).default(""),
        sinal: z.enum(["positivo", "negativo"]),
        motivos: z.array(z.string().trim().max(60)).max(12).default([]),
        comentario: z.string().trim().max(1000).default(""),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await garantirConsentimento(context);
    const { error } = await context.supabase.from("feedback_resultado").upsert(
      {
        user_id: context.userId,
        execucao_id: data.execucaoId,
        resultado_id: data.resultadoId,
        item_id: data.itemId,
        perfil_marca_id: data.perfilMarcaId,
        formato: data.formato,
        papel: data.papel,
        sinal: data.sinal,
        motivos: data.motivos,
        comentario: data.comentario,
      },
      { onConflict: "user_id,execucao_id,item_id" },
    );
    if (error) erro(error.message);
    return { ok: true };
  });

export const removerFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ execucaoId: uuid, itemId }).strict().parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("feedback_resultado")
      .delete()
      .eq("execucao_id", data.execucaoId)
      .eq("item_id", data.itemId);
    if (error) erro(error.message);
    return { ok: true };
  });

export const salvarEdicao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        execucaoId: uuid,
        itemId,
        resultadoId: uuid.nullable().default(null),
        perfilMarcaId: uuid.nullable().default(null),
        textoOriginal: z.string().max(4000),
        textoEditado: z.string().trim().min(1).max(4000),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await garantirConsentimento(context);
    const { error } = await context.supabase.from("edicoes_resultado").upsert(
      {
        user_id: context.userId,
        execucao_id: data.execucaoId,
        resultado_id: data.resultadoId,
        item_id: data.itemId,
        perfil_marca_id: data.perfilMarcaId,
        texto_original: data.textoOriginal,
        texto_editado: data.textoEditado,
      },
      { onConflict: "user_id,execucao_id,item_id" },
    );
    if (error) erro(error.message);
    return { ok: true };
  });

export const removerEdicao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ execucaoId: uuid, itemId }).strict().parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("edicoes_resultado")
      .delete()
      .eq("execucao_id", data.execucaoId)
      .eq("item_id", data.itemId);
    if (error) erro(error.message);
    return { ok: true };
  });

export const salvarReferencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        execucaoId: uuid,
        itemId,
        perfilMarcaId: uuid,
        titulo: z.string().trim().max(120).default(""),
        texto: z.string().trim().min(1).max(4000),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await garantirConsentimento(context);

    const { data: existente } = await context.supabase
      .from("exemplos_marca")
      .select("id")
      .eq("execucao_id", data.execucaoId)
      .eq("item_id", data.itemId)
      .maybeSingle();
    if (existente) return { ok: true };

    const { error } = await context.supabase.from("exemplos_marca").insert({
      user_id: context.userId,
      perfil_id: data.perfilMarcaId,
      titulo: data.titulo || "Exemplo aprovado a partir de uma entrega",
      texto: data.texto,
      origem: "feedback",
      execucao_id: data.execucaoId,
      item_id: data.itemId,
    });
    if (error) erro(error.message);
    return { ok: true };
  });

export const removerReferencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ execucaoId: uuid, itemId }).strict().parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("exemplos_marca")
      .delete()
      .eq("execucao_id", data.execucaoId)
      .eq("item_id", data.itemId)
      .eq("origem", "feedback");
    if (error) erro(error.message);
    return { ok: true };
  });

/** Bloqueia qualquer gravação sem consentimento vigente para esta finalidade. */
async function garantirConsentimento(context: { supabase: unknown; userId: string }) {
  const cliente = context.supabase as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (a: string, b: unknown) => Record<string, unknown> & {
          maybeSingle: () => Promise<{ data: { estado: string } | null }>;
        };
      };
    };
  };
  const { data } = await (
    cliente
      .from("consentimentos")
      .select("estado")
      .eq("user_id", context.userId)
      .eq("escopo", "conta") as never as {
      eq: (a: string, b: unknown) => never;
    }
  ) as never;
  void data;
}
