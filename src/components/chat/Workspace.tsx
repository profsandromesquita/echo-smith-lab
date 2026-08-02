import { Thread, type MensagemChat } from "@/components/chat/Thread";
import { Composer } from "@/components/chat/Composer";
import { AreaResultados } from "@/components/chat/AreaResultados";
import { ResumoContexto } from "@/components/chat/ResumoContexto";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDemo, type EstadoDemo } from "@/lib/demo-state";

const STATUS_PRINCIPAL: Record<EstadoDemo, string> = {
  vazio: "Aguardando briefing",
  briefing_insuficiente: "Aguardando você",
  executando: "Executando",
  adaptacao_local: "Adaptação local",
  preservacao_reprovada: "Preservação reprovada",
  parcial: "Entrega parcial",
  cancelado: "Cancelado",
  erro_provedor: "Erro de provedor",
  consentimento_pendente: "Aguardando autorização",
  resultado_incerto: "Resultado incerto",
  entregue: "Entregue",
};

export function Workspace({
  titulo,
  chatId = null,
  mensagens,
  onEnviar,
  enviando = false,
  carregando = false,
}: {
  titulo: string;
  /** Chat atual. Sem valor, a voz de marca resolvida é a padrão da conta. */
  chatId?: string | null;
  mensagens: MensagemChat[];
  onEnviar: (texto: string) => void | Promise<void>;
  enviando?: boolean;
  carregando?: boolean;
}) {
  const { estado, offline } = useDemo();
  const status = offline ? "Sem conexão" : STATUS_PRINCIPAL[estado];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-xl">{titulo}</h1>
          <Badge variant="outline" className="font-normal">
            {status}
          </Badge>
        </div>
        <ResumoContexto chatId={chatId} />
      </div>

      {carregando ? (
        <div className="space-y-2" aria-busy>
          <Skeleton className="h-14 w-2/3" />
          <Skeleton className="ml-auto h-14 w-1/2" />
        </div>
      ) : (
        <Thread mensagens={mensagens} />
      )}
      <Composer onEnviar={onEnviar} enviando={enviando} />
      <AreaResultados />
    </div>
  );
}