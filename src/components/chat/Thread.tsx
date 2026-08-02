import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export interface MensagemChat {
  id: string;
  autor: "usuario" | "plataforma";
  texto: string;
  horario: string;
}

/** Separa a primeira sentença (diagnóstico) do restante da análise. */
function dividirAnalise(texto: string) {
  const partes = texto.split(/(?<=\.)\s+/);
  return { resumo: partes[0] ?? texto, detalhe: partes.slice(1).join(" ").trim() };
}

function Diretriz({ mensagem }: { mensagem: MensagemChat }) {
  const { resumo, detalhe } = dividirAnalise(mensagem.texto);

  return (
    <Collapsible className="rounded-lg border-l-2 border-primary/60 bg-muted/40 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Diretriz estratégica
      </p>
      <p className="mt-0.5 text-sm">{resumo}</p>
      {detalhe && (
        <>
          <CollapsibleTrigger className="group mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline">
            Ver análise
            <ChevronDown
              className="size-3.5 transition-transform group-data-[state=open]:rotate-180"
              aria-hidden
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1.5 text-sm text-muted-foreground">
            {detalhe}
          </CollapsibleContent>
        </>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">{mensagem.horario}</p>
    </Collapsible>
  );
}

export function Thread({ mensagens }: { mensagens: MensagemChat[] }) {
  if (mensagens.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
        Nenhuma mensagem ainda. Descreva o briefing abaixo para começar.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {mensagens.map((m) =>
        m.autor === "plataforma" ? (
          <Diretriz key={m.id} mensagem={m} />
        ) : (
          <div
            key={m.id}
            className={cn(
              "ml-auto max-w-[85%] rounded-lg border bg-secondary px-3 py-2 text-sm text-secondary-foreground",
            )}
          >
            <p>{m.texto}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{m.horario}</p>
          </div>
        ),
      )}
    </div>
  );
}