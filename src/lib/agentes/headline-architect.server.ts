/**
 * Headline Architect com provedor real (Anthropic). Gera 5 headlines para vídeo ou imagem.
 * Não audita, não corrige, não ranqueia e não adapta ao estilo local.
 */

import {
  executarEspecialistaReal,
  type ConfigEspecialista,
  type EntradaEspecialista,
  type ResultadoEspecialista,
} from "@/lib/agentes/especialista-base.server";

export const NOME_SCHEMA_HEADLINE = "headline_architect_variacoes";
export const MAX_CARACTERES_HEADLINE = 120;

const BASE = [
  "Você é o Headline Architect de um pipeline de copywriting para psicologia e saúde mental.",
  "Sua única tarefa é escrever 5 headlines distintas entre si, com ângulos diferentes.",
  "Sem sensacionalismo, sem diagnóstico, sem promessa de cura e sem clichês de mercado.",
  "Nunca escreva hooks, CTAs, roteiros ou análise psicológica.",
].join(" ");

const POR_FORMATO: Record<string, string> = {
  headline_video:
    "Formato vídeo: a headline é falada ou exibida nos primeiros segundos e precisa funcionar em leitura rápida.",
  headline_imagem:
    "Formato imagem: a headline é lida estática, precisa ser autoexplicativa e caber em pouco espaço.",
};

export async function executarHeadlineArchitect(args: {
  config: ConfigEspecialista;
  entrada: EntradaEspecialista;
  chaveIdempotencia: string;
  sinal?: AbortSignal;
}): Promise<ResultadoEspecialista> {
  const especifico = POR_FORMATO[args.entrada.formato] ?? POR_FORMATO['headline_video']!;
  return executarEspecialistaReal({
    config: args.config,
    entrada: args.entrada,
    instrucoesPapel: `${BASE} ${especifico}`,
    nomeSchema: NOME_SCHEMA_HEADLINE,
    maxCaracteres: MAX_CARACTERES_HEADLINE,
    chaveIdempotencia: args.chaveIdempotencia,
    ...(args.sinal ? { sinal: args.sinal } : {}),
  });
}