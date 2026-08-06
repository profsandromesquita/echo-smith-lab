import { useState } from "react";
import { Copy, Pencil, Star, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import type { CapturaFeedback } from "@/hooks/useCapturaFeedback";
import { MOTIVOS_NEGATIVOS, ROTULO_MOTIVO, type MotivoNegativo } from "@/lib/feedback";
import { cn } from "@/lib/utils";

interface Props {
  captura: CapturaFeedback;
  execucaoId: string;
  itemId: string;
  resultadoId: string | null;
  perfilMarcaId: string | null;
  perfilNome: string | null;
  formato: string;
  papel: string;
  texto: string;
}

/** Controles de captura de um item entregue: gostei, não gostei, editar e referência. */
export function AcoesFeedback({
  captura,
  execucaoId,
  itemId,
  resultadoId,
  perfilMarcaId,
  perfilNome,
  formato,
  papel,
  texto,
}: Props) {
  const registro = captura.mapa.feedback[itemId];
  const edicao = captura.mapa.edicoes[itemId];
  const referencia = captura.mapa.referencias[itemId];

  const [motivos, setMotivos] = useState<MotivoNegativo[]>(
    (registro?.motivos ?? []).filter((m): m is MotivoNegativo =>
      (MOTIVOS_NEGATIVOS as readonly string[]).includes(m),
    ),
  );
  const [comentario, setComentario] = useState(registro?.comentario ?? "");
  const [abertoNegativo, setAbertoNegativo] = useState(false);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(edicao?.textoEditado ?? texto);

  const base = {
    execucaoId,
    itemId,
    resultadoId,
    perfilMarcaId,
    formato,
    papel,
  };

  const bloqueado = captura.precisaAutorizar;

  const enviarPositivo = () => {
    if (registro?.sinal === "positivo") {
      captura.apagarFeedback.mutate({ itemId });
      return;
    }
    captura.salvarFeedback.mutate({ ...base, sinal: "positivo", motivos: [], comentario: "" });
  };

  const enviarNegativo = () => {
    captura.salvarFeedback.mutate({
      ...base,
      sinal: "negativo",
      motivos,
      comentario: comentario.trim(),
    });
    setAbertoNegativo(false);
  };

  const salvarEdicao = () => {
    const limpo = rascunho.trim();
    if (!limpo) return toast.error("O texto editado não pode ficar vazio.");
    captura.salvarEdicao.mutate({
      execucaoId,
      itemId,
      resultadoId,
      perfilMarcaId,
      textoOriginal: texto,
      textoEditado: limpo,
    });
    setEditando(false);
  };

  const usarReferencia = () => {
    if (referencia) {
      captura.apagarReferencia.mutate({ itemId });
      return;
    }
    if (!perfilMarcaId)
      return toast.error(
        "Selecione ou crie uma voz de marca antes de guardar um exemplo de referência.",
      );
    captura.salvarReferencia.mutate({
      execucaoId,
      itemId,
      resultadoId,
      perfilMarcaId,
      titulo: "",
      texto: edicao?.textoEditado ?? texto,
    });
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => navigator.clipboard?.writeText(edicao?.textoEditado ?? texto)}
        >
          <Copy className="size-3.5" aria-hidden />
          Copiar
        </Button>

        <Button
          size="sm"
          variant="ghost"
          disabled={bloqueado}
          className={cn("h-7 px-2 text-xs", registro?.sinal === "positivo" && "text-success")}
          onClick={enviarPositivo}
          aria-pressed={registro?.sinal === "positivo"}
        >
          <ThumbsUp className="size-3.5" aria-hidden />
          Gostei
        </Button>

        <Popover open={abertoNegativo} onOpenChange={setAbertoNegativo}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              disabled={bloqueado}
              className={cn(
                "h-7 px-2 text-xs",
                registro?.sinal === "negativo" && "text-destructive",
              )}
              aria-pressed={registro?.sinal === "negativo"}
            >
              <ThumbsDown className="size-3.5" aria-hidden />
              Não gostei
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-3">
            <p className="text-xs text-muted-foreground">
              O que não funcionou? Selecione os motivos que se aplicam.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {MOTIVOS_NEGATIVOS.map((m) => (
                <label key={m} className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={motivos.includes(m)}
                    onCheckedChange={(v) =>
                      setMotivos((atual) =>
                        v ? [...atual, m] : atual.filter((x) => x !== m),
                      )
                    }
                  />
                  {ROTULO_MOTIVO[m]}
                </label>
              ))}
            </div>
            <div className="space-y-1">
              <Label htmlFor={`c-${itemId}`} className="text-xs">
                Comentário (opcional)
              </Label>
              <Textarea
                id={`c-${itemId}`}
                rows={3}
                maxLength={1000}
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Explique em uma frase o que faltou."
              />
            </div>
            <Button size="sm" className="w-full" onClick={enviarNegativo}>
              Registrar
            </Button>
          </PopoverContent>
        </Popover>

        <Button
          size="sm"
          variant="ghost"
          disabled={bloqueado}
          className={cn("h-7 px-2 text-xs", edicao && "text-primary")}
          onClick={() => {
            setRascunho(edicao?.textoEditado ?? texto);
            setEditando((v) => !v);
          }}
        >
          <Pencil className="size-3.5" aria-hidden />
          Editar
        </Button>

        <Button
          size="sm"
          variant="ghost"
          disabled={bloqueado}
          className={cn("h-7 px-2 text-xs", referencia && "text-success")}
          onClick={usarReferencia}
        >
          <Star className="size-3.5" aria-hidden />
          {referencia ? "Referência guardada" : "Usar como referência"}
        </Button>

        {registro && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => captura.apagarFeedback.mutate({ itemId })}
          >
            <Trash2 className="size-3.5" aria-hidden />
            Remover feedback
          </Button>
        )}
      </div>

      {registro && (
        <p className="text-xs text-muted-foreground">
          {registro.sinal === "positivo" ? "Você gostou deste item." : "Você não gostou deste item."}
          {registro.motivos.length > 0 &&
            ` Motivos: ${registro.motivos
              .map((m) => ROTULO_MOTIVO[m as MotivoNegativo] ?? m)
              .join(", ")}.`}
          {registro.comentario && ` “${registro.comentario}”`}
        </p>
      )}

      {referencia && perfilNome && (
        <Badge variant="outline" className="font-normal">
          Exemplo de referência de {perfilNome}
        </Badge>
      )}

      {editando && (
        <div className="space-y-2 rounded-md border p-2">
          <p className="text-xs text-muted-foreground">
            Texto original preservado: “{texto}”
          </p>
          <Textarea
            rows={3}
            maxLength={4000}
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={salvarEdicao}>
              Salvar edição
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
            {edicao && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => {
                  captura.apagarEdicao.mutate({ itemId });
                  setEditando(false);
                }}
              >
                Descartar edição
              </Button>
            )}
          </div>
        </div>
      )}

      {edicao && !editando && (
        <p className="text-xs text-muted-foreground">
          Sua versão editada: “{edicao.textoEditado}”
        </p>
      )}
    </div>
  );
}