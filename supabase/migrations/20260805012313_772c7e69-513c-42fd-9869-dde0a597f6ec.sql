create or replace function public.resolver_resultado_incerto_v2(_etapa_id uuid, _desfecho text)
returns text language plpgsql security definer set search_path = public as $$
declare et record; exec_id uuid; n integer; esperado integer; distintos integer;
begin
  if _desfecho not in ('falha_confirmada','sucesso_confirmado','refazer_manualmente') then
    raise exception 'Desfecho invalido.';
  end if;
  if not public.etapa_e_minha(_etapa_id) then raise exception 'Recurso indisponivel.'; end if;

  select execucao_id into exec_id from public.execucao_etapas where id = _etapa_id;
  if exec_id is null then raise exception 'Etapa inexistente.'; end if;
  perform 1 from public.execucoes where id = exec_id for update;
  select * into et from public.execucao_etapas where id = _etapa_id for update;
  if et.estado <> 'resultado_incerto' then raise exception 'Etapa nao esta em resultado incerto.'; end if;

  if _desfecho = 'falha_confirmada' then
    update public.execucao_etapas
       set lease_token = null, lease_ate = null, proxima_tentativa_em = null,
           ultimo_codigo_erro = 'unknown_outcome'
     where id = _etapa_id;
    perform public.aplicar_transicao_etapa(_etapa_id, 'falhou', 'resolucao manual: falha_confirmada');

  elsif _desfecho = 'sucesso_confirmado' then
    select count(*) into n from public.execucao_resultados where etapa_id = _etapa_id;
    if n = 0 then raise exception 'Resultado ausente: sucesso nao pode ser confirmado.'; end if;
    if exists (
      select 1 from public.execucao_resultados
       where etapa_id = _etapa_id
         and (jsonb_typeof(payload) <> 'object'
              or payload = '{}'::jsonb
              or coalesce(versao, '') = ''
              or coalesce(payload->>'descartado', 'false') = 'true'
              or coalesce(payload->>'descartada', 'false') = 'true')
    ) then raise exception 'Resultado inconsistente: sucesso nao pode ser confirmado.'; end if;
    if exists (select 1 from public.execucao_resultados where etapa_id = _etapa_id and payload->>'id' is null) then
      raise exception 'Resultado sem identificador: sucesso nao pode ser confirmado.';
    end if;
    select count(distinct payload->>'id') into distintos from public.execucao_resultados where etapa_id = _etapa_id;
    if distintos <> n then raise exception 'Resultado duplicado: sucesso nao pode ser confirmado.'; end if;
    esperado := case when et.papel in ('hook_master','headline_architect','cta_specialist') then 5 else 1 end;
    if n < esperado then raise exception 'Resultado parcial: sucesso nao pode ser confirmado.'; end if;

    update public.execucao_etapas
       set lease_token = null, lease_ate = null, proxima_tentativa_em = null, ultimo_codigo_erro = null
     where id = _etapa_id;
    perform public.aplicar_transicao_etapa(_etapa_id, 'concluida', 'resolucao manual: sucesso_confirmado');

  else
    update public.execucao_etapas
       set lease_token = null, lease_ate = null, proxima_tentativa_em = null, ultimo_codigo_erro = null
     where id = _etapa_id;
    perform public.aplicar_transicao_etapa(
      _etapa_id, 'pendente',
      'resolucao manual: refazer_manualmente (decisao do usuario, risco de custo duplicado; tentativa anterior preservada)');
  end if;

  return public.reconciliar_grafo_execucao(exec_id);
end; $$;