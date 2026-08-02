import { useState } from "react";
import { ChevronDown, Copy, GitCompare, Heart, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DiffAdaptacao } from "@/components/pipeline/DiffAdaptacao";
import { ROTULO_FORMATO, ROTULO_VERSAO, type Variacao, type OrigemVersao } from "@/lib/fixtures";
import { cn } from "@/lib/utils";

const CLASSE_VERSAO: Record<OrigemVersao, string> = {
  original: "border-border text-muted-foreground",
  corrigida: "border-warning/60 text-warning",
  adaptada: "border-local/60 text-local",
  final: "border-success/60 text-success",
};

export function CartaoVariacao({ variacao }: { variacao: Variacao }) {
  const [comparando, setComparando] = useState(false);
  const exibida =
    variacao.versoes.find((v) => v.origem === variacao.versaoExibida) ?? variacao.versoes[0];
  const texto = exibida?.texto ?? "";
  const removida = variacao.veredito === "removida";
  const { impacto, clareza, ritmo } = variacao.notas;
  const notaGeral = (impacto + clareza + ritmo) / 3;
  const primeira = variacao.versoes[0];
  const ultima = variacao.versoes[variacao.versoes.length - 1];
  const podeComparar = variacao.versoes.length > 1;

  return (
    <Card className={cn("gap-2 py-4", removida && "border-dashed opacity-70")}>
      <CardHeader className="gap-1.5 pb-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{ROTULO_FORMATO[variacao.formato]}</span>
          {variacao.posicao && <span>#{variacao.posicao}</span>}
          {removida && (
            <Badge variant="destructive" className="font-normal">
              Removida da curadoria
            </Badge>
          )}
          <span
            className={cn(
              "ml-auto font-mono text-sm",
              notaGeral < 8 ? "text-destructive" : "text-foreground",
            )}
            title="Nota geral"
          >
            {notaGeral.toFixed(1)}
          </span>
        </div>
        <p className="font-display text-lg leading-snug">{texto}</p>
      </CardHeader>

      <CardContent className="pb-0">
        <Collapsible>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => navigator.clipboard?.writeText(texto)}
            >
              <Copy className="size-4" aria-hidden />
              Copiar
            </Button>
            <Button
              variant={variacao.favorita ? "default" : "ghost"}
              size="sm"
              className="h-8 px-2"
            >
              <Heart className="size-4" aria-hidden />
              {variacao.favorita ? "Favoritada" : "Favoritar"}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label="Outras ações">
                  <MoreHorizontal className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  disabled={!podeComparar}
                  onSelect={() => setComparando((v) => !v)}
                >
                  <GitCompare className="size-4" aria-hidden />
                  Comparar versões
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Pencil className="size-4" aria-hidden />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Trash2 className="size-4" aria-hidden />
                  Descartar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <CollapsibleTrigger className="group ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline">
              Ver auditoria
              <ChevronDown
                className="size-3.5 transition-transform group-data-[state=open]:rotate-180"
                aria-hidden
              />
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent className="mt-3 space-y-3 border-t pt-3">
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <Nota rotulo="Impacto" valor={impacto} />
              <Nota rotulo="Clareza" valor={clareza} />
              <Nota rotulo="Ritmo" valor={ritmo} />
            </dl>

            <p className="text-sm text-muted-foreground">{variacao.justificativa}</p>

            <div className="space-y-1.5">
              {variacao.versoes.map((v) => (
                <div key={v.origem} className="text-sm">
                  <span
                    className={cn(
                      "mr-2 text-[11px] uppercase tracking-wide",
                      CLASSE_VERSAO[v.origem],
                    )}
                  >
                    {ROTULO_VERSAO[v.origem]}
                  </span>
                  <span className="text-muted-foreground">{v.texto}</span>
                </div>
              ))}
            </div>

            {comparando && primeira && ultima && (
              <DiffAdaptacao antes={primeira.texto} depois={ultima.texto} />
            )}

            <div className="flex flex-wrap gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                disabled={!podeComparar}
                onClick={() => setComparando((v) => !v)}
              >
                <GitCompare className="size-4" aria-hidden />
                Comparar versões
              </Button>
              <Button variant="ghost" size="sm" className="h-8 px-2">
                <Pencil className="size-4" aria-hidden />
                Editar
              </Button>
              <Button variant="ghost" size="sm" className="h-8 px-2">
                <Trash2 className="size-4" aria-hidden />
                Descartar
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function Nota({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
      <dd
        className={cn("font-mono font-medium", valor < 8 ? "text-destructive" : "text-foreground")}
      >
        {valor.toFixed(1)}
      </dd>
    </div>
  );
}