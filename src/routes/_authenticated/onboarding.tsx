import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { CascaSimples } from "@/components/layout/CascaSimples";
import { PaginaConfig } from "@/components/layout/AppShell";

const TITULO = "Primeiros passos — voz de marca e IA local";
const DESCRICAO =
  "Configure sua voz de marca e decida, sem pressa, se quer instalar a IA local para adaptação de estilo no dispositivo.";

export const Route = createFileRoute("/_authenticated/onboarding")({
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
        titulo="Primeiros passos"
        descricao="Duas decisões rápidas: como você escreve e se quer a IA local agora ou depois."
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Sua voz de marca</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="nome-marca">Nome do perfil</Label>
              <Input id="nome-marca" placeholder="Ex.: Clínica Jainara" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="posicionamento">Posicionamento e limites éticos</Label>
              <Textarea
                id="posicionamento"
                rows={3}
                placeholder="Fala adulta, sem promessa de cura rápida. Nomeia a dor antes de oferecer caminho."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proibidas">Palavras proibidas</Label>
              <Input id="proibidas" placeholder="mindset, segredo definitivo, método infalível" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. IA local (opcional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A IA local adapta o estilo dos textos aprovados dentro do seu navegador. O download
              tem cerca de 2 GB, é feito uma única vez e pode ser removido quando quiser.
            </p>
            <Alert>
              <Info aria-hidden />
              <AlertTitle>Nada baixa sozinho</AlertTitle>
              <AlertDescription>
                O download nunca começa automaticamente e nunca é iniciado em celular. Você pode
                instalar depois, sem perder nada.
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link to="/config/ia-local">Ver requisitos e instalar</Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link to="/app">Decidir depois</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Button asChild size="lg">
          <Link to="/app">Ir para o workspace</Link>
        </Button>
      </PaginaConfig>
    </CascaSimples>
  );
}