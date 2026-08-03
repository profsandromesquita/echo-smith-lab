import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { chavesRegistry } from "@/lib/registry";
import {
  atualizarRascunho,
  publicarRascunho,
  testarRascunho,
  validarRascunho,
} from "@/lib/registry.functions";

export interface VersaoEditavel {
  id: string;
  papel: string;
  versao: number;
  ativo: boolean;
  modelo: string;
  limite_entrada: number;
  limite_saida: number;
  timeout_ms: number;
  tentativas_max: number;
  backoff_base_ms: number;
  concorrencia: number;
  orcamento_estimado: number | string;
  motivo_alteracao: string | null;
}

const NUMERICOS = [
  { chave: "limite_entrada", rotulo: "Limite de entrada (tokens)" },
  { chave: "limite_saida", rotulo: "Limite de saída (tokens)" },
  { chave: "timeout_ms", rotulo: "Timeout (ms)" },
  { chave: "tentativas_max", rotulo: "Tentativas máximas" },
  { chave: "backoff_base_ms", rotulo: "Backoff base (ms)" },
  { chave: "concorrencia", rotulo: "Concorrência" },
] as const;

export function EditorVersao({
  versao,
  aberto,
  aoFechar,
}: {
  versao: VersaoEditavel | null;
  aberto: boolean;
  aoFechar: () => void;
}) {
  const cliente = useQueryClient();
  const [form, setForm] = useState<VersaoEditavel | null>(versao);
  const [motivo, setMotivo] = useState("");
  const [problemas, setProblemas] = useState<string[]>([]);
  const [validada, setValidada] = useState(false);
  const [testada, setTestada] = useState(false);

  useEffect(() => {
    setForm(versao);
    setMotivo(versao?.motivo_alteracao ?? "");
    setProblemas([]);
    setValidada(false);
    setTestada(false);
  }, [versao]);

  const invalidar = () => cliente.invalidateQueries({ queryKey: chavesRegistry.raiz });

  const salvar = useMutation({
    mutationFn: async () => {
      if (!form) return;
      await atualizarRascunho({
        data: {
          id: form.id,
          dados: {
            ativo: form.ativo,
            modelo: form.modelo,
            limite_entrada: Number(form.limite_entrada),
            limite_saida: Number(form.limite_saida),
            timeout_ms: Number(form.timeout_ms),
            tentativas_max: Number(form.tentativas_max),
            backoff_base_ms: Number(form.backoff_base_ms),
            concorrencia: Number(form.concorrencia),
            orcamento_estimado: Number(form.orcamento_estimado),
            motivo_alteracao: motivo,
          },
        },
      });
    },
    onSuccess: async () => {
      setValidada(false);
      setTestada(false);
      await invalidar();
      toast.success("Rascunho salvo. A produção não foi alterada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const validar = useMutation({
    mutationFn: () => validarRascunho({ data: { id: form!.id } }),
    onSuccess: (r) => {
      const ok = Boolean(r?.ok);
      setValidada(ok);
      setProblemas(ok ? [] : (r?.problemas ?? ["Configuração inválida."]));
      if (ok) toast.success("Configuração válida.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testar = useMutation({
    mutationFn: () => testarRascunho({ data: { id: form!.id, papel: form!.papel as never } }),
    onSuccess: (r) => {
      setTestada(true);
      toast.success(`Teste simulado concluído em ${r.duracao_ms} ms.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publicar = useMutation({
    mutationFn: () => publicarRascunho({ data: { id: form!.id, motivo } }),
    onSuccess: async () => {
      await invalidar();
      toast.success("Versão publicada. Ela passa a valer para novas execuções.");
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!form) return null;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Rascunho v{form.versao} — {form.papel}
          </DialogTitle>
          <DialogDescription>
            Editar aqui não altera a produção. Publicar exige validação e teste simulado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Papel ativo no pipeline</p>
              <p className="text-xs text-muted-foreground">
                Desativar remove o papel das próximas execuções, sem apagar histórico.
              </p>
            </div>
            <Switch
              checked={form.ativo}
              onCheckedChange={(v) => setForm({ ...form, ativo: v })}
              aria-label="Papel ativo"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="modelo">Modelo configurado</Label>
            <Input
              id="modelo"
              value={form.modelo}
              onChange={(e) => setForm({ ...form, modelo: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Nesta fase só identificadores simulados (prefixo mock-) são aceitos.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {NUMERICOS.map((campo) => (
              <div key={campo.chave} className="grid gap-2">
                <Label htmlFor={campo.chave}>{campo.rotulo}</Label>
                <Input
                  id={campo.chave}
                  type="number"
                  value={String(form[campo.chave])}
                  onChange={(e) =>
                    setForm({ ...form, [campo.chave]: Number(e.target.value) } as VersaoEditavel)
                  }
                />
              </div>
            ))}
            <div className="grid gap-2">
              <Label htmlFor="orcamento">Orçamento estimado por execução</Label>
              <Input
                id="orcamento"
                type="number"
                step="0.01"
                value={String(form.orcamento_estimado)}
                onChange={(e) => setForm({ ...form, orcamento_estimado: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="motivo">Motivo da alteração</Label>
            <Textarea
              id="motivo"
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Registrado no histórico da versão."
            />
          </div>

          {problemas.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>Configuração inválida</AlertTitle>
              <AlertDescription>
                <ul className="list-inside list-disc">
                  {problemas.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            Salvar rascunho
          </Button>
          <Button variant="outline" onClick={() => validar.mutate()} disabled={validar.isPending}>
            Validar
          </Button>
          <Button
            variant="outline"
            onClick={() => testar.mutate()}
            disabled={!validada || testar.isPending}
          >
            Testar simulado
          </Button>
          <Button
            onClick={() => publicar.mutate()}
            disabled={!validada || !testada || publicar.isPending}
          >
            Publicar versão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
