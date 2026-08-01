import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CascaSimples } from "@/components/layout/CascaSimples";
import { PaginaConfig } from "@/components/layout/AppShell";
import { PERFIS_MARCA } from "@/lib/fixtures";

const TITULO = "Vozes de marca — Copyforja";
const DESCRICAO =
  "Gerencie vários perfis de voz de marca por cliente, com perfil padrão, vínculo por pasta e sobreposição por chat.";

export const Route = createFileRoute("/_authenticated/config/voz-de-marca")({
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
        titulo="Vozes de marca"
        descricao="Os perfis pertencem à sua conta. Uma pasta pode ser vinculada a um perfil, e um chat pode usar outro."
      >
        <Button className="w-fit">Novo perfil de marca</Button>

        {PERFIS_MARCA.map((perfil) => (
          <Card key={perfil.id}>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">{perfil.nome}</CardTitle>
              <div className="flex gap-2">
                {perfil.padrao && <Badge>Padrão</Badge>}
                <Badge variant="outline">{perfil.pastasVinculadas} pasta(s)</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">{perfil.posicionamento}</p>
              <div>
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                  Dicionário próprio
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {perfil.dicionario.map((p) => (
                    <Badge key={p} variant="secondary" className="font-normal">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                  Palavras proibidas
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {perfil.proibidas.map((p) => (
                    <Badge
                      key={p}
                      variant="outline"
                      className="border-destructive/50 font-normal text-destructive"
                    >
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline">
                  Editar
                </Button>
                <Button size="sm" variant="ghost">
                  Definir como padrão
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </PaginaConfig>
    </CascaSimples>
  );
}