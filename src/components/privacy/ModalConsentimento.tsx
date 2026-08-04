import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  autorizarExecucao,
  decidirConsentimento,
  montarFotografiaSimulada,
} from "@/lib/consentimento.functions";
import { chavesPrivacidade, ROTULO_CATEGORIA, type ModoPrivacidade } from "@/lib/privacidade";

export interface PermissaoSolicitada {
  categoria:
    | "briefing"
    | "resumo_voz_marca"
    | "texto_gerado"
    | "metadados"
    | "variacoes_para_auditoria"
    | "feedback_para_correcao"
    | "resumo_voz_marca_explicita";
  provedor: string;
  etapa: string;
  finalidade: string;
}

/**
 * Em memória local estrita só a memória privada do dispositivo fica indisponível.
 * Processamento em nuvem continua autorizável de forma explícita, execução a execução.
 */
const BLOQUEADAS_EM_LOCAL_ESTRITA = [
  "memoria_local_estilo",
  "exemplos_locais",
  "preferencias_inferidas",
  "resumo_voz_marca",
];

export const PERMISSOES_PADRAO: PermissaoSolicitada[] = [
  {
    categoria: "briefing",
    provedor: "Provedor de nuvem A",
    etapa: "Gatekeeper e análise psicológica",
    finalidade: "Interpretar o briefing e definir a diretriz estratégica",
  },
  {
    categoria: "resumo_voz_marca",
    provedor: "Provedor de nuvem B",
    etapa: "Especialistas",
    finalidade: "Adequar as variações ao posicionamento da marca",
  },
  {
    categoria: "texto_gerado",
    provedor: "Provedor de nuvem A",
    etapa: "Auditoria",
    finalidade: "Auditar qualidade e conformidade das variações",
  },
  {
    categoria: "variacoes_para_auditoria",
    provedor: "Provedor de nuvem A (OpenAI)",
    etapa: "Auditoria",
    finalidade:
      "Enviar ao provedor de nuvem A as variações escritas pelo provedor de nuvem B (Anthropic) para avaliação de qualidade e conformidade",
  },
  {
    categoria: "feedback_para_correcao",
    provedor: "Provedor de nuvem B (Anthropic)",
    etapa: "Correção única",
    finalidade:
      "Enviar ao provedor de nuvem B as observações da auditoria feita pelo provedor de nuvem A, junto do texto reprovado, para uma única correção",
  },
];

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  chatId?: string | null;
  /** Quando presente, "Apenas esta execução" grava na fotografia desta execução. */
  execucaoId?: string | null;
  modo?: ModoPrivacidade;
  permissoes?: PermissaoSolicitada[];
  /** Chamado só quando a autorização é efetivamente concedida. */
  aoConceder?: () => void;
}

export function ModalConsentimento({
  aberto,
  aoFechar,
  chatId = null,
  execucaoId = null,
  modo = "local_estrita",
  permissoes = PERMISSOES_PADRAO,
  aoConceder,
}: Props) {
  const cliente = useQueryClient();
  const [ocupado, setOcupado] = useState(false);

  const disponiveis = permissoes.filter(
    (p) => modo === "hibrido_autorizado" || !BLOQUEADAS_EM_LOCAL_ESTRITA.includes(p.categoria),
  );
  const indisponiveis = permissoes.filter((p) => !disponiveis.includes(p));

  const invalidar = () =>
    cliente.invalidateQueries({ queryKey: chavesPrivacidade.consentimentos });

  const persistir = useMutation({
    mutationFn: async (escopo: "conta" | "chat") => {
      for (const p of disponiveis) {
        await decidirConsentimento({
          data: {
            escopo,
            escopoId: escopo === "chat" ? chatId : null,
            categoria: p.categoria,
            provedor: p.provedor,
            etapa: p.etapa,
            finalidade: p.finalidade,
            decisao: "concedido",
            origem: "modal",
          },
        });
      }
    },
    onSuccess: async () => {
      await invalidar();
      toast.success("Autorização registrada. Pode ser revogada em Privacidade.");
      aoConceder?.();
      aoFechar();
    },
    onError: () => toast.error("Não foi possível registrar essa autorização."),
  });

  const recusar = useMutation({
    mutationFn: async () => {
      for (const p of disponiveis) {
        await decidirConsentimento({
          data: {
            escopo: chatId ? "chat" : "conta",
            escopoId: chatId,
            categoria: p.categoria,
            provedor: p.provedor,
            etapa: p.etapa,
            finalidade: p.finalidade,
            decisao: "recusado",
            origem: "modal",
          },
        });
      }
    },
    onSuccess: async () => {
      await invalidar();
      toast.message("Recusa registrada. Nada será enviado.");
      aoFechar();
    },
    onError: () => toast.error("Não foi possível registrar a recusa."),
  });

  const apenasEstaExecucao = async () => {
    setOcupado(true);
    try {
      if (execucaoId) {
        // O cliente envia só a execução e as categorias; o servidor deriva o resto.
        const r = await autorizarExecucao({
          data: {
            execucaoId,
            categorias: [...new Set(disponiveis.map((p) => p.categoria))],
          },
        });
        await invalidar();
        toast.success("Autorização válida só para esta execução.", {
          description: `${r.desbloqueadas} etapa(s) liberada(s). Nada fica autorizado para execuções futuras.`,
        });
        aoConceder?.();
        aoFechar();
        return;
      }
      const r = await montarFotografiaSimulada({
        data: {
          permissoes: disponiveis.map((p) => ({ ...p, decisao: "concedido" as const })),
        },
      });
      toast.message("Autorização válida só para esta execução.", {
        description: `${r.itens.length} permissão(ões) autorizadas. O registro definitivo será gravado junto da execução real.`,
      });
      aoFechar();
    } catch {
      toast.error("Não foi possível preparar essa autorização.");
    } finally {
      setOcupado(false);
    }
  };

  const trabalhando = ocupado || persistir.isPending || recusar.isPending;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Autorizar envio para a nuvem</DialogTitle>
          <DialogDescription>
            Nada é enviado sem autorização explícita. Não existe envio automático nem fallback
            silencioso para a nuvem.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 space-y-2 overflow-y-auto text-sm">
          {disponiveis.map((p) => (
            <div key={`${p.categoria}-${p.etapa}`} className="rounded-md border p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{ROTULO_CATEGORIA[p.categoria]}</span>
                <Badge variant="outline" className="border-cloud/50 font-normal text-cloud">
                  {p.provedor}
                </Badge>
                <span className="text-xs text-muted-foreground">{p.etapa}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{p.finalidade}</p>
            </div>
          ))}

          {indisponiveis.length > 0 && (
            <div className="rounded-md border border-dashed p-2.5">
              <p className="text-xs font-medium">Indisponível em memória local estrita</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {indisponiveis.map((p) => ROTULO_CATEGORIA[p.categoria]).join(", ")} só podem ser
                autorizados no modo híbrido autorizado. Troque o modo do chat se quiser liberar.
              </p>
            </div>
          )}

          <Separator />
          <p className="text-xs text-muted-foreground">
            Recusar mantém tudo no dispositivo: as etapas em nuvem não rodam e o pacote não é
            gerado. Toda autorização fica registrada com data, escopo e versão dos termos, e pode
            ser revogada em Privacidade.
          </p>
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={aoFechar} disabled={trabalhando}>
              Cancelar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => recusar.mutate()}
              disabled={trabalhando || disponiveis.length === 0}
            >
              Recusar
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void apenasEstaExecucao()}
              disabled={trabalhando || disponiveis.length === 0}
            >
              Apenas esta execução
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => persistir.mutate("chat")}
              disabled={trabalhando || !chatId || disponiveis.length === 0}
            >
              Este chat
            </Button>
            <Button
              size="sm"
              onClick={() => persistir.mutate("conta")}
              disabled={trabalhando || disponiveis.length === 0}
            >
              Toda a conta
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}