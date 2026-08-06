import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { chavesFeedback, AVISO_LOCAL } from "@/lib/feedback";
import { limparFeedbackLocal, listarTudoLocal } from "@/lib/feedback-local";

const ROTULO: Record<string, string> = {
  feedback: "Sinais de gostei / não gostei",
  edicao: "Edições suas",
  referencia: "Exemplos usados como referência",
};

/** Registros de captura guardados no navegador (modo memória local estrita). */
export function MemoriaLocalEstilo() {
  const qc = useQueryClient();
  const registros = useQuery({
    queryKey: chavesFeedback.local,
    queryFn: () => listarTudoLocal(),
  });

  const limpar = useMutation({
    mutationFn: () => limparFeedbackLocal(),
    onSuccess: (n) => {
      void qc.invalidateQueries({ queryKey: chavesFeedback.raiz });
      toast.success(`${n} registro(s) apagados deste dispositivo.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const linhas = registros.data ?? [];
  const contar = (tipo: string) => linhas.filter((l) => l.tipo === tipo).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Memória de estilo neste dispositivo</CardTitle>
        <p className="text-xs text-muted-foreground">{AVISO_LOCAL}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {Object.keys(ROTULO).map((tipo) => (
          <div key={tipo} className="flex items-center justify-between gap-2 rounded-md border p-2.5">
            <p className="text-sm">{ROTULO[tipo]}</p>
            <span className="font-mono text-sm">{contar(tipo)}</span>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          disabled={linhas.length === 0 || limpar.isPending}
          onClick={() => limpar.mutate()}
        >
          Apagar memória deste dispositivo
        </Button>
      </CardContent>
    </Card>
  );
}