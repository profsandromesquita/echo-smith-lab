create or replace function public.falhar_etapa(_etapa_id uuid, _lease_token uuid, _codigo_erro text, _incerto boolean default false, _sem_retry boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare et record; ex record; novo text;
begin
  if not public.etapa_e_minha(_etapa_id) then raise exception 'Recurso indisponivel.'; end if;
  select execucao_id into et from public.execucao_etapas where id = _etapa_id;
  select * into ex from public.execucoes where id = et.execucao_id for update;
  select * into et from public.execucao_etapas where id = _etapa_id for update;
  if et.estado <> 'em_execucao' or et.lease_token is distinct from _lease_token then
    raise exception 'Lease invalido ou expirado.';
  end if;
  update public.execucao_tentativas set encerrada_em = now(),
    status = case when _incerto then 'unknown_outcome' else 'erro' end, codigo_erro = _codigo_erro
    where etapa_id = _etapa_id and encerrada_em is null;

  if ex.estado in ('cancelamento_solicitado','cancelada') then
    update public.execucao_etapas set lease_token = null, lease_ate = null, proxima_tentativa_em = null,
      ultimo_codigo_erro = 'descartada_por_cancelamento' where id = _etapa_id;
    perform public.aplicar_transicao_etapa(_etapa_id, 'cancelada', 'resposta tardia descartada apos cancelamento');
    perform public.reconciliar_grafo_execucao(et.execucao_id);
    return 'cancelada';
  end if;

  if _incerto then
    update public.execucao_etapas set lease_token = null, lease_ate = null, ultimo_codigo_erro = 'unknown_outcome' where id = _etapa_id;
    perform public.aplicar_transicao_etapa(_etapa_id, 'resultado_incerto', 'persistencia externa nao confirmada');
    perform public.reconciliar_grafo_execucao(et.execucao_id);
    return 'resultado_incerto';
  end if;

  if _sem_retry or et.tentativas >= et.tentativas_limite then
    update public.execucao_etapas set lease_token = null, lease_ate = null, proxima_tentativa_em = null,
      ultimo_codigo_erro = _codigo_erro where id = _etapa_id;
    perform public.aplicar_transicao_etapa(_etapa_id, 'falhou',
      case when _sem_retry then 'falha definitiva sem nova tentativa' else 'tentativas esgotadas' end);
    novo := 'falhou';
    perform public.reconciliar_grafo_execucao(et.execucao_id);
  else
    update public.execucao_etapas set lease_token = null, lease_ate = null, ultimo_codigo_erro = _codigo_erro,
      proxima_tentativa_em = now() + ((et.backoff_base_ms * power(2, greatest(et.tentativas - 1, 0)))::integer || ' milliseconds')::interval
      where id = _etapa_id;
    perform public.aplicar_transicao_etapa(_etapa_id, 'pendente', 'nova tentativa agendada');
    novo := 'pendente';
  end if;
  return novo;
end; $$;