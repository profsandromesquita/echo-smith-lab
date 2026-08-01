import { FileText, PenLine, Send, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function Composer() {
  return (
    <div className="rounded-lg border bg-card p-3">
      <ToggleGroup type="single" defaultValue="texto" variant="outline" size="sm" className="mb-2">
        <ToggleGroupItem value="texto" aria-label="Texto corrido">
          <Type className="size-4" aria-hidden />
          Texto
        </ToggleGroupItem>
        <ToggleGroupItem value="rascunho" aria-label="Rascunho">
          <PenLine className="size-4" aria-hidden />
          Rascunho
        </ToggleGroupItem>
        <ToggleGroupItem value="estruturado" aria-label="Briefing estruturado">
          <FileText className="size-4" aria-hidden />
          Briefing estruturado
        </ToggleGroupItem>
      </ToggleGroup>

      <Textarea
        rows={3}
        placeholder="Descreva o tema, o público e a promessa. Quanto mais concreta a dor, melhor o pacote."
        className="resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Nomes e dados identificáveis são verificados no seu dispositivo antes de qualquer envio.
        </p>
        <Button size="sm">
          <Send className="size-4" aria-hidden />
          Gerar pacote
        </Button>
      </div>
    </div>
  );
}