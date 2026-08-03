import { ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SeloIaLocal } from "@/components/privacy/Indicadores";
import { useDemo, ESTADOS_IA_LOCAL } from "@/lib/demo-state";
import { opcoesPerfilAtivo, rotuloOrigem } from "@/lib/marca";
import { opcoesModo, ROTULO_MODO, rotuloOrigemModo } from "@/lib/privacidade";

export function ResumoContexto({ chatId = null }: { chatId?: string | null }) {
  const { iaLocal } = useDemo();
  const { data } = useQuery(opcoesPerfilAtivo(chatId));
  const { data: privacidade } = useQuery(opcoesModo(chatId));
  const modo = privacidade?.modo ?? "local_estrita";
  const rotuloIa = ESTADOS_IA_LOCAL.find((e) => e.id === iaLocal)?.rotulo ?? "IA local";
  const marca = data?.perfil?.nome ?? "Sem perfil de marca";
  const origem = rotuloOrigem(data?.origem ?? "nenhum", data?.pastaNome);
  const resumo = `Voz: ${marca} · ${ROTULO_MODO[modo]} · ${rotuloIa}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 max-w-full gap-1 px-2 text-xs font-normal text-muted-foreground"
        >
          <span className="truncate">{resumo}</span>
          <ChevronDown className="size-3.5 shrink-0" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3 text-sm">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Voz de marca</p>
          <p className="mt-0.5">{marca}</p>
          <p className="text-[11px] text-muted-foreground">{origem}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Modo de privacidade
          </p>
          <p className="mt-0.5">{ROTULO_MODO[modo]}</p>
          <p className="text-[11px] text-muted-foreground">
            {rotuloOrigemModo(privacidade?.origem ?? "padrao")}
          </p>
        </div>
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            IA local
          </p>
          <SeloIaLocal />
        </div>
      </PopoverContent>
    </Popover>
  );
}
