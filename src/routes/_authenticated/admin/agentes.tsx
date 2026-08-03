import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CascaSimples } from "@/components/layout/CascaSimples";
import { EditorVersao, type VersaoEditavel } from "@/components/registry/EditorVersao";
import { chavesRegistry, opcoesRegistry, ROTULO_ESTADO_VERSAO } from "@/lib/registry";
import { criarRascunho, descartarRascunho } from "@/lib/registry.functions";
import { verificarAdmin } from "@/lib/conta.functions";

const TITULO = "Registry de agentes — Copyforja";
const DESCRICAO =
  "Visão administrativa dos papéis de agente, modelos configurados, versão publicada, rascunhos e histórico.";

export const Route = createFileRoute("/_authenticated/admin/agentes")({
  beforeLoad: async () => {
    const { ehAdmin } = await verificarAdmin();
    if (!ehAdmin) throw redirect({ to: "/app" });
  },
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

function formatar(data: string | null) {
  if (!data) return "—";
  return new Date(data).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function Pagina() {
  const cliente = useQueryClient();
  const { data, isLoading, error } = useQuery(opcoesRegistry());
  const [emEdicao, setEmEdicao] = useState<VersaoEditavel | null>(null);

  const invalidar = () => cliente.invalidateQueries({ queryKey: chavesRegistry.raiz });

  const novoRascunho = useMutation({
    mutationFn: (v: { papel: string; baseVersaoId: string | null; motivo: string }) =>
      criarRascunho({ data: v as never }),
    onSuccess: async () => {
      await invalidar();
      toast.success("Rascunho criado a partir da versão selecionada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const descartar = useMutation({
    mutationFn: (id: string) => descartarRascunho({ data: { id } }),
    onSuccess: async () => {
      await invalidar();
      toast.success("Rascunho descartado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <CascaSimples>
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <header className="mb-6">
          <h1 className="font-display text-2xl">Registry de agentes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Papéis nunca ficam acoplados a um modelo: trocar de modelo é trocar de configuração.
          </p>
        </header>

        <Alert className="mb-6">
          <AlertTitle>Publicação é sempre explícita</AlertTitle>
          <AlertDescription>
            Editar um rascunho não altera a produção. Cada execução registra as versões utilizadas, e
            qualquer versão anterior pode voltar à produção por meio de um novo rascunho baseado nela.
          </AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Sem acesso ao Registry</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Carregando papéis…</p>}

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Papel</TableHead>
                <TableHead>Modelo publicado</TableHead>
                <TableHead>Publicada</TableHead>
                <TableHead>Rascunho</TableHead>
                <TableHead>Atualizado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.agentes ?? []).map((agente) => {
                const versoes = (data?.versoes ?? []).filter((v) => v.agente_id === agente.id);
                const publicada = versoes.find((v) => v.id === agente.versao_publicada_id);
                const rascunho = versoes.find((v) => v.id === agente.versao_rascunho_id);
                return (
                  <TableRow key={agente.id}>
                    <TableCell>
                      <span className="font-medium">{agente.nome_exibicao}</span>
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {agente.papel}
                      </span>
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button size="sm" variant="ghost" className="mt-1 h-6 px-0 text-xs">
                            Histórico de versões
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-1 pt-1">
                          {versoes.map((v) => (
                            <div
                              key={v.id}
                              className="flex items-center gap-2 text-[11px] text-muted-foreground"
                            >
                              <span className="font-mono">v{v.versao}</span>
                              <span>{ROTULO_ESTADO_VERSAO[v.estado] ?? v.estado}</span>
                              <span>{formatar(v.publicada_em ?? v.editada_em)}</span>
                              {v.estado !== "rascunho" && !agente.versao_rascunho_id && (
                                <Button
                                  size="sm"
                                  variant="link"
                                  className="h-auto p-0 text-[11px]"
                                  onClick={() =>
                                    novoRascunho.mutate({
                                      papel: agente.papel,
                                      baseVersaoId: v.id,
                                      motivo: `Rascunho a partir da v${v.versao}`,
                                    })
                                  }
                                >
                                  Usar como base
                                </Button>
                              )}
                            </div>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{publicada?.modelo ?? "—"}</TableCell>
                    <TableCell>
                      {publicada ? (
                        <Badge variant="outline" className="border-success/50 text-success">
                          v{publicada.versao}
                          {publicada.ativo ? "" : " · inativo"}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">nunca publicada</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {rascunho ? (
                        <Badge variant="outline" className="border-warning/60 text-warning">
                          v{rascunho.versao} não publicado
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatar(agente.atualizado_em)}
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      {rascunho ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setEmEdicao({
                                ...(rascunho as unknown as VersaoEditavel),
                                papel: agente.papel,
                              })
                            }
                          >
                            Editar rascunho
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => descartar.mutate(rascunho.id)}
                          >
                            Descartar
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            novoRascunho.mutate({
                              papel: agente.papel,
                              baseVersaoId: agente.versao_publicada_id,
                              motivo: "",
                            })
                          }
                        >
                          Novo rascunho
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Limites de tokens, timeout, tentativas, backoff, concorrência e orçamento por execução são
          versionados junto de cada papel.
        </p>
      </div>

      <EditorVersao
        versao={emEdicao}
        aberto={Boolean(emEdicao)}
        aoFechar={() => setEmEdicao(null)}
      />
    </CascaSimples>
  );
}
