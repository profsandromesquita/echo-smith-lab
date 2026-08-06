import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { CascaSimples } from "@/components/layout/CascaSimples";
import { PaginaConfig } from "@/components/layout/AppShell";
import { DialogoDestrutivo } from "@/components/comum/DialogoDestrutivo";
import { HistoricoConsentimentos } from "@/components/privacy/HistoricoConsentimentos";
import { supabase } from "@/integrations/supabase/client";
import {
  chavesPrivacidade,
  DESCRICAO_MODO,
  opcoesConsentimentos,
  opcoesPreferencias,
  ROTULO_CATEGORIA,
  ROTULO_ESCOPO,
  ROTULO_MODO,
} from "@/lib/privacidade";
import { rotuloProvedor } from "@/lib/privacidade";
import { salvarPreferencias } from "@/lib/privacidade.functions";
import { revogarConsentimento } from "@/lib/consentimento.functions";
import { exportarDados, excluirConta } from "@/lib/conta-dados.functions";
import { limparDadosLocais, RECURSOS_LOCAIS } from "@/lib/armazenamento-local";

const TITULO = "Privacidade e consentimentos — Copyforja";
const DESCRICAO =
  "Escolha o modo de privacidade do chat, veja o que já saiu do dispositivo e gerencie exportação e exclusão de dados.";

export const Route = createFileRoute("/_authenticated/config/privacidade")({
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
  const cliente = useQueryClient();
  const navegar = useNavigate();
  const { data: prefs } = useQuery(opcoesPreferencias());
  const { data: consentimentos } = useQuery(opcoesConsentimentos());
  const [confirmarLocais, setConfirmarLocais] = useState(false);
  const [confirmarConta, setConfirmarConta] = useState(false);

  const salvar = useMutation({
    mutationFn: (dados: Record<string, unknown>) => salvarPreferencias({ data: dados as never }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: chavesPrivacidade.raiz });
      toast.success("Preferência de privacidade salva.");
    },
    onError: () => toast.error("Não foi possível salvar a preferência."),
  });

  const revogar = useMutation({
    mutationFn: (id: string) => revogarConsentimento({ data: { id, origem: "configuracoes" } }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: chavesPrivacidade.consentimentos });
      toast.success("Autorização revogada.");
    },
    onError: () => toast.error("Não foi possível revogar."),
  });

  const exportar = useMutation({
    mutationFn: () => exportarDados(),
    onSuccess: (dados) => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `copyforja-dados-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exportação concluída.");
    },
    onError: () => toast.error("Não foi possível exportar seus dados."),
  });

  const excluir = useMutation({
    mutationFn: () => excluirConta({ data: { confirmacao: "EXCLUIR" } }),
    onSuccess: async () => {
      await supabase.auth.signOut();
      cliente.clear();
      toast.success("Conta excluída.");
      void navegar({ to: "/" });
    },
    onError: () => toast.error("Não foi possível concluir a exclusão."),
  });

  const ativos = (consentimentos?.atuais ?? []).filter((c) => c.estado === "concedido");

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
          <CardContent className="space-y-4">
            <RadioGroup
              value={prefs?.modo_padrao ?? "local_estrita"}
              onValueChange={(v) => salvar.mutate({ modo_padrao: v })}
              className="gap-3"
            >
              <Opcao
                valor="local_estrita"
                titulo={ROTULO_MODO.local_estrita}
                texto={DESCRICAO_MODO.local_estrita}
              />
              <Opcao
                valor="hibrido_autorizado"
                titulo={ROTULO_MODO.hibrido_autorizado}
                texto={DESCRICAO_MODO.hibrido_autorizado}
              />
            </RadioGroup>

            <Separator />

            <Interruptor
              id="alerta-pii"
              titulo="Alertar sobre dados pessoais antes de enviar"
              texto="A verificação roda no seu dispositivo. Nenhum trecho detectado é registrado."
              ativo={prefs?.alerta_dados_pessoais ?? true}
              aoMudar={(v) => salvar.mutate({ alerta_dados_pessoais: v })}
            />
            <Interruptor
              id="bloquear-pii"
              titulo="Bloquear o envio quando houver dado pessoal de alta confiança"
              texto="Exige revisar ou anonimizar o texto antes de prosseguir."
              ativo={prefs?.bloquear_envio_com_alerta ?? false}
              aoMudar={(v) => salvar.mutate({ bloquear_envio_com_alerta: v })}
            />
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
            <CardTitle className="text-base">Autorizações ativas</CardTitle>
            <p className="text-xs text-muted-foreground">
              Cada autorização vale para uma categoria, um provedor e uma etapa. Revogar interrompe
              usos futuros.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {ativos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma autorização ativa. Tudo permanece no dispositivo até você autorizar.
              </p>
            ) : (
              ativos.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm"
                >
                  <span className="font-medium">{ROTULO_CATEGORIA[c.categoria] ?? c.categoria}</span>
                  <Badge variant="outline" className="border-cloud/50 font-normal text-cloud">
                    {rotuloProvedor(c.provedor)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {c.etapa} · {ROTULO_ESCOPO[c.escopo] ?? c.escopo}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 text-destructive"
                    disabled={revogar.isPending}
                    onClick={() => revogar.mutate(c.id)}
                  >
                    Revogar
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Histórico de decisões</CardTitle>
            <p className="text-xs text-muted-foreground">
              Registro append-only: não pode ser editado nem apagado, só acrescentado.
            </p>
          </CardHeader>
          <CardContent>
            <HistoricoConsentimentos />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Retenção, exportação e exclusão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Logs técnicos guardam papel, modelo, duração, tokens e veredito — nunca o texto do
              briefing ou das variações. Ao excluir a conta, todos os registros vinculados a você
              são apagados, inclusive o histórico de autorizações.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={exportar.isPending}
                onClick={() => exportar.mutate()}
              >
                Exportar meus dados
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmarLocais(true)}>
                Apagar dados locais deste dispositivo
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => setConfirmarConta(true)}
              >
                Excluir conta e conteúdo
              </Button>
            </div>
          </CardContent>
        </Card>

        <DialogoDestrutivo
          aberto={confirmarLocais}
          aoFechar={() => setConfirmarLocais(false)}
          titulo="Apagar dados locais deste dispositivo"
          descricao="Remove apenas os artefatos da aplicação guardados neste navegador. Sua sessão e seus dados na nuvem continuam intactos."
          rotuloConfirmar="Apagar dados locais"
          impacto={
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              {RECURSOS_LOCAIS.map((r) => (
                <li key={r.id}>{r.rotulo}</li>
              ))}
            </ul>
          }
          aoConfirmar={async () => {
            const removidos = await limparDadosLocais();
            setConfirmarLocais(false);
            toast.success(`${removidos.length} item(ns) local(is) removido(s).`);
          }}
        />

        <DialogoDestrutivo
          aberto={confirmarConta}
          aoFechar={() => setConfirmarConta(false)}
          titulo="Excluir conta e todo o conteúdo"
          descricao="Ação definitiva e imediata. Não há período de recuperação."
          confirmacao="EXCLUIR"
          rotuloConfirmar="Excluir definitivamente"
          executando={excluir.isPending}
          impacto={
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              <li>Pastas, chats e mensagens</li>
              <li>Perfis de voz de marca e exemplos</li>
              <li>Preferências, consentimentos e histórico de decisões</li>
              <li>Eventos técnicos e a identidade de acesso</li>
              <li>Nada permanece vinculado a você. Exporte antes, se quiser guardar.</li>
            </ul>
          }
          aoConfirmar={() => excluir.mutate()}
        />
      </PaginaConfig>
    </CascaSimples>
  );
}

function Interruptor({
  id,
  titulo,
  texto,
  ativo,
  aoMudar,
}: {
  id: string;
  titulo: string;
  texto: string;
  ativo: boolean;
  aoMudar: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label htmlFor={id} className="text-sm font-medium">
          {titulo}
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">{texto}</p>
      </div>
      <Switch id={id} checked={ativo} onCheckedChange={aoMudar} />
    </div>
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