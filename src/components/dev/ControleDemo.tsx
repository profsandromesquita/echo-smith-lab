import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  ESTADOS_DEMO,
  ESTADOS_IA_LOCAL,
  useDemo,
  type EstadoDemo,
  type EstadoIaLocal,
} from "@/lib/demo-state";
import { cn } from "@/lib/utils";

/** Visível apenas em desenvolvimento: alterna os estados simulados da F0. */
export function ControleDemo() {
  const { estado, definirEstado, iaLocal, definirIaLocal, offline, definirOffline } = useDemo();

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="secondary" className="shadow-md">
            <FlaskConical className="size-4" aria-hidden />
            Estados
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Estado do workspace
          </p>
          <div className="grid grid-cols-2 gap-1">
            {ESTADOS_DEMO.map((e) => (
              <Opcao
                key={e.id}
                ativo={estado === e.id}
                rotulo={e.rotulo}
                onClick={() => definirEstado(e.id as EstadoDemo)}
              />
            ))}
          </div>

          <Separator className="my-3" />

          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            IA local
          </p>
          <div className="grid grid-cols-2 gap-1">
            {ESTADOS_IA_LOCAL.map((e) => (
              <Opcao
                key={e.id}
                ativo={iaLocal === e.id}
                rotulo={e.rotulo}
                onClick={() => definirIaLocal(e.id as EstadoIaLocal)}
              />
            ))}
          </div>

          <Separator className="my-3" />

          <div className="flex items-center justify-between">
            <Label htmlFor="offline" className="text-xs">
              Simular offline
            </Label>
            <Switch id="offline" checked={offline} onCheckedChange={definirOffline} />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Opcao({
  ativo,
  rotulo,
  onClick,
}: {
  ativo: boolean;
  rotulo: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2 py-1 text-left text-[11px] transition-colors",
        ativo ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent/10",
      )}
    >
      {rotulo}
    </button>
  );
}