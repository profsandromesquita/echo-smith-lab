import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Workspace } from "@/components/chat/Workspace";
import { PASTAS } from "@/lib/fixtures";

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
  const chat = PASTAS.flatMap((p) => p.chats).find((c) => c.id === chatId);
  const titulo = chat?.titulo ?? "Novo chat";

  return (
    <AppShell titulo={titulo}>
      <Workspace titulo={titulo} marca={chat?.marca ?? "Padrão"} />
    </AppShell>
  );
}