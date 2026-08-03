import { queryOptions } from "@tanstack/react-query";
import { obterPreferencias, resolverModo } from "@/lib/privacidade.functions";
import { listarConsentimentos } from "@/lib/consentimento.functions";
import { listarSolicitacoes } from "@/lib/conta-dados.functions";

export type ModoPrivacidade = "local_estrita" | "hibrido_autorizado";

export const ROTULO_MODO: Record<ModoPrivacidade, string> = {
  local_estrita: "Memória local estrita",
  hibrido_autorizado: "Híbrido autorizado",
};

export const DESCRICAO_MODO: Record<ModoPrivacidade, string> = {
  local_estrita:
    "Exemplos pessoais, preferências inferidas e textos privados ficam no dispositivo. Só o conteúdo explicitamente autorizado segue para a nuvem.",
  hibrido_autorizado:
    "Você pode autorizar o envio de um resumo derivado da voz de marca. Exemplos brutos continuam locais por padrão.",
};

export const chavesPrivacidade = {
  raiz: ["privacidade"] as const,
  preferencias: ["privacidade", "preferencias"] as const,
  modo: (chatId: string | null) => ["privacidade", "modo", chatId] as const,
  consentimentos: ["privacidade", "consentimentos"] as const,
  solicitacoes: ["privacidade", "solicitacoes"] as const,
};

export const opcoesPreferencias = () =>
  queryOptions({ queryKey: chavesPrivacidade.preferencias, queryFn: () => obterPreferencias() });

export const opcoesModo = (chatId: string | null) =>
  queryOptions({
    queryKey: chavesPrivacidade.modo(chatId),
    queryFn: () => resolverModo({ data: { chatId } }),
  });

export const opcoesConsentimentos = () =>
  queryOptions({
    queryKey: chavesPrivacidade.consentimentos,
    queryFn: () => listarConsentimentos(),
  });

export const opcoesSolicitacoes = () =>
  queryOptions({ queryKey: chavesPrivacidade.solicitacoes, queryFn: () => listarSolicitacoes() });

export const ROTULO_CATEGORIA: Record<string, string> = {
  briefing: "Briefing",
  resumo_voz_marca: "Resumo da voz de marca",
  texto_gerado: "Texto gerado",
  metadados: "Metadados técnicos",
  variacoes_para_auditoria: "Variações geradas para auditoria",
  feedback_para_correcao: "Feedback da auditoria para correção",
};

export const ROTULO_ESCOPO: Record<string, string> = {
  conta: "toda a conta",
  pasta: "uma pasta",
  chat: "este chat",
};

export const rotuloOrigemModo = (origem: "chat" | "padrao") =>
  origem === "chat" ? "definido neste chat" : "padrão da conta";