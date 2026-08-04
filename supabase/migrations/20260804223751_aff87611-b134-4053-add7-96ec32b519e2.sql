CREATE OR REPLACE FUNCTION public.reservar_etapa(_execucao_id uuid)
RETURNS TABLE(etapa_id uuid, papel text, lease_token uuid, tentativa integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare e record; alvo record; token uuid; ativas integer;
begin
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  perform public.recuperar_etapas_expiradas(_execucao_id);
  perform public.reconciliar_grafo_execucao(_execucao_id);
  select * into e from public.execucoes where id = _execucao_id;
  if e.estado = 'pronta' then perform public.aplicar_transicao_execucao(_execucao_id, 'em_processamento', 'primeiro avanco');
  elsif e.estado <> 'em_processamento' then return; end if;

  select count(*) into ativas from public.execucao_etapas
    where execucao_id = _execucao_id and estado = 'em_execucao';
  if ativas >= 3 then return; end if;

  select et.* into alvo from public.execucao_etapas et
   where et.execucao_id = _execucao_id and et.estado = 'pendente'
     and (et.proxima_tentativa_em is null or et.proxima_tentativa_em <= now())
     -- toda dependencia precisa estar encerrada
     and not exists (
       select 1 from unnest(et.depende_de) d
       join public.execucao_etapas dep on dep.execucao_id = et.execucao_id and dep.papel = d
       where dep.estado not in ('concluida','falhou','cancelada','bloqueada'))
     -- e ao menos uma precisa ter concluido com sucesso (barreira dos especialistas)
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

CREATE OR REPLACE FUNCTION public.reconciliar_grafo_execucao(_execucao_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  ex record; r record; mudou boolean := true;
  ativos integer; incertos integer; bloq_consent integer; em_curso integer;
  aprovadas integer; especialistas_pendentes integer; alvo text;
begin
  select * into ex from public.execucoes where id = _execucao_id for update;
  if ex is null then raise exception 'Execucao inexistente.'; end if;
  if ex.estado in ('concluida','parcialmente_concluida','falhou','cancelada') then
    return ex.estado;
  end if;

  perform 1 from public.execucao_etapas where execucao_id = _execucao_id order by ordem, id for update;

  -- propagacao ate ponto fixo: bloqueia apenas quando NENHUMA dependencia teve sucesso
  while mudou loop
    mudou := false;
    for r in
      select e.id, e.estado, e.depende_de
        from public.execucao_etapas e
       where e.execucao_id = _execucao_id
         and e.estado in ('pendente','bloqueada')
         and e.ultimo_codigo_erro is distinct from 'dependencia_falhou'
         and cardinality(e.depende_de) > 0
       order by e.ordem, e.id
    loop
      if not exists (
            select 1 from public.execucao_etapas d
             where d.execucao_id = _execucao_id and d.papel = any (r.depende_de)
               and d.estado not in ('falhou','cancelada','bloqueada'))
         and exists (
            select 1 from public.execucao_etapas d
             where d.execucao_id = _execucao_id and d.papel = any (r.depende_de)
               and d.estado in ('falhou','cancelada','bloqueada'))
      then
        update public.execucao_etapas set lease_token = null, lease_ate = null,
          proxima_tentativa_em = null, ultimo_codigo_erro = 'dependencia_falhou' where id = r.id;
        if r.estado <> 'bloqueada' then
          perform public.aplicar_transicao_etapa(r.id, 'bloqueada', 'dependencia falhou');
        end if;
        mudou := true;
      end if;
    end loop;
  end loop;

  update public.execucao_etapas
     set ultimo_codigo_erro = 'autorizacao_ausente'
   where execucao_id = _execucao_id and estado = 'bloqueada'
     and categoria_requerida is not null
     and ultimo_codigo_erro is null;

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

  select count(*) filter (where res.aprovado is true and res.tipo in ('variacao','correcao'))
    into aprovadas
    from public.execucao_resultados res
    join public.execucao_etapas et on et.id = res.etapa_id
   where et.execucao_id = _execucao_id and et.estado = 'concluida';

  select count(*) into especialistas_pendentes
    from public.execucao_etapas e
   where e.execucao_id = _execucao_id
     and 'analise_psicologica' = any (e.depende_de)
     and (e.estado <> 'concluida'
          or not exists (select 1 from public.execucao_resultados r where r.etapa_id = e.id));

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