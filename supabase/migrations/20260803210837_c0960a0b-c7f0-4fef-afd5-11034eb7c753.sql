drop function if exists public.concluir_etapa(uuid, uuid, integer, jsonb);

create or replace function public.concluir_etapa(_etapa_id uuid, _lease_token uuid, _duracao_ms integer, _resultados jsonb, _parcial boolean default false)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare et record; ex record; r jsonb; restantes integer; falhas integer; parciais integer;
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
  update public.execucao_etapas set lease_token = null, lease_ate = null, duracao_ms = _duracao_ms,
    ultimo_codigo_erro = case when coalesce(_parcial, false) then 'auditoria_parcial' else null end
    where id = _etapa_id;
  perform public.aplicar_transicao_etapa(_etapa_id, 'concluida', 'etapa concluida');

  select * into ex from public.execucoes where id = et.execucao_id;
  select count(*) into restantes from public.execucao_etapas
    where execucao_id = et.execucao_id and estado in ('pendente','em_execucao','resultado_incerto');
  select count(*) into falhas from public.execucao_etapas
    where execucao_id = et.execucao_id and estado in ('falhou','bloqueada','cancelada');
  select count(*) into parciais from public.execucao_etapas
    where execucao_id = et.execucao_id and estado = 'concluida' and ultimo_codigo_erro = 'auditoria_parcial';
  if restantes = 0 and ex.estado = 'em_processamento' then
    perform public.aplicar_transicao_execucao(et.execucao_id,
      case when falhas > 0 or parciais > 0 then 'parcialmente_concluida' else 'concluida' end, 'fim do pipeline');
  end if;
end;
$function$;