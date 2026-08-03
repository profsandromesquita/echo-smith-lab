import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { executarAdaptadorSimulado, type PapelAgente } from "@/lib/adaptadores-simulados";

const uuid = z.string().uuid();

const papel = z.enum([
  "gatekeeper",
  "analise_psicologica",
  "hook_master",
  "headline_architect",
  "cta_specialist",
  "auditor",
  "adaptador_local",
  "validador_preservacao",
  "consolidador",
  "ranking",
]);

const camposEditaveis = z
  .object({
    ativo: z.boolean().optional(),
    modelo: z.string().trim().regex(/^mock-[a-z0-9_-]+$/).optional(),
    instrucoes_sistema: z.string().trim().max(8000).optional(),
    schema_entrada: z.record(z.string(), z.unknown()).optional(),
    schema_saida: z.record(z.string(), z.unknown()).optional(),
    limite_entrada: z.number().int().min(1).max(200000).optional(),
    limite_saida: z.number().int().min(1).max(200000).optional(),
    timeout_ms: z.number().int().min(1000).max(300000).optional(),
    tentativas_max: z.number().int().min(1).max(10).optional(),
    backoff_base_ms: z.number().int().min(100).max(60000).optional(),
    concorrencia: z.number().int().min(1).max(20).optional(),
    orcamento_estimado: z.number().min(0).max(9999).optional(),
    parametros: z.record(z.string(), z.unknown()).optional(),
    fallback: z.record(z.string(), z.unknown()).optional(),
    observacoes: z.string().trim().max(2000).optional(),
    motivo_alteracao: z.string().trim().max(400).optional(),
  })
  .strict();

function erro(mensagem: string): never {
  throw new Error(mensagem);
}

export const listarRegistry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [agentes, versoes] = await Promise.all([
      context.supabase
        .from("registry_agentes")
        .select("id, papel, nome_exibicao, descricao, versao_publicada_id, versao_rascunho_id, atualizado_em")
        .order("papel"),
      context.supabase
        .from("registry_versoes")
        .select(
          "id, agente_id, versao, estado, ativo, provedor, modelo, limite_entrada, limite_saida, timeout_ms, tentativas_max, backoff_base_ms, concorrencia, orcamento_estimado, validada_em, testada_em, publicada_em, publicada_por, arquivada_em, editada_em, motivo_alteracao, autor_id",
        )
        .order("versao", { ascending: false }),
    ]);
    if (agentes.error) erro("Área restrita ao administrador técnico.");
    if (versoes.error) erro("Área restrita ao administrador técnico.");
    return { agentes: agentes.data ?? [], versoes: versoes.data ?? [] };
  });

export const obterVersao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).strict().parse(d))
  .handler(async ({ context, data }) => {
    const { data: v, error } = await context.supabase
      .from("registry_versoes")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !v) erro("Versão indisponível.");
    return v;
  });

export const criarRascunho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ papel, baseVersaoId: uuid.nullable().default(null), motivo: z.string().trim().max(400).default("") }).strict().parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: id, error } = await context.supabase.rpc("registry_criar_rascunho", {
      _papel: data.papel,
      _base_versao_id: data.baseVersaoId as string,
      _motivo: data.motivo,
    });
    if (error) erro(error.message);
    return { id: id as string };
  });

export const atualizarRascunho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, dados: camposEditaveis }).strict().parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("registry_atualizar_rascunho", {
      _versao_id: data.id,
      _dados: data.dados,
    });
    if (error) erro(error.message);
    return { ok: true };
  });

export const validarRascunho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).strict().parse(d))
  .handler(async ({ context, data }) => {
    const { data: r, error } = await context.supabase.rpc("registry_validar", { _versao_id: data.id });
    if (error) erro(error.message);
    return r as { ok: boolean; problemas?: string[] };
  });

/** Teste antes de publicar: roda o adaptador simulado do papel. Nenhum provedor real. */
export const testarRascunho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, papel }).strict().parse(d))
  .handler(async ({ context, data }) => {
    const simulado = executarAdaptadorSimulado(data.papel as PapelAgente, {
      execucaoId: data.id,
      formato: "teste",
    });
    const resultado = {
      ok: true,
      provedor: "simulado",
      duracao_ms: simulado.duracaoMs,
      saidas: simulado.resultados.length,
    };
    const { error } = await context.supabase.rpc("registry_registrar_teste", {
      _versao_id: data.id,
      _resultado: resultado,
    });
    if (error) erro(error.message);
    return resultado;
  });

export const publicarRascunho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, motivo: z.string().trim().max(400).default("") }).strict().parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("registry_publicar", {
      _versao_id: data.id,
      _motivo: data.motivo,
    });
    if (error) erro(error.message);
    return { ok: true };
  });

export const descartarRascunho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).strict().parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("registry_descartar_rascunho", { _versao_id: data.id });
    if (error) erro(error.message);
    return { ok: true };
  });
