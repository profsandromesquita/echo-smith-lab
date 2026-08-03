/**
 * CTA Specialist com provedor real (Anthropic). Gera 5 chamadas para ação.
 * O modelo devolve somente conteúdo criativo: identificador, execução, etapa,
 * lote, papel, versão e estado são gerados e persistidos pelo servidor.
 */

import { z } from "zod";
import {
  executarEstruturadoAnthropic,
  montarConteudoEspecialista,
  type ConfigEspecialista,
  type EntradaEspecialista,
  type ResultadoEstruturado,
} from "@/lib/agentes/especialista-base.server";

export const NOME_SCHEMA_CTA = "cta_specialist_variacoes";
export const MAX_CARACTERES_CTA = 120;

export const TIPOS_ACAO_CTA = [
  "agendar",
  "iniciar_conversa",
  "baixar_material",
  "assinar_lista",
  "responder_pergunta",
  "saber_mais",
] as const;

export const INTENSIDADES_CTA = ["suave", "media", "direta"] as const;
export const FORMATOS_DESTINO_CTA = ["anuncio", "post", "story", "email", "landing"] as const;

export interface CtaGerado {
  texto: string;
  tipo_acao: (typeof TIPOS_ACAO_CTA)[number];
  intensidade: (typeof INTENSIDADES_CTA)[number];
  intencao: string;
  formato_destino: (typeof FORMATOS_DESTINO_CTA)[number];
  alerta_promessa: boolean;
  alerta_cliche: boolean;
  justificativa: string;
}

const INSTRUCOES_CTA = [
  "Você é o CTA Specialist de um pipeline de copywriting para psicologia e saúde mental.",
  "Sua única tarefa é escrever exatamente 5 chamadas para ação claras, específicas e acionáveis.",
  "Respeite o objetivo, o formato, o nível de consciência e o estágio da mensagem do briefing.",
  "Considere a diretriz psicológica e a Voz de Marca quando fornecidas.",
  "Varie a intensidade e o mecanismo de ação entre as variações.",
  "Nunca crie urgência falsa, promessa não sustentada, garantia de resultado ou linguagem genérica.",
  "Nunca repita literalmente hooks ou headlines, não audite, não atribua notas e não altere o briefing.",
  "Não invente identificadores, versões, notas ou metadados de controle.",
].join(" ");

export function schemaCta(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["variacoes"],
    properties: {
      variacoes: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "texto",
            "tipo_acao",
            "intensidade",
            "intencao",
            "formato_destino",
            "alerta_promessa",
            "alerta_cliche",
            "justificativa",
          ],
          properties: {
            texto: { type: "string", maxLength: MAX_CARACTERES_CTA },
            tipo_acao: { type: "string", enum: [...TIPOS_ACAO_CTA] },
            intensidade: { type: "string", enum: [...INTENSIDADES_CTA] },
            intencao: { type: "string" },
            formato_destino: { type: "string", enum: [...FORMATOS_DESTINO_CTA] },
            alerta_promessa: { type: "boolean" },
            alerta_cliche: { type: "boolean" },
            justificativa: { type: "string" },
          },
        },
      },
    },
  };
}

/** Revalidação local estrita: 5 itens, enums fechados e sem duplicata literal. */
export const validadorCta = z
  .object({
    variacoes: z
      .array(
        z
          .object({
            texto: z.string().trim().min(1).max(MAX_CARACTERES_CTA),
            tipo_acao: z.enum(TIPOS_ACAO_CTA),
            intensidade: z.enum(INTENSIDADES_CTA),
            intencao: z.string().trim().min(1).max(160),
            formato_destino: z.enum(FORMATOS_DESTINO_CTA),
            alerta_promessa: z.boolean(),
            alerta_cliche: z.boolean(),
            justificativa: z.string().trim().max(400),
          })
          .strict(),
      )
      .length(5)
      .refine(
        (itens) =>
          new Set(itens.map((i) => i.texto.trim().toLowerCase())).size === itens.length,
        "duplicata literal",
      ),
  })
  .strict();

export async function executarCtaSpecialist(args: {
  config: ConfigEspecialista;
  entrada: EntradaEspecialista;
  chaveIdempotencia: string;
  sinal?: AbortSignal;
}): Promise<ResultadoEstruturado<{ variacoes: CtaGerado[] }>> {
  return executarEstruturadoAnthropic<{ variacoes: CtaGerado[] }>({
    config: args.config,
    conteudoUsuario: montarConteudoEspecialista(args.entrada, args.config.limiteEntrada),
    instrucoesPapel: INSTRUCOES_CTA,
    nomeSchema: NOME_SCHEMA_CTA,
    schema: schemaCta(),
    validador: validadorCta,
    chaveIdempotencia: args.chaveIdempotencia,
    ...(args.sinal ? { sinal: args.sinal } : {}),
  });
}