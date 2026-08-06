import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Thread, type MensagemChat } from "@/components/chat/Thread";
import { Composer } from "@/components/chat/Composer";
import { AreaResultados } from "@/components/chat/AreaResultados";
import { ResumoContexto } from "@/components/chat/ResumoContexto";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDemo, type EstadoDemo } from "@/lib/demo-state";
import { ROTULO_FORMATO, type FormatoSaida } from "@/lib/fixtures";
import { opcoesExecucaoAtiva, ROTULO_ESTADO_EXECUCAO, type EstadoExecucao } from "@/lib/execucao";

export type FormatoExecucao = FormatoSaida | "pacote_completo";

const FORMATOS: Array<{ valor: FormatoExecucao; rotulo: string }> = [
  ...(Object.keys(ROTULO_FORMATO) as FormatoSaida[]).map((f) => ({
    valor: f as FormatoExecucao,
    rotulo: ROTULO_FORMATO[f],
  })),
  { valor: "pacote_completo", rotulo: "Pacote completo" },
];

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
  onEnviar: (texto: string, formato: FormatoExecucao) => void | Promise<void>;
  enviando?: boolean;
  carregando?: boolean;
}) {
  const { estado, offline } = useDemo();
  // Estado honesto: quando existe execução real neste chat, o rótulo vem dela.
  const ativa = useQuery({
    ...opcoesExecucaoAtiva(chatId ?? ""),
    enabled: Boolean(chatId),
  });
  const estadoReal = ativa.data?.estado as EstadoExecucao | undefined;
  const status = offline
    ? "Sem conexão"
    : estadoReal
      ? ROTULO_ESTADO_EXECUCAO[estadoReal]
      : STATUS_PRINCIPAL[estado];
  const [formato, setFormato] = useState<FormatoExecucao>("hook");

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
        <div className="mt-2 flex items-center gap-2">
          <Select value={formato} onValueChange={(v) => setFormato(v as FormatoExecucao)}>
            <SelectTrigger className="h-8 w-56 text-xs" aria-label="Formato do pacote">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMATOS.map((f) => (
                <SelectItem key={f.valor} value={f.valor}>
                  {f.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Enviar o briefing inicia a execução real nos provedores autorizados.
          </p>
        </div>
      </div>

      {carregando ? (
        <div className="space-y-2" aria-busy>
          <Skeleton className="h-14 w-2/3" />
          <Skeleton className="ml-auto h-14 w-1/2" />
        </div>
      ) : (
        <Thread mensagens={mensagens} />
      )}
      <Composer onEnviar={(texto) => onEnviar(texto, formato)} enviando={enviando} />
      <AreaResultados chatId={chatId} />
    </div>
  );
}