import { useState } from "react";
import { FileText, Loader2, PenLine, Send, ShieldCheck, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const AVISO_PRIVACIDADE =
  "Nomes e dados identificáveis são verificados no seu dispositivo antes de qualquer envio.";

export function Composer({
  onEnviar,
  enviando = false,
}: {
  onEnviar: (texto: string) => void | Promise<void>;
  enviando?: boolean;
}) {
  const [texto, setTexto] = useState("");

  const enviar = () => {
    const valor = texto.trim();
    if (!valor || enviando) return;
    setTexto("");
    void onEnviar(valor);
  };

  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <Textarea
        rows={2}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            enviar();
          }
        }}
        maxLength={8000}
        aria-label="Briefing"
        placeholder="Descreva o tema, o público e a promessa. Quanto mais concreta a dor, melhor o pacote."
        className="min-h-0 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
      />

      <div className="mt-2 flex items-center gap-2">
        <ToggleGroup
          type="single"
          defaultValue="texto"
          variant="outline"
          size="sm"
          className="h-7"
        >
          <ToggleGroupItem value="texto" aria-label="Texto corrido" className="h-7 px-2">
            <Type className="size-3.5" aria-hidden />
            <span className="hidden text-xs sm:inline">Texto</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="rascunho" aria-label="Rascunho" className="h-7 px-2">
            <PenLine className="size-3.5" aria-hidden />
            <span className="hidden text-xs sm:inline">Rascunho</span>
          </ToggleGroupItem>
          <ToggleGroupItem
            value="estruturado"
            aria-label="Briefing estruturado"
            className="h-7 px-2"
          >
            <FileText className="size-3.5" aria-hidden />
            <span className="hidden text-xs sm:inline">Briefing</span>
          </ToggleGroupItem>
        </ToggleGroup>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7 text-muted-foreground"
                aria-label={AVISO_PRIVACIDADE}
              >
                <ShieldCheck className="size-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{AVISO_PRIVACIDADE}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Button
          size="sm"
          className="ml-auto h-8"
          onClick={enviar}
          disabled={enviando || texto.trim().length === 0}
        >
          {enviando ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          Gerar pacote
        </Button>
      </div>
    </div>
  );
}