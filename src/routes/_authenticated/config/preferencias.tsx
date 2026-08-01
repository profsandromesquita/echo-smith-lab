import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CascaSimples } from "@/components/layout/CascaSimples";
import { PaginaConfig } from "@/components/layout/AppShell";
import { PREFERENCIAS_EXPLICITAS, PREFERENCIAS_INFERIDAS } from "@/lib/fixtures";

const TITULO = "Preferências de estilo — Copyforja";
const DESCRICAO =
  "Veja e edite suas regras explícitas e as preferências inferidas a partir de favoritos, edições e descartes.";

export const Route = createFileRoute("/_authenticated/config/preferencias")({
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
      <PaginaConfig
        titulo="Preferências de estilo"
        descricao="Regras explícitas sempre vencem preferências inferidas. Nenhuma inferência é aplicada em silêncio."
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Regras explícitas</CardTitle>
            <p className="text-xs text-muted-foreground">
              Prioridade máxima. Aplicadas como restrição dura em toda geração.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {PREFERENCIAS_EXPLICITAS.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5">
                <p className="text-sm">{p.regra}</p>
                <Button size="icon" variant="ghost" aria-label="Remover regra">
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline">
              Adicionar regra
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preferências inferidas</CardTitle>
            <p className="text-xs text-muted-foreground">
              Derivadas do seu uso. Ficam apenas neste dispositivo e podem ser removidas.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {PREFERENCIAS_INFERIDAS.map((p) => (
              <div key={p.id} className="flex items-start justify-between gap-2 rounded-md border p-2.5">
                <div>
                  <p className="text-sm">{p.regra}</p>
                  <Badge variant="outline" className="mt-1 font-normal text-muted-foreground">
                    {p.evidencia}
                  </Badge>
                </div>
                <Button size="icon" variant="ghost" aria-label="Remover inferência">
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Alert>
          <AlertTitle>Memória de estilo é deste dispositivo</AlertTitle>
          <AlertDescription>
            Seus favoritos aparecem em qualquer aparelho, mas a memória de estilo não sincroniza.
            Você pode exportar o perfil e importá-lo em outro dispositivo.
          </AlertDescription>
        </Alert>
      </PaginaConfig>
    </CascaSimples>
  );
}