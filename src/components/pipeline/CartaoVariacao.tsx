import { Heart, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { ROTULO_FORMATO, ROTULO_VERSAO, type Variacao, type OrigemVersao } from "@/lib/fixtures";
import { cn } from "@/lib/utils";

const CLASSE_VERSAO: Record<OrigemVersao, string> = {
  original: "border-border text-muted-foreground",
  corrigida: "border-warning/60 text-warning",
  adaptada: "border-local/60 text-local",
  final: "border-success/60 text-success",
};

export function CartaoVariacao({ variacao }: { variacao: Variacao }) {
  const exibida = variacao.versoes.find((v) => v.origem === variacao.versaoExibida) ?? variacao.versoes[0];
  const texto = exibida?.texto ?? "";
  const removida = variacao.veredito === "removida";

  return (
    <Card className={cn("gap-3", removida && "border-dashed opacity-70")}>
      <CardHeader className="gap-2 pb-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{ROTULO_FORMATO[variacao.formato]}</Badge>
          {variacao.posicao && (
            <Badge className="bg-primary text-primary-foreground">#{variacao.posicao}</Badge>
          )}
          {removida && <Badge variant="destructive">Removida da curadoria</Badge>}
        </div>
        <p className="font-display text-lg leading-snug">{texto}</p>
      </CardHeader>

      <CardContent className="space-y-3 pb-0">
        <div className="flex flex-wrap gap-1.5">
          {variacao.versoes.map((v) => (
            <Badge
              key={v.origem}
              variant="outline"
              className={cn("font-normal", CLASSE_VERSAO[v.origem])}
            >
              {ROTULO_VERSAO[v.origem]}
            </Badge>
          ))}
        </div>

        <dl className="grid grid-cols-3 gap-2 text-center">
          <Nota rotulo="Impacto" valor={variacao.notas.impacto} />
          <Nota rotulo="Clareza" valor={variacao.notas.clareza} />
          <Nota rotulo="Ritmo" valor={variacao.notas.ritmo} />
        </dl>

        <p className="text-sm text-muted-foreground">{variacao.justificativa}</p>
      </CardContent>

      <CardFooter className="gap-2">
        <Button variant={variacao.favorita ? "default" : "outline"} size="sm">
          <Heart className="size-4" aria-hidden />
          {variacao.favorita ? "Favoritada" : "Favoritar"}
        </Button>
        <Button variant="outline" size="sm">
          <Pencil className="size-4" aria-hidden />
          Editar
        </Button>
        <Button variant="ghost" size="sm">
          <Trash2 className="size-4" aria-hidden />
          Descartar
        </Button>
      </CardFooter>
    </Card>
  );
}

function Nota({ rotulo, valor }: { rotulo: string; valor: number }) {
  const baixa = valor < 8;
  return (
    <div className="rounded-md border bg-muted/40 py-1.5">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
      <dd
        className={cn(
          "font-mono text-sm font-medium",
          baixa ? "text-destructive" : "text-foreground",
        )}
      >
        {valor.toFixed(1)}
      </dd>
    </div>
  );
}