import { Button } from "@/components/ui/button";
import type { CapturaFeedback } from "@/hooks/useCapturaFeedback";

/**
 * No modo híbrido autorizado nada é gravado antes de uma autorização explícita.
 * Sem consentimento os controles de captura ficam desligados.
 */
export function AutorizacaoFeedback({ captura }: { captura: CapturaFeedback }) {
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="text-sm">Guardar seu feedback na sua conta?</p>
      <p className="text-xs text-muted-foreground">
        Precisamos da sua autorização para salvar o que você gostou, o que não gostou, suas edições
        e os exemplos de referência. Esses dados ficam só na sua conta e não são enviados a
        provedores de IA nesta etapa. Sem autorização, os controles seguem desligados.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={captura.autorizar.isPending} onClick={() => captura.autorizar.mutate("concedido")}>
          Autorizar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={captura.autorizar.isPending}
          onClick={() => captura.autorizar.mutate("recusado")}
        >
          Agora não
        </Button>
      </div>
    </div>
  );
}
