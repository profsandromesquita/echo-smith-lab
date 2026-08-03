import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao: string;
  impacto?: ReactNode;
  /** Quando definido, exige digitação exata antes de liberar a confirmação. */
  confirmacao?: string;
  rotuloConfirmar?: string;
  executando?: boolean;
  aoConfirmar: () => void | Promise<void>;
}

/** Diálogo único para toda ação destrutiva: impacto explícito e confirmação proporcional. */
export function DialogoDestrutivo({
  aberto,
  aoFechar,
  titulo,
  descricao,
  impacto,
  confirmacao,
  rotuloConfirmar = "Excluir",
  executando = false,
  aoConfirmar,
}: Props) {
  const [texto, setTexto] = useState("");
  const liberado = !confirmacao || texto.trim() === confirmacao;

  const fechar = () => {
    setTexto("");
    aoFechar();
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>

        {impacto && <div className="rounded-md border bg-muted/50 p-3 text-sm">{impacto}</div>}

        {confirmacao && (
          <div className="space-y-1.5">
            <Label htmlFor="confirmacao-destrutiva" className="text-xs">
              Digite <span className="font-mono font-medium">{confirmacao}</span> para confirmar
            </Label>
            <Input
              id="confirmacao-destrutiva"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              autoComplete="off"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={fechar}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={!liberado || executando}
            onClick={() => void aoConfirmar()}
          >
            {rotuloConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}