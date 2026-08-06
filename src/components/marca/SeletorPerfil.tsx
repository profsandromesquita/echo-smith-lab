import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { opcoesPerfis } from "@/lib/marca";

export const SEM_PERFIL = "__sem_perfil__";

/** Seletor de perfil de marca. `null` representa a ausência de vínculo. */
export function SeletorPerfil({
  valor,
  aoMudar,
  rotuloVazio = "Nenhum perfil",
  desabilitado = false,
  ariaLabel = "Perfil de voz de marca",
}: {
  valor: string | null;
  aoMudar: (id: string | null) => void;
  rotuloVazio?: string;
  desabilitado?: boolean;
  ariaLabel?: string;
}) {
  const { data: perfis, isLoading } = useQuery(opcoesPerfis());
  const vazio = (perfis ?? []).length === 0;

  return (
    <div className="space-y-1.5">
    <Select
      value={valor ?? SEM_PERFIL}
      onValueChange={(v) => aoMudar(v === SEM_PERFIL ? null : v)}
      disabled={desabilitado || isLoading}
    >
      <SelectTrigger className="w-full" aria-label={ariaLabel}>
        <SelectValue placeholder={rotuloVazio} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SEM_PERFIL}>{rotuloVazio}</SelectItem>
        {(perfis ?? []).map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.nome}
            {p.padrao ? " · padrão" : ""}
          </SelectItem>
        ))}
        <Separator className="my-1" />
        <Link
          to="/config/voz-de-marca"
          className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-primary outline-none hover:bg-accent"
        >
          <Plus className="size-4" aria-hidden />
          {vazio ? "Criar voz de marca" : "Criar nova voz de marca"}
        </Link>
      </SelectContent>
    </Select>
      {vazio && !isLoading && (
        <p className="text-xs text-muted-foreground">
          Você ainda não tem nenhuma voz de marca.{" "}
          <Link to="/config/voz-de-marca" className="underline underline-offset-2">
            Criar a primeira
          </Link>
          .
        </p>
      )}
    </div>
  );
}
