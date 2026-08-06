import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Workspace, type FormatoExecucao } from "@/components/chat/Workspace";
import { criarChat, enviarMensagem } from "@/lib/historico.functions";
import { criarExecucaoParaMensagem } from "@/lib/execucao.functions";
import { chavesExecucao } from "@/lib/execucao";

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
    mutationFn: async (v: { texto: string; formato: FormatoExecucao }) => {
      const chat = await criarChat({ data: { primeiraMensagem: v.texto } });
      // O briefing é o gatilho do pipeline real: a criação é idempotente por mensagem.
      if (chat?.id && chat.mensagemId) {
        await criarExecucaoParaMensagem({
          data: { chatId: chat.id, mensagemId: chat.mensagemId, formato: v.formato },
        });
      }
      return chat;
    },
    onSuccess: (chat) => {
      void cliente.invalidateQueries({ queryKey: ["historico"] });
      void cliente.invalidateQueries({ queryKey: chavesExecucao.raiz });
      if (chat?.id) void navegar({ to: "/app/c/$chatId", params: { chatId: chat.id } });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o chat."),
  });

  return (
    <AppShell titulo="Novo chat">
      <Workspace
        titulo="Novo chat"
        mensagens={[]}
        enviando={criacao.isPending}
        onEnviar={(texto, formato) => criacao.mutate({ texto, formato })}
      />
    </AppShell>
  );
}