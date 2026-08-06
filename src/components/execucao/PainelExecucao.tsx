import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Circle, HelpCircle, Loader2, Lock, TriangleAlert, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DetalhesTecnicos } from "@/components/execucao/DetalhesTecnicos";
import { CuradoriaExecucao } from "@/components/execucao/CuradoriaExecucao";
import { ComplementoBriefing } from "@/components/execucao/ComplementoBriefing";
import { ModalConsentimento } from "@/components/privacy/ModalConsentimento";
import { IndicadorProcessamento } from "@/components/privacy/Indicadores";
import { PAPEL_LOCAL, ROTULO_PAPEL, type PapelAgente } from "@/lib/adaptadores-simulados";
import {
  MENSAGEM_ERRO_ETAPA,
  ROTULO_ESTADO_EXECUCAO,
  chavesExecucao,
  opcoesExecucao,
  opcoesExecucaoAtiva,
  type EstadoExecucao,
  type EstadoEtapa,
} from "@/lib/execucao";
import {
  avancarExecucao,
  cancelarExecucao,
  criarExecucaoParaMensagem,
  resolverIncerto,
} from "@/lib/execucao.functions";
import { ROTULO_FORMATO, type FormatoSaida } from "@/lib/fixtures";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ICONES: Record<EstadoEtapa, typeof Check> = {
  pendente: Circle,
  bloqueada: Lock,
  em_execucao: Loader2,
  concluida: Check,
  falhou: TriangleAlert,
  cancelada: X,
  resultado_incerto: HelpCircle,
};

const CORES: Record<EstadoEtapa, string> = {
  pendente: "border-border text-muted-foreground",
  bloqueada: "border-warning text-warning",
  em_execucao: "border-primary text-primary",
  concluida: "border-success text-success",
  falhou: "border-destructive text-destructive",
  cancelada: "border-muted-foreground text-muted-foreground",
  resultado_incerto: "border-uncertain text-uncertain",
};

const ATIVOS: EstadoExecucao[] = ["pronta", "em_processamento", "resultado_incerto"];

/** Texto exibido por categoria. Provedor e finalidade reais são derivados no servidor. */
/**
 * Cada categoria é apresentada por provedor: a autorização é sempre concedida a
 * um provedor específico, nunca a "a nuvem" de forma genérica.
 */
const DETALHE_CATEGORIA: Record<
  string,
  Array<{
    provedor: "openai" | "anthropic";
    rotuloProvedor: string;
    etapa: string;
    finalidade: string;
  }>
> = {
  briefing: [
    {
      provedor: "openai",
      rotuloProvedor: "Provedor de nuvem A (OpenAI)",
      etapa: "Gatekeeper e análise psicológica",
      finalidade: "Interpretar o briefing e definir a diretriz estratégica",
    },
    {
      provedor: "anthropic",
      rotuloProvedor: "Provedor de nuvem B (Anthropic)",
      etapa: "Especialistas",
      finalidade: "Escrever as variações a partir do briefing aprovado",
    },
  ],
  variacoes_para_auditoria: [
    {
      provedor: "openai",
      rotuloProvedor: "Provedor de nuvem A (OpenAI)",
      etapa: "Auditoria e auditoria final",
      finalidade: "Avaliar qualidade e conformidade das variações desta execução",
    },
  ],
  feedback_para_correcao: [
    {
      provedor: "anthropic",
      rotuloProvedor: "Provedor de nuvem B (Anthropic)",
      etapa: "Correção única",
      finalidade: "Enviar as observações da auditoria para a correção única desta execução",
    },
  ],
  resumo_voz_marca_explicita: [
    {
      provedor: "anthropic",
      rotuloProvedor: "Provedor de nuvem B (Anthropic)",
      etapa: "Especialistas",
      finalidade: "Adequar as variações ao perfil explícito de voz de marca",
    },
    {
      provedor: "openai",
      rotuloProvedor: "Provedor de nuvem A (OpenAI)",
      etapa: "Auditoria",
      finalidade: "Considerar o perfil explícito de voz de marca ao auditar",
    },
  ],
};

export function PainelExecucao({ chatId }: { chatId: string }) {
  const cliente = useQueryClient();
  const [autorizando, setAutorizando] = useState(false);
  const [confirmandoReexecucao, setConfirmandoReexecucao] = useState(false);
  const avancando = useRef(false);

  const ativa = useQuery(opcoesExecucaoAtiva(chatId));
  const execucaoId = ativa.data?.id ?? null;
  const detalhe = useQuery({ ...opcoesExecucao(execucaoId ?? ""), enabled: Boolean(execucaoId) });

  const invalidar = async () => {
    await cliente.invalidateQueries({ queryKey: chavesExecucao.raiz });
  };

  const reexecutar = useMutation({
    mutationFn: (v: { mensagemId: string; formato: string }) =>
      criarExecucaoParaMensagem({
        data: { chatId, mensagemId: v.mensagemId, formato: v.formato as never, reexecutar: true },
      }),
    onSuccess: async () => {
      setConfirmandoReexecucao(false);
      await invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const avancar = useMutation({
    mutationFn: (id: string) => avancarExecucao({ data: { id, simular: "ok" } }),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelar = useMutation({
    mutationFn: (id: string) => cancelarExecucao({ data: { id } }),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });

  const resolver = useMutation({
    mutationFn: (v: {
      etapaId: string;
      desfecho: "falha_confirmada" | "sucesso_confirmado" | "refazer_manualmente";
    }) => resolverIncerto({ data: v }),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });

  const estado = (detalhe.data?.execucao.estado ?? null) as EstadoExecucao | null;
  const etapas = detalhe.data?.etapas ?? [];
  const resultados = detalhe.data?.resultados ?? [];

  // Sempre o resultado mais recente: um complemento reavalia o briefing e gera nova saída.
  const cargas = resultados.map((r) => (r.payload ?? {}) as Record<string, unknown>);
  const ultima = (campo: string) =>
    cargas.slice().reverse().find((p) => p['campo'] === campo);
  const gatekeeper = ultima("gatekeeper");
  const diretriz = ultima("diretriz_estrategica");

  const snapshotChat = (detalhe.data?.execucao.snapshot_chat ?? {}) as Record<string, unknown>;
  const mensagemDaExecucao =
    typeof snapshotChat['mensagem_id'] === "string" ? snapshotChat['mensagem_id'] : null;
  const formatoDaExecucao = detalhe.data?.execucao.formato_solicitado ?? "hook";
  const etapaPsicologia = etapas.find((e) => e.papel === "analise_psicologica");

  // O avanço exige esta aba aberta: não há processo de fundo no servidor.
  useEffect(() => {
    if (!execucaoId || !estado || !ATIVOS.includes(estado)) return;
    if (avancando.current) return;
    avancando.current = true;
    const temporizador = window.setTimeout(async () => {
      try {
        await avancar.mutateAsync(execucaoId);
      } finally {
        avancando.current = false;
      }
    }, 400);
    return () => {
      window.clearTimeout(temporizador);
      avancando.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execucaoId, estado, etapas.filter((e) => e.estado === "concluida").length]);

  if (!execucaoId) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Execução do pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Nenhuma execução ainda neste chat. Escolha o formato e envie o briefing para gerar o
            pacote: os agentes rodam nos provedores em nuvem fixados no Registry e cada etapa só é
            chamada com o consentimento que você autorizar.
          </p>
        </CardContent>
      </Card>
    );
  }

  const incerta = etapas.find((e) => e.estado === "resultado_incerto");
  const bloqueadas = etapas.filter((e) => e.estado === "bloqueada");

  // As categorias vêm das etapas realmente bloqueadas; o servidor deriva provedor e finalidade.
  const permissoesPendentes = [
    ...new Set(
      bloqueadas
        .map((e) => e.categoria_requerida)
        .filter((c): c is string => Boolean(c && DETALHE_CATEGORIA[c])),
    ),
  ].flatMap((c) => DETALHE_CATEGORIA[c]!.map((d) => ({ categoria: c as never, ...d })));
  const encerrada = estado
    ? ["concluida", "parcialmente_concluida", "falhou", "cancelada"].includes(estado)
    : false;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          Execução do pipeline
          <Badge variant="outline" className="font-normal">
            {estado ? ROTULO_ESTADO_EXECUCAO[estado] : "—"}
          </Badge>
        </CardTitle>
        <div className="flex gap-2">
          {!encerrada && (
            <Button size="sm" variant="outline" onClick={() => cancelar.mutate(execucaoId)}>
              Cancelar
            </Button>
          )}
          {estado && ATIVOS.includes(estado) && (
            <Button size="sm" variant="ghost" onClick={() => avancar.mutate(execucaoId)}>
              Retomar
            </Button>
          )}
          {encerrada && mensagemDaExecucao && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmandoReexecucao(true)}
              disabled={reexecutar.isPending}
            >
              Executar novamente
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {confirmandoReexecucao && mensagemDaExecucao && (
          <Alert>
            <TriangleAlert aria-hidden />
            <AlertTitle>Executar novamente gera novo custo</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                Uma nova execução do mesmo briefing chama os provedores outra vez e é cobrada de
                novo. A execução anterior e seus resultados continuam salvos.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    reexecutar.mutate({
                      mensagemId: mensagemDaExecucao,
                      formato: formatoDaExecucao,
                    })
                  }
                  disabled={reexecutar.isPending}
                >
                  Confirmar e executar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmandoReexecucao(false)}
                  disabled={reexecutar.isPending}
                >
                  Cancelar
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {bloqueadas.length > 0 && (
          <Alert>
            <Lock aria-hidden />
            <AlertTitle>Etapas bloqueadas por falta de autorização</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
              Só as etapas que dependem da categoria recusada ficam paradas. Autorize em
              Privacidade para liberar — nada é enviado por conta própria.
              </p>
              <Button size="sm" variant="outline" onClick={() => setAutorizando(true)}>
                Ver o que seria enviado
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <ModalConsentimento
          aberto={autorizando}
          chatId={chatId}
          execucaoId={execucaoId}
          permissoes={permissoesPendentes}
          aoFechar={() => {
            setAutorizando(false);
          }}
          aoConceder={() => void invalidar()}
        />

        {incerta && (
          <Alert>
            <HelpCircle aria-hidden />
            <AlertTitle>Resultado externo incerto</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                A etapa {ROTULO_PAPEL[incerta.papel as PapelAgente] ?? incerta.papel} concluiu sem
                confirmação de persistência. Enquanto não for resolvida, os ramos que dependem dela
                ficam parados e nada é entregue a partir dela. Refazer pode gerar custo duplicado no
                provedor.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    resolver.mutate({ etapaId: incerta.id, desfecho: "sucesso_confirmado" })
                  }
                >
                  Confirmar sucesso
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    resolver.mutate({ etapaId: incerta.id, desfecho: "falha_confirmada" })
                  }
                >
                  Confirmar falha
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    resolver.mutate({ etapaId: incerta.id, desfecho: "refazer_manualmente" })
                  }
                >
                  Refazer manualmente (pode custar de novo)
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {estado === "parcialmente_concluida" && (
          <Alert>
            <TriangleAlert aria-hidden />
            <AlertTitle>Entrega parcial</AlertTitle>
            <AlertDescription>
              Parte das etapas não concluiu. O que foi produzido continua salvo e pode ser
              reexecutado numa nova execução.
            </AlertDescription>
          </Alert>
        )}

        {/* Diretriz sempre derivada dos resultados desta execução. Sem texto de exemplo. */}
        {estado === "aguardando_complemento" && (
          <ComplementoBriefing
            execucaoId={execucaoId}
            pergunta={String(
              gatekeeper?.['pergunta_de_refinamento'] ??
                "Faltam informações essenciais no briefing.",
            )}
            lacunas={
              Array.isArray(gatekeeper?.['lacunas'])
                ? (gatekeeper['lacunas'] as string[])
                : []
            }
            aoResponder={invalidar}
          />
        )}

        {gatekeeper?.['suficiente'] === true && (
          <div className="rounded-lg border-l-2 border-primary/60 bg-muted/40 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Diretriz estratégica
            </p>
            {diretriz ? (
              <>
                <p className="mt-0.5 text-sm">{String(diretriz['texto'] ?? "")}</p>
                <dl className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                  {(
                    [
                      ["Conflito inconsciente", diretriz['conflito_inconsciente']],
                      ["Medo central", diretriz['medo_central']],
                      ["Desejo central", diretriz['desejo_central']],
                      ["Objeção provável", diretriz['objecao_provavel']],
                    ] as const
                  )
                    .filter(([, v]) => typeof v === "string" && v)
                    .map(([rotulo, v]) => (
                      <div key={rotulo}>
                        <dt className="inline font-medium">{rotulo}: </dt>
                        <dd className="inline">{String(v)}</dd>
                      </div>
                    ))}
                </dl>
              </>
            ) : etapaPsicologia?.estado === "falhou" ||
              etapaPsicologia?.estado === "cancelada" ? (
              <p className="mt-0.5 text-sm text-muted-foreground">
                A análise psicológica desta execução não concluiu. Nenhuma diretriz foi produzida.
              </p>
            ) : etapaPsicologia?.estado === "bloqueada" ? (
              <p className="mt-0.5 text-sm text-muted-foreground">
                A análise psicológica está bloqueada até você autorizar o envio ao provedor.
              </p>
            ) : (
              <p className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Analisando o briefing desta execução…
              </p>
            )}
          </div>
        )}

        <ol className="space-y-1">
          {etapas.map((etapa, indice) => {
            const atual = etapa.estado as EstadoEtapa;
            const Icone = ICONES[atual] ?? Circle;
            const papel = etapa.papel as PapelAgente;
            return (
              <li key={etapa.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full border-2 bg-background",
                      CORES[atual],
                    )}
                  >
                    <Icone
                      className={cn("size-3", atual === "em_execucao" && "animate-spin")}
                      aria-hidden
                    />
                  </span>
                  {indice < etapas.length - 1 && (
                    <span className="my-0.5 w-px flex-1 bg-border" aria-hidden />
                  )}
                </div>
                <div className="pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{ROTULO_PAPEL[papel] ?? etapa.papel}</p>
                    <IndicadorProcessamento local={PAPEL_LOCAL[papel] ?? false} />
                  </div>
                  {etapa.ultimo_codigo_erro && (
                    <p className="text-xs text-muted-foreground">
                      {MENSAGEM_ERRO_ETAPA[etapa.ultimo_codigo_erro] ?? "Falha temporária nesta etapa."}
                      {etapa.proxima_tentativa_em ? " — nova tentativa agendada" : ""}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button size="sm" variant="ghost" className="px-0 text-xs">
              Ver detalhes técnicos
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <DetalhesTecnicos etapas={etapas} />
            <p className="mt-2 text-xs text-muted-foreground">
              O avanço acontece enquanto esta aba estiver aberta. Ao reabrir, a execução retoma do
              ponto em que parou.
            </p>
          </CollapsibleContent>
        </Collapsible>

        <CuradoriaExecucao resultados={resultados} />
      </CardContent>
    </Card>
  );
}
