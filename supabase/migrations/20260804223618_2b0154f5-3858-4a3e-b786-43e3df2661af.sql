-- Transições adicionais de encerramento direto
CREATE OR REPLACE FUNCTION public.aplicar_transicao_execucao(_execucao_id uuid, _para text, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    'pronta>em_processamento','pronta>cancelamento_solicitado','pronta>cancelada','pronta>falhou',
    'pronta>parcialmente_concluida','pronta>concluida',
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
end; $$;

-- Reconciliação do grafo: bloqueio de descendentes + estado final com cobertura de formatos
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

  -- propagação de impossibilidade até ponto fixo: descendente vira BLOQUEADA
  while mudou loop
    mudou := false;
    for r in
      select e.id, e.estado, e.ultimo_codigo_erro, e.depende_de
        from public.execucao_etapas e
       where e.execucao_id = _execucao_id
         and e.estado in ('pendente','bloqueada')
         and e.ultimo_codigo_erro is distinct from 'dependencia_falhou'
       order by e.ordem, e.id
    loop
      if exists (
        select 1 from public.execucao_etapas d
         where d.execucao_id = _execucao_id
           and d.papel = any (r.depende_de)
           and (d.estado in ('falhou','cancelada')
                or (d.estado = 'bloqueada' and d.ultimo_codigo_erro = 'dependencia_falhou'))
      ) then
        update public.execucao_etapas set lease_token = null, lease_ate = null,
          proxima_tentativa_em = null, ultimo_codigo_erro = 'dependencia_falhou' where id = r.id;
        if r.estado <> 'bloqueada' then
          perform public.aplicar_transicao_etapa(r.id, 'bloqueada', 'dependencia falhou');
        end if;
        mudou := true;
      end if;
    end loop;
  end loop;

  -- etapas bloqueadas por consentimento recebem código próprio
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

  -- conteúdo elegível: apenas resultados aprovados de etapas concluídas
  select count(*) filter (where res.aprovado is true and res.tipo in ('variacao','correcao'))
    into aprovadas
    from public.execucao_resultados res
    join public.execucao_etapas et on et.id = res.etapa_id
   where et.execucao_id = _execucao_id and et.estado = 'concluida';

  -- cobertura de formatos: todo especialista roteado precisa ter concluído com resultado
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

-- Cancelamento preserva etapas falhas e com resultado incerto
CREATE OR REPLACE FUNCTION public.cancelar_execucao(_execucao_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare ex record; em_curso integer; r record;
begin
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  select * into ex from public.execucoes where id = _execucao_id for update;
  if ex is null then raise exception 'Execucao inexistente.'; end if;
  if ex.estado in ('concluida','parcialmente_concluida','falhou','cancelada') then
    return; -- idempotente
  end if;

  perform 1 from public.execucao_etapas where execucao_id = _execucao_id order by ordem, id for update;

  select count(*) into em_curso from public.execucao_etapas
    where execucao_id = _execucao_id and estado = 'em_execucao';

  if em_curso > 0 and ex.estado <> 'cancelamento_solicitado' then
    perform public.aplicar_transicao_execucao(_execucao_id, 'cancelamento_solicitado', 'solicitado pelo usuario');
  end if;

  update public.execucao_etapas set proxima_tentativa_em = null, lease_token = null, lease_ate = null,
    ultimo_codigo_erro = 'cancelada_por_execucao'
    where execucao_id = _execucao_id and estado in ('pendente','bloqueada');
  for r in select id from public.execucao_etapas
            where execucao_id = _execucao_id and estado in ('pendente','bloqueada')
            order by ordem, id
  loop
    perform public.aplicar_transicao_etapa(r.id, 'cancelada', 'execucao cancelada');
  end loop;

  if em_curso = 0 then
    perform public.aplicar_transicao_execucao(_execucao_id, 'cancelada', 'sem etapas em curso');
  end if;
end; $$;

-- Reserva antiga deixa de ser acessível a usuários finais
REVOKE ALL ON FUNCTION public.reservar_custo(uuid, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_custo(uuid, uuid, text) TO service_role;