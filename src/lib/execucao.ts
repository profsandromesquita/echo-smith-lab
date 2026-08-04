import { queryOptions } from "@tanstack/react-query";
import { execucaoAtivaDoChat, obterExecucao } from "@/lib/execucao.functions";

export const chavesExecucao = {
  raiz: ["execucao"] as const,
  porId: (id: string) => ["execucao", id] as const,
  ativaDoChat: (chatId: string) => ["execucao", "chat", chatId] as const,
};

export const opcoesExecucao = (id: string) =>
  queryOptions({ queryKey: chavesExecucao.porId(id), queryFn: () => obterExecucao({ data: { id } }) });

export const opcoesExecucaoAtiva = (chatId: string) =>
  queryOptions({
    queryKey: chavesExecucao.ativaDoChat(chatId),
    queryFn: () => execucaoAtivaDoChat({ data: { chatId } }),
  });

export type EstadoExecucao =
  | "criada"
  | "aguardando_consentimento"
  | "pronta"
  | "em_processamento"
  | "parcialmente_concluida"
  | "concluida"
  | "falhou"
  | "cancelamento_solicitado"
  | "cancelada";

export const ROTULO_ESTADO_EXECUCAO: Record<EstadoExecucao, string> = {
  criada: "Criada",
  aguardando_consentimento: "Aguardando autorização",
  pronta: "Pronta",
  em_processamento: "Em processamento",
  parcialmente_concluida: "Entrega parcial",
  concluida: "Concluída",
  falhou: "Falhou",
  cancelamento_solicitado: "Cancelamento solicitado",
  cancelada: "Cancelada",
};

export type EstadoEtapa =
  | "pendente"
  | "bloqueada"
  | "em_execucao"
  | "concluida"
  | "falhou"
  | "cancelada"
  | "resultado_incerto";

export const ROTULO_ESTADO_ETAPA: Record<EstadoEtapa, string> = {
  pendente: "Pendente",
  bloqueada: "Bloqueada",
  em_execucao: "Em execução",
  concluida: "Concluída",
  falhou: "Falhou",
  cancelada: "Cancelada",
  resultado_incerto: "Resultado incerto",
};

/** Tradução segura de códigos técnicos para o usuário final. Nada de payload ou stack. */
export const MENSAGEM_ERRO_ETAPA: Record<string, string> = {
  autorizacao_ausente: "Autorização necessária para enviar o briefing.",
  credencial_ausente: "Integração de IA ainda não configurada. Nada foi enviado.",
  credencial_invalida: "Integração de IA indisponível no momento.",
  config_ausente: "Configuração do agente indisponível.",
  modelo_indisponivel: "O modelo configurado está indisponível no momento.",
  rate_limit: "Limite de uso atingido. Nova tentativa em instantes.",
  timeout: "A análise demorou mais que o esperado.",
  provider_error: "Falha temporária na análise do briefing.",
  resposta_invalida: "A resposta veio fora do formato esperado e foi descartada.",
  provider_refusal: "O provedor recusou analisar este briefing. Revise o conteúdo.",
  saida_truncada: "A resposta foi interrompida por limite de tamanho e foi descartada.",
  stop_reason_inesperado: "A resposta terminou de forma inesperada e foi descartada.",
  unknown_outcome: "Não foi possível confirmar o resultado desta etapa.",
  auditoria_parcial:
    "Parte das variações não foi auditada. Elas ficam fora da entrega desta execução.",
  correcao_parcial:
    "Parte das variações reprovadas não pôde ser corrigida. As demais correções foram mantidas.",
  orcamento_esgotado:
    "O orçamento desta execução acabou antes de corrigir todas as variações reprovadas.",
  descartada_por_cancelamento: "Resposta descartada após o cancelamento.",
  cancelada_por_execucao: "Etapa cancelada junto com a execução.",
  dependencia_falhou: "Etapa anterior falhou, então esta não pôde ser executada.",
  configuracao_indisponivel:
    "A configuração do agente não pôde ser lida. A etapa foi interrompida sem substituir por simulação.",
};
