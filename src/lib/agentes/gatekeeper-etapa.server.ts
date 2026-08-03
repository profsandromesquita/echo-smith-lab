/**
 * Roteamento da etapa Gatekeeper: decide entre adaptador simulado e provedor real,
 * revalida consentimento no servidor e monta a entrada autorizada.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  executarGatekeeperReal,
  type ConfigGatekeeper,
  type ResultadoGatekeeper,
} from "@/lib/agentes/gatekeeper.server";

type Cliente = SupabaseClient<Database>;

export interface ConfiguracaoEtapa {
  provedor: string;
  config: ConfigGatekeeper;
}

/** Lê a configuração publicada vinculada à etapa. Nunca lê credenciais do banco. */
export async function lerConfiguracaoEtapa(
  supabase: Cliente,
  registryVersaoId: string | null,
): Promise<ConfiguracaoEtapa | null> {
  if (!registryVersaoId) return null;
  // O Registry é configuração da plataforma, não dado do usuário: só admin_tecnico
  // lê por RLS. A etapa precisa da versão fixada mesmo para uma conta comum, então
  // a leitura acontece pelo cliente privilegiado, restrita ao id já fixado na etapa.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("registry_versoes")
    .select("provedor, modelo, instrucoes_sistema, parametros, limite_entrada, limite_saida, timeout_ms")
    .eq("id", registryVersaoId)
    .maybeSingle();
  if (!data) return null;

  const parametros = (data.parametros ?? {}) as Record<string, unknown>;
  const esforco = String(parametros['reasoning_effort'] ?? "low");
  return {
    provedor: data.provedor,
    config: {
      modelo: data.modelo,
      instrucoesSistema: data.instrucoes_sistema ?? "",
      esforcoRaciocinio: esforco === "medium" ? "medium" : "low",
      limiteEntrada: data.limite_entrada,
      limiteSaida: data.limite_saida,
      timeoutMs: data.timeout_ms,
    },
  };
}

/** Revalidação server-side da fotografia de consentimento da execução. */
export async function briefingAutorizado(
  supabase: Cliente,
  fotografiaId: string | null,
): Promise<boolean> {
  if (!fotografiaId) return false;
  const { data } = await supabase
    .from("fotografias_consentimento")
    .select("id")
    .eq("fotografia_id", fotografiaId)
    .eq("categoria", "briefing")
    .eq("decisao", "concedido")
    .limit(1);
  return (data ?? []).length > 0;
}

/** Só o que foi autorizado: briefing do chat e parâmetros do pedido. Sem memória local. */
export async function montarEntradaAutorizada(
  supabase: Cliente,
  chatId: string | null,
  formato: string,
) {
  let briefing = "";
  let contexto: string[] = [];
  if (chatId) {
    const { data } = await supabase
      .from("mensagens")
      .select("autor, texto")
      .eq("chat_id", chatId)
      .order("criado_em", { ascending: false })
      .limit(8);
    const ordenadas = (data ?? []).slice().reverse();
    const doUsuario = ordenadas.filter((m) => m.autor === "usuario");
    briefing = doUsuario.at(-1)?.texto ?? "";
    contexto = ordenadas.map((m) => `${m.autor}: ${m.texto}`).slice(0, 6);
  }
  return { formato, briefing, parametros: { formato }, contextoConversa: contexto };
}

export interface DesfechoGatekeeper {
  resultado: ResultadoGatekeeper;
  modelo: string;
}

export async function executarEtapaGatekeeper(
  supabase: Cliente,
  args: {
    configuracao: ConfiguracaoEtapa;
    chatId: string | null;
    formato: string;
    etapaId: string;
    tentativa: number;
    sinal?: AbortSignal;
  },
): Promise<DesfechoGatekeeper> {
  const entrada = await montarEntradaAutorizada(supabase, args.chatId, args.formato);
  const resultado = await executarGatekeeperReal(
    args.configuracao.config,
    entrada,
    `${args.etapaId}:${args.tentativa}`,
    args.sinal,
  );
  return { resultado, modelo: args.configuracao.config.modelo };
}

/** Payload persistido: sem briefing bruto, sem prompt, sem raciocínio do modelo. */
export function resultadosDoGatekeeper(saida: {
  suficiente: boolean;
  lacunas: string[];
  pergunta_de_refinamento: string | null;
  briefing_estruturado: Record<string, string> | null;
  resumo_seguro: string;
  sinalizadores: string[];
}, modelo: string) {
  return [
    {
      tipo: "diretriz" as const,
      payload: {
        campo: "gatekeeper",
        provedor: "openai",
        modelo,
        suficiente: saida.suficiente,
        lacunas: saida.lacunas,
        pergunta_de_refinamento: saida.pergunta_de_refinamento,
        briefing_estruturado: saida.briefing_estruturado,
        resumo: saida.resumo_seguro,
        sinalizadores: saida.sinalizadores,
      },
    },
  ];
}