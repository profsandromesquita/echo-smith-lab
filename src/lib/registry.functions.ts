import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { executarAdaptadorSimulado, type PapelAgente } from "@/lib/adaptadores-simulados";
import { testarGatekeeperSintetico } from "@/lib/agentes/gatekeeper-teste.server";
import { testarEspecialistaSintetico } from "@/lib/agentes/especialista-teste.server";
import { testarPapelOpenAISintetico } from "@/lib/agentes/openai-teste.server";

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
    provedor: z.enum(["simulado", "openai", "anthropic"]).optional(),
    modelo: z
      .string()
      .trim()
      .regex(/^(mock-[a-z0-9_-]+|gpt-5\.6|gpt-5\.6-sol|claude-fable-5)$/)
      .optional(),
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
          "id, agente_id, versao, estado, ativo, provedor, modelo, instrucoes_sistema, parametros, limite_entrada, limite_saida, timeout_ms, tentativas_max, backoff_base_ms, concorrencia, orcamento_estimado, validada_em, testada_em, publicada_em, publicada_por, arquivada_em, editada_em, motivo_alteracao, autor_id",
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
      _dados: data.dados as never,
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

/**
 * Teste antes de publicar. Versões simuladas rodam o adaptador simulado.
 * Versões com provedor real fazem uma chamada real com briefing sintético,
 * iniciada explicitamente pelo administrador técnico e sem dados de usuários.
 */
export const testarRascunho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        papel,
        confirmarChamadaReal: z.boolean().default(false),
        esforcoComparado: z.enum(["low", "medium", "high", "xhigh", "max"]).nullable().default(null),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: versao } = await context.supabase
      .from("registry_versoes")
      .select("provedor, modelo, instrucoes_sistema, parametros, limite_entrada, limite_saida, timeout_ms")
      .eq("id", data.id)
      .maybeSingle();

    if (versao?.provedor === "openai") {
      if (!data.confirmarChamadaReal) erro("Confirme o teste: ele faz uma chamada real e gera custo.");
      if (data.papel === "analise_psicologica" || data.papel === "auditor") {
        const real = await testarPapelOpenAISintetico(data.papel, versao, data.esforcoComparado);
        const { error } = await context.supabase.rpc("registry_registrar_teste", {
          _versao_id: data.id,
          _resultado: { ...real, administrativo: true, briefing: "sintetico" } as never,
        });
        if (error) erro(error.message);
        return { ...real, administrativo: true };
      }
      if (data.papel !== "gatekeeper") erro("Este papel ainda não usa o provedor OpenAI.");
      const real = await testarGatekeeperSintetico(versao);
      const { error } = await context.supabase.rpc("registry_registrar_teste", {
        _versao_id: data.id,
        _resultado: { ...real, administrativo: true, briefing: "sintetico" },
      });
      if (error) erro(error.message);
      return { ...real, administrativo: true };
    }

    if (versao?.provedor === "anthropic") {
      if (!data.confirmarChamadaReal) erro("Confirme o teste: ele faz uma chamada real e gera custo.");
      if (
        data.papel !== "hook_master" &&
        data.papel !== "headline_architect" &&
        data.papel !== "cta_specialist"
      ) {
        erro("Este papel ainda não usa o provedor Anthropic.");
      }
      const real = await testarEspecialistaSintetico(
        data.papel as "hook_master" | "headline_architect" | "cta_specialist",
        versao,
        data.esforcoComparado,
      );
      const { error } = await context.supabase.rpc("registry_registrar_teste", {
        _versao_id: data.id,
        _resultado: { ...real, administrativo: true, briefing: "sintetico" } as never,
      });
      if (error) erro(error.message);
      return { ...real, administrativo: true };
    }

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
    return { ...resultado, administrativo: false };
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
