import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Workspace } from "@/components/chat/Workspace";
import { Button } from "@/components/ui/button";
import { enviarMensagem } from "@/lib/historico.functions";
import { horario, opcoesChat } from "@/lib/historico";
import { RESPOSTA_SIMULADA } from "@/lib/fixtures";

const TITULO = "Chat de criação — Copyforja";
const DESCRICAO =
  "Histórico do chat, parâmetros da geração e curadoria das melhores variações auditadas.";

export const Route = createFileRoute("/_authenticated/app/c/$chatId")({
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
  const { chatId } = Route.useParams();
  const cliente = useQueryClient();
  const consulta = useQuery(opcoesChat(chatId));

  const envio = useMutation({
    mutationFn: async (texto: string) => {
      await enviarMensagem({ data: { chatId, texto, autor: "usuario" } });
      // A resposta segue simulada, mas é persistida para reaparecer ao recarregar.
      await enviarMensagem({
        data: { chatId, texto: RESPOSTA_SIMULADA, autor: "plataforma" },
      });
    },
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ["historico"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar a mensagem."),
  });

  if (!consulta.isLoading && !consulta.isError && consulta.data === null) {
    return (
      <AppShell titulo="Chat indisponível">
        <div className="mx-auto w-full max-w-md px-4 py-16 text-center">
          <h1 className="font-display text-xl">Chat indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Esta conversa não existe ou não está na sua conta.
          </p>
          <Button asChild className="mt-4">
            <Link to="/app">Voltar ao workspace</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  if (consulta.isError) {
    return (
      <AppShell titulo="Erro">
        <div className="mx-auto w-full max-w-md px-4 py-16 text-center">
          <h1 className="font-display text-xl">Não foi possível carregar a conversa</h1>
          <Button className="mt-4" onClick={() => consulta.refetch()}>
            Tentar de novo
          </Button>
        </div>
      </AppShell>
    );
  }

  const titulo = consulta.data?.chat.titulo ?? "Carregando…";
  const mensagens = (consulta.data?.mensagens ?? []).map((m) => ({
    id: m.id,
    autor: m.autor as "usuario" | "plataforma",
    texto: m.texto,
    horario: horario(m.criado_em),
  }));

  return (
    <AppShell titulo={titulo} chatId={chatId}>
      <Workspace
        titulo={titulo}
        chatId={chatId}
        mensagens={mensagens}
        carregando={consulta.isLoading}
        enviando={envio.isPending}
        onEnviar={(texto) => envio.mutate(texto)}
      />
    </AppShell>
  );
}

