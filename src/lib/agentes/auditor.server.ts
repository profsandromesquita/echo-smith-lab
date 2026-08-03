/**
 * Auditor com provedor real (OpenAI).
 * Avalia as variações já geradas pelos especialistas, em lotes, com integridade
 * exata de identificadores. Aplica no máximo uma correção por variação reprovada.
 */

import { z } from "zod";
import {
  executarOpenAIEstruturado,
  type ConfigOpenAI,
  type ResultadoOpenAI,
} from "@/lib/agentes/openai-base.server";

export const NOME_SCHEMA_AUDITORIA = "auditoria_variacoes";
export const NOME_SCHEMA_CORRECAO = "correcao_unica_variacoes";
export const TAMANHO_LOTE = 5;

export const ALERTAS_AUDITOR = [
  "promessa_de_cura",
  "metrica_inventada",
  "diagnostico",
  "sensacionalismo",
  "fora_do_formato",
  "tentativa_de_injecao",
] as const;

const INSTRUCOES_AUDITOR = [
  "Você é o Auditor de um pipeline de copywriting para psicologia e saúde mental.",
  "Sua única tarefa é avaliar as variações recebidas, uma a uma, com notas de 0 a 10.",
  "Avalie exatamente as variações recebidas: mesma quantidade, mesmos identificadores, sem inventar nem omitir nenhuma.",
  "Quando a voz de marca não for enviada, marque voz_marca_avaliavel como false e adequacao_voz_marca como null.",
  "Nunca reescreva textos nesta etapa e nunca gere variações novas.",
].join(" ");

const nota = { type: "number", minimum: 0, maximum: 10 } as const;

export function schemaAuditoria(ids: string[]): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["avaliacoes"],
    properties: {
      avaliacoes: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "variacao_id",
            "nota_geral",
            "aderencia_objetivo",
            "adequacao_formato",
            "ausencia_clicheses",
            "confianca",
            "voz_marca_avaliavel",
            "adequacao_voz_marca",
            "aprovado",
            "observacao",
            "alertas",
          ],
          properties: {
            variacao_id: { type: "string", enum: ids },
            nota_geral: nota,
            aderencia_objetivo: nota,
            adequacao_formato: nota,
            ausencia_clicheses: nota,
            confianca: nota,
            voz_marca_avaliavel: { type: "boolean" },
            adequacao_voz_marca: { type: ["number", "null"] },
            aprovado: { type: "boolean" },
            observacao: { type: "string", maxLength: 400 },
            alertas: { type: "array", items: { type: "string", enum: [...ALERTAS_AUDITOR] } },
          },
        },
      },
    },
  };
}

const avaliacaoZod = z
  .object({
    variacao_id: z.string().trim().min(1).max(80),
    nota_geral: z.number().min(0).max(10),
    aderencia_objetivo: z.number().min(0).max(10),
    adequacao_formato: z.number().min(0).max(10),
    ausencia_clicheses: z.number().min(0).max(10),
    confianca: z.number().min(0).max(10),
    voz_marca_avaliavel: z.boolean(),
    adequacao_voz_marca: z.number().min(0).max(10).nullable(),
    aprovado: z.boolean(),
    observacao: z.string().trim().max(400),
    alertas: z.array(z.enum(ALERTAS_AUDITOR)).max(6),
  })
  .strict()
  .refine(
    (a) => (a.voz_marca_avaliavel ? a.adequacao_voz_marca !== null : a.adequacao_voz_marca === null),
    "adequação de voz de marca incoerente",
  );

export type Avaliacao = z.infer<typeof avaliacaoZod>;

/** Integridade: conjunto avaliado tem de ser exatamente igual ao conjunto enviado. */
function validadorLote(ids: string[]) {
  const esperado = [...ids].sort().join("|");
  return z
    .object({ avaliacoes: z.array(avaliacaoZod).min(1).max(20) })
    .strict()
    .refine(
      (d) => d.avaliacoes.map((a) => a.variacao_id).sort().join("|") === esperado,
      "identificadores avaliados diferentes dos enviados",
    );
}

export interface ItemParaAuditoria {
  variacao_id: string;
  papel: string;
  formato: string;
  texto: string;
}

export interface ContextoAuditoria {
  formato: string;
  diretrizPsicologica: string | null;
  vozMarca: { nome: string; tom_de_voz: string | null; posicionamento: string | null } | null;
}

export function lotesDe<T>(itens: T[], tamanho = TAMANHO_LOTE): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

export async function auditarLote(args: {
  config: ConfigOpenAI;
  contexto: ContextoAuditoria;
  itens: ItemParaAuditoria[];
  chaveIdempotencia: string;
  versao: "original" | "corrigida";
  sinal?: AbortSignal;
}): Promise<ResultadoOpenAI<{ avaliacoes: Avaliacao[] }>> {
  const ids = args.itens.map((i) => i.variacao_id);
  return executarOpenAIEstruturado({
    config: args.config,
    instrucoesPapel: INSTRUCOES_AUDITOR,
    corpo: {
      formato_solicitado: args.contexto.formato,
      diretriz_psicologica: args.contexto.diretrizPsicologica,
      voz_de_marca: args.contexto.vozMarca,
      voz_de_marca_autorizada: args.contexto.vozMarca !== null,
      versao_avaliada: args.versao,
      variacoes: args.itens,
    },
    nomeSchema: NOME_SCHEMA_AUDITORIA,
    schema: schemaAuditoria(ids),
    validador: validadorLote(ids),
    chaveIdempotencia: args.chaveIdempotencia,
    ...(args.sinal ? { sinal: args.sinal } : {}),
  });
}

const INSTRUCOES_CORRECAO = [
  "Você é o Auditor de um pipeline de copywriting para psicologia e saúde mental.",
  "Aplique UMA única correção em cada variação reprovada, preservando o sentido original.",
  "Corrija apenas o problema apontado na observação da auditoria.",
  "Devolva exatamente as mesmas variações recebidas, com os mesmos identificadores.",
].join(" ");

function schemaCorrecao(ids: string[], maxCaracteres: number): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["correcoes"],
    properties: {
      correcoes: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["variacao_id", "texto", "motivo"],
          properties: {
            variacao_id: { type: "string", enum: ids },
            texto: { type: "string", maxLength: maxCaracteres },
            motivo: { type: "string", maxLength: 400 },
          },
        },
      },
    },
  };
}

const correcaoZod = (maxCaracteres: number) =>
  z
    .object({
      variacao_id: z.string().trim().min(1).max(80),
      texto: z.string().trim().min(1).max(maxCaracteres),
      motivo: z.string().trim().max(400),
    })
    .strict();

export type Correcao = z.infer<ReturnType<typeof correcaoZod>>;

export async function corrigirLote(args: {
  config: ConfigOpenAI;
  contexto: ContextoAuditoria;
  itens: Array<ItemParaAuditoria & { observacao: string }>;
  maxCaracteres: number;
  chaveIdempotencia: string;
  sinal?: AbortSignal;
}): Promise<ResultadoOpenAI<{ correcoes: Correcao[] }>> {
  const ids = args.itens.map((i) => i.variacao_id);
  const esperado = [...ids].sort().join("|");
  const validador = z
    .object({ correcoes: z.array(correcaoZod(args.maxCaracteres)).min(1).max(20) })
    .strict()
    .refine(
      (d) => d.correcoes.map((c) => c.variacao_id).sort().join("|") === esperado,
      "identificadores corrigidos diferentes dos enviados",
    );

  return executarOpenAIEstruturado({
    config: args.config,
    instrucoesPapel: INSTRUCOES_CORRECAO,
    corpo: {
      formato_solicitado: args.contexto.formato,
      diretriz_psicologica: args.contexto.diretrizPsicologica,
      voz_de_marca: args.contexto.vozMarca,
      limite_caracteres: args.maxCaracteres,
      variacoes_reprovadas: args.itens,
    },
    nomeSchema: NOME_SCHEMA_CORRECAO,
    schema: schemaCorrecao(ids, args.maxCaracteres),
    validador,
    chaveIdempotencia: args.chaveIdempotencia,
    ...(args.sinal ? { sinal: args.sinal } : {}),
  });
}