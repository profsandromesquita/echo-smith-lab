import { queryOptions } from "@tanstack/react-query";
import { listarPerfis, obterPerfil, resolverPerfil } from "@/lib/marca.functions";

export const chavesMarca = {
  raiz: ["marca"] as const,
  lista: ["marca", "lista"] as const,
  perfil: (id: string) => ["marca", "perfil", id] as const,
  resolvido: (chatId: string | null, pastaId: string | null) =>
    ["marca", "resolvido", chatId, pastaId] as const,
};

export const opcoesPerfis = () =>
  queryOptions({ queryKey: chavesMarca.lista, queryFn: () => listarPerfis() });

export const opcoesPerfil = (id: string) =>
  queryOptions({
    queryKey: chavesMarca.perfil(id),
    queryFn: () => obterPerfil({ data: { id } }),
  });

export const opcoesPerfilAtivo = (chatId: string | null, pastaId: string | null = null) =>
  queryOptions({
    queryKey: chavesMarca.resolvido(chatId, pastaId),
    queryFn: () => resolverPerfil({ data: { chatId, pastaId } }),
  });

export type OrigemPerfil = "chat" | "pasta" | "padrao" | "nenhum";

export function rotuloOrigem(origem: OrigemPerfil, pastaNome?: string | null) {
  if (origem === "chat") return "definido neste chat";
  if (origem === "pasta") return pastaNome ? `herdado da pasta ${pastaNome}` : "herdado da pasta";
  if (origem === "padrao") return "perfil padrão da conta";
  return "nenhum perfil selecionado";
}

/** Campos textuais de um perfil, no formato usado pelo formulário. */
export const CAMPOS_VAZIOS = {
  nome: "",
  descricao: "",
  publico: "",
  posicionamento: "",
  personalidade: "",
  tom_de_voz: "",
  preferidas: [] as string[],
  evitadas: [] as string[],
  principios: "",
  orientacoes: "",
};

export type CamposPerfil = typeof CAMPOS_VAZIOS;

export const paraLista = (v: string) =>
  v
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 60)
    .map((s) => s.slice(0, 60));

export const paraTexto = (v: string[] | null | undefined) => (v ?? []).join(", ");
