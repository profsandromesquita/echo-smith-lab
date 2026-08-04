import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const escopo = z.enum(["conta", "pasta", "chat"]);
const categoria = z.enum([
  "briefing",
  "resumo_voz_marca",
  "texto_gerado",
  "metadados",
  "variacoes_para_auditoria",
  "feedback_para_correcao",
  "resumo_voz_marca_explicita",
]);
const decisao = z.enum(["concedido", "recusado"]);
const origem = z.enum(["modal", "configuracoes", "painel_chat", "sistema"]);

function erro(mensagem: string): never {
  throw new Error(mensagem);
}

const entradaDecisao = z
  .object({
    escopo,
    escopoId: uuid.nullable(),
    categoria,
    provedor: z.string().trim().min(1).max(60),
    etapa: z.string().trim().min(1).max(60),
    finalidade: z.string().trim().min(1).max(200),
    decisao,
    origem,
  })
  .strict()
  .refine((v) => (v.escopo === "conta" ? v.escopoId === null : v.escopoId !== null), {
    message: "Escopo e identificador incompatíveis.",
  });

/** Consentimentos atuais e histórico da conta autenticada. */
export const listarConsentimentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [atuais, historico] = await Promise.all([
      context.supabase
        .from("consentimentos")
        .select("id, escopo, escopo_id, categoria, provedor, etapa, finalidade, estado, atualizado_em")
        .order("atualizado_em", { ascending: false }),
      context.supabase
        .from("consentimentos_historico")
        .select("id, escopo, categoria, provedor, etapa, acao, origem, termos_versao, ocorrido_em")
        .order("ocorrido_em", { ascending: false })
        .limit(100),
    ]);
    if (atuais.error) erro(atuais.error.message);
    if (historico.error) erro(historico.error.message);
    return { atuais: atuais.data ?? [], historico: historico.data ?? [] };
  });

/** Conceder ou recusar. A gravação acontece só dentro da função segura do banco. */
export const decidirConsentimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => entradaDecisao.parse(d))
  .handler(async ({ context, data }) => {
    const { data: id, error } = await context.supabase.rpc("registrar_consentimento", {
      _escopo: data.escopo,
      _escopo_id: data.escopoId as string,
      _categoria: data.categoria,
      _provedor: data.provedor,
      _etapa: data.etapa,
      _finalidade: data.finalidade,
      _decisao: data.decisao,
      _origem: data.origem,
    });
    if (error) erro("Não foi possível registrar essa decisão.");
    return { id };
  });

export const revogarConsentimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, origem }).strict().parse(d))
  .handler(async ({ context, data }) => {
    const { data: ok, error } = await context.supabase.rpc("revogar_consentimento", {
      _id: data.id,
      _origem: data.origem,
    });
    if (error) erro("Não foi possível revogar essa autorização.");
    return { ok: Boolean(ok) };
  });

/**
 * Autorização "apenas esta execução".
 * Nesta fase não existe execução real, então nada é gravado: a fotografia é apenas
 * montada em memória e devolvida para exibição. A gravação definitiva será feita de
 * forma atômica junto à execução correspondente, em fase posterior.
 */
export const montarFotografiaSimulada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        permissoes: z
          .array(
            z
              .object({
                categoria,
                provedor: z.string().trim().min(1).max(60),
                etapa: z.string().trim().min(1).max(60),
                finalidade: z.string().trim().min(1).max(200),
                decisao,
              })
              .strict(),
          )
          .min(1)
          .max(12),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: termos, error } = await context.supabase
      .from("termos_consentimento")
      .select("id, chave, versao")
      .eq("vigente", true);
    if (error) erro(error.message);

    const porChave = new Map((termos ?? []).map((t) => [t.chave, t]));

    return {
      persistida: false as const,
      motivo: "sem_execucao_real" as const,
      itens: data.permissoes.map((p) => {
        const t = porChave.get(p.categoria);
        return {
          ...p,
          origem: "modal" as const,
          termos_id: t?.id ?? null,
          termos_versao: t?.versao ?? null,
        };
      }),
    };
  });

/**
 * Autorização válida somente para a execução informada.
 * O cliente envia apenas o id da execução e as categorias marcadas; provedor, papel,
 * etapa, finalidade, termos e proprietário são derivados no servidor, que também
 * desbloqueia as etapas correspondentes na mesma transação.
 */
export const autorizarExecucao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ execucaoId: uuid, categorias: z.array(categoria).min(1).max(8) })
      .strict()
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: r, error } = await context.supabase.rpc("autorizar_execucao", {
      _execucao_id: data.execucaoId,
      _categorias: data.categorias,
    });
    if (error) erro("Não foi possível registrar essa autorização para a execução.");
    const saida = (r ?? {}) as { concedidas?: string[]; desbloqueadas?: number };
    return {
      concedidas: saida.concedidas ?? [],
      desbloqueadas: Number(saida.desbloqueadas ?? 0),
    };
  });