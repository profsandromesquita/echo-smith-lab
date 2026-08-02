import { queryOptions } from "@tanstack/react-query";
import { listarHistorico, obterChat, buscarHistorico } from "@/lib/historico.functions";

export const chavesHistorico = {
  arvore: ["historico", "arvore"] as const,
  chat: (id: string) => ["historico", "chat", id] as const,
  busca: (termo: string) => ["historico", "busca", termo] as const,
};

export const opcoesArvore = () =>
  queryOptions({
    queryKey: chavesHistorico.arvore,
    queryFn: () => listarHistorico(),
  });

export const opcoesChat = (id: string) =>
  queryOptions({
    queryKey: chavesHistorico.chat(id),
    queryFn: () => obterChat({ data: { id } }),
  });

export const opcoesBusca = (termo: string) =>
  queryOptions({
    queryKey: chavesHistorico.busca(termo),
    queryFn: () => buscarHistorico({ data: { termo } }),
    enabled: termo.trim().length > 1,
  });

/** Data relativa curta em pt-BR, calculada no cliente. */
export function quando(iso: string) {
  const data = new Date(iso);
  const minutos = Math.round((Date.now() - data.getTime()) / 60000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function horario(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}