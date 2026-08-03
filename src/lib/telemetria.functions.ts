import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Único caminho de escrita em eventos técnicos.
 * Schema fechado: nenhum campo de texto livre, nenhuma mensagem original, nenhum conteúdo.
 */
export const CODIGOS_ERRO = [
  "timeout",
  "rate_limit",
  "invalid_input",
  "provider_error",
  "unknown_outcome",
] as const;

export type CodigoErro = (typeof CODIGOS_ERRO)[number];

/** Normaliza qualquer falha para um código fechado. A mensagem original nunca é persistida. */
export function normalizarErro(e: unknown): CodigoErro {
  const texto = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
  if (texto.includes("timeout") || texto.includes("abort")) return "timeout";
  if (texto.includes("rate") || texto.includes("429")) return "rate_limit";
  if (texto.includes("invalid") || texto.includes("parse") || texto.includes("zod"))
    return "invalid_input";
  if (texto.includes("provider") || texto.includes("upstream")) return "provider_error";
  return "unknown_outcome";
}

const entrada = z
  .object({
    tipo: z.enum(["etapa", "execucao", "consentimento", "deteccao_local", "exportacao"]),
    etapa: z.string().trim().max(40).nullable().default(null),
    provedor: z.string().trim().max(40).nullable().default(null),
    modelo: z.string().trim().max(60).nullable().default(null),
    duracaoMs: z.number().int().min(0).max(3_600_000).nullable().default(null),
    status: z.enum(["ok", "erro", "cancelado", "unknown_outcome"]),
    codigoErro: z.enum(CODIGOS_ERRO).nullable().default(null),
    tentativas: z.number().int().min(1).max(20).default(1),
    custoEstimado: z.number().min(0).max(9999).nullable().default(null),
    chatId: z.string().uuid().nullable().default(null),
  })
  .strict();

export const registrarEvento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => entrada.parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("registrar_evento_tecnico", {
      _tipo: data.tipo,
      _etapa: data.etapa as string,
      _provedor: data.provedor as string,
      _modelo: data.modelo as string,
      _duracao_ms: data.duracaoMs as number,
      _status: data.status,
      _codigo_erro: data.codigoErro as string,
      _tentativas: data.tentativas,
      _custo: data.custoEstimado as number,
      _chat_id: data.chatId as string,
    });
    // Falha de telemetria nunca interrompe o fluxo do usuário.
    return { ok: !error };
  });

export const listarEventos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("eventos_tecnicos")
      .select("id, tipo, etapa, provedor, modelo, duracao_ms, status, codigo_erro, criado_em")
      .order("criado_em", { ascending: false })
      .limit(50);
    return data ?? [];
  });