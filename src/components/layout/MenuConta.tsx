import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LogOut, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { obterConta } from "@/lib/conta.functions";
import { sair } from "@/hooks/useAuth";

/** Identidade da conta e saída. O papel administrativo vem do servidor, nunca do cliente. */
export function MenuConta() {
  const navigate = useNavigate();
  const buscarConta = useServerFn(obterConta);
  const { data: conta } = useQuery({
    queryKey: ["conta"],
    queryFn: () => buscarConta(),
    staleTime: 60_000,
  });

  async function encerrar() {
    await sair();
    await navigate({ to: "/auth", search: { destino: "/app" }, replace: true });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="Menu da conta">
          <User className="size-5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium">{conta?.nomeExibicao || "Minha conta"}</p>
          <p className="truncate text-xs text-muted-foreground">{conta?.email ?? ""}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {conta?.ehAdmin && (
          <DropdownMenuItem asChild>
            <Link to="/admin/agentes">
              <ShieldCheck className="size-4" aria-hidden />
              Registry de agentes
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void encerrar()}>
          <LogOut className="size-4" aria-hidden />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}