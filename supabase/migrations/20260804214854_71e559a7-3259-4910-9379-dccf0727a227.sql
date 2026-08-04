-- 1) Transições de execução: cancelamento a partir de qualquer estado não final,
--    retorno a aguardando_consentimento e conclusão a partir de reconciliação.
CREATE OR REPLACE FUNCTION public.aplicar_transicao_execucao(_execucao_id uuid, _para text, _motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare de_estado text;
begin
  select estado into de_estado from public.execucoes where id = _execucao_id for update;
  if de_estado is null then raise exception 'Execucao inexistente.'; end if;
  if de_estado = _para then return; end if;
  if not ((de_estado || '>' || _para) = any (array[
    'criada>pronta','criada>aguardando_consentimento','criada>cancelamento_solicitado','criada>cancelada',
    'aguardando_consentimento>pronta','aguardando_consentimento>em_processamento',
    'aguardando_consentimento>cancelamento_solicitado','aguardando_consentimento>cancelada',
    'aguardando_consentimento>falhou','aguardando_consentimento>parcialmente_concluida',
    'pronta>em_processamento','pronta>cancelamento_solicitado','pronta>cancelada','pronta>falhou',
    'em_processamento>concluida','em_processamento>parcialmente_concluida','em_processamento>falhou',
    'em_processamento>aguardando_consentimento',
    'em_processamento>cancelamento_solicitado','em_processamento>cancelada',
    'cancelamento_solicitado>cancelada'])) then
    raise exception 'Transicao de execucao invalida: % -> %', de_estado, _para;
  end if;
  update public.execucoes set estado = _para,
    iniciada_em = case when _para = 'em_processamento' and iniciada_em is null then now() else iniciada_em end,
    finalizada_em = case when _para in ('concluida','parcialmente_concluida','falhou','cancelada') then now() else finalizada_em end,
    cancelamento_solicitado_em = case when _para = 'cancelamento_solicitado' then now() else cancelamento_solicitado_em end
  where id = _execucao_id;
  insert into public.execucao_eventos (execucao_id, de, para, motivo) values (_execucao_id, de_estado, _para, _motivo);
end;
$function$;

-- 2) Transições de etapa: falha propagada a partir de pendente/bloqueada e
--    cancelamento de etapas já falhas quando a execução é cancelada.
CREATE OR REPLACE FUNCTION public.aplicar_transicao_etapa(_etapa_id uuid, _para text, _motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare de_estado text; exec_id uuid;
begin
  select estado, execucao_id into de_estado, exec_id from public.execucao_etapas where id = _etapa_id for update;
  if de_estado is null then raise exception 'Etapa inexistente.'; end if;
  if de_estado = _para then return; end if;
  if not ((de_estado || '>' || _para) = any (array[
    'bloqueada>pendente','bloqueada>cancelada','bloqueada>falhou',
    'pendente>em_execucao','pendente>cancelada','pendente>bloqueada','pendente>falhou',
    'em_execucao>concluida','em_execucao>falhou','em_execucao>cancelada',
    'em_execucao>resultado_incerto','em_execucao>pendente',
    'falhou>pendente','falhou>cancelada',
    'resultado_incerto>pendente','resultado_incerto>concluida','resultado_incerto>cancelada','resultado_incerto>falhou'])) then
    raise exception 'Transicao de etapa invalida: % -> %', de_estado, _para;
  end if;
  update public.execucao_etapas set estado = _para where id = _etapa_id;
  insert into public.execucao_eventos (execucao_id, etapa_id, de, para, motivo) values (exec_id, _etapa_id, de_estado, _para, _motivo);
end;
$function$;

-- 3) Reconciliação do grafo: propaga falhas para dependentes, bloqueia por
--    autorização ausente e calcula o estado final de forma determinística.
--    Ordem de lock: execução primeiro, depois etapas por (ordem, id).
CREATE OR REPLACE FUNCTION public.reconciliar_grafo_execucao(_execucao_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ex record; r record; mudou boolean := true;
  ativos integer; incertos integer; bloq_consent integer; em_curso integer;
  aprovadas integer; conteudo integer; alvo text;
begin
  select * into ex from public.execucoes where id = _execucao_id for update;
  if ex is null then raise exception 'Execucao inexistente.'; end if;
  if ex.estado in ('concluida','parcialmente_concluida','falhou','cancelada') then
    return ex.estado;
  end if;

  perform 1 from public.execucao_etapas where execucao_id = _execucao_id order by ordem, id for update;

  -- propagação de falhas até ponto fixo
  while mudou loop
    mudou := false;
    for r in
      select e.id, e.categoria_requerida, e.depende_de
        from public.execucao_etapas e
       where e.execucao_id = _execucao_id and e.estado in ('pendente','bloqueada')
       order by e.ordem, e.id
    loop
      if exists (
        select 1 from public.execucao_etapas d
         where d.execucao_id = _execucao_id
           and d.papel = any (r.depende_de)
           and d.estado in ('falhou','cancelada')
      ) then
        update public.execucao_etapas set lease_token = null, lease_ate = null,
          proxima_tentativa_em = null, ultimo_codigo_erro = 'dependencia_falhou' where id = r.id;
        perform public.aplicar_transicao_etapa(r.id, 'falhou', 'dependencia falhou');
        mudou := true;
      end if;
    end loop;
  end loop;

  -- etapas bloqueadas por consentimento recebem código próprio
  update public.execucao_etapas
     set ultimo_codigo_erro = 'autorizacao_ausente'
   where execucao_id = _execucao_id and estado = 'bloqueada'
     and categoria_requerida is not null
     and ultimo_codigo_erro is distinct from 'autorizacao_ausente';

  select count(*) filter (where estado in ('pendente','em_execucao')),
         count(*) filter (where estado = 'resultado_incerto'),
         count(*) filter (where estado = 'bloqueada'),
         count(*) filter (where estado = 'em_execucao')
    into ativos, incertos, bloq_consent, em_curso
    from public.execucao_etapas where execucao_id = _execucao_id;

  -- precedência: cancelada > resultado_incerto > aguardando_consentimento > em_processamento > terminal
  if ex.estado = 'cancelamento_solicitado' then
    if em_curso = 0 then
      perform public.aplicar_transicao_execucao(_execucao_id, 'cancelada', 'sem etapas em curso');
      return 'cancelada';
    end if;
    return ex.estado;
  end if;

  if incertos > 0 or ativos > 0 then
    return ex.estado;
  end if;

  if bloq_consent > 0 then
    if ex.estado = 'em_processamento' then
      perform public.aplicar_transicao_execucao(_execucao_id, 'aguardando_consentimento', 'autorizacao pendente');
      return 'aguardando_consentimento';
    end if;
    return ex.estado;
  end if;

  select count(*) filter (where res.aprovado is true and res.tipo in ('variacao','correcao')),
         count(*) filter (where res.tipo in ('variacao','correcao'))
    into aprovadas, conteudo
    from public.execucao_resultados res
    join public.execucao_etapas et on et.id = res.etapa_id
   where et.execucao_id = _execucao_id and et.estado = 'concluida';

  if aprovadas >= 3 and not exists (
    select 1 from public.execucao_etapas
     where execucao_id = _execucao_id and estado in ('falhou','cancelada')
  ) then
    alvo := 'concluida';
  elsif aprovadas > 0 or conteudo > 0 then
    alvo := 'parcialmente_concluida';
  else
    alvo := 'falhou';
  end if;

  perform public.aplicar_transicao_execucao(_execucao_id, alvo, 'reconciliacao do grafo');
  return alvo;
end;
$function$;

REVOKE ALL ON FUNCTION public.reconciliar_grafo_execucao(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reconciliar_grafo_execucao(uuid) TO authenticated, service_role;

-- 4) Cancelamento honesto a partir de qualquer estado não final.
CREATE OR REPLACE FUNCTION public.cancelar_execucao(_execucao_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ex record; em_curso integer; r record;
begin
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  select * into ex from public.execucoes where id = _execucao_id for update;
  if ex is null then raise exception 'Execucao inexistente.'; end if;
  if ex.estado in ('concluida','parcialmente_concluida','falhou','cancelada') then
    return; -- idempotente: nada a cancelar
  end if;

  perform 1 from public.execucao_etapas where execucao_id = _execucao_id order by ordem, id for update;

  select count(*) into em_curso from public.execucao_etapas
    where execucao_id = _execucao_id and estado = 'em_execucao';

  if em_curso > 0 and ex.estado <> 'cancelamento_solicitado' then
    perform public.aplicar_transicao_execucao(_execucao_id, 'cancelamento_solicitado', 'solicitado pelo usuario');
  end if;

  update public.execucao_etapas set proxima_tentativa_em = null, lease_token = null, lease_ate = null,
    ultimo_codigo_erro = 'cancelada_por_execucao'
    where execucao_id = _execucao_id and estado in ('pendente','bloqueada','falhou','resultado_incerto');
  for r in select id from public.execucao_etapas
            where execucao_id = _execucao_id and estado in ('pendente','bloqueada','falhou','resultado_incerto')
            order by ordem, id
  loop
    perform public.aplicar_transicao_etapa(r.id, 'cancelada', 'execucao cancelada');
  end loop;

  if em_curso = 0 then
    perform public.aplicar_transicao_execucao(_execucao_id, 'cancelada', 'sem etapas em curso');
  end if;
end;
$function$;

-- 5) Reserva de custo: chave derivada e validada no servidor, bloqueio após
--    estado final ou cancelamento, e recusa de segunda correção do mesmo item.
CREATE OR REPLACE FUNCTION public.reservar_custo_v2(
  _execucao_id uuid, _etapa_id uuid, _tentativa integer, _tipo text, _escopo text DEFAULT NULL)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ex record; et record; total numeric; teto numeric; reserva numeric; chave text;
begin
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  if _tipo not in ('etapa','correcao') then raise exception 'Tipo de reserva invalido.'; end if;
  if _tentativa is null or _tentativa < 1 then raise exception 'Tentativa invalida.'; end if;
  if _tipo = 'correcao' and coalesce(_escopo, '') = '' then raise exception 'Escopo obrigatorio.'; end if;

  select * into ex from public.execucoes where id = _execucao_id for update;
  if ex is null then return false; end if;
  if ex.estado in ('concluida','parcialmente_concluida','falhou','cancelada','cancelamento_solicitado') then
    return false;
  end if;

  select * into et from public.execucao_etapas where id = _etapa_id and execucao_id = _execucao_id;
  if et is null or et.registry_versao_id is null then return false; end if;
  if et.tentativas is distinct from _tentativa then return false; end if;

  if _tipo = 'etapa' then
    chave := 'etapa:' || _etapa_id::text || ':' || _tentativa::text;
  else
    chave := 'correcao:' || _escopo || ':' || _etapa_id::text || ':' || _tentativa::text;
  end if;

  if exists (select 1 from public.execucao_reservas_custo where execucao_id = _execucao_id and chave = reservar_custo_v2.chave) then
    return true; -- idempotente
  end if;

  -- correção única: outro lote já reservado para o mesmo escopo é recusado
  if _tipo = 'correcao' and exists (
    select 1 from public.execucao_reservas_custo
     where execucao_id = _execucao_id and chave like 'correcao:' || _escopo || ':%'
  ) then
    return false;
  end if;

  reserva := public.custo_maximo_versao(et.registry_versao_id);
  teto := public.teto_execucao(_execucao_id);
  select coalesce(sum(coalesce(custo_real, custo_reservado)), 0) into total
    from public.execucao_reservas_custo where execucao_id = _execucao_id;
  if total + reserva > teto then return false; end if;

  insert into public.execucao_reservas_custo (execucao_id, etapa_id, chave, custo_reservado)
    values (_execucao_id, _etapa_id, chave, reserva);
  return true;
end;
$function$;

REVOKE ALL ON FUNCTION public.reservar_custo_v2(uuid, uuid, integer, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.reservar_custo_v2(uuid, uuid, integer, text, text) TO authenticated, service_role;

-- reserva antiga permanece, mas nunca aceita execução cancelada ou final
CREATE OR REPLACE FUNCTION public.reservar_custo(_execucao_id uuid, _etapa_id uuid, _chave text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ex record; total numeric; teto numeric; reserva numeric; vid uuid;
begin
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  select * into ex from public.execucoes where id = _execucao_id for update;
  if ex is null then return false; end if;
  if ex.estado in ('concluida','parcialmente_concluida','falhou','cancelada','cancelamento_solicitado') then
    return false;
  end if;
  if exists (select 1 from public.execucao_reservas_custo where execucao_id = _execucao_id and chave = _chave) then
    return true;
  end if;
  select registry_versao_id into vid from public.execucao_etapas
    where id = _etapa_id and execucao_id = _execucao_id;
  if vid is null then return false; end if;
  reserva := public.custo_maximo_versao(vid);
  teto := public.teto_execucao(_execucao_id);
  select coalesce(sum(coalesce(custo_real, custo_reservado)), 0) into total
    from public.execucao_reservas_custo where execucao_id = _execucao_id;
  if total + reserva > teto then return false; end if;
  insert into public.execucao_reservas_custo (execucao_id, etapa_id, chave, custo_reservado)
    values (_execucao_id, _etapa_id, _chave, reserva);
  return true;
end;
$function$;

-- 6) Conclusão e falha de etapa delegam o desfecho à reconciliação.
CREATE OR REPLACE FUNCTION public.concluir_etapa(_etapa_id uuid, _lease_token uuid, _duracao_ms integer, _resultados jsonb, _parcial boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare et record; ex record; r jsonb;
begin
  if not public.etapa_e_minha(_etapa_id) then raise exception 'Recurso indisponivel.'; end if;
  select execucao_id into et from public.execucao_etapas where id = _etapa_id;
  -- ordem de lock deterministica: execucao primeiro, depois a etapa
  select * into ex from public.execucoes where id = et.execucao_id for update;
  select * into et from public.execucao_etapas where id = _etapa_id for update;
  if et.estado <> 'em_execucao' or et.lease_token is distinct from _lease_token or et.lease_ate < now() then
    raise exception 'Lease invalido ou expirado.';
  end if;

  if ex.estado in ('cancelamento_solicitado','cancelada') then
    update public.execucao_tentativas set encerrada_em = now(), status = 'erro', codigo_erro = 'descartada_por_cancelamento'
      where etapa_id = _etapa_id and encerrada_em is null;
    update public.execucao_etapas set lease_token = null, lease_ate = null, proxima_tentativa_em = null,
      ultimo_codigo_erro = 'descartada_por_cancelamento' where id = _etapa_id;
    perform public.aplicar_transicao_etapa(_etapa_id, 'cancelada', 'resposta tardia descartada apos cancelamento');
    perform public.reconciliar_grafo_execucao(et.execucao_id);
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
  perform public.reconciliar_grafo_execucao(et.execucao_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.falhar_etapa(_etapa_id uuid, _lease_token uuid, _codigo_erro text, _incerto boolean DEFAULT false, _sem_retry boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end;
$function$;

-- 7) Resolução de resultado incerto e recuperação de leases reconciliam o grafo.
CREATE OR REPLACE FUNCTION public.resolver_resultado_incerto(_etapa_id uuid, _retomar boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare exec_id uuid;
begin
  if not public.etapa_e_minha(_etapa_id) then raise exception 'Recurso indisponivel.'; end if;
  select execucao_id into exec_id from public.execucao_etapas where id = _etapa_id;
  if _retomar then
    update public.execucao_etapas set proxima_tentativa_em = null where id = _etapa_id;
    perform public.aplicar_transicao_etapa(_etapa_id, 'pendente', 'retomada apos resultado incerto');
  else
    perform public.aplicar_transicao_etapa(_etapa_id, 'cancelada', 'descartada apos resultado incerto');
  end if;
  perform public.reconciliar_grafo_execucao(exec_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.recuperar_etapas_expiradas(_execucao_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n integer := 0; r record;
begin
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  for r in select id, tentativas, tentativas_limite, backoff_base_ms from public.execucao_etapas
           where execucao_id = _execucao_id and estado = 'em_execucao' and lease_ate is not null and lease_ate < now()
           order by ordem, id
  loop
    update public.execucao_tentativas set encerrada_em = now(), status = 'erro', codigo_erro = 'timeout'
      where etapa_id = r.id and encerrada_em is null;
    if r.tentativas >= r.tentativas_limite then
      update public.execucao_etapas set lease_token = null, lease_ate = null, ultimo_codigo_erro = 'timeout' where id = r.id;
      perform public.aplicar_transicao_etapa(r.id, 'falhou', 'timeout definitivo');
    else
      update public.execucao_etapas set lease_token = null, lease_ate = null, ultimo_codigo_erro = 'timeout',
        proxima_tentativa_em = now() + ((r.backoff_base_ms * power(2, greatest(r.tentativas - 1, 0)))::integer || ' milliseconds')::interval
        where id = r.id;
      perform public.aplicar_transicao_etapa(r.id, 'pendente', 'lease expirado');
    end if;
    n := n + 1;
  end loop;
  if n > 0 then perform public.reconciliar_grafo_execucao(_execucao_id); end if;
  return n;
end;
$function$;