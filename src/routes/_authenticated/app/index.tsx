import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Workspace } from "@/components/chat/Workspace";

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
  return (
    <AppShell titulo="Reels sobre procrastinação">
      <Workspace titulo="Reels sobre procrastinação" marca="Jainara — Psicologia Profunda" />
    </AppShell>
  );
}