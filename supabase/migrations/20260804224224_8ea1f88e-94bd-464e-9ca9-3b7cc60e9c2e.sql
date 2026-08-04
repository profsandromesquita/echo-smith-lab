CREATE OR REPLACE FUNCTION public.reconciliar_grafo_execucao(_execucao_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  -- etapas barradas por consentimento recebem codigo proprio antes da propagacao
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