import { useState } from "react";
import {
  CircleAlert,
  CircleHelp,
  MessageCircleQuestion,
  Sparkles,
  WifiOff,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CartaoVariacao } from "@/components/pipeline/CartaoVariacao";
import { DiffAdaptacao } from "@/components/pipeline/DiffAdaptacao";
import { PainelRanking } from "@/components/pipeline/PainelCuradoria";
import { LinhaDoTempoPipeline } from "@/components/pipeline/LinhaDoTempoPipeline";
import { ModalConsentimento } from "@/components/privacy/ModalConsentimento";
import { AvisoRotuloHonesto } from "@/components/privacy/Indicadores";
import { useQuery } from "@tanstack/react-query";
import { useDemo } from "@/lib/demo-state";
import { opcoesModo } from "@/lib/privacidade";
import { VARIACOES, type EtapaId, type StatusEtapa } from "@/lib/fixtures";

type MapaStatus = Record<EtapaId, StatusEtapa>;

function mapa(parcial: Partial<MapaStatus>, padrao: StatusEtapa = "pendente"): MapaStatus {
  const base: MapaStatus = {
    privacidade_local: padrao,
    gatekeeper: padrao,
    analise_psicologica: padrao,
    especialistas: padrao,
    auditoria: padrao,
    correcao: padrao,
    adaptacao_local: padrao,
    validacao_preservacao: padrao,
    ranking: padrao,
    entrega: padrao,
  };
  return { ...base, ...parcial };
}

export function AreaResultados({ chatId = null }: { chatId?: string | null }) {
  const { estado, offline } = useDemo();
  const { data: privacidade } = useQuery(opcoesModo(chatId));
  const [consentimentoAberto, setConsentimentoAberto] = useState(false);

  if (offline) {
    return (
      <Alert>
        <WifiOff aria-hidden />
        <AlertTitle>Você está sem conexão</AlertTitle>
        <AlertDescription>
          As etapas em nuvem ficam indisponíveis. O que já foi entregue continua acessível e a
          adaptação local segue funcionando se a IA local estiver instalada.
        </AlertDescription>
      </Alert>
    );
  }

  switch (estado) {
    case "vazio":
      return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center">
          <Sparkles className="mb-3 size-6 text-primary" aria-hidden />
          <h2 className="font-display text-lg">Comece pelo briefing</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Descreva o tema, o público e a promessa. Escolha os formatos na barra de parâmetros e a
            plataforma monta o pacote auditado.
          </p>
        </div>
      );

    case "briefing_insuficiente":
      return (
        <Card>
          <CardHeader className="flex-row items-start gap-3 space-y-0">
            <MessageCircleQuestion className="mt-0.5 size-5 text-warning" aria-hidden />
            <div>
              <CardTitle className="text-base">Antes de gerar, preciso da Dor Central</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                O briefing traz o tema, mas não a dor. Qual é o incômodo concreto que essa pessoa
                sente na segunda-feira de manhã?
              </p>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline">
              Medo do julgamento
            </Button>
            <Button size="sm" variant="outline">
              Culpa por não render
            </Button>
            <Button size="sm" variant="outline">
              Descrever com minhas palavras
            </Button>
          </CardContent>
        </Card>
      );

    case "executando":
      return (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-sm">Execução em andamento</CardTitle>
            <Button size="sm" variant="outline">
              Cancelar execução
            </Button>
          </CardHeader>
          <CardContent>
            <LinhaDoTempoPipeline
              status={mapa({
                privacidade_local: "concluida",
                gatekeeper: "concluida",
                analise_psicologica: "concluida",
                especialistas: "em_curso",
              })}
            />
          </CardContent>
        </Card>
      );

    case "adaptacao_local":
      return (
        <div className="space-y-4">
          <LinhaDoTempoPipeline
            status={mapa({
              privacidade_local: "concluida",
              gatekeeper: "concluida",
              analise_psicologica: "concluida",
              especialistas: "concluida",
              auditoria: "concluida",
              correcao: "concluida",
              adaptacao_local: "em_curso",
            })}
          />
          <DiffAdaptacao
            antes="A sua lista de tarefas virou um tribunal."
            depois="Sua lista de tarefas virou um tribunal — e você é o réu."
          />
          <AvisoRotuloHonesto />
        </div>
      );

    case "preservacao_reprovada":
      return (
        <DiffAdaptacao
          reprovado
          antes="O medo de falhar não avisa. Ele te faz limpar a cozinha."
          depois="Limpar a cozinha é autocuidado quando o medo aperta."
          motivo="A adaptação inverteu a intenção: o texto passou a validar o comportamento em vez de nomeá-lo. A versão aprovada pela auditoria foi mantida."
        />
      );

    case "parcial":
      return (
        <div className="space-y-4">
          <Alert>
            <CircleAlert aria-hidden />
            <AlertTitle>Pacote parcial</AlertTitle>
            <AlertDescription>
              O especialista de Headline para Imagem falhou. Os demais formatos foram entregues
              normalmente e você pode reexecutar apenas o formato que faltou.
            </AlertDescription>
          </Alert>
          <div className="grid gap-3">
            {VARIACOES.filter((v) => v.formato !== "headline_imagem")
              .slice(0, 2)
              .map((v) => (
                <CartaoVariacao key={v.id} variacao={v} />
              ))}
          </div>
        </div>
      );

    case "cancelado":
      return (
        <Alert>
          <XCircle aria-hidden />
          <AlertTitle>Execução cancelada</AlertTitle>
          <AlertDescription>
            Nenhuma etapa nova será iniciada e a resposta que chegar atrasada será descartada. Uma
            chamada já enviada ao provedor pode continuar processando do lado dele e gerar custo —
            não temos como garantir a interrupção remota.
          </AlertDescription>
        </Alert>
      );

    case "erro_provedor":
      return (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>Provedor de nuvem B indisponível</AlertTitle>
          <AlertDescription>
            A etapa de especialistas falhou por indisponibilidade do provedor. Você pode tentar
            novamente ou aguardar. As etapas já concluídas foram preservadas.
          </AlertDescription>
        </Alert>
      );

    case "consentimento_pendente":
      return (
        <>
          <Alert>
            <CircleHelp aria-hidden />
            <AlertTitle>Autorização necessária</AlertTitle>
            <AlertDescription>
              A IA local não está disponível neste dispositivo. Nada será enviado à nuvem sem a sua
              autorização — não existe envio automático.
              <span className="mt-3 block">
                <Button size="sm" onClick={() => setConsentimentoAberto(true)}>
                  Ver o que seria enviado
                </Button>
              </span>
            </AlertDescription>
          </Alert>
          <ModalConsentimento
            aberto={consentimentoAberto}
            aoFechar={() => setConsentimentoAberto(false)}
            chatId={chatId}
            modo={privacidade?.modo ?? "local_estrita"}
          />
        </>
      );

    case "resultado_incerto":
      return (
        <Alert>
          <CircleHelp aria-hidden />
          <AlertTitle>Resultado externo incerto</AlertTitle>
          <AlertDescription>
            A chamada saiu, mas não recebemos confirmação de que o resultado foi gravado. Não vamos
            repetir automaticamente: essa chamada pode já ter sido cobrada pelo provedor. Você pode
            tentar reconciliar o resultado ou refazer a etapa de forma controlada.
            <span className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline">
                Tentar reconciliar
              </Button>
              <Button size="sm" variant="ghost">
                Refazer mesmo assim
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      );

    case "entregue":
    default:
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg">Curadoria final</h2>
            <p className="text-xs text-muted-foreground">
              5 variações por formato · 3 entregues após auditoria e ranking
            </p>
          </div>
          <div className="grid gap-3">
            {VARIACOES.map((v) => (
              <CartaoVariacao key={v.id} variacao={v} />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <PainelRanking />
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Etapas desta execução</CardTitle>
              </CardHeader>
              <CardContent>
                <LinhaDoTempoPipeline status={mapa({}, "concluida")} />
              </CardContent>
            </Card>
          </div>
          <AvisoRotuloHonesto />
        </div>
      );
  }
}