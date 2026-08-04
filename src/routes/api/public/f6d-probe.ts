// TEMPORÁRIO — diagnóstico da validação F6D. Remover ao final.
import { createFileRoute } from "@tanstack/react-router";
import { consumeLastCapturedError, describeError } from "@/lib/error-capture";

export const Route = createFileRoute("/api/public/f6d-probe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const alvo = new URL(request.url).searchParams.get("m") ?? "historico";
        try {
          if (alvo === "ultimo-erro") {
            const e = consumeLastCapturedError();
            return Response.json({ ok: true, erro: e === undefined ? null : describeError(e) });
          }
          if (alvo === "manifest") {
            const m = await import(/* @vite-ignore */ "tanstack-start-server-fn-manifest:v" as string);
            return Response.json({ ok: true, ids: Object.keys((m as { default: Record<string, unknown> }).default) });
          }
          const mod = await import(/* @vite-ignore */ `/src/lib/${alvo}.functions.ts?tss-serverfn-split`);
          return Response.json({ ok: true, chaves: Object.keys(mod) });
        } catch (e) {
          const err = e as Error;
          return Response.json({ ok: false, msg: err?.message, stack: err?.stack?.slice(0, 1500) });
        }
      },
    },
  },
});