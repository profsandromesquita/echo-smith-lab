import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TITULO = "Entrar na Copyforja";
const DESCRICAO =
  "Acesse seu workspace de copywriting com pastas por cliente, voz de marca e curadoria auditada.";

export const Route = createFileRoute("/auth")({
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center font-display text-2xl">Copyforja</h1>
        <Tabs defaultValue="entrar">
          <TabsList className="w-full">
            <TabsTrigger value="entrar" className="flex-1">
              Entrar
            </TabsTrigger>
            <TabsTrigger value="criar" className="flex-1">
              Criar conta
            </TabsTrigger>
          </TabsList>

          <TabsContent value="entrar">
            <Formulario acao="Entrar" />
          </TabsContent>
          <TabsContent value="criar">
            <Formulario acao="Criar conta" />
          </TabsContent>
        </Tabs>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Tela de apresentação. A autenticação real entra em uma fase posterior.
        </p>
      </div>
    </div>
  );
}

function Formulario({ acao }: { acao: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{acao}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`email-${acao}`}>E-mail</Label>
          <Input id={`email-${acao}`} type="email" placeholder="voce@estudio.com.br" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`senha-${acao}`}>Senha</Label>
          <Input id={`senha-${acao}`} type="password" placeholder="••••••••" />
        </div>
      </CardContent>
      <CardFooter className="flex-col gap-2">
        <Button asChild className="w-full">
          <Link to="/app">{acao}</Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="w-full">
          <Link to="/onboarding">Configurar voz de marca primeiro</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}