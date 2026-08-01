import { Check, Circle, Loader2, TriangleAlert, X, HelpCircle } from "lucide-react";
import { ETAPAS_PIPELINE, type EtapaId, type StatusEtapa } from "@/lib/fixtures";
import { IndicadorProcessamento } from "@/components/privacy/Indicadores";
import { cn } from "@/lib/utils";

const ICONES: Record<StatusEtapa, typeof Check> = {
  pendente: Circle,
  em_curso: Loader2,
  concluida: Check,
  falhou: TriangleAlert,
  ignorada: Circle,
  cancelada: X,
  incerta: HelpCircle,
  aguardando_usuario: HelpCircle,
};

const CORES: Record<StatusEtapa, string> = {
  pendente: "border-border text-muted-foreground",
  em_curso: "border-primary text-primary",
  concluida: "border-success text-success",
  falhou: "border-destructive text-destructive",
  ignorada: "border-border text-muted-foreground/60",
  cancelada: "border-muted-foreground text-muted-foreground",
  incerta: "border-uncertain text-uncertain",
  aguardando_usuario: "border-warning text-warning",
};

export function LinhaDoTempoPipeline({ status }: { status: Record<EtapaId, StatusEtapa> }) {
  return (
    <ol className="space-y-1">
      {ETAPAS_PIPELINE.map((etapa, indice) => {
        const atual = status[etapa.id] ?? "pendente";
        const Icone = ICONES[atual];
        return (
          <li key={etapa.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border-2 bg-background",
                  CORES[atual],
                )}
              >
                <Icone className={cn("size-3", atual === "em_curso" && "animate-spin")} aria-hidden />
              </span>
              {indice < ETAPAS_PIPELINE.length - 1 && (
                <span className="my-0.5 w-px flex-1 bg-border" aria-hidden />
              )}
            </div>
            <div className="pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{etapa.titulo}</p>
                <IndicadorProcessamento local={etapa.local} />
              </div>
              <p className="text-xs text-muted-foreground">{etapa.descricao}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}