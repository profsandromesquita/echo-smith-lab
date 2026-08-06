import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  opcoesConsentimentos,
  ROTULO_CATEGORIA,
  ROTULO_ESCOPO,
  rotuloProvedor,
} from "@/lib/privacidade";

const ROTULO_ACAO: Record<string, string> = {
  concedido: "Autorizado",
  recusado: "Recusado",
  revogado: "Revogado",
};

const formatar = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Histórico append-only: não pode ser alterado nem apagado pelo usuário. */
export function HistoricoConsentimentos() {
  const { data, isPending } = useQuery(opcoesConsentimentos());
  const historico = data?.historico ?? [];

  if (isPending) return <p className="text-sm text-muted-foreground">Carregando histórico…</p>;
  if (historico.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma decisão de consentimento registrada até agora.
      </p>
    );

  return (
    <ul className="space-y-1.5">
      {historico.map((h) => (
        <li key={h.id} className="flex flex-wrap items-baseline gap-2 rounded-md border p-2.5 text-sm">
          <span className="font-mono text-xs text-muted-foreground">{formatar(h.ocorrido_em)}</span>
          <Badge
            variant="outline"
            className={
              h.acao === "concedido"
                ? "border-cloud/50 font-normal text-cloud"
                : "font-normal text-muted-foreground"
            }
          >
            {ROTULO_ACAO[h.acao] ?? h.acao}
          </Badge>
          <span className="font-medium">{ROTULO_CATEGORIA[h.categoria] ?? h.categoria}</span>
          <span className="text-muted-foreground">
            {ROTULO_ESCOPO[h.escopo] ?? h.escopo} · {rotuloProvedor(h.provedor)} · {h.etapa} · termos v
            {h.termos_versao}
          </span>
        </li>
      ))}
    </ul>
  );
}