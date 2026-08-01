import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

interface Props {
  aberto: boolean;
  aoFechar: () => void;
}

export function ModalConsentimento({ aberto, aoFechar }: Props) {
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Autorizar envio para a nuvem</DialogTitle>
          <DialogDescription>
            O processamento local não está disponível agora. Nada será enviado sem a sua
            autorização explícita.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium">Quais dados</p>
            <p className="text-muted-foreground">
              Briefing anonimizado e resumo derivado da voz de marca. Exemplos pessoais e
              preferências inferidas permanecem no seu dispositivo.
            </p>
          </div>
          <Separator />
          <div>
            <p className="font-medium">Quais etapas</p>
            <p className="text-muted-foreground">
              Gatekeeper, análise psicológica, especialistas e auditoria.
            </p>
          </div>
          <Separator />
          <div>
            <p className="font-medium">Quais provedores</p>
            <p className="text-muted-foreground">
              Provedor de nuvem A (orquestração e auditoria) e provedor de nuvem B (escrita).
            </p>
          </div>
          <Separator />
          <p className="text-xs text-muted-foreground">
            A autorização fica registrada com data e escopo, e pode ser revogada em Privacidade.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={aoFechar}>
            Não enviar
          </Button>
          <Button onClick={aoFechar}>Autorizar este envio</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}