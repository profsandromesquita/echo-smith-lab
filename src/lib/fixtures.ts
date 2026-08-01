/**
 * F0 — dados simulados. Nenhuma chamada de rede, nenhuma persistência.
 * Tudo aqui é fixture tipada para renderizar os estados da interface.
 */

export type FormatoSaida = "hook" | "headline_video" | "headline_imagem" | "cta";

export const ROTULO_FORMATO: Record<FormatoSaida, string> = {
  hook: "Hook",
  headline_video: "Headline para Vídeo",
  headline_imagem: "Headline para Imagem",
  cta: "CTA",
};

export type EtapaId =
  | "privacidade_local"
  | "gatekeeper"
  | "analise_psicologica"
  | "especialistas"
  | "auditoria"
  | "correcao"
  | "adaptacao_local"
  | "validacao_preservacao"
  | "ranking"
  | "entrega";

export type StatusEtapa =
  | "pendente"
  | "em_curso"
  | "concluida"
  | "falhou"
  | "ignorada"
  | "cancelada"
  | "incerta"
  | "aguardando_usuario";

export interface EtapaPipeline {
  id: EtapaId;
  titulo: string;
  descricao: string;
  local: boolean;
}

/** Ordem canônica do pipeline — adaptação local SEMPRE antes do ranking. */
export const ETAPAS_PIPELINE: EtapaPipeline[] = [
  {
    id: "privacidade_local",
    titulo: "Pré-processamento de privacidade",
    descricao: "Detecta nomes e dados identificáveis antes de qualquer envio.",
    local: true,
  },
  {
    id: "gatekeeper",
    titulo: "Gatekeeper",
    descricao: "Verifica público, dor e promessa. Pergunta a Dor Central se faltar.",
    local: false,
  },
  {
    id: "analise_psicologica",
    titulo: "Análise psicológica",
    descricao: "Identifica o conflito inconsciente e produz uma diretriz única.",
    local: false,
  },
  {
    id: "especialistas",
    titulo: "Especialistas em paralelo",
    descricao: "Cinco variações por formato selecionado.",
    local: false,
  },
  {
    id: "auditoria",
    titulo: "Auditoria",
    descricao: "Notas de impacto, clareza de consequência e ritmo.",
    local: false,
  },
  {
    id: "correcao",
    titulo: "Correção única",
    descricao: "No máximo uma tentativa por item reprovado.",
    local: false,
  },
  {
    id: "adaptacao_local",
    titulo: "Adaptação local de estilo",
    descricao: "Voz de marca e preferências aplicadas no seu dispositivo.",
    local: true,
  },
  {
    id: "validacao_preservacao",
    titulo: "Validação de preservação",
    descricao: "Confirma sentido, intenção e formato após a adaptação.",
    local: true,
  },
  {
    id: "ranking",
    titulo: "Ranking determinístico",
    descricao: "Ordena as versões finais por seis sinais explicáveis.",
    local: false,
  },
  {
    id: "entrega",
    titulo: "Entrega",
    descricao: "As três melhores por formato, com curadoria técnica.",
    local: false,
  },
];

export type OrigemVersao = "original" | "corrigida" | "adaptada" | "final";

export const ROTULO_VERSAO: Record<OrigemVersao, string> = {
  original: "Original do especialista",
  corrigida: "Corrigida",
  adaptada: "Adaptada localmente",
  final: "Versão final",
};

export interface VersaoVariacao {
  origem: OrigemVersao;
  texto: string;
}

export interface NotasAuditoria {
  impacto: number;
  clareza: number;
  ritmo: number;
}

export interface Variacao {
  id: string;
  formato: FormatoSaida;
  versoes: VersaoVariacao[];
  versaoExibida: OrigemVersao;
  notas: NotasAuditoria;
  justificativa: string;
  veredito: "aprovada" | "corrigida" | "removida";
  posicao?: number;
  favorita?: boolean;
}

export const VARIACOES: Variacao[] = [
  {
    id: "v1",
    formato: "hook",
    versoes: [
      {
        origem: "original",
        texto: "Você não procrastina por preguiça. Você adia para não ser julgado.",
      },
      {
        origem: "final",
        texto: "Você não adia por preguiça. Você adia para não ser julgado.",
      },
    ],
    versaoExibida: "final",
    notas: { impacto: 9.2, clareza: 8.8, ritmo: 9.0 },
    justificativa:
      "Troca a explicação pelo confronto direto e nomeia o conflito inconsciente em nove palavras.",
    veredito: "aprovada",
    posicao: 1,
    favorita: true,
  },
  {
    id: "v2",
    formato: "hook",
    versoes: [
      { origem: "original", texto: "A sua lista de tarefas virou um tribunal." },
      { origem: "corrigida", texto: "Sua lista de tarefas virou um tribunal." },
      { origem: "adaptada", texto: "Sua lista de tarefas virou um tribunal — e você é o réu." },
      { origem: "final", texto: "Sua lista de tarefas virou um tribunal — e você é o réu." },
    ],
    versaoExibida: "final",
    notas: { impacto: 8.9, clareza: 8.2, ritmo: 8.7 },
    justificativa:
      "Imagem mental forte, sem explicar o mecanismo. A adaptação local acrescentou a virada de papel.",
    veredito: "corrigida",
    posicao: 2,
  },
  {
    id: "v3",
    formato: "headline_video",
    versoes: [
      { origem: "original", texto: "O medo de falhar não avisa. Ele só te faz limpar a cozinha." },
      { origem: "final", texto: "O medo de falhar não avisa. Ele te faz limpar a cozinha." },
    ],
    versaoExibida: "final",
    notas: { impacto: 8.6, clareza: 8.9, ritmo: 8.4 },
    justificativa: "Contraste alto e leitura em movimento preservada com corte de duas sílabas.",
    veredito: "aprovada",
    posicao: 3,
  },
  {
    id: "v4",
    formato: "headline_imagem",
    versoes: [
      { origem: "original", texto: "Descubra agora o segredo definitivo da produtividade." },
      { origem: "corrigida", texto: "O segredo definitivo para produzir mais todos os dias." },
    ],
    versaoExibida: "corrigida",
    notas: { impacto: 4.1, clareza: 6.0, ritmo: 5.2 },
    justificativa:
      "Reprovada duas vezes por clichê e promessa genérica. Removida da curadoria e mantida no histórico técnico.",
    veredito: "removida",
  },
  {
    id: "v5",
    formato: "cta",
    versoes: [
      { origem: "original", texto: "Comenta “tribunal” que eu te mando o roteiro completo." },
      { origem: "final", texto: "Comenta “tribunal” e eu te mando o roteiro completo." },
    ],
    versaoExibida: "final",
    notas: { impacto: 8.1, clareza: 9.1, ritmo: 8.8 },
    justificativa: "Gancho de comentário ancorado na metáfora do hook vencedor.",
    veredito: "aprovada",
    posicao: 1,
  },
];

export const SINAIS_RANKING = [
  { nome: "Notas do auditor", peso: 0.3, valor: 9.0 },
  { nome: "Objetivo (Viralizar)", peso: 0.2, valor: 8.6 },
  { nome: "Adequação ao formato", peso: 0.15, valor: 9.4 },
  { nome: "Adequação à voz de marca", peso: 0.15, valor: 8.8 },
  { nome: "Ausência de clichês", peso: 0.12, valor: 9.5 },
  { nome: "Confiança da avaliação", peso: 0.08, valor: 8.0 },
];

export interface ChatResumo {
  id: string;
  titulo: string;
  atualizadoEm: string;
  marca: string;
}

export interface PastaResumo {
  id: string;
  nome: string;
  marcaVinculada: string;
  chats: ChatResumo[];
}

export const PASTAS: PastaResumo[] = [
  {
    id: "p1",
    nome: "Clínica Jainara",
    marcaVinculada: "Jainara — Psicologia Profunda",
    chats: [
      {
        id: "c1",
        titulo: "Reels sobre procrastinação",
        atualizadoEm: "hoje, 14h20",
        marca: "Jainara — Psicologia Profunda",
      },
      {
        id: "c2",
        titulo: "Carrossel sobre culpa materna",
        atualizadoEm: "ontem",
        marca: "Jainara — Psicologia Profunda",
      },
    ],
  },
  {
    id: "p2",
    nome: "Campanha Setembro",
    marcaVinculada: "Instituto Vértice",
    chats: [
      {
        id: "c3",
        titulo: "Hooks de abertura para lives",
        atualizadoEm: "2 dias atrás",
        marca: "Instituto Vértice",
      },
    ],
  },
  {
    id: "p3",
    nome: "Rascunhos pessoais",
    marcaVinculada: "Sem marca vinculada",
    chats: [
      { id: "c4", titulo: "Testes de CTA", atualizadoEm: "semana passada", marca: "Padrão" },
    ],
  },
];

export interface MensagemChat {
  id: string;
  autor: "usuario" | "plataforma";
  texto: string;
  horario: string;
}

export const MENSAGENS: MensagemChat[] = [
  {
    id: "m1",
    autor: "usuario",
    texto:
      "Preciso de hooks e headlines para um Reels sobre procrastinação, para mulheres de 30 a 45 anos em terapia.",
    horario: "14h12",
  },
  {
    id: "m2",
    autor: "plataforma",
    texto:
      "Briefing suficiente. Conflito inconsciente identificado: medo do julgamento disfarçado de falta de tempo. Diretriz compartilhada com os especialistas.",
    horario: "14h13",
  },
];

export interface PerfilMarca {
  id: string;
  nome: string;
  padrao: boolean;
  pastasVinculadas: number;
  dicionario: string[];
  proibidas: string[];
  posicionamento: string;
}

export const PERFIS_MARCA: PerfilMarca[] = [
  {
    id: "b1",
    nome: "Jainara — Psicologia Profunda",
    padrao: true,
    pastasVinculadas: 2,
    dicionario: ["conflito", "sombra", "travessia", "nomear"],
    proibidas: ["hack", "segredo definitivo", "método infalível", "mindset"],
    posicionamento:
      "Fala adulta, sem promessa de cura rápida. Nomeia a dor antes de oferecer caminho.",
  },
  {
    id: "b2",
    nome: "Instituto Vértice",
    padrao: false,
    pastasVinculadas: 1,
    dicionario: ["evidência", "processo", "prática clínica"],
    proibidas: ["milagre", "gatilho mental"],
    posicionamento: "Autoridade técnica, tom institucional, zero sensacionalismo.",
  },
];

export interface PreferenciaItem {
  id: string;
  regra: string;
  evidencia?: string;
}

export const PREFERENCIAS_EXPLICITAS: PreferenciaItem[] = [
  { id: "pe1", regra: "Nunca abrir headline com pergunta retórica." },
  { id: "pe2", regra: "Máximo de 12 palavras em headline para vídeo." },
  { id: "pe3", regra: "Nunca usar a palavra “mindset”." },
];

export const PREFERENCIAS_INFERIDAS: PreferenciaItem[] = [
  {
    id: "pi1",
    regra: "Prefere frases com virada no final.",
    evidencia: "3 favoritos e 2 edições nas últimas 2 semanas",
  },
  {
    id: "pi2",
    regra: "Costuma remover advérbios terminados em -mente.",
    evidencia: "7 edições registradas",
  },
  {
    id: "pi3",
    regra: "Descarta aberturas com estatística.",
    evidencia: "4 descartes consecutivos",
  },
];

export interface AgenteRegistry {
  papel: string;
  nome: string;
  modelo: string;
  versaoPublicada: string;
  rascunho: string | null;
  atualizadoPor: string;
  atualizadoEm: string;
}

export const REGISTRY: AgenteRegistry[] = [
  {
    papel: "gatekeeper",
    nome: "Gatekeeper",
    modelo: "gpt-5.6-sol",
    versaoPublicada: "v4",
    rascunho: "v5",
    atualizadoPor: "admin técnico",
    atualizadoEm: "01/08/2026",
  },
  {
    papel: "psych_analyst",
    nome: "Análise psicológica",
    modelo: "gpt-5.6-sol (esforço alto)",
    versaoPublicada: "v3",
    rascunho: null,
    atualizadoPor: "admin técnico",
    atualizadoEm: "28/07/2026",
  },
  {
    papel: "hook_master",
    nome: "Hook Master",
    modelo: "claude-fable-5",
    versaoPublicada: "v7",
    rascunho: null,
    atualizadoPor: "admin técnico",
    atualizadoEm: "30/07/2026",
  },
  {
    papel: "headline_video",
    nome: "Headline para Vídeo",
    modelo: "claude-fable-5",
    versaoPublicada: "v5",
    rascunho: "v6",
    atualizadoPor: "admin técnico",
    atualizadoEm: "31/07/2026",
  },
  {
    papel: "headline_imagem",
    nome: "Headline para Imagem",
    modelo: "claude-fable-5",
    versaoPublicada: "v5",
    rascunho: null,
    atualizadoPor: "admin técnico",
    atualizadoEm: "31/07/2026",
  },
  {
    papel: "cta_hook",
    nome: "Gancho de CTA",
    modelo: "claude-fable-5",
    versaoPublicada: "v2",
    rascunho: null,
    atualizadoPor: "admin técnico",
    atualizadoEm: "22/07/2026",
  },
  {
    papel: "auditor",
    nome: "Auditor",
    modelo: "gpt-5.6-sol (esforço alto)",
    versaoPublicada: "v9",
    rascunho: null,
    atualizadoPor: "admin técnico",
    atualizadoEm: "01/08/2026",
  },
  {
    papel: "local_style_adapter",
    nome: "Adaptador local de estilo",
    modelo: "llama-3.2-3b (navegador)",
    versaoPublicada: "v2",
    rascunho: null,
    atualizadoPor: "admin técnico",
    atualizadoEm: "20/07/2026",
  },
];

export interface EventoEnvio {
  id: string;
  quando: string;
  etapa: string;
  destino: string;
  conteudo: string;
}

export const LINHA_DO_TEMPO_ENVIOS: EventoEnvio[] = [
  {
    id: "e1",
    quando: "hoje, 14h12",
    etapa: "Gatekeeper",
    destino: "Provedor de nuvem A",
    conteudo: "Briefing anonimizado",
  },
  {
    id: "e2",
    quando: "hoje, 14h13",
    etapa: "Análise psicológica",
    destino: "Provedor de nuvem A",
    conteudo: "Briefing anonimizado + parâmetros",
  },
  {
    id: "e3",
    quando: "hoje, 14h14",
    etapa: "Especialistas",
    destino: "Provedor de nuvem B",
    conteudo: "Diretriz psicológica + resumo da voz de marca",
  },
  {
    id: "e4",
    quando: "hoje, 14h16",
    etapa: "Adaptação local",
    destino: "Seu dispositivo",
    conteudo: "Nada saiu da máquina",
  },
];