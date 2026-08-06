import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MenuConta } from "@/components/layout/MenuConta";
import { NavConfig } from "@/components/layout/NavConfig";
import { DemoProvider } from "@/lib/demo-state";

/** Casca das páginas fora do workspace (configurações, admin, onboarding). */
export function CascaSimples({ children }: { children: ReactNode }) {
  return (
    <DemoProvider>
      <div className="min-h-screen bg-background">
        <header className="flex h-14 items-center gap-2 border-b bg-panel px-3">
          <Button asChild size="sm" variant="ghost">
            <Link to="/app">
              <ArrowLeft className="size-4" aria-hidden />
              Voltar ao workspace
            </Link>
          </Button>
          <span className="ml-auto font-display text-sm font-semibold">Copyforja</span>
          <MenuConta />
        </header>
        <NavConfig />
        {children}
      </div>
    </DemoProvider>
  );
}
