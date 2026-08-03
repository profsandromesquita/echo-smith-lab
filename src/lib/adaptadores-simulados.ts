/**
 * F5 — adaptadores exclusivamente simulados.
 * Nenhuma chamada de rede, nenhum provedor real, nenhum Secret.
 * Saídas determinísticas: a mesma execução produz sempre o mesmo resultado.
 */

import { PESOS_PADRAO, pontuar, pontuarComVoz, ordenar, type FatoresRanking } from "@/lib/ranking";

export type PapelAgente =
  | "gatekeeper"
  | "analise_psicologica"
  | "hook_master"
  | "headline_architect"
  | "cta_specialist"
  | "auditor"
  | "adaptador_local"
  | "validador_preservacao"
  | "ranking"
  | "consolidador";

export const ROTULO_PAPEL: Record<PapelAgente, string> = {
  gatekeeper: "Gatekeeper",
  analise_psicologica: "Análise psicológica",
  hook_master: "Hook Master",
  headline_architect: "Headline Architect",
  cta_specialist: "Especialista em CTA",
  auditor: "Auditoria",
  adaptador_local: "Adaptação local",
  validador_preservacao: "Validação de preservação",
  ranking: "Ranking determinístico",
  consolidador: "Entrega",
};

export const PAPEL_LOCAL: Record<PapelAgente, boolean> = {
  gatekeeper: false,
  analise_psicologica: false,
  hook_master: false,
  headline_architect: false,
  cta_specialist: false,
  auditor: false,
  adaptador_local: true,
  validador_preservacao: true,
  ranking: true,
  consolidador: true,
};

export interface ResultadoSimulado {
  tipo:
    | "diretriz"
    | "variacao"
    | "auditoria"
    | "correcao"
    | "adaptacao"
    | "validacao"
    | "ranking"
    | "entrega";
  payload: Record<string, unknown>;
  versao?: "original" | "corrigida" | "adaptada";
  aprovado?: boolean;
  nota_final?: number;
}

/** Resultado já persistido de etapas anteriores da mesma execução. */
export interface ResultadoAnterior {
  tipo: string;
  payload: Record<string, unknown> | null;
  versao: string | null;
  aprovado: boolean | null;
  nota_final: number | string | null;
}

/** Hash determinístico simples — sem dependências, sem aleatoriedade. */
function semente(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function faixa(base: string, piso: number, teto: number): number {
  const amplitude = (teto - piso) * 10;
  return Number((piso + (semente(base) % amplitude) / 10).toFixed(1));
}

const MODELOS_TEXTO: Record<string, string[]> = {
  hook_master: [
    "Você não está sem disciplina. Você está sem permissão.",
    "O cansaço que não passa dormindo tem outro nome.",
    "Ninguém te contou que produtividade virou penitência.",
    "A sua agenda cheia é um jeito educado de fugir.",
    "Existe um preço silencioso por parecer bem resolvido.",
  ],
  headline_architect: [
    "O que a sua exaustão está tentando dizer",
    "Quando descansar parece uma falha de caráter",
    "A culpa que aparece toda vez que você para",
    "Por que a sua mente não desliga às 23h",
    "O limite que você adia há três anos",
  ],
  cta_specialist: [
    "Agende a primeira conversa",
    "Comece por uma sessão inicial",
    "Fale com um profissional hoje",
    "Reserve o seu horário desta semana",
    "Dê o primeiro passo agora",
  ],
};

const FORMATO_DO_PAPEL: Record<string, string> = {
  hook_master: "hook",
  headline_architect: "headline",
  cta_specialist: "cta",
};

const ESPECIALISTAS = new Set(Object.keys(MODELOS_TEXTO));

const CRITERIOS: Array<keyof FatoresRanking> = [
  "nota_auditor",
  "objetivo",
  "formato",
  "voz_marca",
  "sem_cliches",
  "confianca",
];

export function fatoresDe(chave: string): FatoresRanking {
  const f = {} as FatoresRanking;
  for (const c of CRITERIOS) f[c] = faixa(`${chave}:${c}`, 5, 10);
  return f;
}

interface Variacao {
  id: string;
  papel: string;
  formato: string;
  texto: string;
  indice: number;
  fatores: FatoresRanking;
}

/** Reconstrói, a partir dos resultados persistidos, o estado corrente de cada variação. */
function lerVariacoes(anteriores: ResultadoAnterior[]) {
  const variacoes = new Map<string, Variacao>();
  const textoAtual = new Map<string, string>();
  const corrigidas = new Set<string>();
  const reprovadas = new Set<string>();
  const notas = new Map<string, number>();
  const adaptadas = new Map<string, string>();
  // fatores e avaliabilidade da Voz de Marca vindos da auditoria real
  const criterios = new Map<string, FatoresRanking>();
  const vozAvaliavel = new Map<string, boolean>();

  for (const r of anteriores) {
    const p = (r.payload ?? {}) as Record<string, unknown>;
    const id = String(p['variacao_id'] ?? p['id'] ?? "");
    if (!id) continue;
    if (r.tipo === "variacao") {
      variacoes.set(id, p as unknown as Variacao);
      textoAtual.set(id, String(p['texto'] ?? ""));
    } else if (r.tipo === "correcao") {
      corrigidas.add(id);
      textoAtual.set(id, String(p['texto'] ?? textoAtual.get(id) ?? ""));
    } else if (r.tipo === "auditoria") {
      notas.set(id, Number(r.nota_final ?? 0));
      if (r.aprovado === false) reprovadas.add(id);
      else reprovadas.delete(id);
      if (p['criterios']) criterios.set(id, p['criterios'] as FatoresRanking);
      if (typeof p['voz_marca_avaliavel'] === "boolean") {
        vozAvaliavel.set(id, p['voz_marca_avaliavel'] as boolean);
      }
    } else if (r.tipo === "adaptacao") {
      adaptadas.set(id, String(p['texto_depois'] ?? textoAtual.get(id) ?? ""));
    }
  }
  return { variacoes, textoAtual, corrigidas, reprovadas, notas, adaptadas, criterios, vozAvaliavel };
}

/**
 * Executa o adaptador simulado de um papel. Recebe apenas identificadores, contagens e
 * os resultados já persistidos — nunca briefing bruto.
 */
export function executarAdaptadorSimulado(
  papel: PapelAgente,
  contexto: { execucaoId: string; formato: string; anteriores?: ResultadoAnterior[] },
): { resultados: ResultadoSimulado[]; duracaoMs: number } {
  const anteriores = contexto.anteriores ?? [];
  const chave = `${papel}:${contexto.execucaoId}:${contexto.formato}`;
  const duracaoMs = 250 + (semente(chave) % 600);
  const estado = lerVariacoes(anteriores);

  if (papel === "gatekeeper") {
    return {
      duracaoMs,
      resultados: [
        {
          tipo: "diretriz",
          payload: {
            campo: "gatekeeper",
            suficiente: true,
            resumo: "Público, dor e promessa identificados no briefing.",
          },
        },
      ],
    };
  }

  if (papel === "analise_psicologica") {
    return {
      duracaoMs,
      resultados: [
        {
          tipo: "diretriz",
          payload: {
            campo: "diretriz_estrategica",
            texto:
              "Nomear o conflito entre a necessidade de descanso e a crença de que parar é falhar.",
          },
        },
      ],
    };
  }

  if (ESPECIALISTAS.has(papel)) {
    const textos = MODELOS_TEXTO[papel] ?? [];
    return {
      duracaoMs,
      resultados: textos.map((texto, i) => {
        const id = `${papel}-${i + 1}`;
        return {
          tipo: "variacao" as const,
          versao: "original" as const,
          payload: {
            id,
            variacao_id: id,
            papel,
            formato: FORMATO_DO_PAPEL[papel] ?? contexto.formato,
            texto,
            indice: i + 1,
            fatores: fatoresDe(`${contexto.execucaoId}:${id}`),
          },
        };
      }),
    };
  }

  if (papel === "auditor") {
    const resultados: ResultadoSimulado[] = [];
    const porPapel = new Map<string, Variacao[]>();
    for (const v of estado.variacoes.values()) {
      const lista = porPapel.get(v.papel) ?? [];
      lista.push(v);
      porPapel.set(v.papel, lista);
    }

    for (const [papelEsp, lista] of porPapel) {
      const notas = lista.map((v) => ({
        v,
        nota: Number((pontuar(v.fatores, PESOS_PADRAO) as number).toFixed(1)),
      }));
      // pior variação do formato: recebe uma única correção e é reauditada
      const pior = ordenar(notas.map((n) => ({ id: n.v.id, score: n.nota }))).at(-1);

      for (const { v, nota } of notas) {
        const reprovada = v.id === pior?.id;
        resultados.push({
          tipo: "auditoria",
          versao: "original",
          aprovado: !reprovada,
          nota_final: nota,
          payload: {
            variacao_id: v.id,
            papel: papelEsp,
            criterios: v.fatores,
            observacao: reprovada
              ? "Promessa ampla demais para o formato. Encaminhada para correção única."
              : "Impacto, clareza de consequência e ritmo dentro do critério.",
          },
        });
      }

      if (pior) {
        const v = estado.variacoes.get(pior.id)!;
        const textoCorrigido = `${v.texto.replace(/\.$/, "")} — e isso tem consequência hoje.`;
        resultados.push({
          tipo: "correcao",
          versao: "corrigida",
          payload: {
            variacao_id: v.id,
            papel: papelEsp,
            texto_antes: v.texto,
            texto: textoCorrigido,
            motivo: "Correção única aplicada após reprovação na auditoria.",
            tentativa: 1,
          },
        });
        const notaCorrigida = faixa(`${contexto.execucaoId}:${v.id}:corrigida`, 4, 6);
        resultados.push({
          tipo: "auditoria",
          versao: "corrigida",
          aprovado: false,
          nota_final: notaCorrigida,
          payload: {
            variacao_id: v.id,
            papel: papelEsp,
            criterios: v.fatores,
            observacao:
              "Reprovada também após a correção única. Fica fora da curadoria e permanece no histórico técnico.",
            correcao_esgotada: true,
          },
        });
      }
    }
    return { duracaoMs, resultados };
  }

  if (papel === "adaptador_local") {
    const resultados: ResultadoSimulado[] = [];
    for (const v of estado.variacoes.values()) {
      if (estado.reprovadas.has(v.id)) continue;
      const antes = estado.textoAtual.get(v.id) ?? v.texto;
      resultados.push({
        tipo: "adaptacao",
        versao: "adaptada",
        payload: {
          variacao_id: v.id,
          papel: v.papel,
          texto_antes: antes,
          texto_depois: antes.replace(/^A sua|^Você/, (m) => (m === "A sua" ? "Sua" : "Você")),
          rotulo: "adaptação local",
          aplicada: true,
        },
      });
    }
    return { duracaoMs, resultados };
  }

  if (papel === "validador_preservacao") {
    const resultados: ResultadoSimulado[] = [];
    for (const [id, texto] of estado.adaptadas) {
      resultados.push({
        tipo: "validacao",
        versao: "adaptada",
        aprovado: true,
        payload: { variacao_id: id, sentido_preservado: true, texto },
      });
    }
    return { duracaoMs, resultados };
  }

  if (papel === "ranking") {
    const itens = [...estado.variacoes.values()]
      .filter((v) => !estado.reprovadas.has(v.id))
      .map((v) => {
        // fatores da auditoria real quando existirem; caso contrário, os da geração
        const fatores = estado.criterios.get(v.id) ?? v.fatores;
        const avaliavel = estado.vozAvaliavel.get(v.id) ?? true;
        return {
          id: v.id,
          score: pontuarComVoz(fatores, PESOS_PADRAO, avaliavel),
          papel: v.papel,
          voz_marca_avaliavel: avaliavel,
          texto: estado.adaptadas.get(v.id) ?? estado.textoAtual.get(v.id) ?? v.texto,
        };
      });
    const ordenados = ordenar(itens).map((i, pos) => ({ ...i, posicao: pos + 1 }));
    return {
      duracaoMs,
      resultados: [
        {
          tipo: "ranking",
          payload: { pesos: PESOS_PADRAO, itens: ordenados, calculado: true },
        },
      ],
    };
  }

  // consolidador
  const ranking = anteriores.find((r) => r.tipo === "ranking");
  const itens = (ranking?.payload?.['itens'] ?? []) as Array<Record<string, unknown>>;
  const porPapelEntrega = new Map<string, Array<Record<string, unknown>>>();
  for (const i of itens) {
    const p = String(i['papel'] ?? "");
    const lista = porPapelEntrega.get(p) ?? [];
    if (lista.length < 3) lista.push(i);
    porPapelEntrega.set(p, lista);
  }
  const entregues = [...porPapelEntrega.values()].flat();
  return {
    duracaoMs,
    resultados: [
      {
        tipo: "entrega",
        payload: {
          entregues,
          total_entregues: entregues.length,
          total_geradas: estado.variacoes.size,
          reprovadas: [...estado.reprovadas],
        },
      },
    ],
  };
}
