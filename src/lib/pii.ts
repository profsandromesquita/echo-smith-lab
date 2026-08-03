/**
 * Detecção local de dados pessoais.
 * Roda inteiramente no navegador, é determinística e nunca faz rede.
 * O texto analisado jamais é enviado ao backend.
 */

export type TipoPii =
  | "email"
  | "telefone"
  | "cpf"
  | "cnpj"
  | "cep"
  | "cartao"
  | "url_identificada"
  | "data_nascimento"
  | "nome_proprio"
  | "termo_sensivel";

export type Confianca = "alta" | "media";

export interface AchadoPii {
  tipo: TipoPii;
  trecho: string;
  inicio: number;
  fim: number;
  confianca: Confianca;
}

export const ROTULO_PII: Record<TipoPii, string> = {
  email: "E-mail",
  telefone: "Telefone",
  cpf: "CPF",
  cnpj: "CNPJ",
  cep: "CEP",
  cartao: "Cartão",
  url_identificada: "Link com identificador",
  data_nascimento: "Data de nascimento",
  nome_proprio: "Nome próprio",
  termo_sensivel: "Dado sensível de saúde",
};

const SUBSTITUTO: Record<TipoPii, string> = {
  email: "[EMAIL]",
  telefone: "[TELEFONE]",
  cpf: "[CPF]",
  cnpj: "[CNPJ]",
  cep: "[CEP]",
  cartao: "[CARTAO]",
  url_identificada: "[LINK]",
  data_nascimento: "[DATA]",
  nome_proprio: "[NOME]",
  termo_sensivel: "[DADO SENSIVEL]",
};

const so = (v: string) => v.replace(/\D/g, "");

function cpfValido(valor: string) {
  const d = so(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

function cnpjValido(valor: string) {
  const d = so(valor);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (ate: number) => {
    let peso = ate - 7;
    let soma = 0;
    for (let i = 0; i < ate; i++) {
      soma += Number(d[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

function luhnValido(valor: string) {
  const d = so(valor);
  if (d.length < 13 || d.length > 19) return false;
  let soma = 0;
  let alterna = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (alterna) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    soma += n;
    alterna = !alterna;
  }
  return soma % 10 === 0;
}

const TERMOS_SENSIVEIS = [
  "diagnóstico",
  "diagnostico",
  "cid-10",
  "cid 10",
  "medicação",
  "medicacao",
  "antidepressivo",
  "ansiolítico",
  "ansiolitico",
  "paciente",
  "prontuário",
  "prontuario",
  "laudo",
  "psicodiagnóstico",
  "psicodiagnostico",
];

interface Regra {
  tipo: TipoPii;
  padrao: RegExp;
  confianca: Confianca;
  aceita?: (t: string) => boolean;
}

const REGRAS: Regra[] = [
  {
    tipo: "email",
    padrao: /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g,
    confianca: "alta",
  },
  {
    tipo: "cpf",
    padrao: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
    confianca: "alta",
    aceita: cpfValido,
  },
  {
    tipo: "cnpj",
    padrao: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,
    confianca: "alta",
    aceita: cnpjValido,
  },
  {
    tipo: "cartao",
    padrao: /\b(?:\d[ -]?){13,19}\b/g,
    confianca: "alta",
    aceita: luhnValido,
  },
  {
    tipo: "telefone",
    padrao: /(?:\+55\s?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g,
    confianca: "alta",
  },
  {
    tipo: "cep",
    padrao: /\b\d{5}-\d{3}\b/g,
    confianca: "media",
  },
  {
    tipo: "url_identificada",
    padrao: /\bhttps?:\/\/\S*(?:id=|user=|token=|\/u\/|\/perfil\/)\S*/gi,
    confianca: "media",
  },
  {
    tipo: "data_nascimento",
    padrao: /\b(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])\/(19|20)\d{2}\b/g,
    confianca: "media",
  },
  {
    tipo: "termo_sensivel",
    padrao: new RegExp(`\\b(${TERMOS_SENSIVEIS.join("|")})\\b`, "gi"),
    confianca: "media",
  },
  {
    // Heurística conservadora: dois nomes capitalizados seguidos, fora do início da frase.
    tipo: "nome_proprio",
    padrao: /(?<=[a-zà-ú,]\s)[A-ZÀ-Ú][a-zà-ú]{2,}\s[A-ZÀ-Ú][a-zà-ú]{2,}\b/g,
    confianca: "media",
  },
];

const PALAVRAS_COMUNS = new Set([
  "Brasil",
  "São Paulo",
  "Rio",
  "Copyforja",
  "Voz de Marca",
  "Instagram",
  "Facebook",
]);

function sobrepoe(a: AchadoPii, b: AchadoPii) {
  return a.inicio < b.fim && b.inicio < a.fim;
}

/** Analisa um texto e devolve os achados ordenados por posição, sem sobreposição. */
export function detectarPii(texto: string): AchadoPii[] {
  const achados: AchadoPii[] = [];
  for (const regra of REGRAS) {
    const re = new RegExp(regra.padrao.source, regra.padrao.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto)) !== null) {
      const trecho = m[0];
      if (!trecho.trim()) break;
      if (regra.aceita && !regra.aceita(trecho)) continue;
      if (regra.tipo === "nome_proprio" && PALAVRAS_COMUNS.has(trecho.trim())) continue;
      achados.push({
        tipo: regra.tipo,
        trecho,
        inicio: m.index,
        fim: m.index + trecho.length,
        confianca: regra.confianca,
      });
    }
  }

  const prioridade: Confianca[] = ["alta", "media"];
  achados.sort(
    (a, b) =>
      a.inicio - b.inicio ||
      prioridade.indexOf(a.confianca) - prioridade.indexOf(b.confianca) ||
      b.fim - b.inicio - (a.fim - a.inicio),
  );

  const finais: AchadoPii[] = [];
  for (const a of achados) if (!finais.some((f) => sobrepoe(f, a))) finais.push(a);
  return finais;
}

/** Substitui todos os achados por marcadores neutros. */
export function anonimizar(texto: string, achados: AchadoPii[]): string {
  let saida = texto;
  for (const a of [...achados].sort((x, y) => y.inicio - x.inicio)) {
    saida = saida.slice(0, a.inicio) + SUBSTITUTO[a.tipo] + saida.slice(a.fim);
  }
  return saida;
}

/** Contagem por tipo — único derivado que pode virar evento técnico. */
export function contarPorTipo(achados: AchadoPii[]): Record<string, number> {
  return achados.reduce<Record<string, number>>((acc, a) => {
    acc[a.tipo] = (acc[a.tipo] ?? 0) + 1;
    return acc;
  }, {});
}

export const temBloqueio = (achados: AchadoPii[]) => achados.some((a) => a.confianca === "alta");