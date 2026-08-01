import { Thread } from "@/components/chat/Thread";
import { Composer } from "@/components/chat/Composer";
import { AreaResultados } from "@/components/chat/AreaResultados";
import { Badge } from "@/components/ui/badge";

export function Workspace({ titulo, marca }: { titulo: string; marca: string }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-5">
      <div>
        <h1 className="font-display text-xl">{titulo}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-normal">
            Voz de marca: {marca}
          </Badge>
          <Badge variant="outline" className="border-local/50 font-normal text-local">
            Memória local estrita
          </Badge>
        </div>
      </div>

      <Thread />
      <Composer />
      <AreaResultados />
    </div>
  );
}