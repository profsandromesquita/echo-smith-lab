import { adaptadorLocal } from "@/lib/feedback-local";
import {
  listarFeedbackExecucao,
  removerEdicao,
  removerFeedback,
  removerReferencia,
  salvarEdicao,
  salvarFeedback,
  salvarReferencia,
} from "@/lib/feedback.functions";
import type { AdaptadorFeedback, MapaFeedback } from "@/lib/feedback";
import type { ModoPrivacidade } from "@/lib/privacidade";

/** Híbrido autorizado: grava na conta, sempre atrás do consentimento do servidor. */
const adaptadorServidor: AdaptadorFeedback = {
  modo: "hibrido_autorizado",

  async listar(execucaoId) {
    const r = await listarFeedbackExecucao({ data: { execucaoId } });
    const mapa: MapaFeedback = { feedback: {}, edicoes: {}, referencias: {} };
    for (const f of r.feedback) mapa.feedback[f.itemId] = f;
    for (const e of r.edicoes) mapa.edicoes[e.itemId] = e;
    for (const x of r.referencias) mapa.referencias[x.itemId] = x;
    return mapa;
  },

  async registrarFeedback(e) {
    await salvarFeedback({ data: e });
  },
  async removerFeedback(execucaoId, itemId) {
    await removerFeedback({ data: { execucaoId, itemId } });
  },
  async registrarEdicao(e) {
    await salvarEdicao({ data: e });
  },
  async removerEdicao(execucaoId, itemId) {
    await removerEdicao({ data: { execucaoId, itemId } });
  },
  async usarComoReferencia(e) {
    await salvarReferencia({
      data: {
        execucaoId: e.execucaoId,
        itemId: e.itemId,
        perfilMarcaId: e.perfilMarcaId,
        titulo: e.titulo,
        texto: e.texto,
      },
    });
  },
  async removerReferencia(execucaoId, itemId) {
    await removerReferencia({ data: { execucaoId, itemId } });
  },
};

/**
 * Escolhe a estratégia de persistência pelo modo ativo. Não há fallback entre
 * as duas: em memória local estrita nada sai do dispositivo, e em híbrido nada
 * é gravado sem autorização.
 */
export function adaptadorDoModo(modo: ModoPrivacidade): AdaptadorFeedback {
  return modo === "local_estrita" ? adaptadorLocal : adaptadorServidor;
}