import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  executarAdaptadorSimulado,
  type PapelAgente,
  type ResultadoAnterior,
} from "@/lib/adaptadores-simulados";
import {
  briefingAutorizado,
  executarEtapaGatekeeper,
  lerConfiguracaoEtapa,
  resultadosDoGatekeeper,
} from "@/lib/agentes/gatekeeper-etapa.server";
import {
  categoriaAutorizada,
  executarEtapaEspecialista,
  executarEtapaCta,
  lerConfiguracaoEspecialista,
  resultadosDoEspecialista,
  resultadosDoCta,
} from "@/lib/agentes/especialista-etapa.server";
import {
  executarEtapaAuditor,
  executarEtapaPsicologia,
  lerConfiguracaoOpenAI,
  resultadosDaPsicologia,
} from "@/lib/agentes/openai-etapa.server";
import { ERROS_SEM_RETRY, MENSAGEM_SEGURA } from "@/lib/provedores/tipos";

const uuid = z.string().uuid();
const formato = z.enum(["hook", "headline_video", "headline_imagem", "cta", "pacote_completo"]);
const categoria = z.enum([
  "briefing",
  "resumo_voz_marca",
  "texto_gerado",
  "metadados",
  "variacoes_para_auditoria",
]);

function erro(mensagem: string): never {
  throw new Error(mensagem);
}

/**
 * Cria execução, fotografia de consentimento, permissões, vínculo com as versões
 * publicadas do Registry e etapas roteadas — tudo na mesma transação do banco.
 */
export const criarExecucao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        chatId: uuid.nullable().default(null),
        formato,
        permissoesUnicas: z
          .array(
            z
              .object({
                categoria,
                provedor: z.string().trim().min(1).max(60),
                etapa: z.string().trim().min(1).max(60),
                finalidade: z.string().trim().min(1).max(200),
                decisao: z.enum(["concedido", "recusado"]),
              })
              .strict(),
          )
          .max(12)
          .default([]),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const [prefs, chat, termos, consentimentos] = await Promise.all([
      context.supabase
        .from("preferencias_privacidade")
        .select("modo_padrao")
        .eq("user_id", context.userId)
        .maybeSingle(),
      data.chatId
        ? context.supabase.from("chats").select("modo_privacidade").eq("id", data.chatId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      context.supabase.from("termos_consentimento").select("id, chave, versao").eq("vigente", true),
      context.supabase
        .from("consentimentos")
        .select("escopo, escopo_id, categoria, provedor, etapa, finalidade, estado")
        .eq("estado", "concedido"),
    ]);
    if (termos.error) erro(termos.error.message);

    const modo =
      (chat.data as { modo_privacidade?: string | null } | null)?.modo_privacidade ??
      prefs.data?.modo_padrao ??
      "local_estrita";

    const porChave = new Map((termos.data ?? []).map((t) => [t.chave, t]));

    const vigentes = (consentimentos.data ?? []).filter(
      (c) => c.escopo === "conta" || (c.escopo === "chat" && c.escopo_id === data.chatId),
    );

    const chaves = new Set<string>();
    const permissoes: Array<Record<string, unknown>> = [];
    const adicionar = (p: {
      categoria: string;
      provedor: string;
      etapa: string;
      finalidade: string;
      decisao: string;
      origem: string;
    }) => {
      const t = porChave.get(p.categoria);
      if (!t) return;
      const chave = `${p.categoria}|${p.provedor}|${p.etapa}`;
      if (chaves.has(chave)) return;
      chaves.add(chave);
      permissoes.push({ ...p, termos_id: t.id, termos_versao: t.versao });
    };

    for (const p of data.permissoesUnicas) adicionar({ ...p, origem: "modal" });
    for (const c of vigentes) {
      adicionar({
        categoria: c.categoria,
        provedor: c.provedor,
        etapa: c.etapa,
        finalidade: c.finalidade,
        decisao: "concedido",
        origem: "sistema",
      });
    }

    const { data: id, error } = await context.supabase.rpc("criar_execucao", {
      _chat_id: data.chatId as string,
      _formato: data.formato,
      _snapshot_chat: { chat_id: data.chatId, formato: data.formato },
      _snapshot_marca: {},
      _snapshot_privacidade: { modo },
      _modo_privacidade: modo,
      _permissoes: permissoes as never,
    });
    if (error) erro(error.message);
    return { id: id as string, modo };
  });

export const obterExecucao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).strict().parse(d))
  .handler(async ({ context, data }) => {
    const { data: execucao, error } = await context.supabase
      .from("execucoes")
      .select(
        "id, chat_id, formato_solicitado, estado, custo_estimado, criada_em, iniciada_em, finalizada_em, cancelamento_solicitado_em, fotografia_id, snapshot_registry, motivo_falha",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error || !execucao) erro("Execução indisponível.");

    const [etapas, eventos, resultados] = await Promise.all([
      context.supabase
        .from("execucao_etapas")
        .select(
          "id, papel, ordem, estado, categoria_requerida, tentativas, tentativas_limite, proxima_tentativa_em, ultimo_codigo_erro, duracao_ms, registry_versao_id",
        )
        .eq("execucao_id", data.id)
        .order("ordem"),
      context.supabase
        .from("execucao_eventos")
        .select("id, etapa_id, de, para, motivo, ocorrido_em")
        .eq("execucao_id", data.id)
        .order("ocorrido_em", { ascending: false })
        .limit(60),
      context.supabase
        .from("execucao_resultados")
        .select("id, etapa_id, tipo, payload, versao, aprovado, nota_final, criado_em")
        .in(
          "etapa_id",
          (
            await context.supabase.from("execucao_etapas").select("id").eq("execucao_id", data.id)
          ).data?.map((e) => e.id) ?? [],
        )
        .order("criado_em"),
    ]);

    return {
      execucao,
      etapas: etapas.data ?? [],
      eventos: eventos.data ?? [],
      resultados: resultados.data ?? [],
    };
  });

export const execucaoAtivaDoChat = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ chatId: uuid }).strict().parse(d))
  .handler(async ({ context, data }) => {
    const { data: linha } = await context.supabase
      .from("execucoes")
      .select("id, estado")
      .eq("chat_id", data.chatId)
      .order("criada_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    return linha ?? null;
  });

/**
 * O cliente apenas pede avanço. O servidor escolhe a etapa elegível, concede o lease,
 * roda o adaptador simulado e decide conclusão, retry com backoff ou falha definitiva.
 */
export const avancarExecucao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        // apenas para exercitar caminhos de erro em teste; nunca chama provedor real
        simular: z.enum(["ok", "erro", "incerto"]).default("ok"),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: reserva, error } = await context.supabase.rpc("reservar_etapa", {
      _execucao_id: data.id,
    });
    if (error) erro(error.message);
    const etapa = (reserva as Array<{ etapa_id: string; papel: string; lease_token: string; tentativa: number }> | null)?.[0];
    if (!etapa) return { avancou: false as const };

    const { data: execucao } = await context.supabase
      .from("execucoes")
      .select("formato_solicitado, chat_id, fotografia_id")
      .eq("id", data.id)
      .maybeSingle();

    const formatoExec = execucao?.formato_solicitado ?? "hook";

    // ---- Gatekeeper com provedor real (F6A). Demais papéis seguem simulados. ----
    if (etapa.papel === "gatekeeper") {
      const { data: linhaEtapa } = await context.supabase
        .from("execucao_etapas")
        .select("registry_versao_id")
        .eq("id", etapa.etapa_id)
        .maybeSingle();
      const configuracao = await lerConfiguracaoEtapa(
        context.supabase,
        linhaEtapa?.registry_versao_id ?? null,
      );

      if (configuracao && configuracao.provedor === "openai") {
        const autorizado = await briefingAutorizado(context.supabase, execucao?.fotografia_id ?? null);
        if (!autorizado) {
          await context.supabase.rpc("falhar_etapa", {
            _etapa_id: etapa.etapa_id,
            _lease_token: etapa.lease_token,
            _codigo_erro: "autorizacao_ausente",
            _incerto: false,
            _sem_retry: true,
          });
          return { avancou: true as const, papel: etapa.papel, desfecho: "falhou", codigoErro: "autorizacao_ausente" };
        }

        const { resultado, modelo } = await executarEtapaGatekeeper(context.supabase, {
          configuracao,
          chatId: execucao?.chat_id ?? null,
          formato: formatoExec,
          etapaId: etapa.etapa_id,
          tentativa: etapa.tentativa,
        });

        let desfechoReal = "concluida";
        let statusEvento: "ok" | "erro" | "unknown_outcome" = "ok";
        let codigoErro: string | null = null;

        if (resultado.ok) {
          const { error: eConcluir } = await context.supabase.rpc("concluir_etapa", {
            _etapa_id: etapa.etapa_id,
            _lease_token: etapa.lease_token,
            _duracao_ms: resultado.duracaoMs,
            _resultados: resultadosDoGatekeeper(resultado.saida, modelo) as never,
          });
          if (eConcluir) {
            // a chamada externa pode ter sido processada e cobrada: nunca repetir às cegas
            statusEvento = "unknown_outcome";
            codigoErro = "unknown_outcome";
            desfechoReal = "resultado_incerto";
            await context.supabase.rpc("falhar_etapa", {
              _etapa_id: etapa.etapa_id,
              _lease_token: etapa.lease_token,
              _codigo_erro: "unknown_outcome",
              _incerto: true,
              _sem_retry: false,
            });
          }
        } else {
          statusEvento = "erro";
          codigoErro = resultado.codigo;
          const { data: novo } = await context.supabase.rpc("falhar_etapa", {
            _etapa_id: etapa.etapa_id,
            _lease_token: etapa.lease_token,
            _codigo_erro: resultado.codigo,
            _incerto: false,
            _sem_retry: ERROS_SEM_RETRY.has(resultado.codigo),
          });
          desfechoReal = String(novo ?? "pendente");
        }

        await context.supabase.rpc("registrar_evento_tecnico", {
          _tipo: "etapa",
          _etapa: etapa.papel,
          _provedor: "openai",
          _modelo: modelo,
          _duracao_ms: resultado.duracaoMs,
          _status: statusEvento,
          _codigo_erro: codigoErro as never,
          _tentativas: etapa.tentativa,
          _custo: resultado.uso.custoUsd,
          _chat_id: (execucao?.chat_id ?? null) as never,
          _tokens_entrada: resultado.uso.tokensEntrada,
          _tokens_saida: resultado.uso.tokensSaida,
        });

        return {
          avancou: true as const,
          papel: etapa.papel,
          desfecho: desfechoReal,
          codigoErro,
          mensagem: resultado.ok ? null : MENSAGEM_SEGURA[resultado.codigo],
        };
      }
    }

    // ---- Hook Master e Headline Architect com provedor real (F6B). ----
    if (etapa.papel === "hook_master" || etapa.papel === "headline_architect") {
      const { data: linhaEtapa } = await context.supabase
        .from("execucao_etapas")
        .select("registry_versao_id")
        .eq("id", etapa.etapa_id)
        .maybeSingle();
      const configuracao = await lerConfiguracaoEspecialista(
        context.supabase,
        linhaEtapa?.registry_versao_id ?? null,
      );

      if (configuracao && configuracao.provedor === "anthropic") {
        const fotografiaId = execucao?.fotografia_id ?? null;
        const autorizado = await categoriaAutorizada(context.supabase, fotografiaId, "briefing");
        if (!autorizado) {
          await context.supabase.rpc("falhar_etapa", {
            _etapa_id: etapa.etapa_id,
            _lease_token: etapa.lease_token,
            _codigo_erro: "autorizacao_ausente",
            _incerto: false,
            _sem_retry: true,
          });
          return {
            avancou: true as const,
            papel: etapa.papel,
            desfecho: "falhou",
            codigoErro: "autorizacao_ausente",
          };
        }

        const vozAutorizada = await categoriaAutorizada(
          context.supabase,
          fotografiaId,
          "resumo_voz_marca",
        );

        const { resultado, modelo } = await executarEtapaEspecialista(context.supabase, {
          papel: etapa.papel,
          configuracao,
          execucaoId: data.id,
          chatId: execucao?.chat_id ?? null,
          formato: formatoExec,
          vozAutorizada,
          etapaId: etapa.etapa_id,
          tentativa: etapa.tentativa,
        });

        let desfechoReal = "concluida";
        let statusEvento: "ok" | "erro" | "unknown_outcome" = "ok";
        let codigoErro: string | null = null;

        if (resultado.ok) {
          const { error: eConcluir } = await context.supabase.rpc("concluir_etapa", {
            _etapa_id: etapa.etapa_id,
            _lease_token: etapa.lease_token,
            _duracao_ms: resultado.duracaoMs,
            _resultados: resultadosDoEspecialista(
              etapa.papel,
              data.id,
              formatoExec,
              modelo,
              resultado.variacoes,
            ) as never,
          });
          if (eConcluir) {
            // a chamada externa pode ter sido processada e cobrada: nunca repetir às cegas
            statusEvento = "unknown_outcome";
            codigoErro = "unknown_outcome";
            desfechoReal = "resultado_incerto";
            await context.supabase.rpc("falhar_etapa", {
              _etapa_id: etapa.etapa_id,
              _lease_token: etapa.lease_token,
              _codigo_erro: "unknown_outcome",
              _incerto: true,
              _sem_retry: false,
            });
          }
        } else {
          statusEvento = "erro";
          codigoErro = resultado.codigo;
          const { data: novo } = await context.supabase.rpc("falhar_etapa", {
            _etapa_id: etapa.etapa_id,
            _lease_token: etapa.lease_token,
            _codigo_erro: resultado.codigo,
            _incerto: false,
            _sem_retry: ERROS_SEM_RETRY.has(resultado.codigo),
          });
          desfechoReal = String(novo ?? "pendente");
        }

        await context.supabase.rpc("registrar_evento_tecnico", {
          _tipo: "etapa",
          _etapa: etapa.papel,
          _provedor: "anthropic",
          _modelo: modelo,
          _duracao_ms: resultado.duracaoMs,
          _status: statusEvento,
          _codigo_erro: codigoErro as never,
          _tentativas: etapa.tentativa,
          _custo: resultado.uso.custoUsd,
          _chat_id: (execucao?.chat_id ?? null) as never,
          _tokens_entrada: resultado.uso.tokensEntrada,
          _tokens_saida: resultado.uso.tokensSaida,
        });

        return {
          avancou: true as const,
          papel: etapa.papel,
          desfecho: desfechoReal,
          codigoErro,
          mensagem: resultado.ok ? null : MENSAGEM_SEGURA[resultado.codigo],
        };
      }
    }

    // ---- CTA Specialist com provedor real (F6D). ----
    if (etapa.papel === "cta_specialist") {
      const { data: linhaEtapa } = await context.supabase
        .from("execucao_etapas")
        .select("registry_versao_id")
        .eq("id", etapa.etapa_id)
        .maybeSingle();
      const configuracao = await lerConfiguracaoEspecialista(
        context.supabase,
        linhaEtapa?.registry_versao_id ?? null,
      );

      if (configuracao && configuracao.provedor === "anthropic") {
        const fotografiaId = execucao?.fotografia_id ?? null;
        const autorizado = await categoriaAutorizada(context.supabase, fotografiaId, "briefing");
        if (!autorizado) {
          await context.supabase.rpc("falhar_etapa", {
            _etapa_id: etapa.etapa_id,
            _lease_token: etapa.lease_token,
            _codigo_erro: "autorizacao_ausente",
            _incerto: false,
            _sem_retry: true,
          });
          return {
            avancou: true as const,
            papel: etapa.papel,
            desfecho: "falhou",
            codigoErro: "autorizacao_ausente",
          };
        }

        const vozAutorizada = await categoriaAutorizada(
          context.supabase,
          fotografiaId,
          "resumo_voz_marca",
        );

        const { resultado, modelo } = await executarEtapaCta(context.supabase, {
          configuracao,
          execucaoId: data.id,
          chatId: execucao?.chat_id ?? null,
          formato: formatoExec,
          vozAutorizada,
          etapaId: etapa.etapa_id,
          tentativa: etapa.tentativa,
        });

        let desfechoReal = "concluida";
        let statusEvento: "ok" | "erro" | "unknown_outcome" = "ok";
        let codigoErro: string | null = null;

        if (resultado.ok) {
          const { error: eConcluir } = await context.supabase.rpc("concluir_etapa", {
            _etapa_id: etapa.etapa_id,
            _lease_token: etapa.lease_token,
            _duracao_ms: resultado.duracaoMs,
            _resultados: resultadosDoCta(
              data.id,
              formatoExec,
              modelo,
              resultado.dados.variacoes,
            ) as never,
          });
          if (eConcluir) {
            statusEvento = "unknown_outcome";
            codigoErro = "unknown_outcome";
            desfechoReal = "resultado_incerto";
            await context.supabase.rpc("falhar_etapa", {
              _etapa_id: etapa.etapa_id,
              _lease_token: etapa.lease_token,
              _codigo_erro: "unknown_outcome",
              _incerto: true,
              _sem_retry: false,
            });
          }
        } else {
          statusEvento = "erro";
          codigoErro = resultado.codigo;
          const { data: novo } = await context.supabase.rpc("falhar_etapa", {
            _etapa_id: etapa.etapa_id,
            _lease_token: etapa.lease_token,
            _codigo_erro: resultado.codigo,
            _incerto: false,
            _sem_retry: ERROS_SEM_RETRY.has(resultado.codigo),
          });
          desfechoReal = String(novo ?? "pendente");
        }

        await context.supabase.rpc("registrar_evento_tecnico", {
          _tipo: "etapa",
          _etapa: etapa.papel,
          _provedor: "anthropic",
          _modelo: modelo,
          _duracao_ms: resultado.duracaoMs,
          _status: statusEvento,
          _codigo_erro: codigoErro as never,
          _tentativas: etapa.tentativa,
          _custo: resultado.uso.custoUsd,
          _chat_id: (execucao?.chat_id ?? null) as never,
          _tokens_entrada: resultado.uso.tokensEntrada,
          _tokens_saida: resultado.uso.tokensSaida,
        });

        return {
          avancou: true as const,
          papel: etapa.papel,
          desfecho: desfechoReal,
          codigoErro,
          mensagem: resultado.ok ? null : MENSAGEM_SEGURA[resultado.codigo],
        };
      }
    }

    // ---- Análise psicológica com provedor real (F6C). ----
    if (etapa.papel === "analise_psicologica") {
      const { data: linhaEtapa } = await context.supabase
        .from("execucao_etapas")
        .select("registry_versao_id")
        .eq("id", etapa.etapa_id)
        .maybeSingle();
      const configuracao = await lerConfiguracaoOpenAI(
        context.supabase,
        linhaEtapa?.registry_versao_id ?? null,
        "medium",
      );

      if (configuracao && configuracao.provedor === "openai") {
        const autorizado = await briefingAutorizado(context.supabase, execucao?.fotografia_id ?? null);
        if (!autorizado) {
          await context.supabase.rpc("falhar_etapa", {
            _etapa_id: etapa.etapa_id,
            _lease_token: etapa.lease_token,
            _codigo_erro: "autorizacao_ausente",
            _incerto: false,
            _sem_retry: true,
          });
          return {
            avancou: true as const,
            papel: etapa.papel,
            desfecho: "falhou",
            codigoErro: "autorizacao_ausente",
          };
        }

        const { resultado, modelo } = await executarEtapaPsicologia(context.supabase, {
          configuracao,
          execucaoId: data.id,
          chatId: execucao?.chat_id ?? null,
          formato: formatoExec,
          etapaId: etapa.etapa_id,
          tentativa: etapa.tentativa,
        });

        let desfechoReal = "concluida";
        let statusEvento: "ok" | "erro" | "unknown_outcome" = "ok";
        let codigoErro: string | null = null;

        if (resultado.ok) {
          const { error: eConcluir } = await context.supabase.rpc("concluir_etapa", {
            _etapa_id: etapa.etapa_id,
            _lease_token: etapa.lease_token,
            _duracao_ms: resultado.duracaoMs,
            _resultados: resultadosDaPsicologia(resultado.dados, modelo) as never,
          });
          if (eConcluir) {
            statusEvento = "unknown_outcome";
            codigoErro = "unknown_outcome";
            desfechoReal = "resultado_incerto";
            await context.supabase.rpc("falhar_etapa", {
              _etapa_id: etapa.etapa_id,
              _lease_token: etapa.lease_token,
              _codigo_erro: "unknown_outcome",
              _incerto: true,
              _sem_retry: false,
            });
          }
        } else {
          statusEvento = "erro";
          codigoErro = resultado.codigo;
          const { data: novo } = await context.supabase.rpc("falhar_etapa", {
            _etapa_id: etapa.etapa_id,
            _lease_token: etapa.lease_token,
            _codigo_erro: resultado.codigo,
            _incerto: false,
            _sem_retry: ERROS_SEM_RETRY.has(resultado.codigo),
          });
          desfechoReal = String(novo ?? "pendente");
        }

        await context.supabase.rpc("registrar_evento_tecnico", {
          _tipo: "etapa",
          _etapa: etapa.papel,
          _provedor: "openai",
          _modelo: modelo,
          _duracao_ms: resultado.duracaoMs,
          _status: statusEvento,
          _codigo_erro: codigoErro as never,
          _tentativas: etapa.tentativa,
          _custo: resultado.uso.custoUsd,
          _chat_id: (execucao?.chat_id ?? null) as never,
          _tokens_entrada: resultado.uso.tokensEntrada,
          _tokens_saida: resultado.uso.tokensSaida,
        });

        return {
          avancou: true as const,
          papel: etapa.papel,
          desfecho: desfechoReal,
          codigoErro,
          mensagem: resultado.ok ? null : MENSAGEM_SEGURA[resultado.codigo],
        };
      }
    }

    // ---- Auditoria com provedor real (F6C), em lotes independentes. ----
    if (etapa.papel === "auditor") {
      const { data: linhaEtapa } = await context.supabase
        .from("execucao_etapas")
        .select("registry_versao_id")
        .eq("id", etapa.etapa_id)
        .maybeSingle();
      const configuracao = await lerConfiguracaoOpenAI(
        context.supabase,
        linhaEtapa?.registry_versao_id ?? null,
        "high",
      );

      if (configuracao && configuracao.provedor === "openai") {
        const fotografiaId = execucao?.fotografia_id ?? null;
        const autorizado = await categoriaAutorizada(
          context.supabase,
          fotografiaId,
          "variacoes_para_auditoria",
        );
        if (!autorizado) {
          await context.supabase.rpc("falhar_etapa", {
            _etapa_id: etapa.etapa_id,
            _lease_token: etapa.lease_token,
            _codigo_erro: "autorizacao_ausente",
            _incerto: false,
            _sem_retry: true,
          });
          return {
            avancou: true as const,
            papel: etapa.papel,
            desfecho: "falhou",
            codigoErro: "autorizacao_ausente",
          };
        }

        const vozAutorizada = await categoriaAutorizada(
          context.supabase,
          fotografiaId,
          "resumo_voz_marca",
        );

        const { desfecho, modelo } = await executarEtapaAuditor(context.supabase, {
          configuracao,
          execucaoId: data.id,
          formato: formatoExec,
          vozAutorizada,
          etapaId: etapa.etapa_id,
          tentativa: etapa.tentativa,
        });

        let desfechoReal = "concluida";
        let statusEvento: "ok" | "erro" | "unknown_outcome" = "ok";
        let codigoErro: string | null = null;

        if (desfecho.ok) {
          const { error: eConcluir } = await context.supabase.rpc("concluir_etapa", {
            _etapa_id: etapa.etapa_id,
            _lease_token: etapa.lease_token,
            _duracao_ms: desfecho.duracaoMs,
            _resultados: desfecho.resultados as never,
            _parcial: desfecho.lotesFalhos > 0,
          });
          if (eConcluir) {
            statusEvento = "unknown_outcome";
            codigoErro = "unknown_outcome";
            desfechoReal = "resultado_incerto";
            await context.supabase.rpc("falhar_etapa", {
              _etapa_id: etapa.etapa_id,
              _lease_token: etapa.lease_token,
              _codigo_erro: "unknown_outcome",
              _incerto: true,
              _sem_retry: false,
            });
          } else if (desfecho.lotesFalhos > 0) {
            // auditoria parcial: os lotes válidos continuam persistidos
            codigoErro = "auditoria_parcial";
          }
        } else {
          statusEvento = "erro";
          codigoErro = desfecho.codigo ?? "provider_error";
          const { data: novo } = await context.supabase.rpc("falhar_etapa", {
            _etapa_id: etapa.etapa_id,
            _lease_token: etapa.lease_token,
            _codigo_erro: codigoErro,
            _incerto: false,
            _sem_retry: desfecho.codigo ? ERROS_SEM_RETRY.has(desfecho.codigo) : false,
          });
          desfechoReal = String(novo ?? "pendente");
        }

        await context.supabase.rpc("registrar_evento_tecnico", {
          _tipo: "etapa",
          _etapa: etapa.papel,
          _provedor: "openai",
          _modelo: modelo,
          _duracao_ms: desfecho.duracaoMs,
          _status: statusEvento,
          _codigo_erro: codigoErro as never,
          _tentativas: etapa.tentativa,
          _custo: desfecho.uso.custoUsd,
          _chat_id: (execucao?.chat_id ?? null) as never,
          _tokens_entrada: desfecho.uso.tokensEntrada,
          _tokens_saida: desfecho.uso.tokensSaida,
        });

        return {
          avancou: true as const,
          papel: etapa.papel,
          desfecho: desfechoReal,
          codigoErro,
          mensagem: desfecho.ok ? null : desfecho.mensagemSegura,
        };
      }
    }

    // O adaptador do papel corrente enxerga apenas o que já foi persistido nesta execução.
    const { data: idsEtapas } = await context.supabase
      .from("execucao_etapas")
      .select("id")
      .eq("execucao_id", data.id);
    const { data: anteriores } = await context.supabase
      .from("execucao_resultados")
      .select("tipo, payload, versao, aprovado, nota_final")
      .in("etapa_id", (idsEtapas ?? []).map((e) => e.id))
      .order("criado_em");

    const simulado = executarAdaptadorSimulado(etapa.papel as PapelAgente, {
      execucaoId: data.id,
      formato: formatoExec,
      anteriores: (anteriores ?? []) as ResultadoAnterior[],
    });

    let status: "ok" | "erro" | "unknown_outcome" = "ok";
    let desfecho = "concluida";

    if (data.simular === "ok") {
      const { error: e } = await context.supabase.rpc("concluir_etapa", {
        _etapa_id: etapa.etapa_id,
        _lease_token: etapa.lease_token,
        _duracao_ms: simulado.duracaoMs,
        _resultados: simulado.resultados as never,
      });
      if (e) erro(e.message);
    } else {
      status = data.simular === "incerto" ? "unknown_outcome" : "erro";
      const { data: novo, error: e } = await context.supabase.rpc("falhar_etapa", {
        _etapa_id: etapa.etapa_id,
        _lease_token: etapa.lease_token,
        _codigo_erro: data.simular === "incerto" ? "unknown_outcome" : "provider_error",
        _incerto: data.simular === "incerto",
        _sem_retry: false,
      });
      if (e) erro(e.message);
      desfecho = String(novo);
    }

    await context.supabase.rpc("registrar_evento_tecnico", {
      _tipo: "etapa",
      _etapa: etapa.papel,
      _provedor: "simulado",
      _modelo: `mock-${etapa.papel}`,
      _duracao_ms: simulado.duracaoMs,
      _status: status === "ok" ? "ok" : status === "erro" ? "erro" : "unknown_outcome",
      _codigo_erro: (status === "ok" ? null : status === "erro" ? "provider_error" : "unknown_outcome") as never,
      _tentativas: etapa.tentativa,
      _custo: 0,
      _chat_id: null as never,
      _tokens_entrada: 0,
      _tokens_saida: 0,
    });

    return { avancou: true as const, papel: etapa.papel, desfecho, codigoErro: null, mensagem: null };
  });

export const cancelarExecucao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).strict().parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("cancelar_execucao", { _execucao_id: data.id });
    if (error) erro(error.message);
    return { ok: true };
  });

export const resolverIncerto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ etapaId: uuid, retomar: z.boolean() }).strict().parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("resolver_resultado_incerto", {
      _etapa_id: data.etapaId,
      _retomar: data.retomar,
    });
    if (error) erro(error.message);
    return { ok: true };
  });

export const desbloquearEtapas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, categoria }).strict().parse(d))
  .handler(async ({ context, data }) => {
    const { data: n, error } = await context.supabase.rpc("desbloquear_etapas", {
      _execucao_id: data.id,
      _categoria: data.categoria,
    });
    if (error) erro(error.message);
    return { desbloqueadas: Number(n ?? 0) };
  });
