import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  return (
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
      </SelectContent>
    </Select>
  );
}
