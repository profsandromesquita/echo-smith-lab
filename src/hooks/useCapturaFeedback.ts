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

  const ok = (msg: string) => () => {
    invalidar();
    toast.success(msg);
  };
  const falha = (e: Error) => toast.error(e.message);

  const salvarFeedback = useMutation({
    mutationFn: (v: EntradaFeedback) => adaptador.registrarFeedback(v),
    onSuccess: ok(local ? "Registrado neste dispositivo." : "Registrado na sua conta."),
    onError: falha,
  });
  const apagarFeedback = useMutation({
    mutationFn: (v: { itemId: string }) =>
      adaptador.removerFeedback(execucaoId as string, v.itemId),
    onSuccess: ok("Feedback removido."),
    onError: falha,
  });
  const salvarEdicao = useMutation({
    mutationFn: (v: EntradaEdicao) => adaptador.registrarEdicao(v),
    onSuccess: ok("Edição salva. O texto original foi preservado."),
    onError: falha,
  });
  const apagarEdicao = useMutation({
    mutationFn: (v: { itemId: string }) => adaptador.removerEdicao(execucaoId as string, v.itemId),
    onSuccess: ok("Edição removida."),
    onError: falha,
  });
  const salvarReferencia = useMutation({
    mutationFn: (v: EntradaReferencia) => adaptador.usarComoReferencia(v),
    onSuccess: ok(
      local ? "Referência guardada neste dispositivo." : "Exemplo de referência criado.",
    ),
    onError: falha,
  });
  const apagarReferencia = useMutation({
    mutationFn: (v: { itemId: string }) =>
      adaptador.removerReferencia(execucaoId as string, v.itemId),
    onSuccess: ok("Referência removida."),
    onError: falha,
  });

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