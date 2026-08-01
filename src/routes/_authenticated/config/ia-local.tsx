import { createFileRoute } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { CascaSimples } from "@/components/layout/CascaSimples";
import { PaginaConfig } from "@/components/layout/AppShell";
import { ControleDemo } from "@/components/dev/ControleDemo";
import { SeloIaLocal } from "@/components/privacy/Indicadores";
import { useDemo } from "@/lib/demo-state";

const TITULO = "IA local — Copyforja";
const DESCRICAO =
  "Instale, acompanhe ou remova o modelo local que adapta o estilo dos textos dentro do seu navegador.";

export const Route = createFileRoute("/_authenticated/config/ia-local")({
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
      <Conteudo />
      <ControleDemo />
    </CascaSimples>
  );
}

function Conteudo() {
  const { iaLocal } = useDemo();

  return (
    <PaginaConfig
      titulo="IA local"
      descricao="Modelo opcional que roda no seu dispositivo para adaptar o estilo dos textos já aprovados."
    >
      <SeloIaLocal />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Requisitos e tamanho</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Linha rotulo="Tamanho do download" valor="≈ 2,1 GB (uma única vez)" />
          <Separator />
          <Linha rotulo="Espaço em disco" valor="≈ 2,5 GB no navegador" />
          <Separator />
          <Linha rotulo="Aceleração" valor="WebGPU disponível no navegador" />
          <Separator />
          <Linha rotulo="Memória recomendada" valor="8 GB de RAM" />
        </CardContent>
      </Card>

      {iaLocal === "baixando" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Download em andamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={38} aria-label="Progresso do download" />
            <p className="text-xs text-muted-foreground">
              820 MB de 2,1 GB · você pode continuar usando a plataforma normalmente.
            </p>
            <Button size="sm" variant="outline">
              Pausar download
            </Button>
          </CardContent>
        </Card>
      )}

      {iaLocal === "incompativel" && (
        <Alert variant="destructive">
          <AlertTitle>Este dispositivo não suporta a IA local</AlertTitle>
          <AlertDescription>
            Sem WebGPU não é possível rodar o modelo aqui. As etapas em nuvem continuam
            disponíveis, mas cada envio exigirá sua autorização — não há troca automática.
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <AlertTitle>Nada baixa sozinho</AlertTitle>
        <AlertDescription>
          O download nunca começa automaticamente, nunca é iniciado em celular e pode ser adiado
          indefinidamente. A remoção libera todo o espaço usado.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap gap-2">
        <Button>Instalar IA local</Button>
        <Button variant="outline">Adiar decisão</Button>
        <Button variant="ghost">Remover modelo do dispositivo</Button>
      </div>
    </PaginaConfig>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="font-medium">{valor}</span>
    </div>
  );
}