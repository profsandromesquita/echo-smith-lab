/**
 * Armazenamento local da Copyforja, sempre sob namespace próprio.
 * A limpeza remove apenas o que está declarado aqui — nunca varre a origem inteira.
 * Sessão de autenticação e chaves de outras funcionalidades ficam intactas.
 */

export const PREFIXO = "copyforja:";
export const BANCO_INDEXEDDB = "copyforja";
export const STORES_INDEXEDDB = ["memoria-estilo", "cache-pii", "modelo-local"] as const;

export const RECURSOS_LOCAIS = [
  { id: "preferencias", rotulo: "Preferências locais", detalhe: `chaves ${PREFIXO}pref.*` },
  { id: "cache-pii", rotulo: "Cache de detecção de dados pessoais", detalhe: "IndexedDB cache-pii" },
  { id: "memoria-estilo", rotulo: "Memória local de estilo", detalhe: "IndexedDB memoria-estilo" },
  { id: "modelo-local", rotulo: "Artefatos do modelo local", detalhe: "IndexedDB modelo-local" },
] as const;

export const PRESERVADOS = [
  "Sessão de autenticação",
  "Configurações necessárias ao funcionamento",
  "Qualquer chave fora do namespace copyforja:",
];

const chave = (nome: string) => `${PREFIXO}${nome}`;

export function lerLocal<T>(nome: string, padrao: T): T {
  if (typeof window === "undefined") return padrao;
  try {
    const bruto = window.localStorage.getItem(chave(nome));
    return bruto ? (JSON.parse(bruto) as T) : padrao;
  } catch {
    return padrao;
  }
}

export function gravarLocal(nome: string, valor: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(chave(nome), JSON.stringify(valor));
  } catch {
    /* armazenamento indisponível: preferência simplesmente não persiste */
  }
}

function apagarBanco(nome: string) {
  return new Promise<void>((resolve) => {
    if (typeof indexedDB === "undefined") return resolve();
    const req = indexedDB.deleteDatabase(nome);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

/** Remove somente o namespace da Copyforja e devolve a lista do que foi removido. */
export async function limparDadosLocais(): Promise<string[]> {
  const removidos: string[] = [];

  if (typeof window !== "undefined") {
    const chaves: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIXO)) chaves.push(k);
    }
    for (const k of chaves) {
      window.localStorage.removeItem(k);
      removidos.push(k);
    }
  }

  await apagarBanco(BANCO_INDEXEDDB);
  for (const store of STORES_INDEXEDDB) removidos.push(`${BANCO_INDEXEDDB}/${store}`);

  return removidos;
}