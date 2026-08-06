import { BANCO_INDEXEDDB, STORES_INDEXEDDB } from "@/lib/armazenamento-local";
import {
  MAPA_VAZIO,
  type AdaptadorFeedback,
  type EntradaEdicao,
  type EntradaFeedback,
  type EntradaReferencia,
  type MapaFeedback,
  type RegistroEdicao,
  type RegistroFeedback,
  type RegistroReferencia,
} from "@/lib/feedback";

/**
 * Memória local estrita: feedback, edições e referências vivem apenas no
 * IndexedDB deste dispositivo, dentro do namespace já declarado da Copyforja.
 * Nada aqui toca o servidor.
 */

const STORE = "memoria-estilo";
const VERSAO = 1;

type Tipo = "feedback" | "edicao" | "referencia";

interface Linha {
  chave: string;
  tipo: Tipo;
  execucaoId: string;
  itemId: string;
  dados: unknown;
}

const chaveDe = (tipo: Tipo, execucaoId: string, itemId: string) =>
  `${tipo}:${execucaoId}:${itemId}`;

function abrir(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(BANCO_INDEXEDDB, VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const nome of STORES_INDEXEDDB) {
        if (!db.objectStoreNames.contains(nome)) db.createObjectStore(nome, { keyPath: "chave" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

async function comStore<T>(
  modo: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
  padrao: T,
): Promise<T> {
  const db = await abrir();
  if (!db) return padrao;
  if (!db.objectStoreNames.contains(STORE)) {
    db.close();
    return padrao;
  }
  return new Promise<T>((resolve) => {
    const tx = db.transaction(STORE, modo);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve((req.result as T) ?? padrao);
    req.onerror = () => resolve(padrao);
    tx.oncomplete = () => db.close();
  });
}

async function todas(): Promise<Linha[]> {
  const linhas = await comStore<Linha[]>("readonly", (s) => s.getAll(), []);
  return Array.isArray(linhas) ? linhas : [];
}

async function gravar(linha: Linha) {
  await comStore<unknown>("readwrite", (s) => s.put(linha), null);
}

async function apagar(chave: string) {
  await comStore<unknown>("readwrite", (s) => s.delete(chave), null);
}

export async function listarTudoLocal() {
  const linhas = await todas();
  return linhas.map((l) => ({
    tipo: l.tipo,
    execucaoId: l.execucaoId,
    itemId: l.itemId,
    dados: l.dados,
  }));
}

export async function limparFeedbackLocal() {
  const linhas = await todas();
  for (const l of linhas) await apagar(l.chave);
  return linhas.length;
}

export const adaptadorLocal: AdaptadorFeedback = {
  modo: "local_estrita",

  async listar(execucaoId) {
    const linhas = (await todas()).filter((l) => l.execucaoId === execucaoId);
    const mapa: MapaFeedback = { ...MAPA_VAZIO, feedback: {}, edicoes: {}, referencias: {} };
    for (const l of linhas) {
      if (l.tipo === "feedback") mapa.feedback[l.itemId] = l.dados as RegistroFeedback;
      if (l.tipo === "edicao") mapa.edicoes[l.itemId] = l.dados as RegistroEdicao;
      if (l.tipo === "referencia") mapa.referencias[l.itemId] = l.dados as RegistroReferencia;
    }
    return mapa;
  },

  async registrarFeedback(e: EntradaFeedback) {
    const dados: RegistroFeedback = {
      itemId: e.itemId,
      execucaoId: e.execucaoId,
      perfilMarcaId: e.perfilMarcaId,
      formato: e.formato,
      papel: e.papel,
      sinal: e.sinal,
      motivos: e.motivos,
      comentario: e.comentario,
      atualizadoEm: new Date().toISOString(),
    };
    await gravar({
      chave: chaveDe("feedback", e.execucaoId, e.itemId),
      tipo: "feedback",
      execucaoId: e.execucaoId,
      itemId: e.itemId,
      dados,
    });
  },

  async removerFeedback(execucaoId, itemId) {
    await apagar(chaveDe("feedback", execucaoId, itemId));
  },

  async registrarEdicao(e: EntradaEdicao) {
    const dados: RegistroEdicao = {
      itemId: e.itemId,
      execucaoId: e.execucaoId,
      perfilMarcaId: e.perfilMarcaId,
      textoOriginal: e.textoOriginal,
      textoEditado: e.textoEditado,
      atualizadoEm: new Date().toISOString(),
    };
    await gravar({
      chave: chaveDe("edicao", e.execucaoId, e.itemId),
      tipo: "edicao",
      execucaoId: e.execucaoId,
      itemId: e.itemId,
      dados,
    });
  },

  async removerEdicao(execucaoId, itemId) {
    await apagar(chaveDe("edicao", execucaoId, itemId));
  },

  async usarComoReferencia(e: EntradaReferencia) {
    const dados: RegistroReferencia = {
      itemId: e.itemId,
      execucaoId: e.execucaoId,
      perfilMarcaId: e.perfilMarcaId,
      texto: e.texto,
      criadoEm: new Date().toISOString(),
    };
    await gravar({
      chave: chaveDe("referencia", e.execucaoId, e.itemId),
      tipo: "referencia",
      execucaoId: e.execucaoId,
      itemId: e.itemId,
      dados,
    });
  },

  async removerReferencia(execucaoId, itemId) {
    await apagar(chaveDe("referencia", execucaoId, itemId));
  },
};