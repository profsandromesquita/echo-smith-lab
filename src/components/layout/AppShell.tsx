import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { PanelLeft, SlidersHorizontal, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PainelPastas } from "@/components/layout/PainelPastas";
import { PainelParametros } from "@/components/layout/PainelParametros";
import { ControleDemo } from "@/components/dev/ControleDemo";
import { SeloIaLocal } from "@/components/privacy/Indicadores";
import { DemoProvider } from "@/lib/demo-state";

export function AppShell({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <DemoProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-panel px-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" className="lg:hidden" aria-label="Abrir pastas e histórico">
                <PanelLeft className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[85vw] max-w-sm p-4">
              <SheetHeader className="p-0 pb-3">
                <SheetTitle>Pastas e histórico</SheetTitle>
              </SheetHeader>
              <PainelPastas />
            </SheetContent>
          </Sheet>

          <Link to="/" className="font-display text-base font-semibold tracking-tight">
            Copyforja
          </Link>
          <span className="hidden truncate text-sm text-muted-foreground sm:block">/ {titulo}</span>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden md:block">
              <SeloIaLocal compacto />
            </div>
            <Button asChild size="icon" variant="ghost" aria-label="Configurações">
              <Link to="/config/privacidade">
                <Settings className="size-5" aria-hidden />
              </Link>
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button size="icon" variant="ghost" className="xl:hidden" aria-label="Abrir parâmetros">
                  <SlidersHorizontal className="size-5" aria-hidden />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[85vw] max-w-sm overflow-y-auto p-4">
                <SheetHeader className="p-0 pb-3">
                  <SheetTitle>Parâmetros da geração</SheetTitle>
                </SheetHeader>
                <PainelParametros />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-72 shrink-0 border-r bg-sidebar p-3 lg:block">
            <PainelPastas />
          </aside>

          <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>

          <aside className="hidden w-80 shrink-0 border-l bg-sidebar p-3 xl:block">
            <PainelParametros />
          </aside>
        </div>

        <ControleDemo />
      </div>
    </DemoProvider>
  );
}

export function PaginaConfig({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl">{titulo}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>
      </header>
      <div className="space-y-6">{children}</div>
    </div>
  );
}