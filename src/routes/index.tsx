import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Brain, Gauge, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ETAPAS_PIPELINE } from "@/lib/fixtures";

const TITULO = "Copyforja — hooks e headlines auditados por múltiplos agentes";
const DESCRICAO =
  "Pipeline multi-agente que transforma briefings em hooks, headlines e CTAs auditados, ranqueados e adaptados à sua voz de marca — com privacidade sob seu controle.";

export const Route = createFileRoute("/")({
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
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <span className="font-display text-lg font-semibold tracking-tight">Copyforja</span>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth">Entrar</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/app">Abrir workspace</Link>
          </Button>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-20">
        <section className="border-y py-14">
          <p className="mb-3 font-mono text-xs uppercase tracking-widest text-primary">
            Copywriting com curadoria técnica
          </p>
          <h1 className="max-w-3xl font-display text-4xl leading-[1.1] sm:text-5xl">
            Seu briefing entra bruto. Sai um pacote auditado, ranqueado e com a sua voz.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground">
            Não é um chat genérico. Especialistas distintos escrevem hooks, headlines para vídeo,
            headlines para imagem e CTAs; um auditor pontua e devolve o que ficou fraco; um ranking
            explicável entrega as três melhores de cada formato.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/app">
                Ver o workspace
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/onboarding">Configurar voz de marca</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-6 py-14 md:grid-cols-3">
          <Pilar
            icone={<Brain className="size-5 text-primary" aria-hidden />}
            titulo="Conflito antes da frase"
            texto="Um agente de psicologia profunda identifica o conflito inconsciente do tema e entrega uma diretriz única para todos os especialistas."
          />
          <Pilar
            icone={<Gauge className="size-5 text-primary" aria-hidden />}
            titulo="Auditoria com nota"
            texto="Impacto emocional, clareza de consequência e ritmo de leitura. O que reprova ganha uma única chance de correção."
          />
          <Pilar
            icone={<ShieldCheck className="size-5 text-primary" aria-hidden />}
            titulo="Privacidade sem letra miúda"
            texto="A adaptação de estilo roda no seu dispositivo. Nada vai para a nuvem sem autorização e nenhum envio acontece em silêncio."
          />
        </section>

        <section className="border-t py-14">
          <h2 className="font-display text-2xl">Como o pacote é construído</h2>
          <ol className="mt-6 grid gap-3 sm:grid-cols-2">
            {ETAPAS_PIPELINE.map((etapa, i) => (
              <li key={etapa.id} className="flex gap-3 rounded-lg border bg-card p-3">
                <span className="font-mono text-xs text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="text-sm font-medium">{etapa.titulo}</p>
                  <p className="text-xs text-muted-foreground">{etapa.descricao}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}

function Pilar({
  icone,
  titulo,
  texto,
}: {
  icone: React.ReactNode;
  titulo: string;
  texto: string;
}) {
  return (
    <article>
      {icone}
      <h2 className="mt-3 font-display text-lg">{titulo}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{texto}</p>
    </article>
  );
}
