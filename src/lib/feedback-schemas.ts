import { z } from "zod";

/** Schemas de entrada da captura de feedback. Compartilhados cliente/servidor. */
export const uuidFb = z.string().uuid();
export const itemIdFb = z.string().trim().min(1).max(200);

export const entradaExecucao = z.object({ execucaoId: uuidFb }).strict();
export const entradaItem = z.object({ execucaoId: uuidFb, itemId: itemIdFb }).strict();

export const entradaFeedback = z
  .object({
    execucaoId: uuidFb,
    itemId: itemIdFb,
    resultadoId: uuidFb.nullable().default(null),
    perfilMarcaId: uuidFb.nullable().default(null),
    formato: z.string().trim().max(60).default(""),
    papel: z.string().trim().max(60).default(""),
    sinal: z.enum(["positivo", "negativo"]),
    motivos: z.array(z.string().trim().max(60)).max(12).default([]),
    comentario: z.string().trim().max(1000).default(""),
  })
  .strict();

export const entradaEdicaoFb = z
  .object({
    execucaoId: uuidFb,
    itemId: itemIdFb,
    resultadoId: uuidFb.nullable().default(null),
    perfilMarcaId: uuidFb.nullable().default(null),
    textoOriginal: z.string().max(4000),
    textoEditado: z.string().trim().min(1).max(4000),
  })
  .strict();

export const entradaReferenciaFb = z
  .object({
    execucaoId: uuidFb,
    itemId: itemIdFb,
    perfilMarcaId: uuidFb,
    titulo: z.string().trim().max(120).default(""),
    texto: z.string().trim().min(1).max(4000),
  })
  .strict();

export const entradaDecisao = z
  .object({ decisao: z.enum(["concedido", "recusado"]) })
  .strict();
