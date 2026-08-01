import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SINAIS_RANKING } from "@/lib/fixtures";

export function PainelRanking() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Por que esta é a ordem</CardTitle>
        <p className="text-xs text-muted-foreground">
          Ranking determinístico aplicado às versões finais, depois da adaptação local.
        </p>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {SINAIS_RANKING.map((sinal) => (
          <div key={sinal.nome} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span>{sinal.nome}</span>
              <span className="font-mono text-muted-foreground">
                {sinal.valor.toFixed(1)} × peso {sinal.peso.toFixed(2)}
              </span>
            </div>
            <Progress value={sinal.valor * 10} className="h-1.5" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}