import { Link } from "@tanstack/react-router";

/** Navegação entre as páginas de configuração da conta. */
const ITENS = [
  { to: "/config/privacidade", rotulo: "Privacidade" },
  { to: "/config/voz-de-marca", rotulo: "Voz de marca" },
  { to: "/config/preferencias", rotulo: "Preferências" },
  { to: "/config/ia-local", rotulo: "IA local" },
] as const;

export function NavConfig() {
  return (
    <nav aria-label="Configurações" className="border-b bg-panel">
      <ul className="mx-auto flex w-full max-w-3xl gap-1 overflow-x-auto px-4 py-2">
        {ITENS.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              className="block whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              activeProps={{ className: "bg-accent text-foreground font-medium" }}
            >
              {item.rotulo}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
