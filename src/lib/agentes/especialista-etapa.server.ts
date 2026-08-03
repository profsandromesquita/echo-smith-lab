/**
 * Roteamento das etapas Hook Master e Headline Architect com provedor real (F6B).
 * Revalida consentimento no servidor, monta somente a entrada autorizada e
 * converte a saída no mesmo formato de variação já usado pelo pipeline.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { fatoresDe } from "@/lib/adaptadores-simulados";
import {
  executarHeadlineArchitect,
  MAX_CARACTERES_HEADLINE,
} from "@/lib/agentes/headline-architect.server";
import { executarHookMaster, MAX_CARACTERES_HOOK } from "@/lib/agentes/hook-master.server";
import type {
  ConfigEspecialista,
  EntradaEspecialista,
  ResultadoEspecialista,
  VariacaoGerada,
} from "@/lib/agentes/especialista-base.server";
import type { NivelEsforco } from "@/lib/provedores/tipos";
import { lerVersaoDaEtapa } from "@/lib/agentes/registry-etapa.server";
import {
  executarCtaSpecialist,
  MAX_CARACTERES_CTA,
  type CtaGerado,
} from "@/lib/agentes/cta-specialist.server";
import type { ResultadoEstruturado } from "@/lib/agentes/especialista-base.server";

type Cliente = SupabaseClient<Database>;

export const ESFORCOS_ANTHROPIC: readonly NivelEsforco[] = ["low", "medium", "high", "xhigh", "max"];

export function normalizarEsforco(valor: unknown): NivelEsforco {
  const v = String(valor ?? "medium") as NivelEsforco;
  return ESFORCOS_ANTHROPIC.includes(v) ? v : "medium";
}

export interface ConfiguracaoEtapaEspecialista {
  provedor: string;
  config: ConfigEspecialista;
}

/** Lê a configuração publicada vinculada à etapa. Nunca lê credenciais do banco. */
export async function lerConfiguracaoEspecialista(
  supabase: Cliente,
  etapaId: string | null,
): Promise<ConfiguracaoEtapaEspecialista | null> {
  if (!etapaId) return null;
  const versao = await lerVersaoDaEtapa(supabase, etapaId);
  if (!versao) return null;

  return {
    provedor: versao.provedor,
    config: {
      modelo: versao.modelo,
      instrucoesSistema: versao.instrucoesSistema,
      esforco: normalizarEsforco(versao.parametros['effort']),
      limiteEntrada: versao.limiteEntrada,
      limiteSaida: versao.limiteSaida,
      timeoutMs: versao.timeoutMs,
    },
  };
}

/** Revalidação server-side de uma categoria na fotografia de consentimento da execução. */
export async function categoriaAutorizada(
  supabase: Cliente,
  fotografiaId: string | null,
  categoria: string,
): Promise<boolean> {
  if (!fotografiaId) return false;
  const { data } = await supabase
    .from("fotografias_consentimento")
    .select("id")
    .eq("fotografia_id", fotografiaId)
    .eq("categoria", categoria)
    .eq("decisao", "concedido")
    .limit(1);
  return (data ?? []).length > 0;
}

/** Monta só o que foi autorizado: briefing, diretriz da etapa anterior e voz de marca. */
export async function montarEntradaEspecialista(
  supabase: Cliente,
  args: {
    execucaoId: string;
    chatId: string | null;
    formato: string;
    vozAutorizada: boolean;
  },
): Promise<EntradaEspecialista> {
  let briefing = "";
  if (args.chatId) {
    const { data } = await supabase
      .from("mensagens")
      .select("autor, texto")
      .eq("chat_id", args.chatId)
      .eq("autor", "usuario")
      .order("criado_em", { ascending: false })
      .limit(1);
    briefing = data?.[0]?.texto ?? "";
  }

  const { data: idsEtapas } = await supabase
    .from("execucao_etapas")
    .select("id")
    .eq("execucao_id", args.execucaoId);
  const { data: diretrizes } = await supabase
    .from("execucao_resultados")
    .select("payload")
    .in("etapa_id", (idsEtapas ?? []).map((e) => e.id))
    .eq("tipo", "diretriz")
    .order("criado_em");

  let diretrizPsicologica: string | null = null;
  let resumoGatekeeper: string | null = null;
  for (const d of diretrizes ?? []) {
    const p = (d.payload ?? {}) as Record<string, unknown>;
    if (p['campo'] === "diretriz_estrategica") diretrizPsicologica = String(p['texto'] ?? "");
    if (p['campo'] === "gatekeeper" && p['resumo']) resumoGatekeeper = String(p['resumo']);
  }

  let vozMarca: EntradaEspecialista["vozMarca"] = null;
  if (args.vozAutorizada) {
    let perfilId: string | null = null;
    let pastaId: string | null = null;
    if (args.chatId) {
      const { data: chat } = await supabase
        .from("chats")
        .select("perfil_marca_id, pasta_id")
        .eq("id", args.chatId)
        .maybeSingle();
      perfilId = chat?.perfil_marca_id ?? null;
      pastaId = chat?.pasta_id ?? null;
    }
    if (!perfilId && pastaId) {
      const { data: pasta } = await supabase
        .from("pastas")
        .select("perfil_marca_id")
        .eq("id", pastaId)
        .maybeSingle();
      perfilId = pasta?.perfil_marca_id ?? null;
    }
    if (!perfilId) {
      const { data: padrao } = await supabase
        .from("perfis_marca")
        .select("id")
        .eq("padrao", true)
        .maybeSingle();
      perfilId = padrao?.id ?? null;
    }
    if (perfilId) {
      const { data: perfil } = await supabase
        .from("perfis_marca")
        .select("nome, tom_de_voz, posicionamento")
        .eq("id", perfilId)
        .maybeSingle();
      if (perfil) vozMarca = perfil;
    }
  }

  return {
    formato: args.formato,
    briefing: resumoGatekeeper ? `${briefing}\n\nResumo aprovado: ${resumoGatekeeper}` : briefing,
    diretrizPsicologica,
    vozMarca,
    parametros: { formato: args.formato },
  };
}

const FORMATO_DE_SAIDA: Record<string, string> = {
  hook_master: "hook",
  headline_architect: "headline",
  cta_specialist: "cta",
};

export async function executarEtapaEspecialista(
  supabase: Cliente,
  args: {
    papel: "hook_master" | "headline_architect";
    configuracao: ConfiguracaoEtapaEspecialista;
    execucaoId: string;
    chatId: string | null;
    formato: string;
    vozAutorizada: boolean;
    etapaId: string;
    tentativa: number;
    sinal?: AbortSignal;
  },
): Promise<{ resultado: ResultadoEspecialista; modelo: string }> {
  const entrada = await montarEntradaEspecialista(supabase, {
    execucaoId: args.execucaoId,
    chatId: args.chatId,
    formato: args.formato,
    vozAutorizada: args.vozAutorizada,
  });

  const comum = {
    config: args.configuracao.config,
    entrada,
    chaveIdempotencia: `${args.etapaId}:${args.tentativa}`,
    ...(args.sinal ? { sinal: args.sinal } : {}),
  };

  const resultado =
    args.papel === "hook_master"
      ? await executarHookMaster(comum)
      : await executarHeadlineArchitect(comum);

  return { resultado, modelo: args.configuracao.config.modelo };
}

/** Etapa do CTA Specialist: mesma entrada autorizada, contrato de saída próprio. */
export async function executarEtapaCta(
  supabase: Cliente,
  args: {
    configuracao: ConfiguracaoEtapaEspecialista;
    execucaoId: string;
    chatId: string | null;
    formato: string;
    vozAutorizada: boolean;
    etapaId: string;
    tentativa: number;
    sinal?: AbortSignal;
  },
): Promise<{ resultado: ResultadoEstruturado<{ variacoes: CtaGerado[] }>; modelo: string }> {
  const entrada = await montarEntradaEspecialista(supabase, {
    execucaoId: args.execucaoId,
    chatId: args.chatId,
    formato: args.formato,
    vozAutorizada: args.vozAutorizada,
  });

  const resultado = await executarCtaSpecialist({
    config: args.configuracao.config,
    entrada,
    chaveIdempotencia: `${args.etapaId}:${args.tentativa}`,
    ...(args.sinal ? { sinal: args.sinal } : {}),
  });

  return { resultado, modelo: args.configuracao.config.modelo };
}

/** Payload do CTA: identificador, índice e fatores são gerados pelo servidor. */
export function resultadosDoCta(
  execucaoId: string,
  formatoExec: string,
  modelo: string,
  variacoes: CtaGerado[],
) {
  return variacoes.map((v, i) => {
    const id = `cta_specialist-${i + 1}`;
    return {
      tipo: "variacao" as const,
      versao: "original" as const,
      payload: {
        id,
        variacao_id: id,
        papel: "cta_specialist",
        provedor: "anthropic",
        modelo,
        formato: FORMATO_DE_SAIDA['cta_specialist'] ?? formatoExec,
        texto: v.texto.slice(0, MAX_CARACTERES_CTA),
        tipo_acao: v.tipo_acao,
        intensidade: v.intensidade,
        intencao: v.intencao,
        formato_destino: v.formato_destino,
        alerta_promessa: v.alerta_promessa,
        alerta_cliche: v.alerta_cliche,
        justificativa: v.justificativa,
        indice: i + 1,
        fatores: fatoresDe(`${execucaoId}:${id}`),
      },
    };
  });
}

/** Payload persistido: texto entregue, sem prompt, sem briefing bruto, sem raciocínio. */
export function resultadosDoEspecialista(
  papel: "hook_master" | "headline_architect",
  execucaoId: string,
  formatoExec: string,
  modelo: string,
  variacoes: VariacaoGerada[],
) {
  const limite = papel === "hook_master" ? MAX_CARACTERES_HOOK : MAX_CARACTERES_HEADLINE;
  return variacoes.map((v, i) => {
    const id = `${papel}-${i + 1}`;
    return {
      tipo: "variacao" as const,
      versao: "original" as const,
      payload: {
        id,
        variacao_id: id,
        papel,
        provedor: "anthropic",
        modelo,
        formato: FORMATO_DE_SAIDA[papel] ?? formatoExec,
        texto: v.texto.slice(0, limite),
        angulo: v.angulo,
        justificativa: v.justificativa,
        indice: i + 1,
        fatores: fatoresDe(`${execucaoId}:${id}`),
      },
    };
  });
}