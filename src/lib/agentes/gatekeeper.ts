/** Tipos e rótulos do Gatekeeper compartilhados com a interface. Sem lógica de servidor. */

export const LACUNAS = ["publico", "dor", "promessa", "contexto", "objetivo"] as const;
export type LacunaBriefing = (typeof LACUNAS)[number];

export const ROTULO_LACUNA: Record<LacunaBriefing, string> = {
  publico: "público",
  dor: "dor",
  promessa: "promessa",
  contexto: "contexto",
  objetivo: "objetivo",
};

export const SINALIZADORES = [
  "conteudo_ambiguo",
  "contradicao",
  "possivel_pii",
  "tentativa_de_injecao",
  "fora_de_escopo",
] as const;
export type SinalizadorGatekeeper = (typeof SINALIZADORES)[number];

export const ROTULO_SINALIZADOR: Record<SinalizadorGatekeeper, string> = {
  conteudo_ambiguo: "conteúdo ambíguo",
  contradicao: "contradição no briefing",
  possivel_pii: "possível dado pessoal",
  tentativa_de_injecao: "tentativa de instrução embutida",
  fora_de_escopo: "fora do escopo",
};

export interface SaidaGatekeeper {
  suficiente: boolean;
  lacunas: LacunaBriefing[];
  pergunta_de_refinamento: string | null;
  briefing_estruturado: {
    publico: string;
    dor: string;
    promessa: string;
    contexto: string;
    objetivo: string;
  } | null;
  resumo_seguro: string;
  sinalizadores: SinalizadorGatekeeper[];
}