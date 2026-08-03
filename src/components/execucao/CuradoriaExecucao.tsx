import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ROTULO_PAPEL, type PapelAgente } from "@/lib/adaptadores-simulados";
import { ROTULO_FATOR, type FatoresRanking } from "@/lib/ranking";

export interface ResultadoExecucao {
  id: string;
  etapa_id: string;
  tipo: string;
  payload: unknown;
  versao: string | null;
  aprovado: boolean | null;
  nota_final: number | string | null;
}

function obj(v: unknown): Record<string, unknown> {
  return (v ?? {}) as Record<string, unknown>;
}

/** Curadoria real da execução simulada: entrega, correção única e itens fora da curadoria. */
export function CuradoriaExecucao({ resultados }: { resultados: ResultadoExecucao[] }) {
  const entrega = resultados.find((r) => r.tipo === "entrega");
  if (!entrega) return null;

  const p = obj(entrega.payload);
  const entregues = (p['entregues'] ?? []) as Array<Record<string, unknown>>;
  const geradas = Number(p['total_geradas'] ?? 0);
  const reprovadas = new Set((p['reprovadas'] ?? []) as string[]);

  const variacoes = new Map<string, Record<string, unknown>>();
  const auditorias = new Map<string, ResultadoExecucao[]>();
  const correcoes = new Map<string, Record<string, unknown>>();
  const adaptacoes = new Map<string, Record<string, unknown>>();

  for (const r of resultados) {
    const carga = obj(r.payload);
    const id = String(carga['variacao_id'] ?? "");
    if (!id) continue;
    if (r.tipo === "variacao") variacoes.set(id, carga);
    if (r.tipo === "correcao") correcoes.set(id, carga);
    if (r.tipo === "adaptacao") adaptacoes.set(id, carga);
    if (r.tipo === "auditoria") auditorias.set(id, [...(auditorias.get(id) ?? []), r]);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          Curadoria desta execução
          <span className="text-xs font-normal text-muted-foreground">
            {geradas} variações geradas · {entregues.length} entregues após auditoria e ranking
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {entregues.map((item) => {
          const id = String(item['id'] ?? "");
          const papel = String(item['papel'] ?? "") as PapelAgente;
          const auditoria = (auditorias.get(id) ?? []).at(-1);
          const fatores = obj(obj(auditoria?.payload)['criterios']) as unknown as FatoresRanking;
          const adaptacao = adaptacoes.get(id);
          return (
            <div key={id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm">{String(item['texto'] ?? "")}</p>
                <Badge variant="outline" className="font-normal">
                  {Number(item['score'] ?? 0).toFixed(2)}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {ROTULO_PAPEL[papel] ?? papel} · posição {String(item['posicao'] ?? "—")}
              </p>
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button size="sm" variant="ghost" className="mt-1 h-7 px-0 text-xs">
                    Ver auditoria
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-1 text-xs text-muted-foreground">
                  <ul className="grid gap-0.5 sm:grid-cols-2">
                    {(Object.keys(ROTULO_FATOR) as Array<keyof FatoresRanking>).map((k) => (
                      <li key={k} className="flex justify-between gap-2">
                        <span>{ROTULO_FATOR[k]}</span>
                        <span className="font-mono">{Number(fatores?.[k] ?? 0).toFixed(1)}</span>
                      </li>
                    ))}
                  </ul>
                  {adaptacao && (
                    <p>
                      Adaptação local aplicada sobre: “{String(adaptacao['texto_antes'] ?? "")}”
                    </p>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>
          );
        })}

        {reprovadas.size > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button size="sm" variant="ghost" className="px-0 text-xs">
                Fora da curadoria ({reprovadas.size})
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              {[...reprovadas].map((id) => {
                const v = variacoes.get(id) ?? {};
                const correcao = correcoes.get(id);
                const ultima = (auditorias.get(id) ?? []).at(-1);
                return (
                  <div key={id} className="rounded-lg border border-dashed p-3 text-xs">
                    <p className="text-sm text-muted-foreground line-through">
                      {String(v['texto'] ?? "")}
                    </p>
                    {correcao && (
                      <p className="mt-1 text-muted-foreground">
                        Correção única aplicada: “{String(correcao['texto'] ?? "")}”
                      </p>
                    )}
                    <p className="mt-1 text-muted-foreground">
                      {String(obj(ultima?.payload)['observacao'] ?? "")}
                    </p>
                  </div>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
