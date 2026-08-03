/**
 * Motor determinístico de ranking. Sem modelo próprio.
 * Os pesos vêm da versão publicada do papel `ranking` no Registry.
 */

export interface FatoresRanking {
  nota_auditor: number;
  objetivo: number;
  formato: number;
  voz_marca: number;
  sem_cliches: number;
  confianca: number;
}

export const PESOS_PADRAO: FatoresRanking = {
  nota_auditor: 0.35,
  objetivo: 0.15,
  formato: 0.15,
  voz_marca: 0.15,
  sem_cliches: 0.1,
  confianca: 0.1,
};

export const ROTULO_FATOR: Record<keyof FatoresRanking, string> = {
  nota_auditor: "Nota do auditor",
  objetivo: "Aderência ao objetivo",
  formato: "Adequação ao formato",
  voz_marca: "Adequação à Voz de Marca",
  sem_cliches: "Ausência de clichês",
  confianca: "Confiança da avaliação",
};

export function pontuar(fatores: FatoresRanking, pesos: Partial<FatoresRanking>): number {
  const p = { ...PESOS_PADRAO, ...pesos };
  const total = (Object.keys(PESOS_PADRAO) as (keyof FatoresRanking)[]).reduce(
    (acc, k) => acc + p[k],
    0,
  );
  const soma = (Object.keys(PESOS_PADRAO) as (keyof FatoresRanking)[]).reduce(
    (acc, k) => acc + fatores[k] * p[k],
    0,
  );
  return Number((total > 0 ? soma / total : 0).toFixed(4));
}

/**
 * Quando a Voz de Marca não foi autorizada, o auditor não pode avaliá-la.
 * O fator é neutralizado: peso zero e redistribuição proporcional entre os demais.
 */
export function pesosNeutralizados(
  pesos: Partial<FatoresRanking>,
  vozMarcaAvaliavel: boolean,
): Partial<FatoresRanking> {
  const p = { ...PESOS_PADRAO, ...pesos };
  if (vozMarcaAvaliavel) return p;
  return { ...p, voz_marca: 0 };
}

/** Pontuação já com o fator de Voz de Marca neutralizado quando não avaliável. */
export function pontuarComVoz(
  fatores: FatoresRanking,
  pesos: Partial<FatoresRanking>,
  vozMarcaAvaliavel: boolean,
): number {
  return pontuar(
    vozMarcaAvaliavel ? fatores : { ...fatores, voz_marca: 0 },
    pesosNeutralizados(pesos, vozMarcaAvaliavel),
  );
}

/** Ordenação estável: score desc, depois id asc — sempre reprodutível. */
export function ordenar<T extends { id: string; score: number }>(itens: T[]): T[] {
  return [...itens].sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));
}
