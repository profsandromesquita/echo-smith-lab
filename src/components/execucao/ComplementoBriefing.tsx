import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { HelpCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertaDadosPessoais } from "@/components/privacy/AlertaDadosPessoais";
import { anonimizar, detectarPii, temBloqueio, type AchadoPii } from "@/lib/pii";
import { ROTULO_LACUNA, type LacunaBriefing } from "@/lib/agentes/gatekeeper";
import { responderComplemento } from "@/lib/execucao.functions";

/**
 * Card bloqueante do briefing insuficiente. A execução só volta a andar depois que
 * o usuário responde: nenhuma etapa seguinte é reservada enquanto isso.
 */
export function ComplementoBriefing({
  execucaoId,
  pergunta,
  lacunas,
  aoResponder,
}: {
  execucaoId: string;
  pergunta: string;
  lacunas: string[];
  aoResponder: () => void | Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const [achados, setAchados] = useState<AchadoPii[]>([]);
  const [alerta, setAlerta] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);

  const envio = useMutation({
    mutationFn: (valor: string) =>
      responderComplemento({ data: { execucaoId, texto: valor } }),
    onSuccess: async () => {
      setTexto("");
      setAchados([]);
      setAlerta(false);
      await aoResponder();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enviar = () => {
    const valor = texto.trim();
    if (!valor || envio.isPending) return;
    // Verificação de dados pessoais roda no dispositivo, antes de qualquer envio.
    const encontrados = detectarPii(valor);
    if (encontrados.length > 0) {
      setAchados(encontrados);
      setAlerta(true);
      return;
    }
    envio.mutate(valor);
  };

  const rotulos = lacunas
    .map((l) => ROTULO_LACUNA[l as LacunaBriefing] ?? l)
    .filter(Boolean);

  return (
    <>
      <Alert>
        <HelpCircle aria-hidden />
        <AlertTitle>Aguardando complemento do briefing</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>{pergunta}</p>
          {rotulos.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Faltam informações sobre: {rotulos.join(", ")}.
            </p>
          )}
          <Textarea
            ref={campo}
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={8000}
            aria-label="Complemento do briefing"
            placeholder="Responda à pergunta acima para liberar o restante do pipeline."
          />
          <p className="text-xs text-muted-foreground">
            Enviar o complemento reavalia o briefing e gera uma nova chamada ao provedor,
            com novo custo. Nenhuma etapa seguinte roda até lá.
          </p>
          <Button
            size="sm"
            onClick={enviar}
            disabled={envio.isPending || texto.trim().length === 0}
          >
            {envio.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Enviar complemento
          </Button>
        </AlertDescription>
      </Alert>

      <AlertaDadosPessoais
        aberto={alerta}
        achados={achados}
        bloquear={temBloqueio(achados)}
        aoCancelar={() => setAlerta(false)}
        aoEditar={() => {
          setAlerta(false);
          campo.current?.focus();
        }}
        aoAnonimizar={() => {
          setTexto((t) => anonimizar(t, detectarPii(t)));
          setAchados([]);
          setAlerta(false);
          campo.current?.focus();
        }}
        aoIgnorar={() => envio.mutate(texto.trim())}
      />
    </>
  );
}