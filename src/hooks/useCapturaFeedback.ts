import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adaptadorDoModo } from "@/lib/feedback-adaptador";
import {
  MAPA_VAZIO,
  chavesFeedback,
  type EntradaEdicao,
  type EntradaFeedback,
  type EntradaReferencia,
} from "@/lib/feedback";
import { autorizacaoFeedback, decidirAutorizacaoFeedback } from "@/lib/feedback.functions";
import { opcoesModo } from "@/lib/privacidade";

/**
 * Estado e ações da captura de feedback de uma execução.
 * A escolha entre dispositivo e conta vem só do modo de privacidade ativo.
 */
export function useCapturaFeedback(execucaoId: string | null, chatId: string) {
  const qc = useQueryClient();
  const consultaModo = useQuery(opcoesModo(chatId));
  const modo = consultaModo.data?.modo ?? "local_estrita";
  const local = modo === "local_estrita";
  const adaptador = adaptadorDoModo(modo);

  const autorizacao = useQuery({
    queryKey: chavesFeedback.autorizacao,
    queryFn: () => autorizacaoFeedback(),
    enabled: !local,
  });

  const registros = useQuery({
    queryKey: chavesFeedback.execucao(modo, execucaoId ?? "sem-execucao"),
    queryFn: () => adaptador.listar(execucaoId as string),
    enabled: Boolean(execucaoId) && (local || autorizacao.data?.autorizado === true),
  });

  const mapa = registros.data ?? MAPA_VAZIO;

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: chavesFeedback.raiz });
  };

  const acao = <T,>(fn: (v: T) => Promise<unknown>, sucesso: string) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => {
        invalidar();
        toast.success(sucesso);
      },
      onError: (e: Error) => toast.error(e.message),
    });

  const salvarFeedback = acao<EntradaFeedback>(
    (v) => adaptador.registrarFeedback(v),
    local ? "Registrado neste dispositivo." : "Registrado na sua conta.",
  );
  const apagarFeedback = acao<{ itemId: string }>(
    (v) => adaptador.removerFeedback(execucaoId as string, v.itemId),
    "Feedback removido.",
  );
  const salvarEdicao = acao<EntradaEdicao>(
    (v) => adaptador.registrarEdicao(v),
    "Edição salva. O texto original foi preservado.",
  );
  const apagarEdicao = acao<{ itemId: string }>(
    (v) => adaptador.removerEdicao(execucaoId as string, v.itemId),
    "Edição removida.",
  );
  const salvarReferencia = acao<EntradaReferencia>(
    (v) => adaptador.usarComoReferencia(v),
    local ? "Referência guardada neste dispositivo." : "Exemplo de referência criado.",
  );
  const apagarReferencia = acao<{ itemId: string }>(
    (v) => adaptador.removerReferencia(execucaoId as string, v.itemId),
    "Referência removida.",
  );

  const autorizar = useMutation({
    mutationFn: (decisao: "concedido" | "recusado") =>
      decidirAutorizacaoFeedback({ data: { decisao } }),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    modo,
    local,
    mapa,
    carregando: registros.isLoading,
    precisaAutorizar: !local && autorizacao.data?.autorizado === false,
    autorizar,
    salvarFeedback,
    apagarFeedback,
    salvarEdicao,
    apagarEdicao,
    salvarReferencia,
    apagarReferencia,
  };
}

export type CapturaFeedback = ReturnType<typeof useCapturaFeedback>;