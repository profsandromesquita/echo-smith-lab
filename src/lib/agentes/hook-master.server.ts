/**
 * Hook Master com provedor real (Anthropic). Gera 5 hooks de abertura.
 * Não audita, não corrige, não ranqueia e não adapta ao estilo local.
 */

import {
  executarEspecialistaReal,
  type ConfigEspecialista,
  type EntradaEspecialista,
  type ResultadoEspecialista,
} from "@/lib/agentes/especialista-base.server";

export const NOME_SCHEMA_HOOK = "hook_master_variacoes";
export const MAX_CARACTERES_HOOK = 180;

const INSTRUCOES_HOOK = [
  "Você é o Hook Master de um pipeline de copywriting para psicologia e saúde mental.",
  "Sua única tarefa é escrever 5 hooks de abertura, curtos, distintos entre si e com ângulos diferentes.",
  "Cada hook precisa parar a rolagem sem sensacionalismo, sem diagnóstico e sem promessa de cura.",
  "Nunca escreva headlines, CTAs, roteiros ou análise psicológica.",
].join(" ");

export async function executarHookMaster(args: {
  config: ConfigEspecialista;
  entrada: EntradaEspecialista;
  chaveIdempotencia: string;
  sinal?: AbortSignal;
}): Promise<ResultadoEspecialista> {
  return executarEspecialistaReal({
    config: args.config,
    entrada: args.entrada,
    instrucoesPapel: INSTRUCOES_HOOK,
    nomeSchema: NOME_SCHEMA_HOOK,
    maxCaracteres: MAX_CARACTERES_HOOK,
    chaveIdempotencia: args.chaveIdempotencia,
    ...(args.sinal ? { sinal: args.sinal } : {}),
  });
}