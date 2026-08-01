import { createFileRoute } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CascaSimples } from "@/components/layout/CascaSimples";
import { REGISTRY } from "@/lib/fixtures";

const TITULO = "Registry de agentes — Copyforja";
const DESCRICAO =
  "Visão administrativa dos papéis de agente, modelos configurados, versão publicada, rascunhos e histórico.";

export const Route = createFileRoute("/_authenticated/admin/agentes")({
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
  component: Pagina,
});

function Pagina() {
  return (
    <CascaSimples>
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <header className="mb-6">
          <h1 className="font-display text-2xl">Registry de agentes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Papéis nunca ficam acoplados a um modelo: trocar de modelo é trocar de configuração.
          </p>
        </header>

        <Alert className="mb-6">
          <AlertTitle>Publicação é sempre explícita</AlertTitle>
          <AlertDescription>
            Editar um rascunho não altera a produção. Cada execução registra a versão utilizada, e
            qualquer versão anterior pode ser restaurada.
          </AlertDescription>
        </Alert>

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Papel</TableHead>
                <TableHead>Modelo configurado</TableHead>
                <TableHead>Publicada</TableHead>
                <TableHead>Rascunho</TableHead>
                <TableHead>Atualizado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {REGISTRY.map((a) => (
                <TableRow key={a.papel}>
                  <TableCell>
                    <span className="font-medium">{a.nome}</span>
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      {a.papel}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{a.modelo}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-success/50 text-success">
                      {a.versaoPublicada}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {a.rascunho ? (
                      <Badge variant="outline" className="border-warning/60 text-warning">
                        {a.rascunho} não publicado
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {a.atualizadoEm} · {a.atualizadoPor}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost">
                      Histórico
                    </Button>
                    <Button size="sm" variant="outline" disabled={!a.rascunho}>
                      Publicar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Limites de tokens, timeout, tentativas, concorrência e orçamento por execução também são
          versionados junto de cada papel.
        </p>
      </div>
    </CascaSimples>
  );
}