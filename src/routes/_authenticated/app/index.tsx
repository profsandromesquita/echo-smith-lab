import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Workspace } from "@/components/chat/Workspace";
import { criarChat } from "@/lib/historico.functions";

const TITULO = "Workspace — Copyforja";
const DESCRICAO =
  "Gere hooks, headlines e CTAs com pipeline multi-agente, auditoria com notas e adaptação de estilo no seu dispositivo.";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: TITULO },
      { name: "description", content: DESCRICAO },
      { property: "og:title", content: TITULO },
      { property: "og:description", content: DESCRICAO },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const navegar = useNavigate();
  const cliente = useQueryClient();

  const criacao = useMutation({
    mutationFn: (texto: string) => criarChat({ data: { primeiraMensagem: texto } }),
    onSuccess: (chat) => {
      void cliente.invalidateQueries({ queryKey: ["historico"] });
      if (chat?.id) void navegar({ to: "/app/c/$chatId", params: { chatId: chat.id } });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o chat."),
  });

  return (
    <AppShell titulo="Novo chat">
      <Workspace
        titulo="Novo chat"
        marca="Padrão"
        mensagens={[]}
        enviando={criacao.isPending}
        onEnviar={(texto) => criacao.mutate(texto)}
      />
    </AppShell>
  );
}