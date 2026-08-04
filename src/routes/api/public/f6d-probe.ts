// TEMPORÁRIO — diagnóstico da validação F6D. Remover ao final.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/f6d-probe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const alvo = new URL(request.url).searchParams.get("m") ?? "historico";
        try {
          const mod = await import(`../../../lib/${alvo}.functions.ts`);
          return Response.json({ ok: true, chaves: Object.keys(mod) });
        } catch (e) {
          const err = e as Error;
          return Response.json({ ok: false, msg: err?.message, stack: err?.stack?.slice(0, 1500) });
        }
      },
    },
  },
});