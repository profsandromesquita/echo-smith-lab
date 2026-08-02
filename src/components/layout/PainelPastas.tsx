import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  FolderOpen,
  Inbox,
  MessageSquarePlus,
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  criarChat,
  criarPasta,
  excluirChat,
  excluirPasta,
  moverChat,
  renomearChat,
  renomearPasta,
} from "@/lib/historico.functions";
import { chavesHistorico, opcoesArvore, opcoesBusca, quando } from "@/lib/historico";
import { SeletorPerfil } from "@/components/marca/SeletorPerfil";
import { chavesMarca } from "@/lib/marca";
import { definirPerfilPasta } from "@/lib/marca.functions";
import { cn } from "@/lib/utils";

type ChatItem = { id: string; titulo: string; pasta_id: string | null; ultima_atividade_em: string };
type PastaItem = { id: string; nome: string; criado_em: string; perfil_marca_id: string | null };

type DialogoTexto =
  | { tipo: "nova_pasta" }
  | { tipo: "renomear_pasta"; id: string; valor: string }
  | { tipo: "renomear_chat"; id: string; valor: string }
  | null;

type Confirmacao =
  | { tipo: "excluir_pasta"; id: string; nome: string; quantidade: number }
  | { tipo: "excluir_chat"; id: string; titulo: string }
  | null;

export function PainelPastas() {
  const cliente = useQueryClient();
  const navegar = useNavigate();
  const [abertas, setAbertas] = useState<string[]>([]);
  const [termo, setTermo] = useState("");
  const [termoAtrasado, setTermoAtrasado] = useState("");
  const [dialogo, setDialogo] = useState<DialogoTexto>(null);
  const [valorDialogo, setValorDialogo] = useState("");
  const [confirmacao, setConfirmacao] = useState<Confirmacao>(null);
  const [vozPasta, setVozPasta] = useState<PastaItem | null>(null);
  const [perfilPasta, setPerfilPasta] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setTermoAtrasado(termo.trim()), 300);
    return () => clearTimeout(t);
  }, [termo]);

  const arvore = useQuery(opcoesArvore());
  const busca = useQuery(opcoesBusca(termoAtrasado));
  const buscando = termoAtrasado.length > 1;

  const pastas: PastaItem[] = arvore.data?.pastas ?? [];
  const chats: ChatItem[] = arvore.data?.chats ?? [];

  const atualizar = () => {
    void cliente.invalidateQueries({ queryKey: ["historico"] });
  };

  const aoFalhar = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Não foi possível concluir a ação.");

  const mCriarPasta = useMutation({
    mutationFn: (nome: string) => criarPasta({ data: { nome } }),
    onSuccess: (p) => {
      atualizar();
      if (p?.id) setAbertas((a) => [...a, p.id]);
      toast.success("Pasta criada.");
    },
    onError: aoFalhar,
  });

  const mRenomearPasta = useMutation({
    mutationFn: (v: { id: string; nome: string }) => renomearPasta({ data: v }),
    onSuccess: atualizar,
    onError: aoFalhar,
  });

  const mExcluirPasta = useMutation({
    mutationFn: (id: string) => excluirPasta({ data: { id } }),
    onSuccess: () => {
      atualizar();
      toast.success("Pasta excluída. Os chats foram mantidos sem pasta.");
    },
    onError: aoFalhar,
  });

  const mVozPasta = useMutation({
    mutationFn: (v: { pastaId: string; perfilId: string | null }) =>
      definirPerfilPasta({ data: v }),
    onSuccess: () => {
      atualizar();
      void cliente.invalidateQueries({ queryKey: chavesMarca.raiz });
      setVozPasta(null);
      toast.success("Voz de marca da pasta atualizada.");
    },
    onError: aoFalhar,
  });

  const mCriarChat = useMutation({
    mutationFn: (pastaId: string | null) => criarChat({ data: { pastaId } }),
    onSuccess: (chat) => {
      atualizar();
      if (chat?.id) void navegar({ to: "/app/c/$chatId", params: { chatId: chat.id } });
    },
    onError: aoFalhar,
  });

  const mRenomearChat = useMutation({
    mutationFn: (v: { id: string; titulo: string }) => renomearChat({ data: v }),
    onSuccess: atualizar,
    onError: aoFalhar,
  });

  const mMoverChat = useMutation({
    mutationFn: (v: { id: string; pastaId: string | null }) => moverChat({ data: v }),
    onSuccess: atualizar,
    onError: aoFalhar,
  });

  const mExcluirChat = useMutation({
    mutationFn: (id: string) => excluirChat({ data: { id } }),
    onSuccess: () => {
      atualizar();
      toast.success("Chat excluído.");
      void navegar({ to: "/app" });
    },
    onError: aoFalhar,
  });

  const alternar = (id: string) =>
    setAbertas((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
    );

  const estaAberta = (id: string) => abertas.includes(id) || arvore.isLoading;

  const abrirDialogo = (d: NonNullable<DialogoTexto>) => {
    setDialogo(d);
    setValorDialogo("valor" in d ? d.valor : "");
  };

  const confirmarDialogo = () => {
    const valor = valorDialogo.trim();
    if (!dialogo || !valor) return;
    if (dialogo.tipo === "nova_pasta") mCriarPasta.mutate(valor);
    if (dialogo.tipo === "renomear_pasta") mRenomearPasta.mutate({ id: dialogo.id, nome: valor });
    if (dialogo.tipo === "renomear_chat") mRenomearChat.mutate({ id: dialogo.id, titulo: valor });
    setDialogo(null);
  };

  const AcoesChat = ({ chat }: { chat: ChatItem }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="size-7 shrink-0" aria-label="Ações do chat">
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => abrirDialogo({ tipo: "renomear_chat", id: chat.id, valor: chat.titulo })}
        >
          Renomear chat
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Mover para</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem
              disabled={chat.pasta_id === null}
              onSelect={() => mMoverChat.mutate({ id: chat.id, pastaId: null })}
            >
              Sem pasta
            </DropdownMenuItem>
            {pastas.map((p) => (
              <DropdownMenuItem
                key={p.id}
                disabled={chat.pasta_id === p.id}
                onSelect={() => mMoverChat.mutate({ id: chat.id, pastaId: p.id })}
              >
                {p.nome}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => setConfirmacao({ tipo: "excluir_chat", id: chat.id, titulo: chat.titulo })}
        >
          Excluir chat
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const LinhaChat = ({ chat }: { chat: ChatItem }) => (
    <li className="flex items-center gap-1">
      <Link
        to="/app/c/$chatId"
        params={{ chatId: chat.id }}
        className="block min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent"
        activeProps={{ className: "bg-sidebar-accent font-medium" }}
      >
        <span className="block truncate">{chat.titulo}</span>
        <span className="block text-[11px] text-muted-foreground">
          {quando(chat.ultima_atividade_em)}
        </span>
      </Link>
      <AcoesChat chat={chat} />
    </li>
  );

  const semPasta = chats.filter((c) => c.pasta_id === null);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar no histórico"
            className="pl-8"
            aria-label="Buscar no histórico"
          />
        </div>
        <Button
          size="icon"
          variant="outline"
          aria-label="Nova pasta"
          onClick={() => abrirDialogo({ tipo: "nova_pasta" })}
        >
          <Plus className="size-4" aria-hidden />
        </Button>
      </div>

      <Button
        size="sm"
        variant="secondary"
        className="justify-start"
        onClick={() => mCriarChat.mutate(null)}
        disabled={mCriarChat.isPending}
      >
        <MessageSquarePlus className="size-4" aria-hidden />
        Novo chat
      </Button>

      <nav className="flex-1 space-y-3 overflow-y-auto pr-1">
        {arvore.isLoading && (
          <div className="space-y-2" aria-busy>
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-6 w-1/2" />
          </div>
        )}

        {arvore.isError && (
          <div className="rounded-md border border-destructive/40 p-3 text-sm">
            <p>Não foi possível carregar o histórico.</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => arvore.refetch()}>
              Tentar de novo
            </Button>
          </div>
        )}

        {!arvore.isLoading && !arvore.isError && buscando && (
          <section>
            <p className="px-1.5 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              Resultados da busca
            </p>
            {busca.isLoading ? (
              <Skeleton className="h-6 w-3/4" />
            ) : (busca.data?.chats.length ?? 0) === 0 ? (
              <p className="px-1.5 text-sm text-muted-foreground">Nenhum chat encontrado.</p>
            ) : (
              <ul className="space-y-0.5">
                {busca.data?.chats.map((chat) => <LinhaChat key={chat.id} chat={chat} />)}
              </ul>
            )}
          </section>
        )}

        {!arvore.isLoading && !arvore.isError && !buscando && (
          <>
            {pastas.length === 0 && chats.length === 0 && (
              <p className="px-1.5 text-sm text-muted-foreground">
                Nenhum chat ainda. Crie uma pasta ou comece um novo chat.
              </p>
            )}

            {pastas.map((pasta) => {
              const daPasta = chats.filter((c) => c.pasta_id === pasta.id);
              const aberta = estaAberta(pasta.id);
              return (
                <section key={pasta.id}>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => alternar(pasta.id)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm font-medium hover:bg-sidebar-accent"
                      aria-expanded={aberta}
                    >
                      <ChevronDown
                        className={cn("size-3.5 shrink-0 transition-transform", !aberta && "-rotate-90")}
                        aria-hidden
                      />
                      <FolderOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate">{pasta.nome}</span>
                      <span className="ml-1 text-[11px] text-muted-foreground">{daPasta.length}</span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="size-7" aria-label="Ações da pasta">
                          <MoreHorizontal className="size-4" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => mCriarChat.mutate(pasta.id)}>
                          Novo chat nesta pasta
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            abrirDialogo({ tipo: "renomear_pasta", id: pasta.id, valor: pasta.nome })
                          }
                        >
                          Renomear pasta
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            setVozPasta(pasta);
                            setPerfilPasta(pasta.perfil_marca_id);
                          }}
                        >
                          Voz de marca da pasta
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() =>
                            setConfirmacao({
                              tipo: "excluir_pasta",
                              id: pasta.id,
                              nome: pasta.nome,
                              quantidade: daPasta.length,
                            })
                          }
                        >
                          Excluir pasta
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {aberta && (
                    <ul className="space-y-0.5 pl-6">
                      {daPasta.length === 0 ? (
                        <li className="px-2 py-1 text-[11px] text-muted-foreground">Pasta vazia.</li>
                      ) : (
                        daPasta.map((chat) => <LinhaChat key={chat.id} chat={chat} />)
                      )}
                    </ul>
                  )}
                </section>
              );
            })}

            {semPasta.length > 0 && (
              <section>
                <div className="flex items-center gap-1.5 px-1.5 py-1 text-sm font-medium">
                  <Inbox className="size-4 text-muted-foreground" aria-hidden />
                  Sem pasta
                </div>
                <ul className="space-y-0.5 pl-6">
                  {semPasta.map((chat) => <LinhaChat key={chat.id} chat={chat} />)}
                </ul>
              </section>
            )}
          </>
        )}
      </nav>

      <Dialog open={dialogo !== null} onOpenChange={(aberto) => !aberto && setDialogo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogo?.tipo === "nova_pasta"
                ? "Nova pasta"
                : dialogo?.tipo === "renomear_pasta"
                  ? "Renomear pasta"
                  : "Renomear chat"}
            </DialogTitle>
            <DialogDescription>
              {dialogo?.tipo === "renomear_chat"
                ? "O novo título aparece no histórico e no topo da conversa."
                : "Use um nome curto e reconhecível."}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={valorDialogo}
            maxLength={dialogo?.tipo === "renomear_chat" ? 120 : 80}
            onChange={(e) => setValorDialogo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmarDialogo()}
            aria-label="Nome"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogo(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmarDialogo} disabled={!valorDialogo.trim()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={vozPasta !== null} onOpenChange={(aberto) => !aberto && setVozPasta(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Voz de marca da pasta</DialogTitle>
            <DialogDescription>
              Os chats desta pasta herdam este perfil, a menos que definam outro.
            </DialogDescription>
          </DialogHeader>
          <SeletorPerfil
            valor={perfilPasta}
            aoMudar={setPerfilPasta}
            rotuloVazio="Usar o perfil padrão da conta"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVozPasta(null)}>
              Cancelar
            </Button>
            <Button
              disabled={mVozPasta.isPending}
              onClick={() =>
                vozPasta && mVozPasta.mutate({ pastaId: vozPasta.id, perfilId: perfilPasta })
              }
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmacao !== null}
        onOpenChange={(aberto) => !aberto && setConfirmacao(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmacao?.tipo === "excluir_pasta"
                ? `Excluir a pasta “${confirmacao.nome}”?`
                : `Excluir o chat “${confirmacao?.titulo ?? ""}”?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmacao?.tipo === "excluir_pasta"
                ? confirmacao.quantidade > 0
                  ? `${confirmacao.quantidade} chat(s) serão mantidos e passarão para “Sem pasta”. Nenhuma conversa é apagada.`
                  : "A pasta está vazia. Nenhuma conversa será apagada."
                : "As mensagens desta conversa serão apagadas junto. Esta ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmacao) return;
                if (confirmacao.tipo === "excluir_pasta") mExcluirPasta.mutate(confirmacao.id);
                else mExcluirChat.mutate(confirmacao.id);
                setConfirmacao(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

