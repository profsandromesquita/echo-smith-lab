import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  atualizarPerfil,
  criarPerfil,
  excluirExemplo,
  salvarExemplo,
} from "@/lib/marca.functions";
import {
  CAMPOS_VAZIOS,
  chavesMarca,
  opcoesPerfil,
  paraLista,
  paraTexto,
  type CamposPerfil,
} from "@/lib/marca";

export function FormularioPerfil({
  perfilId,
  aberto,
  aoFechar,
}: {
  /** null = criação de um novo perfil. */
  perfilId: string | null;
  aberto: boolean;
  aoFechar: () => void;
}) {
  const cliente = useQueryClient();
  const criando = perfilId === null;
  const consulta = useQuery({ ...opcoesPerfil(perfilId ?? ""), enabled: aberto && !criando });

  const [campos, setCampos] = useState<CamposPerfil>(CAMPOS_VAZIOS);
  const [preferidasTexto, setPreferidasTexto] = useState("");
  const [evitadasTexto, setEvitadasTexto] = useState("");
  const [exemploTitulo, setExemploTitulo] = useState("");
  const [exemploTexto, setExemploTexto] = useState("");

  useEffect(() => {
    if (!aberto) return;
    if (criando) {
      setCampos(CAMPOS_VAZIOS);
      setPreferidasTexto("");
      setEvitadasTexto("");
      return;
    }
    const p = consulta.data?.perfil;
    if (!p) return;
    setCampos({
      nome: p.nome,
      descricao: p.descricao ?? "",
      publico: p.publico ?? "",
      posicionamento: p.posicionamento ?? "",
      personalidade: p.personalidade ?? "",
      tom_de_voz: p.tom_de_voz ?? "",
      preferidas: p.preferidas ?? [],
      evitadas: p.evitadas ?? [],
      principios: p.principios ?? "",
      orientacoes: p.orientacoes ?? "",
    });
    setPreferidasTexto(paraTexto(p.preferidas));
    setEvitadasTexto(paraTexto(p.evitadas));
  }, [aberto, criando, consulta.data]);

  const atualizarLista = () => {
    void cliente.invalidateQueries({ queryKey: chavesMarca.raiz });
  };

  const aoFalhar = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");

  const salvar = useMutation({
    mutationFn: async () => {
      const dados = {
        ...campos,
        preferidas: paraLista(preferidasTexto),
        evitadas: paraLista(evitadasTexto),
      };
      if (criando) return criarPerfil({ data: { ...dados, padrao: false } });
      return atualizarPerfil({ data: { ...dados, id: perfilId } });
    },
    onSuccess: () => {
      atualizarLista();
      toast.success(criando ? "Perfil criado." : "Perfil atualizado.");
      aoFechar();
    },
    onError: aoFalhar,
  });

  const novoExemplo = useMutation({
    mutationFn: () =>
      salvarExemplo({
        data: { perfilId: perfilId ?? "", titulo: exemploTitulo, texto: exemploTexto },
      }),
    onSuccess: () => {
      setExemploTitulo("");
      setExemploTexto("");
      atualizarLista();
    },
    onError: aoFalhar,
  });

  const removerExemplo = useMutation({
    mutationFn: (id: string) => excluirExemplo({ data: { id } }),
    onSuccess: atualizarLista,
    onError: aoFalhar,
  });

  const naoEncontrado = !criando && !consulta.isLoading && consulta.data === null;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{criando ? "Novo perfil de marca" : "Editar perfil"}</DialogTitle>
          <DialogDescription>
            Só informações que você escreve aqui são guardadas. Nada é enviado a modelos nesta
            etapa.
          </DialogDescription>
        </DialogHeader>

        {naoEncontrado ? (
          <p className="py-6 text-sm text-muted-foreground">
            Este perfil não existe ou não está na sua conta.
          </p>
        ) : consulta.isLoading && !criando ? (
          <div className="space-y-2 py-4" aria-busy>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <Campo id="nome" rotulo="Nome da marca ou cliente">
              <Input
                id="nome"
                value={campos.nome}
                maxLength={80}
                onChange={(e) => setCampos({ ...campos, nome: e.target.value })}
              />
            </Campo>

            <Campo id="descricao" rotulo="Descrição da identidade">
              <Textarea
                id="descricao"
                rows={2}
                maxLength={1000}
                value={campos.descricao}
                onChange={(e) => setCampos({ ...campos, descricao: e.target.value })}
              />
            </Campo>

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="publico" rotulo="Público principal">
                <Textarea
                  id="publico"
                  rows={2}
                  maxLength={600}
                  value={campos.publico}
                  onChange={(e) => setCampos({ ...campos, publico: e.target.value })}
                />
              </Campo>
              <Campo id="posicionamento" rotulo="Posicionamento">
                <Textarea
                  id="posicionamento"
                  rows={2}
                  maxLength={1000}
                  value={campos.posicionamento}
                  onChange={(e) => setCampos({ ...campos, posicionamento: e.target.value })}
                />
              </Campo>
              <Campo id="personalidade" rotulo="Personalidade">
                <Textarea
                  id="personalidade"
                  rows={2}
                  maxLength={600}
                  value={campos.personalidade}
                  onChange={(e) => setCampos({ ...campos, personalidade: e.target.value })}
                />
              </Campo>
              <Campo id="tom" rotulo="Tom de voz">
                <Input
                  id="tom"
                  maxLength={300}
                  value={campos.tom_de_voz}
                  onChange={(e) => setCampos({ ...campos, tom_de_voz: e.target.value })}
                />
              </Campo>
            </div>

            <Campo id="preferidas" rotulo="Palavras e expressões preferidas">
              <Input
                id="preferidas"
                value={preferidasTexto}
                onChange={(e) => setPreferidasTexto(e.target.value)}
                placeholder="conflito, travessia, nomear"
              />
              <p className="text-[11px] text-muted-foreground">Separe por vírgula.</p>
            </Campo>

            <Campo id="evitadas" rotulo="Palavras e expressões evitadas">
              <Input
                id="evitadas"
                value={evitadasTexto}
                onChange={(e) => setEvitadasTexto(e.target.value)}
                placeholder="mindset, método infalível"
              />
              <p className="text-[11px] text-muted-foreground">Separe por vírgula.</p>
            </Campo>

            <Campo id="principios" rotulo="Princípios e restrições éticas">
              <Textarea
                id="principios"
                rows={3}
                maxLength={1500}
                value={campos.principios}
                onChange={(e) => setCampos({ ...campos, principios: e.target.value })}
              />
            </Campo>

            <Campo id="orientacoes" rotulo="Orientações de escrita">
              <Textarea
                id="orientacoes"
                rows={3}
                maxLength={2000}
                value={campos.orientacoes}
                onChange={(e) => setCampos({ ...campos, orientacoes: e.target.value })}
              />
            </Campo>

            {!criando && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">Exemplos de textos aprovados</p>
                    <p className="text-[11px] text-muted-foreground">
                      Materiais que você cadastra conscientemente. Ainda não são usados por nenhum
                      modelo.
                    </p>
                  </div>

                  {(consulta.data?.exemplos ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum exemplo cadastrado.</p>
                  ) : (
                    <ul className="space-y-2">
                      {consulta.data?.exemplos.map((ex) => (
                        <li
                          key={ex.id}
                          className="flex items-start justify-between gap-2 rounded-md border p-2.5"
                        >
                          <div className="min-w-0">
                            {ex.titulo && <p className="text-xs font-medium">{ex.titulo}</p>}
                            <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                              {ex.texto}
                            </p>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 shrink-0"
                            aria-label="Excluir exemplo"
                            onClick={() => removerExemplo.mutate(ex.id)}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="space-y-2 rounded-md border p-2.5">
                    <Input
                      value={exemploTitulo}
                      maxLength={120}
                      placeholder="Título do exemplo (opcional)"
                      onChange={(e) => setExemploTitulo(e.target.value)}
                      aria-label="Título do exemplo"
                    />
                    <Textarea
                      rows={3}
                      maxLength={4000}
                      value={exemploTexto}
                      placeholder="Cole aqui um texto aprovado por você."
                      onChange={(e) => setExemploTexto(e.target.value)}
                      aria-label="Texto do exemplo"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!exemploTexto.trim() || novoExemplo.isPending}
                      onClick={() => novoExemplo.mutate()}
                    >
                      Adicionar exemplo
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            onClick={() => salvar.mutate()}
            disabled={!campos.nome.trim() || salvar.isPending || naoEncontrado}
          >
            Salvar perfil
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Campo({
  id,
  rotulo,
  children,
}: {
  id: string;
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </Label>
      {children}
    </div>
  );
}
