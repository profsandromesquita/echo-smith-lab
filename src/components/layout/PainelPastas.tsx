import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, FolderOpen, MoreHorizontal, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PASTAS } from "@/lib/fixtures";
import { cn } from "@/lib/utils";

export function PainelPastas() {
  const [abertas, setAbertas] = useState<string[]>(PASTAS.map((p) => p.id));

  const alternar = (id: string) =>
    setAbertas((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
    );

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input placeholder="Buscar no histórico" className="pl-8" aria-label="Buscar no histórico" />
        </div>
        <Button size="icon" variant="outline" aria-label="Nova pasta">
          <Plus className="size-4" aria-hidden />
        </Button>
      </div>

      <nav className="flex-1 space-y-3 overflow-y-auto pr-1">
        {PASTAS.map((pasta) => {
          const aberta = abertas.includes(pasta.id);
          return (
            <section key={pasta.id}>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => alternar(pasta.id)}
                  className="flex flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm font-medium hover:bg-sidebar-accent"
                  aria-expanded={aberta}
                >
                  <ChevronDown
                    className={cn("size-3.5 transition-transform", !aberta && "-rotate-90")}
                    aria-hidden
                  />
                  <FolderOpen className="size-4 text-muted-foreground" aria-hidden />
                  <span className="truncate">{pasta.nome}</span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="size-7" aria-label="Ações da pasta">
                      <MoreHorizontal className="size-4" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Renomear pasta</DropdownMenuItem>
                    <DropdownMenuItem>Vincular voz de marca</DropdownMenuItem>
                    <DropdownMenuItem>Mover chats</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <p className="px-1.5 pb-1 pl-8 text-[11px] text-muted-foreground">
                {pasta.marcaVinculada}
              </p>

              {aberta && (
                <ul className="space-y-0.5 pl-8">
                  {pasta.chats.map((chat) => (
                    <li key={chat.id}>
                      <Link
                        to="/app/c/$chatId"
                        params={{ chatId: chat.id }}
                        className="block rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent"
                        activeProps={{ className: "bg-sidebar-accent font-medium" }}
                      >
                        <span className="block truncate">{chat.titulo}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {chat.atualizadoEm}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </nav>
    </div>
  );
}