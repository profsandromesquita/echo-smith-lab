import { Badge } from "@/components/ui/badge";
import { ROTULO_ESTADO_ETAPA, type EstadoEtapa } from "@/lib/execucao";

export interface EtapaTecnica {
  id: string;
  papel: string;
  estado: string;
  tentativas: number;
  tentativas_limite: number;
  duracao_ms: number | null;
  ultimo_codigo_erro: string | null;
  proxima_tentativa_em: string | null;
}

/**
 * Detalhes técnicos visíveis ao usuário. Nunca expõe instruções internas,
 * prompts, provedor configurado nem parâmetros do Registry.
 */
export function DetalhesTecnicos({ etapas }: { etapas: EtapaTecnica[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr className="text-left">
            <th className="py-1 pr-3 font-medium">Etapa</th>
            <th className="py-1 pr-3 font-medium">Estado</th>
            <th className="py-1 pr-3 font-medium">Tentativas</th>
            <th className="py-1 pr-3 font-medium">Duração</th>
            <th className="py-1 font-medium">Erro</th>
          </tr>
        </thead>
        <tbody>
          {etapas.map((e) => (
            <tr key={e.id} className="border-t">
              <td className="py-1 pr-3 font-mono">{e.papel}</td>
              <td className="py-1 pr-3">
                <Badge variant="outline" className="font-normal">
                  {ROTULO_ESTADO_ETAPA[e.estado as EstadoEtapa] ?? e.estado}
                </Badge>
              </td>
              <td className="py-1 pr-3">
                {e.tentativas}/{e.tentativas_limite}
              </td>
              <td className="py-1 pr-3">{e.duracao_ms ? `${e.duracao_ms} ms` : "—"}</td>
              <td className="py-1 text-muted-foreground">{e.ultimo_codigo_erro ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
