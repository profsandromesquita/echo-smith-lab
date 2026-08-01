import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IndicadorProcessamento } from "@/components/privacy/Indicadores";

interface Props {
  antes: string;
  depois: string;
  reprovado?: boolean;
  motivo?: string;
}

export function DiffAdaptacao({ antes, depois, reprovado, motivo }: Props) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm">Adaptação local de estilo</CardTitle>
        <IndicadorProcessamento local />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              Aprovada pela auditoria
            </p>
            <p className="text-sm">{antes}</p>
          </div>
          <ArrowRight className="mx-auto size-4 rotate-90 text-muted-foreground md:rotate-0" aria-hidden />
          <div
            className={
              reprovado
                ? "rounded-md border border-destructive/50 bg-destructive/10 p-3"
                : "rounded-md border border-local/50 bg-local/10 p-3"
            }
          >
            <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              Adaptada no dispositivo
            </p>
            <p className="text-sm">{depois}</p>
          </div>
        </div>

        {reprovado ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <p className="font-medium text-destructive">Validação de preservação reprovada</p>
            <p className="text-muted-foreground">
              {motivo ??
                "A adaptação alterou o sentido pretendido. A versão aprovada pela auditoria foi mantida como final."}
            </p>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button size="sm">Aceitar adaptação</Button>
            <Button size="sm" variant="outline">
              Desfazer
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}