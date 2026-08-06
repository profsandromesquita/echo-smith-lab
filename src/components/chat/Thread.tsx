import { ehMensagemLegadaSimulada } from "@/lib/legado";
import { cn } from "@/lib/utils";

export interface MensagemChat {
  id: string;
  autor: "usuario" | "plataforma";
  texto: string;
  horario: string;
}

export function Thread({ mensagens }: { mensagens: MensagemChat[] }) {
  // O conteúdo demonstrativo legado permanece no banco, mas não é renderizado:
  // nem como diretriz, nem como mensagem comum. A diretriz real vem da execução.
  const visiveis = mensagens.filter((m) => !ehMensagemLegadaSimulada(m));

  if (visiveis.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
        Nenhuma mensagem ainda. Descreva o briefing abaixo para começar.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {visiveis.map((m) => (
        <div
          key={m.id}
          className={cn(
            "max-w-[85%] rounded-lg border px-3 py-2 text-sm",
            m.autor === "usuario"
              ? "ml-auto bg-secondary text-secondary-foreground"
              : "bg-muted/40",
          )}
        >
          <p>{m.texto}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{m.horario}</p>
        </div>
      ))}
    </div>
  );
}