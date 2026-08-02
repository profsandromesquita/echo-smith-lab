import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CascaSimples } from "@/components/layout/CascaSimples";
import { PaginaConfig } from "@/components/layout/AppShell";
import { FormularioPerfil } from "@/components/marca/FormularioPerfil";
import { SeletorPerfil } from "@/components/marca/SeletorPerfil";
import { chavesMarca, opcoesPerfis } from "@/lib/marca";
import { definirPadrao, duplicarPerfil, excluirPerfil } from "@/lib/marca.functions";

const TITULO = "Vozes de marca — Copyforja";
const DESCRICAO =
  "Gerencie vários perfis de voz de marca por cliente, com perfil padrão, vínculo por pasta e sobreposição por chat.";

export const Route = createFileRoute("/_authenticated/config/voz-de-marca")({
  head: () => ({
    meta: [
      { title: TITULO },
      { name: "description", content: DESCRICAO },
      { property: "og:title", content: TITULO },
      { property: "og:description", content: DESCRICAO },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Pagina,
});

type Perfil = { id: string; nome: string; pastas: number; chats: number };

function Pagina() {
  const cliente = useQueryClient();
  const consulta = useQuery(opcoesPerfis());
  const [editando, setEditando] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [excluindo, setExcluindo] = useState<Perfil | null>(null);
  const [substituto, setSubstituto] = useState<string | null>(null);

  const atualizar = () => cliente.invalidateQueries({ queryKey: chavesMarca.raiz });
  const aoFalhar = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Não foi possível concluir a ação.");

  const padrao = useMutation({
    mutationFn: (id: string) => definirPadrao({ data: { id } }),
    onSuccess: () => {
      void atualizar();
      toast.success("Perfil padrão atualizado.");
    },
    onError: aoFalhar,
  });

  const duplicar = useMutation({
    mutationFn: (id: string) => duplicarPerfil({ data: { id } }),
    onSuccess: () => {
      void atualizar();
      toast.success("Perfil duplicado.");
    },
    onError: aoFalhar,
  });

  const excluir = useMutation({
    mutationFn: (dados: { id: string; substitutoId: string | null }) =>
      excluirPerfil({ data: dados }),
    onSuccess: () => {
      void atualizar();
      setExcluindo(null);
      setSubstituto(null);
      toast.success("Perfil excluído.");
    },
    onError: aoFalhar,
  });

  const perfis = consulta.data ?? [];

  return (
    <CascaSimples>
      <PaginaConfig
        titulo="Vozes de marca"
        descricao="Os perfis pertencem à sua conta. Uma pasta pode ser vinculada a um perfil, e um chat pode usar outro."
      >
        <Button
          className="w-fit"
          onClick={() => {
            setEditando(null);
            setFormAberto(true);
          }}
        >
          Novo perfil de marca
        </Button>

        {consulta.isLoading ? (
          <div className="space-y-3" aria-busy>
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : consulta.isError ? (
          <Card>
            <CardContent className="space-y-3 py-6 text-sm">
              <p>Não foi possível carregar seus perfis.</p>
              <Button size="sm" onClick={() => consulta.refetch()}>
                Tentar de novo
              </Button>
            </CardContent>
          </Card>
        ) : perfis.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Você ainda não tem perfis de voz de marca. Crie o primeiro para definir tom,
              posicionamento e limites da sua escrita.
            </CardContent>
          </Card>
        ) : (
          perfis.map((perfil) => (
            <Card key={perfil.id}>
              <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">{perfil.nome}</CardTitle>
                <div className="flex flex-wrap justify-end gap-2">
                  {perfil.padrao && <Badge>Padrão</Badge>}
                  <Badge variant="outline">{perfil.pastas} pasta(s)</Badge>
                  <Badge variant="outline">{perfil.chats} chat(s)</Badge>
                  <Badge variant="outline">{perfil.exemplos} exemplo(s)</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {perfil.posicionamento && (
                  <p className="text-muted-foreground">{perfil.posicionamento}</p>
                )}

                {perfil.preferidas.length > 0 && (
                  <Termos rotulo="Palavras preferidas" itens={perfil.preferidas} />
                )}
                {perfil.evitadas.length > 0 && (
                  <Termos rotulo="Palavras evitadas" itens={perfil.evitadas} negativo />
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditando(perfil.id);
                      setFormAberto(true);
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={duplicar.isPending}
                    onClick={() => duplicar.mutate(perfil.id)}
                  >
                    Duplicar
                  </Button>
                  {!perfil.padrao && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={padrao.isPending}
                      onClick={() => padrao.mutate(perfil.id)}
                    >
                      Definir como padrão
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setExcluindo(perfil);
                      setSubstituto(null);
                    }}
                  >
                    Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </PaginaConfig>

      <FormularioPerfil
        perfilId={editando}
        aberto={formAberto}
        aoFechar={() => setFormAberto(false)}
      />

      <AlertDialog open={excluindo !== null} onOpenChange={(v) => !v && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{excluindo?.nome}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluindo && excluindo.pastas + excluindo.chats > 0
                ? `${excluindo.pastas} pasta(s) e ${excluindo.chats} chat(s) usam este perfil. Escolha um substituto ou deixe sem perfil — nenhum chat ou mensagem é apagado.`
                : "Os exemplos deste perfil também serão excluídos. Nenhum chat ou mensagem é apagado."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {excluindo && excluindo.pastas + excluindo.chats > 0 && (
            <div className="space-y-1.5">
              <SeletorPerfil
                valor={substituto}
                aoMudar={setSubstituto}
                rotuloVazio="Deixar sem perfil"
                ariaLabel="Perfil substituto"
              />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                excluindo &&
                excluir.mutate({
                  id: excluindo.id,
                  substitutoId: substituto === excluindo.id ? null : substituto,
                })
              }
            >
              Excluir perfil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CascaSimples>
  );
}

function Termos({
  rotulo,
  itens,
  negativo = false,
}: {
  rotulo: string;
  itens: string[];
  negativo?: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <div className="flex flex-wrap gap-1.5">
        {itens.map((t) => (
          <Badge
            key={t}
            variant={negativo ? "outline" : "secondary"}
            className={
              negativo ? "border-destructive/50 font-normal text-destructive" : "font-normal"
            }
          >
            {t}
          </Badge>
        ))}
      </div>
    </div>
  );
}
