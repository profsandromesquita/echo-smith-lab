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
import { SeloIaLocal } from "@/components/privacy/Indicadores";
import { PERFIS_MARCA, ROTULO_FORMATO } from "@/lib/fixtures";
import { useDemo } from "@/lib/demo-state";

export function PainelParametros() {
  const { modo, definirModo } = useDemo();

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <Campo rotulo="Perfil de voz de marca">
        <Select defaultValue={PERFIS_MARCA[0]?.id ?? ""}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERFIS_MARCA.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">Herdado da pasta. Pode ser trocado só neste chat.</p>
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