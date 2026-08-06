import type { ModoPrivacidade } from "@/lib/privacidade";

/**
 * Etapa 1 — Captura de feedback.
 *
 * A interface nunca decide onde gravar: ela fala com um adaptador de contrato
 * único. O modo de privacidade ativo escolhe a implementação (dispositivo ou
 * conta na nuvem). Não existe fallback de um para o outro em nenhuma direção.
 */

export type SinalFeedback = "positivo" | "negativo";

export const MOTIVOS_NEGATIVOS = [
  "generico",
  "clichê",
  "longo_demais",
  "pouco_claro",
  "agressivo_demais",
  "fraco",
  "desalinhado_marca",
  "publico_errado",
  "outro",
] as const;

export type MotivoNegativo = (typeof MOTIVOS_NEGATIVOS)[number];

export const ROTULO_MOTIVO: Record<MotivoNegativo, string> = {
  generico: "Genérico",
  "clichê": "Clichê",
  longo_demais: "Longo demais",
  pouco_claro: "Pouco claro",
  agressivo_demais: "Agressivo demais",
  fraco: "Fraco",
  desalinhado_marca: "Desalinhado com a voz de marca",
  publico_errado: "Não corresponde ao público",
  outro: "Outro",
};

export interface RegistroFeedback {
  itemId: string;
  execucaoId: string;
  perfilMarcaId: string | null;
  formato: string;
  papel: string;
  sinal: SinalFeedback;
  motivos: string[];
  comentario: string;
  atualizadoEm: string;
}

export interface RegistroEdicao {
  itemId: string;
  execucaoId: string;
  perfilMarcaId: string | null;
  textoOriginal: string;
  textoEditado: string;
  atualizadoEm: string;
}

export interface RegistroReferencia {
  itemId: string;
  execucaoId: string;
  perfilMarcaId: string | null;
  texto: string;
  criadoEm: string;
}

export interface MapaFeedback {
  feedback: Record<string, RegistroFeedback>;
  edicoes: Record<string, RegistroEdicao>;
  referencias: Record<string, RegistroReferencia>;
}

export const MAPA_VAZIO: MapaFeedback = { feedback: {}, edicoes: {}, referencias: {} };

export interface EntradaFeedback {
  execucaoId: string;
  itemId: string;
  resultadoId: string | null;
  perfilMarcaId: string | null;
  formato: string;
  papel: string;
  sinal: SinalFeedback;
  motivos: string[];
  comentario: string;
}

export interface EntradaEdicao {
  execucaoId: string;
  itemId: string;
  resultadoId: string | null;
  perfilMarcaId: string | null;
  textoOriginal: string;
  textoEditado: string;
}

export interface EntradaReferencia {
  execucaoId: string;
  itemId: string;
  resultadoId: string | null;
  perfilMarcaId: string;
  titulo: string;
  texto: string;
}

export interface AdaptadorFeedback {
  modo: ModoPrivacidade;
  listar(execucaoId: string): Promise<MapaFeedback>;
  registrarFeedback(entrada: EntradaFeedback): Promise<void>;
  removerFeedback(execucaoId: string, itemId: string): Promise<void>;
  registrarEdicao(entrada: EntradaEdicao): Promise<void>;
  removerEdicao(execucaoId: string, itemId: string): Promise<void>;
  usarComoReferencia(entrada: EntradaReferencia): Promise<void>;
  removerReferencia(execucaoId: string, itemId: string): Promise<void>;
}

export const chavesFeedback = {
  raiz: ["feedback"] as const,
  execucao: (modo: ModoPrivacidade, execucaoId: string) =>
    ["feedback", modo, execucaoId] as const,
  autorizacao: ["feedback", "autorizacao"] as const,
  local: ["feedback", "local", "tudo"] as const,
};

export const AVISO_LOCAL =
  "Este aprendizado fica somente neste dispositivo. Não é enviado à nuvem nem compartilhado com outros dispositivos ou navegadores.";

export const AVISO_HIBRIDO =
  "Seu feedback é guardado na sua conta, apenas para você. Ele não é enviado a provedores de IA nesta etapa.";
/** Identidade do consentimento usado pela captura no modo híbrido autorizado. */
export const CATEGORIA_FEEDBACK = "preferencias_inferidas";
export const ETAPA_FEEDBACK = "feedback";
export const PROVEDOR_FEEDBACK = "simulado";
