import { MENSAGENS } from "@/lib/fixtures";
import { cn } from "@/lib/utils";

export function Thread() {
  return (
    <div className="space-y-3">
      {MENSAGENS.map((m) => (
        <div
          key={m.id}
          className={cn(
            "max-w-[85%] rounded-lg border px-3 py-2 text-sm",
            m.autor === "usuario"
              ? "ml-auto bg-secondary text-secondary-foreground"
              : "bg-card text-card-foreground",
          )}
        >
          <p>{m.texto}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{m.horario}</p>
        </div>
      ))}
    </div>
  );
}