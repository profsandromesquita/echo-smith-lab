import { createFileRoute } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CascaSimples } from "@/components/layout/CascaSimples";
import { PaginaConfig } from "@/components/layout/AppShell";
import { LINHA_DO_TEMPO_ENVIOS } from "@/lib/fixtures";

const TITULO = "Privacidade e consentimentos — Copyforja";
const DESCRICAO =
  "Escolha o modo de privacidade do chat, veja o que já saiu do dispositivo e gerencie exportação e exclusão de dados.";

export const Route = createFileRoute("/config/privacidade")({
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
        titulo="Privacidade e consentimentos"
        descricao="Nenhum conteúdo vai para a nuvem sem autorização explícita. Não existe envio automático."
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Modo de privacidade padrão dos novos chats</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup defaultValue="local_estrita" className="gap-3">
              <Opcao
                valor="local_estrita"
                titulo="Memória local estrita"
                texto="Exemplos pessoais, preferências inferidas e textos privados do few-shot ficam no dispositivo. Só o conteúdo explicitamente autorizado segue para a nuvem."
              />
              <Opcao
                valor="hibrido_autorizado"
                titulo="Híbrido autorizado"
                texto="Você pode autorizar o envio de um resumo derivado da voz de marca. Exemplos brutos continuam locais por padrão."
              />
            </RadioGroup>
          </CardContent>
        </Card>

        <Alert>
          <AlertTitle>Como os rótulos funcionam</AlertTitle>
          <AlertDescription>
            <strong>Memória de estilo local</strong> e <strong>adaptação local</strong> acontecem no
            seu dispositivo. <strong>Processamento em nuvem</strong> cobre gatekeeper, análise
            psicológica, especialistas e auditoria. <strong>Geração totalmente local</strong> não
            existe nesta versão e nunca será anunciada como se existisse.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">O que saiu deste dispositivo</CardTitle>
            <p className="text-xs text-muted-foreground">
              Registro por execução, com etapa, destino e tipo de conteúdo.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {LINHA_DO_TEMPO_ENVIOS.map((e) => (
              <div key={e.id} className="flex flex-wrap items-baseline gap-2 rounded-md border p-2.5 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{e.quando}</span>
                <span className="font-medium">{e.etapa}</span>
                <Badge
                  variant="outline"
                  className={
                    e.destino === "Seu dispositivo"
                      ? "border-local/50 font-normal text-local"
                      : "border-cloud/50 font-normal text-cloud"
                  }
                >
                  {e.destino}
                </Badge>
                <span className="text-muted-foreground">{e.conteudo}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Retenção, exportação e exclusão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Logs técnicos guardam papel, modelo, duração, tokens e veredito — nunca o texto do
              briefing ou das variações. O histórico de autorizações é preservado como registro
              mínimo mesmo após a exclusão de conteúdo.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm">
                Exportar meus dados
              </Button>
              <Button variant="outline" size="sm">
                Apagar dados locais deste dispositivo
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive">
                Excluir conta e conteúdo
              </Button>
            </div>
          </CardContent>
        </Card>
      </PaginaConfig>
    </CascaSimples>
  );
}

function Opcao({ valor, titulo, texto }: { valor: string; titulo: string; texto: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <RadioGroupItem value={valor} id={valor} className="mt-1" />
      <div>
        <Label htmlFor={valor} className="text-sm font-medium">
          {titulo}
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">{texto}</p>
      </div>
    </div>
  );
}