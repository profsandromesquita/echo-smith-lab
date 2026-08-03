/**
 * F5 — adaptadores exclusivamente simulados.
 * Nenhuma chamada de rede, nenhum provedor real, nenhum Secret.
 * Saídas determinísticas: o mesmo papel com a mesma semente produz o mesmo resultado.
 */

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

/** Hash determinístico simples — sem dependências, sem aleatoriedade. */
function semente(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function nota(base: string, piso = 6, teto = 10): number {
  const faixa = teto - piso;
  return Number((piso + (semente(base) % (faixa * 10)) / 10).toFixed(1));
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

const ESPECIALISTAS = new Set(["hook_master", "headline_architect", "cta_specialist"]);

/**
 * Executa o adaptador simulado de um papel. Recebe apenas identificadores e contagens,
 * nunca briefing bruto — o conteúdo mockado é gerado localmente.
 */
export function executarAdaptadorSimulado(
  papel: PapelAgente,
  contexto: { execucaoId: string; formato: string },
): { resultados: ResultadoSimulado[]; duracaoMs: number } {
  const chave = `${papel}:${contexto.execucaoId}:${contexto.formato}`;
  const duracaoMs = 250 + (semente(chave) % 600);

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
      resultados: textos.map((texto, i) => ({
        tipo: "variacao" as const,
        versao: "original" as const,
        payload: { texto, indice: i + 1, papel },
      })),
    };
  }

  if (papel === "auditor") {
    return {
      duracaoMs,
      resultados: [
        {
          tipo: "auditoria",
          payload: {
            criterios: ["impacto", "clareza_consequencia", "ritmo"],
            observacao: "Uma variação por formato foi encaminhada para correção única.",
          },
          nota_final: nota(chave, 7),
        },
      ],
    };
  }

  if (papel === "adaptador_local") {
    return {
      duracaoMs,
      resultados: [
        {
          tipo: "adaptacao",
          versao: "adaptada",
          payload: { aplicada: true, rotulo: "adaptação local" },
        },
      ],
    };
  }

  if (papel === "validador_preservacao") {
    return {
      duracaoMs,
      resultados: [
        { tipo: "validacao", aprovado: true, payload: { sentido_preservado: true } },
      ],
    };
  }

  if (papel === "ranking") {
    return { duracaoMs, resultados: [{ tipo: "ranking", payload: { calculado: true } }] };
  }

  return {
    duracaoMs,
    resultados: [{ tipo: "entrega", payload: { entregues: 3, geradas: 5 } }],
  };
}
