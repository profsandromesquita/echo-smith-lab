/**
 * Conteúdo demonstrativo da F0 que chegou a ser gravado como mensagem de plataforma.
 * Mantido apenas como assinatura para reconhecimento exato na renderização: os
 * registros continuam no banco, mas não são exibidos como resposta, análise ou
 * diretriz. Nunca use este texto como conteúdo, fallback ou entrada de execução.
 */
const TEXTO_LEGADO_SIMULADO =
  "Briefing suficiente. Conflito inconsciente identificado: medo do julgamento disfarçado de falta de tempo. Diretriz compartilhada com os especialistas.";

/** Comparação exata e restrita à origem: nunca esconde mensagem real de plataforma. */
export function ehMensagemLegadaSimulada(mensagem: { autor: string; texto: string }): boolean {
  return mensagem.autor === "plataforma" && mensagem.texto.trim() === TEXTO_LEGADO_SIMULADO;
}