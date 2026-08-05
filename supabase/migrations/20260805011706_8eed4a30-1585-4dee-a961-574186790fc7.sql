-- A. transicoes de execucao com resultado_incerto
create or replace function public.aplicar_transicao_execucao(_execucao_id uuid, _para text, _motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare de_estado text;
begin
  select estado into de_estado from public.execucoes where id = _execucao_id for update;
  if de_estado is null then raise exception 'Execucao inexistente.'; end if;
  if de_estado = _para then return; end if;
  if not ((de_estado || '>' || _para) = any (array[
    'criada>pronta','criada>aguardando_consentimento','criada>cancelamento_solicitado','criada>cancelada','criada>falhou',
    'aguardando_consentimento>pronta','aguardando_consentimento>em_processamento',
    'aguardando_consentimento>cancelamento_solicitado','aguardando_consentimento>cancelada',
    'aguardando_consentimento>falhou','aguardando_consentimento>parcialmente_concluida','aguardando_consentimento>concluida',
    'aguardando_consentimento>resultado_incerto',
    'pronta>em_processamento','pronta>cancelamento_solicitado','pronta>cancelada','pronta>falhou',
    'pronta>parcialmente_concluida','pronta>concluida','pronta>resultado_incerto',
    'em_processamento>concluida','em_processamento>parcialmente_concluida','em_processamento>falhou',
    'em_processamento>aguardando_consentimento','em_processamento>resultado_incerto',
    'em_processamento>cancelamento_solicitado','em_processamento>cancelada',
    'resultado_incerto>em_processamento','resultado_incerto>aguardando_consentimento',
    'resultado_incerto>concluida','resultado_incerto>parcialmente_concluida','resultado_incerto>falhou',
    'resultado_incerto>cancelamento_solicitado','resultado_incerto>cancelada',
    'cancelamento_solicitado>cancelada'])) then
    raise exception 'Transicao de execucao invalida: % -> %', de_estado, _para;
  end if;
  update public.execucoes set estado = _para,
    iniciada_em = case when _para = 'em_processamento' and iniciada_em is null then now() else iniciada_em end,
    finalizada_em = case when _para in ('concluida','parcialmente_concluida','falhou','cancelada') then now() else finalizada_em end,
    cancelamento_solicitado_em = case when _para = 'cancelamento_solicitado' then now() else cancelamento_solicitado_em end
  where id = _execucao_id;
  insert into public.execucao_eventos (execucao_id, de, para, motivo) values (_execucao_id, de_estado, _para, _motivo);
end; $$;

-- helper: fecho transitivo de dependencias ate etapa incerta
create or replace function public.etapa_depende_de_incerta(_etapa_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare exec_id uuid; achou boolean;
begin
  select execucao_id into exec_id from public.execucao_etapas where id = _etapa_id;
  if exec_id is null then return false; end if;
  with recursive dep(papel) as (
    select unnest(depende_de) from public.execucao_etapas where id = _etapa_id
    union
    select unnest(e.depende_de) from public.execucao_etapas e
      join dep on e.papel = dep.papel
     where e.execucao_id = exec_id
  )
  select exists (
    select 1 from public.execucao_etapas e join dep on e.papel = dep.papel
     where e.execucao_id = exec_id and e.estado = 'resultado_incerto'
  ) into achou;
  return coalesce(achou, false);
end; $$;

-- D. reserva de custo compativel com resultado_incerto
create or replace function public.reservar_custo_v2(_execucao_id uuid, _etapa_id uuid, _tentativa integer, _tipo text, _escopo text default null)
returns boolean language plpgsql security definer set search_path = public as $$
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
  if et.estado = 'resultado_incerto' then return false; end if;
  if et.tentativas is distinct from _tentativa then return false; end if;

  if ex.estado = 'resultado_incerto' then
    if et.estado <> 'em_execucao' then return false; end if;
    if et.lease_token is null or et.lease_ate is null or et.lease_ate < now() then return false; end if;
    if public.etapa_depende_de_incerta(_etapa_id) then return false; end if;
  end if;

  if _tipo = 'etapa' then
    chave := 'etapa:' || _etapa_id::text || ':' || _tentativa::text;
  else
    chave := 'correcao:' || _escopo || ':' || _etapa_id::text || ':' || _tentativa::text;
  end if;

  if exists (select 1 from public.execucao_reservas_custo where execucao_id = _execucao_id and chave = reservar_custo_v2.chave) then
    return true;
  end if;

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
end; $$;

-- C. reservar_etapa continua entregando ramos independentes
create or replace function public.reservar_etapa(_execucao_id uuid)
returns table(etapa_id uuid, papel text, lease_token uuid, tentativa integer)
language plpgsql security definer set search_path = public as $$
declare e record; alvo record; token uuid; ativas integer;
begin
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  perform public.recuperar_etapas_expiradas(_execucao_id);
  perform public.reconciliar_grafo_execucao(_execucao_id);
  select * into e from public.execucoes where id = _execucao_id;
  if e.estado = 'pronta' then perform public.aplicar_transicao_execucao(_execucao_id, 'em_processamento', 'primeiro avanco');
  elsif e.estado not in ('em_processamento','resultado_incerto') then return; end if;

  select count(*) into ativas from public.execucao_etapas
    where execucao_id = _execucao_id and estado = 'em_execucao';
  if ativas >= 3 then return; end if;

  select et.* into alvo from public.execucao_etapas et
   where et.execucao_id = _execucao_id and et.estado = 'pendente'
     and (et.proxima_tentativa_em is null or et.proxima_tentativa_em <= now())
     and not exists (
       select 1 from unnest(et.depende_de) d
       join public.execucao_etapas dep on dep.execucao_id = et.execucao_id and dep.papel = d
       where dep.estado not in ('concluida','falhou','cancelada','bloqueada'))
     and (cardinality(et.depende_de) = 0 or exists (
       select 1 from unnest(et.depende_de) d
       join public.execucao_etapas dep on dep.execucao_id = et.execucao_id and dep.papel = d
       where dep.estado = 'concluida'))
   order by et.ordem
   for update skip locked
   limit 1;
  if alvo is null then return; end if;

  token := gen_random_uuid();
  update public.execucao_etapas set lease_token = token, lease_ate = now() + make_interval(secs => 90),
    tentativas = tentativas + 1, proxima_tentativa_em = null
    where id = alvo.id;
  perform public.aplicar_transicao_etapa(alvo.id, 'em_execucao', 'lease concedido');
  insert into public.execucao_tentativas (etapa_id, numero, lease_token) values (alvo.id, alvo.tentativas + 1, token);
  return query select alvo.id, alvo.papel, token, alvo.tentativas + 1;
end; $$;

-- B. precedencia de resultado_incerto na reconciliacao
create or replace function public.reconciliar_grafo_execucao(_execucao_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  ex record; r record; mudou boolean := true; codigo text;
  ativos integer; incertos integer; bloq_consent integer; em_curso integer;
  aprovadas integer; especialistas_pendentes integer; alvo text;
begin
  select * into ex from public.execucoes where id = _execucao_id for update;
  if ex is null then raise exception 'Execucao inexistente.'; end if;
  if ex.estado in ('concluida','parcialmente_concluida','falhou','cancelada') then
    return ex.estado;
  end if;

  perform 1 from public.execucao_etapas where execucao_id = _execucao_id order by ordem, id for update;

  update public.execucao_etapas
     set ultimo_codigo_erro = 'autorizacao_ausente'
   where execucao_id = _execucao_id and estado = 'bloqueada'
     and categoria_requerida is not null
     and ultimo_codigo_erro is null;

  while mudou loop
    mudou := false;
    for r in
      select e.id as eid, e.estado as est, e.depende_de as deps
        from public.execucao_etapas e
       where e.execucao_id = _execucao_id
         and e.estado in ('pendente','bloqueada')
         and e.ultimo_codigo_erro is null
         and cardinality(e.depende_de) > 0
       order by e.ordem, e.id
    loop
      if not exists (
            select 1 from public.execucao_etapas d
             where d.execucao_id = _execucao_id and d.papel = any (r.deps)
               and d.estado not in ('falhou','cancelada','bloqueada'))
         and exists (
            select 1 from public.execucao_etapas d
             where d.execucao_id = _execucao_id and d.papel = any (r.deps)
               and d.estado in ('falhou','cancelada','bloqueada'))
      then
        select case
                 when bool_and(d.estado = 'bloqueada' and d.ultimo_codigo_erro = 'autorizacao_ausente')
                   then 'autorizacao_ausente'
                 when bool_and(d.estado = 'cancelada' or d.ultimo_codigo_erro = 'cancelada_por_execucao')
                   then 'cancelada_por_execucao'
                 else 'dependencia_falhou' end
          into codigo
          from public.execucao_etapas d
         where d.execucao_id = _execucao_id and d.papel = any (r.deps);

        update public.execucao_etapas set lease_token = null, lease_ate = null,
          proxima_tentativa_em = null, ultimo_codigo_erro = codigo where id = r.eid;
        if r.est <> 'bloqueada' then
          perform public.aplicar_transicao_etapa(r.eid, 'bloqueada', 'dependencia impossivel');
        end if;
        mudou := true;
      end if;
    end loop;
  end loop;

  select count(*) filter (where estado in ('pendente','em_execucao')),
         count(*) filter (where estado = 'resultado_incerto'),
         count(*) filter (where estado = 'bloqueada' and ultimo_codigo_erro = 'autorizacao_ausente'),
         count(*) filter (where estado = 'em_execucao')
    into ativos, incertos, bloq_consent, em_curso
    from public.execucao_etapas where execucao_id = _execucao_id;

  if ex.estado = 'cancelamento_solicitado' then
    if em_curso = 0 then
      perform public.aplicar_transicao_execucao(_execucao_id, 'cancelada', 'sem etapas em curso');
      return 'cancelada';
    end if;
    return ex.estado;
  end if;

  -- precedencia: desfecho externo nao confirmado vence em_processamento e estados finais
  if incertos > 0 then
    if ex.estado <> 'resultado_incerto' then
      perform public.aplicar_transicao_execucao(_execucao_id, 'resultado_incerto', 'etapa com desfecho externo nao confirmado');
    end if;
    return 'resultado_incerto';
  end if;

  if ativos > 0 then
    if ex.estado = 'resultado_incerto' then
      perform public.aplicar_transicao_execucao(_execucao_id, 'em_processamento', 'incerteza resolvida');
      return 'em_processamento';
    end if;
    return ex.estado;
  end if;

  if bloq_consent > 0 then
    if ex.estado in ('em_processamento','resultado_incerto') then
      perform public.aplicar_transicao_execucao(_execucao_id, 'aguardando_consentimento', 'autorizacao pendente');
      return 'aguardando_consentimento';
    end if;
    return ex.estado;
  end if;

  select count(*) into aprovadas
    from public.execucao_resultados res
    join public.execucao_etapas et on et.id = res.etapa_id
   where et.execucao_id = _execucao_id and et.estado = 'concluida' and res.aprovado is true;

  select count(*) into especialistas_pendentes
    from public.execucao_etapas e
   where e.execucao_id = _execucao_id
     and 'analise_psicologica' = any (e.depende_de)
     and (e.estado <> 'concluida'
          or not exists (select 1 from public.execucao_resultados res2 where res2.etapa_id = e.id));

  if aprovadas >= 3
     and especialistas_pendentes = 0
     and not exists (
       select 1 from public.execucao_etapas
        where execucao_id = _execucao_id and estado in ('falhou','cancelada','bloqueada')
     ) then
    alvo := 'concluida';
  elsif aprovadas > 0 then
    alvo := 'parcialmente_concluida';
  else
    alvo := 'falhou';
  end if;

  perform public.aplicar_transicao_execucao(_execucao_id, alvo, 'reconciliacao do grafo');
  return alvo;
end; $$;

-- E. contrato explicito de resolucao
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
       set lease_token = null, lease_ate = null, proxima_tentativa_em = null,
           ultimo_codigo_erro = null, tentativas = tentativas + 1
     where id = _etapa_id;
    perform public.aplicar_transicao_etapa(
      _etapa_id, 'pendente',
      'resolucao manual: refazer_manualmente (decisao do usuario, risco de custo duplicado; tentativa anterior preservada)');
  end if;

  return public.reconciliar_grafo_execucao(exec_id);
end; $$;

-- wrapper temporario documentado da funcao antiga, fora do alcance do app
create or replace function public.resolver_resultado_incerto(_etapa_id uuid, _retomar boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Mapeamento explicito e temporario: true -> refazer_manualmente, false -> falha_confirmada.
  perform public.resolver_resultado_incerto_v2(
    _etapa_id, case when _retomar then 'refazer_manualmente' else 'falha_confirmada' end);
end; $$;

revoke execute on function public.resolver_resultado_incerto(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.etapa_depende_de_incerta(uuid) from public, anon;
grant execute on function public.resolver_resultado_incerto_v2(uuid, text) to authenticated;