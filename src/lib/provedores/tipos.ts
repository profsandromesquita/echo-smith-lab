/**
 * Contrato de provedor de LLM, desacoplado de fornecedor.
 * F6A: adaptador direto da OpenAI. F6B: adaptador direto da Anthropic.
 */

export type CodigoErroProvedor =
  | "config_ausente"
  | "credencial_ausente"
  | "credencial_invalida"
  | "modelo_indisponivel"
  | "rate_limit"
  | "timeout"
  | "provider_error"
  | "resposta_invalida"
  | "provider_refusal"
  | "saida_truncada"
  | "stop_reason_inesperado"
  | "cancelado"
  | "unknown_outcome";

/** Erros em que repetir a mesma chamada nunca ajuda. */
export const ERROS_SEM_RETRY: ReadonlySet<CodigoErroProvedor> = new Set([
  "config_ausente",
  "credencial_ausente",
  "credencial_invalida",
  "modelo_indisponivel",
  "provider_refusal",
  "saida_truncada",
  "stop_reason_inesperado",
  "cancelado",
]);

export interface UsoProvedor {
  tokensEntrada: number;
  tokensSaida: number;
  custoUsd: number;
}

export const USO_ZERO: UsoProvedor = { tokensEntrada: 0, tokensSaida: 0, custoUsd: 0 };

/** Níveis de esforço aceitos. OpenAI usa low/medium; Anthropic aceita a escala completa. */
export type NivelEsforco = "low" | "medium" | "high" | "xhigh" | "max";

export interface ConfiguracaoChamada {
  modelo: string;
  instrucoesSistema: string;
  /** Conteúdo do usuário, sempre tratado como dado não confiável. */
  conteudoUsuario: string;
  nomeSchema: string;
  schemaSaida: Record<string, unknown>;
  esforcoRaciocinio: NivelEsforco;
  limiteSaida: number;
  timeoutMs: number;
  /** Idempotência externa: mesma chave, mesma tentativa. */
  chaveIdempotencia: string;
  sinal?: AbortSignal;
}

export type RespostaProvedor =
  | { ok: true; dados: unknown; uso: UsoProvedor; duracaoMs: number }
  | {
      ok: false;
      codigo: CodigoErroProvedor;
      /** Mensagem já segura para o usuário final: sem payload, sem stack, sem cabeçalhos. */
      mensagemSegura: string;
      uso: UsoProvedor;
      duracaoMs: number;
      /** true quando a chamada pode ter sido processada/cobrada sem confirmação. */
      incerto?: boolean;
    };

export interface ProvedorLLM {
  readonly nome: string;
  gerarEstruturado(config: ConfiguracaoChamada): Promise<RespostaProvedor>;
}

export const MENSAGEM_SEGURA: Record<CodigoErroProvedor, string> = {
  config_ausente: "Configuração do agente indisponível. A etapa foi interrompida.",
  credencial_ausente: "Integração de IA ainda não configurada. Nada foi enviado.",
  credencial_invalida: "Integração de IA indisponível no momento. Nada foi processado.",
  modelo_indisponivel: "O modelo configurado está indisponível no momento.",
  rate_limit: "Limite de uso atingido. Nova tentativa em instantes.",
  timeout: "A análise demorou mais que o esperado. Você pode tentar novamente.",
  provider_error: "Falha temporária na análise do briefing.",
  resposta_invalida: "A resposta veio fora do formato esperado e foi descartada.",
  provider_refusal: "O provedor recusou analisar este briefing. Revise o conteúdo e tente de novo.",
  saida_truncada:
    "A resposta do modelo foi interrompida por limite de tamanho e foi descartada por segurança.",
  stop_reason_inesperado: "A resposta terminou de forma inesperada e foi descartada.",
  cancelado: "Execução cancelada.",
  unknown_outcome: "Não foi possível confirmar o resultado desta etapa.",
};