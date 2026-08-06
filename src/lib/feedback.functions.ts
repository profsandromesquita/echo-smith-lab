import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CATEGORIA_FEEDBACK, ETAPA_FEEDBACK, PROVEDOR_FEEDBACK } from "@/lib/feedback";
import {
  entradaDecisao,
  entradaEdicaoFb,
  entradaExecucao,
  entradaFeedback,
  entradaItem,
  entradaReferenciaFb,
} from "@/lib/feedback-schemas";
import {
  FINALIDADE_FEEDBACK,
  consentimentoFeedback,
  erroFb,
  garantirConsentimentoFeedback,
} from "@/lib/feedback-consentimento.server";

/** Consentimento vigente de conta para guardar feedback no servidor. */
export const autorizacaoFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ok = await consentimentoFeedback(context.supabase, context.userId);
    return { autorizado: ok, finalidade: FINALIDADE_FEEDBACK };
  });

export const decidirAutorizacaoFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => entradaDecisao.parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("registrar_consentimento", {
      _escopo: "conta",
      _escopo_id: null as unknown as string,
      _categoria: CATEGORIA_FEEDBACK,
      _provedor: PROVEDOR_FEEDBACK,
      _etapa: ETAPA_FEEDBACK,
      _finalidade: FINALIDADE_FEEDBACK,
      _decisao: data.decisao,
      _origem: "interface",
    });
    if (error) erroFb(error.message);
    return { autorizado: data.decisao === "concedido" };
  });

export const listarFeedbackExecucao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => entradaExecucao.parse(d))
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
  .inputValidator((d: unknown) => entradaFeedback.parse(d))
  .handler(async ({ context, data }) => {
    await garantirConsentimentoFeedback(context.supabase, context.userId);
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
    if (error) erroFb(error.message);
    return { ok: true };
  });

export const removerFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => entradaItem.parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("feedback_resultado")
      .delete()
      .eq("execucao_id", data.execucaoId)
      .eq("item_id", data.itemId);
    if (error) erroFb(error.message);
    return { ok: true };
  });

export const salvarEdicao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => entradaEdicaoFb.parse(d))
  .handler(async ({ context, data }) => {
    await garantirConsentimentoFeedback(context.supabase, context.userId);
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
    if (error) erroFb(error.message);
    return { ok: true };
  });

export const removerEdicao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => entradaItem.parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("edicoes_resultado")
      .delete()
      .eq("execucao_id", data.execucaoId)
      .eq("item_id", data.itemId);
    if (error) erroFb(error.message);
    return { ok: true };
  });

export const salvarReferencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => entradaReferenciaFb.parse(d))
  .handler(async ({ context, data }) => {
    await garantirConsentimentoFeedback(context.supabase, context.userId);

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
    if (error) erroFb(error.message);
    return { ok: true };
  });

export const removerReferencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => entradaItem.parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("exemplos_marca")
      .delete()
      .eq("execucao_id", data.execucaoId)
      .eq("item_id", data.itemId)
      .eq("origem", "feedback");
    if (error) erroFb(error.message);
    return { ok: true };
  });

