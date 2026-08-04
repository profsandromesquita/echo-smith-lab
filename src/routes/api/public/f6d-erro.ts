// TEMPORÁRIO — diagnóstico da validação F6D. Remover ao final.
import { createFileRoute } from "@tanstack/react-router";
import { consumeLastCapturedError, describeError } from "@/lib/error-capture";

export const Route = createFileRoute("/api/public/f6d-erro")({
  server: {
    handlers: {
      GET: async () => {
        const e = consumeLastCapturedError();
        return Response.json({ erro: e === undefined ? null : describeError(e) });
      },
    },
  },
});