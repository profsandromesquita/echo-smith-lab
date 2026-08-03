import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ROTULO_PII, type AchadoPii } from "@/lib/pii";

interface Props {
  aberto: boolean;
  achados: AchadoPii[];
  bloquear: boolean;
  aoCancelar: () => void;
  aoEditar: () => void;
  aoAnonimizar: () => void;
  aoIgnorar: () => void;
}

/**
 * Alerta de dados pessoais. A análise acontece no dispositivo: nenhum trecho
 * detectado é enviado ao backend, nem quando o usuário decide prosseguir.
 */
export function AlertaDadosPessoais({
  aberto,
  achados,
  bloquear,
  aoCancelar,
  aoEditar,
  aoAnonimizar,
  aoIgnorar,
}: Props) {
  const [ciente, setCiente] = useState(false);
  const altas = achados.filter((a) => a.confianca === "alta").length;

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v) {
          setCiente(false);
          aoCancelar();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-destructive" aria-hidden />
            Dados pessoais no briefing
          </DialogTitle>
          <DialogDescription>
            A verificação roda no seu dispositivo. Nada foi enviado. {altas > 0
              ? `${altas} ocorrência(s) de alta confiança.`
              : "Somente indícios de confiança média."}
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-56 space-y-1.5 overflow-y-auto text-sm">
          {achados.map((a, i) => (
            <li
              key={`${a.tipo}-${a.inicio}-${i}`}
              className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5"
            >
              <span className="truncate font-mono text-xs">{a.trecho}</span>
              <Badge
                variant="outline"
                className={
                  a.confianca === "alta"
                    ? "shrink-0 border-destructive/50 font-normal text-destructive"
                    : "shrink-0 font-normal text-muted-foreground"
                }
              >
                {ROTULO_PII[a.tipo]}
              </Badge>
            </li>
          ))}
        </ul>

        <div className="flex items-start gap-2 rounded-md bg-muted p-2.5">
          <Checkbox
            id="ciente-pii"
            checked={ciente}
            onCheckedChange={(v) => setCiente(v === true)}
            className="mt-0.5"
          />
          <Label htmlFor="ciente-pii" className="text-xs font-normal leading-relaxed">
            Estou ciente e quero prosseguir mesmo assim. A decisão fica registrada; o trecho
            detectado, nunca.
          </Label>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={aoCancelar}>
            Cancelar
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={aoEditar}>
              Revisar texto
            </Button>
            <Button variant="outline" size="sm" onClick={aoAnonimizar}>
              Anonimizar
            </Button>
            <Button
              size="sm"
              disabled={bloquear || !ciente}
              onClick={() => {
                setCiente(false);
                aoIgnorar();
              }}
            >
              Prosseguir
            </Button>
          </div>
        </DialogFooter>

        {bloquear && (
          <p className="text-xs text-destructive">
            Sua configuração bloqueia o envio enquanto houver dados pessoais de alta confiança.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}