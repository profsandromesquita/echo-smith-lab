import { Cloud, HardDrive, ShieldCheck, ShieldAlert, Download, CircleSlash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useDemo, type EstadoIaLocal } from "@/lib/demo-state";
import { cn } from "@/lib/utils";

const TEXTO_IA_LOCAL: Record<EstadoIaLocal, { rotulo: string; detalhe: string }> = {
  ausente: { rotulo: "IA local não instalada", detalhe: "Download opcional de ~2 GB" },
  baixando: { rotulo: "Baixando IA local", detalhe: "Você pode continuar usando a plataforma" },
  pronta: { rotulo: "IA local ativa", detalhe: "Adaptação de estilo roda no seu dispositivo" },
  incompativel: {
    rotulo: "Dispositivo incompatível",
    detalhe: "Sem suporte a WebGPU neste navegador",
  },
  removida: { rotulo: "IA local removida", detalhe: "Pode ser instalada novamente quando quiser" },
};

export function SeloIaLocal({ compacto = false }: { compacto?: boolean }) {
  const { iaLocal } = useDemo();
  const info = TEXTO_IA_LOCAL[iaLocal];
  const Icone =
    iaLocal === "pronta"
      ? ShieldCheck
      : iaLocal === "baixando"
        ? Download
        : iaLocal === "incompativel"
          ? ShieldAlert
          : CircleSlash;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-2.5 py-1.5",
        iaLocal === "pronta"
          ? "border-local/40 bg-local/10 text-local"
          : iaLocal === "incompativel"
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : "border-border bg-muted text-muted-foreground",
      )}
    >
      <Icone className="size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">{info.rotulo}</p>
        {!compacto && (
          <p className="truncate text-[11px] text-muted-foreground">{info.detalhe}</p>
        )}
      </div>
      {iaLocal === "baixando" && !compacto && (
        <Progress value={38} className="ml-2 h-1.5 w-20" aria-label="Progresso do download" />
      )}
    </div>
  );
}

export function IndicadorProcessamento({ local }: { local: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-normal",
        local ? "border-local/50 text-local" : "border-cloud/50 text-cloud",
      )}
    >
      {local ? <HardDrive className="size-3" aria-hidden /> : <Cloud className="size-3" aria-hidden />}
      {local ? "No dispositivo" : "Em nuvem"}
    </Badge>
  );
}

export function AvisoRotuloHonesto() {
  return (
    <p className="text-xs text-muted-foreground">
      Este chat usa <strong className="font-medium text-local">adaptação local</strong> de estilo,
      mas o briefing foi processado em nuvem. Por isso não é uma geração totalmente local — esse
      modo não existe nesta versão.
    </p>
  );
}