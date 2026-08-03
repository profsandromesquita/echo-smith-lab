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
