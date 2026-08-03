import { queryOptions } from "@tanstack/react-query";
import { listarRegistry, obterVersao } from "@/lib/registry.functions";

export const chavesRegistry = {
  raiz: ["registry"] as const,
  lista: ["registry", "lista"] as const,
  versao: (id: string) => ["registry", "versao", id] as const,
};

export const opcoesRegistry = () =>
  queryOptions({ queryKey: chavesRegistry.lista, queryFn: () => listarRegistry() });

export const opcoesVersao = (id: string) =>
  queryOptions({ queryKey: chavesRegistry.versao(id), queryFn: () => obterVersao({ data: { id } }) });

export const ROTULO_ESTADO_VERSAO: Record<string, string> = {
  rascunho: "Rascunho",
  publicada: "Publicada",
  arquivada: "Arquivada",
};
