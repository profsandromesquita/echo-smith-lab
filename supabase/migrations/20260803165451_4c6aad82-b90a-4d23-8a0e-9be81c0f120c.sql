create or replace function public.concluir_etapa(_etapa_id uuid, _lease_token uuid, _duracao_ms integer, _resultados jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare et record; ex record; r jsonb; restantes integer; falhas integer;
begin
  if not public.etapa_e_minha(_etapa_id) then raise exception 'Recurso indisponivel.'; end if;
  select * into et from public.execucao_etapas where id = _etapa_id for update;
  if et.estado <> 'em_execucao' or et.lease_token is distinct from _lease_token or et.lease_ate < now() then
    raise exception 'Lease invalido ou expirado.';
  end if;

  select * into ex from public.execucoes where id = et.execucao_id;
  if ex.estado in ('cancelamento_solicitado','cancelada') then
    update public.execucao_tentativas set encerrada_em = now(), status = 'erro', codigo_erro = 'descartada_por_cancelamento'
      where etapa_id = _etapa_id and encerrada_em is null;
    update public.execucao_etapas set lease_token = null, lease_ate = null, proxima_tentativa_em = null,
      ultimo_codigo_erro = 'descartada_por_cancelamento' where id = _etapa_id;
    perform public.aplicar_transicao_etapa(_etapa_id, 'cancelada', 'resposta tardia descartada apos cancelamento');
    if not exists (select 1 from public.execucao_etapas where execucao_id = et.execucao_id and estado = 'em_execucao') then
      perform public.aplicar_transicao_execucao(et.execucao_id, 'cancelada', 'sem etapas em curso');
    end if;
    return;
  end if;

  for r in select * from jsonb_array_elements(coalesce(_resultados, '[]'::jsonb)) loop
    insert into public.execucao_resultados (etapa_id, tipo, payload, versao, aprovado, nota_final)
      values (_etapa_id, r->>'tipo', coalesce(r->'payload','{}'::jsonb), coalesce(r->>'versao','original'),
              (r->>'aprovado')::boolean, (r->>'nota_final')::numeric);
  end loop;
  update public.execucao_tentativas set encerrada_em = now(), status = 'ok' where etapa_id = _etapa_id and encerrada_em is null;
  update public.execucao_etapas set lease_token = null, lease_ate = null, duracao_ms = _duracao_ms, ultimo_codigo_erro = null
    where id = _etapa_id;
  perform public.aplicar_transicao_etapa(_etapa_id, 'concluida', 'etapa concluida');

  select * into ex from public.execucoes where id = et.execucao_id;
  select count(*) into restantes from public.execucao_etapas
    where execucao_id = et.execucao_id and estado in ('pendente','em_execucao','resultado_incerto');
  select count(*) into falhas from public.execucao_etapas
    where execucao_id = et.execucao_id and estado in ('falhou','bloqueada','cancelada');
  if restantes = 0 and ex.estado = 'em_processamento' then
    perform public.aplicar_transicao_execucao(et.execucao_id, case when falhas > 0 then 'parcialmente_concluida' else 'concluida' end, 'fim do pipeline');
  end if;
end;
$function$;

create or replace function public.falhar_etapa(_etapa_id uuid, _lease_token uuid, _codigo_erro text, _incerto boolean)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare et record; ex record; novo text; restantes integer;
begin
  if not public.etapa_e_minha(_etapa_id) then raise exception 'Recurso indisponivel.'; end if;
  select * into et from public.execucao_etapas where id = _etapa_id for update;
  if et.estado <> 'em_execucao' or et.lease_token is distinct from _lease_token then
    raise exception 'Lease invalido ou expirado.';
  end if;
  update public.execucao_tentativas set encerrada_em = now(),
    status = case when _incerto then 'unknown_outcome' else 'erro' end, codigo_erro = _codigo_erro
    where etapa_id = _etapa_id and encerrada_em is null;

  select * into ex from public.execucoes where id = et.execucao_id;
  if ex.estado in ('cancelamento_solicitado','cancelada') then
    update public.execucao_etapas set lease_token = null, lease_ate = null, proxima_tentativa_em = null,
      ultimo_codigo_erro = 'descartada_por_cancelamento' where id = _etapa_id;
    perform public.aplicar_transicao_etapa(_etapa_id, 'cancelada', 'resposta tardia descartada apos cancelamento');
    if not exists (select 1 from public.execucao_etapas where execucao_id = et.execucao_id and estado = 'em_execucao') then
      perform public.aplicar_transicao_execucao(et.execucao_id, 'cancelada', 'sem etapas em curso');
    end if;
    return 'cancelada';
  end if;

  if _incerto then
    update public.execucao_etapas set lease_token = null, lease_ate = null, ultimo_codigo_erro = 'unknown_outcome' where id = _etapa_id;
    perform public.aplicar_transicao_etapa(_etapa_id, 'resultado_incerto', 'persistencia externa nao confirmada');
    return 'resultado_incerto';
  end if;

  if et.tentativas >= et.tentativas_limite then
    update public.execucao_etapas set lease_token = null, lease_ate = null, ultimo_codigo_erro = _codigo_erro where id = _etapa_id;
    perform public.aplicar_transicao_etapa(_etapa_id, 'falhou', 'tentativas esgotadas');
    novo := 'falhou';
    select count(*) into restantes from public.execucao_etapas
      where execucao_id = et.execucao_id and estado in ('pendente','em_execucao','resultado_incerto');
    if restantes = 0 then
      perform public.aplicar_transicao_execucao(et.execucao_id,
        case when exists (select 1 from public.execucao_etapas where execucao_id = et.execucao_id and estado = 'concluida')
             then 'parcialmente_concluida' else 'falhou' end, 'falha definitiva');
    end if;
  else
    update public.execucao_etapas set lease_token = null, lease_ate = null, ultimo_codigo_erro = _codigo_erro,
      proxima_tentativa_em = now() + ((et.backoff_base_ms * power(2, greatest(et.tentativas - 1, 0)))::integer || ' milliseconds')::interval
      where id = _etapa_id;
    perform public.aplicar_transicao_etapa(_etapa_id, 'pendente', 'nova tentativa agendada');
    novo := 'pendente';
  end if;
  return novo;
end;
$function$;