import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { SeloIaLocal } from "@/components/privacy/Indicadores";
import { SeletorPerfil } from "@/components/marca/SeletorPerfil";
import { ROTULO_FORMATO } from "@/lib/fixtures";
import { useDemo } from "@/lib/demo-state";
import { chavesMarca, opcoesPerfilAtivo, rotuloOrigem } from "@/lib/marca";
import { definirPerfilChat } from "@/lib/marca.functions";

export function PainelParametros({ chatId = null }: { chatId?: string | null }) {
  const { modo, definirModo } = useDemo();
  const cliente = useQueryClient();
  const ativo = useQuery(opcoesPerfilAtivo(chatId));

  const trocar = useMutation({
    mutationFn: (perfilId: string | null) =>
      definirPerfilChat({ data: { chatId: chatId ?? "", perfilId } }),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: chavesMarca.raiz });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível trocar o perfil."),
  });

  const origem = ativo.data?.origem ?? "nenhum";
  const substituido = Boolean(ativo.data?.substituido);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <Campo rotulo="Perfil de voz de marca">
        <SeletorPerfil
          valor={ativo.data?.perfil?.id ?? null}
          aoMudar={(id) => chatId && trocar.mutate(id)}
          rotuloVazio="Nenhum perfil"
          desabilitado={!chatId || trocar.isPending}
        />
        <p className="text-[11px] text-muted-foreground">
          {chatId
            ? `Origem: ${rotuloOrigem(origem, ativo.data?.pastaNome)}.`
            : "A escolha por chat fica disponível depois da primeira mensagem."}
        </p>
        {chatId && substituido && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-fit px-2 text-[11px]"
            onClick={() => trocar.mutate(null)}
          >
            Voltar à herança
          </Button>
        )}
      </Campo>

      <Separator />

      <Campo rotulo="Formatos de saída">
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          defaultValue={["hook", "headline_video"]}
          className="flex-wrap justify-start"
        >
          {(Object.keys(ROTULO_FORMATO) as (keyof typeof ROTULO_FORMATO)[]).map((f) => (
            <ToggleGroupItem key={f} value={f} className="text-xs">
              {ROTULO_FORMATO[f]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-[11px] text-muted-foreground">
          Só os especialistas dos formatos escolhidos são acionados.
        </p>
      </Campo>

      <Campo rotulo="Nível de consciência">
        <Select defaultValue="problema">
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inconsciente">Inconsciente</SelectItem>
            <SelectItem value="problema">Consciente do problema</SelectItem>
            <SelectItem value="solucao">Consciente da solução</SelectItem>
            <SelectItem value="produto">Consciente do produto</SelectItem>
            <SelectItem value="total">Totalmente consciente</SelectItem>
          </SelectContent>
        </Select>
      </Campo>

      <Campo rotulo="Tom de voz">
        <Select defaultValue="provocativo">
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="provocativo">Provocativo</SelectItem>
            <SelectItem value="educativo">Educativo</SelectItem>
            <SelectItem value="ironico">Irônico</SelectItem>
            <SelectItem value="empatico">Empático</SelectItem>
          </SelectContent>
        </Select>
      </Campo>

      <Campo rotulo="Pessoa gramatical">
        <ToggleGroup type="single" variant="outline" size="sm" defaultValue="segunda">
          <ToggleGroupItem value="primeira">1ª</ToggleGroupItem>
          <ToggleGroupItem value="segunda">2ª</ToggleGroupItem>
          <ToggleGroupItem value="terceira">3ª</ToggleGroupItem>
        </ToggleGroup>
      </Campo>

      <Campo rotulo="Objetivo">
        <ToggleGroup type="single" variant="outline" size="sm" defaultValue="viralizar">
          <ToggleGroupItem value="viralizar" className="text-xs">
            Viralizar
          </ToggleGroupItem>
          <ToggleGroupItem value="autoridade" className="text-xs">
            Autoridade
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-[11px] text-muted-foreground">
          Define o peso de tensão x transformação no ranking final.
        </p>
      </Campo>

      <Separator />

      <Campo rotulo="Privacidade deste chat">
        <div className="flex items-start justify-between gap-3 rounded-md border p-2.5">
          <div>
            <p className="text-xs font-medium">
              {modo === "local_estrita" ? "Memória local estrita" : "Híbrido autorizado"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {modo === "local_estrita"
                ? "Exemplos e preferências ficam no dispositivo."
                : "Resumo da voz de marca pode ser enviado, com autorização."}
            </p>
          </div>
          <Switch
            checked={modo === "hibrido_autorizado"}
            onCheckedChange={(v) => definirModo(v ? "hibrido_autorizado" : "local_estrita")}
            aria-label="Alternar modo de privacidade"
          />
        </div>
        <SeloIaLocal />
      </Campo>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{rotulo}</Label>
      {children}
    </div>
  );
}
