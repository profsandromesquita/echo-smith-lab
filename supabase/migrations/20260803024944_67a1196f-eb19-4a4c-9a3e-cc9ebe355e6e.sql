-- ===== transicoes =====
create or replace function public.aplicar_transicao_execucao(_execucao_id uuid, _para text, _motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare de_estado text;
begin
  select estado into de_estado from public.execucoes where id = _execucao_id for update;
  if de_estado is null then raise exception 'Execucao inexistente.'; end if;
  if de_estado = _para then return; end if;
  if not ((de_estado || '>' || _para) = any (array[
    'criada>pronta','criada>aguardando_consentimento','criada>cancelada',
    'aguardando_consentimento>pronta','aguardando_consentimento>cancelada',
    'pronta>em_processamento','pronta>cancelamento_solicitado',
    'em_processamento>concluida','em_processamento>parcialmente_concluida','em_processamento>falhou',
    'em_processamento>cancelamento_solicitado',
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
$$;

create or replace function public.aplicar_transicao_etapa(_etapa_id uuid, _para text, _motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare de_estado text; exec_id uuid;
begin
  select estado, execucao_id into de_estado, exec_id from public.execucao_etapas where id = _etapa_id for update;
  if de_estado is null then raise exception 'Etapa inexistente.'; end if;
  if de_estado = _para then return; end if;
  if not ((de_estado || '>' || _para) = any (array[
    'bloqueada>pendente','bloqueada>cancelada',
    'pendente>em_execucao','pendente>cancelada','pendente>bloqueada',
    'em_execucao>concluida','em_execucao>falhou','em_execucao>cancelada',
    'em_execucao>resultado_incerto','em_execucao>pendente',
    'falhou>pendente','resultado_incerto>pendente','resultado_incerto>concluida','resultado_incerto>cancelada'])) then
    raise exception 'Transicao de etapa invalida: % -> %', de_estado, _para;
  end if;
  update public.execucao_etapas set estado = _para where id = _etapa_id;
  insert into public.execucao_eventos (execucao_id, etapa_id, de, para, motivo) values (exec_id, _etapa_id, de_estado, _para, _motivo);
end;
$$;

revoke all on function public.aplicar_transicao_execucao(uuid, text, text) from public, anon, authenticated;
revoke all on function public.aplicar_transicao_etapa(uuid, text, text) from public, anon, authenticated;

-- ===== registry: administracao =====
create or replace function public.registry_exigir_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.tem_papel('admin_tecnico') then raise exception 'Acesso restrito.'; end if;
end;
$$;
revoke all on function public.registry_exigir_admin() from public, anon;
grant execute on function public.registry_exigir_admin() to authenticated, service_role;

create or replace function public.registry_criar_rascunho(_papel text, _base_versao_id uuid, _motivo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare ag record; base record; nova uuid; prox integer;
begin
  perform public.registry_exigir_admin();
  select * into ag from public.registry_agentes where papel = _papel;
  if ag is null then raise exception 'Papel inexistente.'; end if;
  if ag.versao_rascunho_id is not null then raise exception 'Ja existe um rascunho para este papel.'; end if;
  select * into base from public.registry_versoes
    where id = coalesce(_base_versao_id, ag.versao_publicada_id) and agente_id = ag.id;
  if base is null then raise exception 'Versao base inexistente.'; end if;
  select coalesce(max(versao), 0) + 1 into prox from public.registry_versoes where agente_id = ag.id;
  insert into public.registry_versoes (agente_id, versao, estado, ativo, provedor, modelo, instrucoes_sistema,
    schema_entrada, schema_saida, limite_entrada, limite_saida, timeout_ms, tentativas_max, backoff_base_ms,
    concorrencia, orcamento_estimado, parametros, fallback, observacoes, motivo_alteracao, autor_id)
  values (ag.id, prox, 'rascunho', base.ativo, base.provedor, base.modelo, base.instrucoes_sistema,
    base.schema_entrada, base.schema_saida, base.limite_entrada, base.limite_saida, base.timeout_ms,
    base.tentativas_max, base.backoff_base_ms, base.concorrencia, base.orcamento_estimado, base.parametros,
    base.fallback, base.observacoes, coalesce(_motivo, ''), auth.uid())
  returning id into nova;
  update public.registry_agentes set versao_rascunho_id = nova, atualizado_em = now() where id = ag.id;
  return nova;
end;
$$;

create or replace function public.registry_atualizar_rascunho(_versao_id uuid, _dados jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  perform public.registry_exigir_admin();
  select * into v from public.registry_versoes where id = _versao_id;
  if v is null or v.estado <> 'rascunho' then raise exception 'Apenas rascunhos podem ser editados.'; end if;
  update public.registry_versoes set
    ativo = coalesce((_dados->>'ativo')::boolean, ativo),
    modelo = coalesce(_dados->>'modelo', modelo),
    instrucoes_sistema = coalesce(_dados->>'instrucoes_sistema', instrucoes_sistema),
    schema_entrada = coalesce(_dados->'schema_entrada', schema_entrada),
    schema_saida = coalesce(_dados->'schema_saida', schema_saida),
    limite_entrada = coalesce((_dados->>'limite_entrada')::integer, limite_entrada),
    limite_saida = coalesce((_dados->>'limite_saida')::integer, limite_saida),
    timeout_ms = coalesce((_dados->>'timeout_ms')::integer, timeout_ms),
    tentativas_max = coalesce((_dados->>'tentativas_max')::integer, tentativas_max),
    backoff_base_ms = coalesce((_dados->>'backoff_base_ms')::integer, backoff_base_ms),
    concorrencia = coalesce((_dados->>'concorrencia')::integer, concorrencia),
    orcamento_estimado = coalesce((_dados->>'orcamento_estimado')::numeric, orcamento_estimado),
    parametros = coalesce(_dados->'parametros', parametros),
    fallback = coalesce(_dados->'fallback', fallback),
    observacoes = coalesce(_dados->>'observacoes', observacoes),
    motivo_alteracao = coalesce(_dados->>'motivo_alteracao', motivo_alteracao),
    autor_id = auth.uid()
  where id = _versao_id;
end;
$$;

create or replace function public.registry_validar(_versao_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v record; problemas text[] := '{}';
begin
  perform public.registry_exigir_admin();
  select * into v from public.registry_versoes where id = _versao_id;
  if v is null or v.estado <> 'rascunho' then raise exception 'Apenas rascunhos podem ser validados.'; end if;
  if jsonb_typeof(v.schema_entrada) <> 'object' then problemas := problemas || 'schema de entrada invalido'; end if;
  if jsonb_typeof(v.schema_saida) <> 'object' then problemas := problemas || 'schema de saida invalido'; end if;
  if length(trim(v.instrucoes_sistema)) < 10 then problemas := problemas || 'instrucoes muito curtas'; end if;
  if v.limite_saida > v.limite_entrada then problemas := problemas || 'limite de saida maior que o de entrada'; end if;
  if v.provedor <> 'simulado' then problemas := problemas || 'provedor real nao permitido nesta fase'; end if;
  if array_length(problemas, 1) is null then
    update public.registry_versoes set validada_em = now(), resultado_validacao = '{"ok":true}'::jsonb where id = _versao_id;
    return '{"ok":true}'::jsonb;
  end if;
  update public.registry_versoes set validada_em = null,
    resultado_validacao = jsonb_build_object('ok', false, 'problemas', to_jsonb(problemas)) where id = _versao_id;
  return jsonb_build_object('ok', false, 'problemas', to_jsonb(problemas));
end;
$$;

create or replace function public.registry_registrar_teste(_versao_id uuid, _resultado jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  perform public.registry_exigir_admin();
  select * into v from public.registry_versoes where id = _versao_id;
  if v is null or v.estado <> 'rascunho' then raise exception 'Apenas rascunhos podem ser testados.'; end if;
  update public.registry_versoes set testada_em = now(), resultado_teste = _resultado where id = _versao_id;
end;
$$;

create or replace function public.registry_publicar(_versao_id uuid, _motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v record; ag record;
begin
  perform public.registry_exigir_admin();
  select * into v from public.registry_versoes where id = _versao_id;
  if v is null or v.estado <> 'rascunho' then raise exception 'Somente um rascunho pode ser publicado.'; end if;
  if v.validada_em is null or v.validada_em < v.editada_em then raise exception 'Valide o rascunho antes de publicar.'; end if;
  if v.testada_em is null or v.testada_em < v.editada_em then raise exception 'Teste o rascunho antes de publicar.'; end if;
  select * into ag from public.registry_agentes where id = v.agente_id for update;
  perform set_config('app.publicacao_em_curso', 'on', true);
  if ag.versao_publicada_id is not null then
    update public.registry_versoes set estado = 'arquivada', arquivada_em = now() where id = ag.versao_publicada_id;
  end if;
  update public.registry_versoes set estado = 'publicada', publicada_em = now(), publicada_por = auth.uid(),
    motivo_alteracao = coalesce(nullif(_motivo, ''), motivo_alteracao) where id = _versao_id;
  perform set_config('app.publicacao_em_curso', 'off', true);
  update public.registry_agentes set versao_publicada_id = _versao_id, versao_rascunho_id = null, atualizado_em = now()
    where id = ag.id;
end;
$$;

create or replace function public.registry_descartar_rascunho(_versao_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  perform public.registry_exigir_admin();
  select * into v from public.registry_versoes where id = _versao_id;
  if v is null or v.estado <> 'rascunho' then raise exception 'Apenas rascunhos podem ser descartados.'; end if;
  update public.registry_agentes set versao_rascunho_id = null where id = v.agente_id;
  delete from public.registry_versoes where id = _versao_id;
end;
$$;

revoke all on function public.registry_criar_rascunho(text, uuid, text) from public, anon;
revoke all on function public.registry_atualizar_rascunho(uuid, jsonb) from public, anon;
revoke all on function public.registry_validar(uuid) from public, anon;
revoke all on function public.registry_registrar_teste(uuid, jsonb) from public, anon;
revoke all on function public.registry_publicar(uuid, text) from public, anon;
revoke all on function public.registry_descartar_rascunho(uuid) from public, anon;
grant execute on function public.registry_criar_rascunho(text, uuid, text) to authenticated, service_role;
grant execute on function public.registry_atualizar_rascunho(uuid, jsonb) to authenticated, service_role;
grant execute on function public.registry_validar(uuid) to authenticated, service_role;
grant execute on function public.registry_registrar_teste(uuid, jsonb) to authenticated, service_role;
grant execute on function public.registry_publicar(uuid, text) to authenticated, service_role;
grant execute on function public.registry_descartar_rascunho(uuid) to authenticated, service_role;

-- ===== criacao de execucao =====
create or replace function public.criar_execucao(
  _chat_id uuid, _formato text, _snapshot_chat jsonb, _snapshot_marca jsonb,
  _snapshot_privacidade jsonb, _modo_privacidade text, _permissoes jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  exec_id uuid; foto_id uuid;
  papeis text[]; p text; i integer := 0; anterior text := null;
  vid uuid; cat text; bloqueada boolean; alguma_bloqueada boolean := false;
  vrec record; custo numeric := 0; perm jsonb;
begin
  if uid is null then raise exception 'Sessao ausente.'; end if;
  if _chat_id is not null and not public.chat_e_meu(_chat_id) then raise exception 'Recurso indisponivel.'; end if;

  papeis := array['gatekeeper','analise_psicologica'];
  if _formato = 'hook' then papeis := papeis || 'hook_master';
  elsif _formato in ('headline_video','headline_imagem') then papeis := papeis || 'headline_architect';
  elsif _formato = 'cta' then papeis := papeis || 'cta_specialist';
  elsif _formato = 'pacote_completo' then papeis := papeis || array['hook_master','headline_architect','cta_specialist'];
  else raise exception 'Formato invalido.'; end if;
  papeis := papeis || array['auditor','adaptador_local','validador_preservacao','ranking','consolidador'];

  insert into public.execucoes (user_id, chat_id, formato_solicitado, snapshot_chat, snapshot_marca, snapshot_privacidade)
    values (uid, _chat_id, _formato, coalesce(_snapshot_chat,'{}'::jsonb), coalesce(_snapshot_marca,'{}'::jsonb), coalesce(_snapshot_privacidade,'{}'::jsonb))
    returning id into exec_id;

  insert into public.execucao_fotografias (user_id, execucao_id, modo_privacidade)
    values (uid, exec_id, _modo_privacidade) returning id into foto_id;
  update public.execucoes set fotografia_id = foto_id where id = exec_id;

  for perm in select * from jsonb_array_elements(coalesce(_permissoes, '[]'::jsonb)) loop
    insert into public.fotografias_consentimento
      (user_id, fotografia_id, categoria, provedor, etapa, finalidade, decisao, termos_id, termos_versao, origem)
    values (uid, foto_id, perm->>'categoria', perm->>'provedor', perm->>'etapa', perm->>'finalidade',
            perm->>'decisao', (perm->>'termos_id')::uuid, (perm->>'termos_versao')::integer, perm->>'origem');
  end loop;

  foreach p in array papeis loop
    i := i + 1;
    select rv.* into vrec from public.registry_versoes rv
      join public.registry_agentes ra on ra.id = rv.agente_id
      where ra.papel = p and rv.id = ra.versao_publicada_id and rv.ativo;
    if vrec is null then raise exception 'Papel % sem versao publicada ativa.', p; end if;
    vid := vrec.id;
    custo := custo + vrec.orcamento_estimado;

    insert into public.execucao_registry_versoes (execucao_id, papel, registry_versao_id)
      values (exec_id, p, vid);

    cat := case when p in ('adaptador_local','validador_preservacao','ranking','consolidador') then null else 'briefing' end;
    bloqueada := cat is not null and not exists (
      select 1 from public.fotografias_consentimento f
      where f.fotografia_id = foto_id and f.categoria = cat and f.decisao = 'concedido');
    if bloqueada then alguma_bloqueada := true; end if;

    insert into public.execucao_etapas (execucao_id, papel, ordem, estado, categoria_requerida, depende_de,
      registry_versao_id, tentativas_limite, backoff_base_ms, timeout_ms)
    values (exec_id, p, i, case when bloqueada then 'bloqueada' else 'pendente' end, cat,
      case when anterior is null then '{}'::text[] else array[anterior] end,
      vid, vrec.tentativas_max, vrec.backoff_base_ms, vrec.timeout_ms);
    anterior := p;
  end loop;

  update public.execucoes set custo_estimado = custo,
    snapshot_registry = (select jsonb_object_agg(erv.papel, jsonb_build_object('versao_id', erv.registry_versao_id, 'versao', rv.versao))
                         from public.execucao_registry_versoes erv join public.registry_versoes rv on rv.id = erv.registry_versao_id
                         where erv.execucao_id = exec_id)
    where id = exec_id;

  insert into public.execucao_eventos (execucao_id, de, para, motivo) values (exec_id, null, 'criada', 'criacao');
  perform public.aplicar_transicao_execucao(exec_id, case when alguma_bloqueada then 'aguardando_consentimento' else 'pronta' end, 'avaliacao de consentimentos');
  return exec_id;
end;
$$;

-- ===== avanco controlado pelo servidor =====
create or replace function public.recuperar_etapas_expiradas(_execucao_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer := 0; r record;
begin
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  for r in select id, tentativas, tentativas_limite, backoff_base_ms from public.execucao_etapas
           where execucao_id = _execucao_id and estado = 'em_execucao' and lease_ate is not null and lease_ate < now()
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
  return n;
end;
$$;

create or replace function public.reservar_etapa(_execucao_id uuid)
returns table (etapa_id uuid, papel text, lease_token uuid, tentativa integer) language plpgsql security definer set search_path = '' as $$
declare e record; alvo record; token uuid;
begin
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  perform public.recuperar_etapas_expiradas(_execucao_id);
  select * into e from public.execucoes where id = _execucao_id;
  if e.estado = 'pronta' then perform public.aplicar_transicao_execucao(_execucao_id, 'em_processamento', 'primeiro avanco');
  elsif e.estado <> 'em_processamento' then return; end if;

  select et.* into alvo from public.execucao_etapas et
   where et.execucao_id = _execucao_id and et.estado = 'pendente'
     and (et.proxima_tentativa_em is null or et.proxima_tentativa_em <= now())
     and not exists (
       select 1 from unnest(et.depende_de) d
       join public.execucao_etapas dep on dep.execucao_id = et.execucao_id and dep.papel = d
       where dep.estado <> 'concluida')
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
end;
$$;

create or replace function public.concluir_etapa(_etapa_id uuid, _lease_token uuid, _duracao_ms integer, _resultados jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare et record; ex record; r jsonb; restantes integer; falhas integer;
begin
  if not public.etapa_e_minha(_etapa_id) then raise exception 'Recurso indisponivel.'; end if;
  select * into et from public.execucao_etapas where id = _etapa_id for update;
  if et.estado <> 'em_execucao' or et.lease_token is distinct from _lease_token or et.lease_ate < now() then
    raise exception 'Lease invalido ou expirado.';
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
$$;

create or replace function public.falhar_etapa(_etapa_id uuid, _lease_token uuid, _codigo_erro text, _incerto boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare et record; novo text; restantes integer;
begin
  if not public.etapa_e_minha(_etapa_id) then raise exception 'Recurso indisponivel.'; end if;
  select * into et from public.execucao_etapas where id = _etapa_id for update;
  if et.estado <> 'em_execucao' or et.lease_token is distinct from _lease_token then
    raise exception 'Lease invalido ou expirado.';
  end if;
  update public.execucao_tentativas set encerrada_em = now(),
    status = case when _incerto then 'unknown_outcome' else 'erro' end, codigo_erro = _codigo_erro
    where etapa_id = _etapa_id and encerrada_em is null;

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
$$;

create or replace function public.resolver_resultado_incerto(_etapa_id uuid, _retomar boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.etapa_e_minha(_etapa_id) then raise exception 'Recurso indisponivel.'; end if;
  if _retomar then
    update public.execucao_etapas set proxima_tentativa_em = null where id = _etapa_id;
    perform public.aplicar_transicao_etapa(_etapa_id, 'pendente', 'retomada apos resultado incerto');
  else
    perform public.aplicar_transicao_etapa(_etapa_id, 'cancelada', 'descartada apos resultado incerto');
  end if;
end;
$$;

create or replace function public.cancelar_execucao(_execucao_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare pendentes integer;
begin
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  perform public.aplicar_transicao_execucao(_execucao_id, 'cancelamento_solicitado', 'solicitado pelo usuario');
  update public.execucao_etapas set proxima_tentativa_em = null where execucao_id = _execucao_id and estado in ('pendente','bloqueada');
  perform public.aplicar_transicao_etapa(id, 'cancelada', 'execucao cancelada')
    from public.execucao_etapas where execucao_id = _execucao_id and estado in ('pendente','bloqueada');
  select count(*) into pendentes from public.execucao_etapas where execucao_id = _execucao_id and estado = 'em_execucao';
  if pendentes = 0 then
    perform public.aplicar_transicao_execucao(_execucao_id, 'cancelada', 'sem etapas em curso');
  end if;
end;
$$;

create or replace function public.desbloquear_etapas(_execucao_id uuid, _categoria text)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer := 0; r record; ex record;
begin
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  for r in select id from public.execucao_etapas
           where execucao_id = _execucao_id and estado = 'bloqueada' and categoria_requerida = _categoria
  loop
    perform public.aplicar_transicao_etapa(r.id, 'pendente', 'consentimento concedido');
    n := n + 1;
  end loop;
  select * into ex from public.execucoes where id = _execucao_id;
  if ex.estado = 'aguardando_consentimento'
     and not exists (select 1 from public.execucao_etapas where execucao_id = _execucao_id and estado = 'bloqueada') then
    perform public.aplicar_transicao_execucao(_execucao_id, 'pronta', 'consentimentos satisfeitos');
  end if;
  return n;
end;
$$;

revoke all on function public.criar_execucao(uuid, text, jsonb, jsonb, jsonb, text, jsonb) from public, anon;
revoke all on function public.recuperar_etapas_expiradas(uuid) from public, anon;
revoke all on function public.reservar_etapa(uuid) from public, anon;
revoke all on function public.concluir_etapa(uuid, uuid, integer, jsonb) from public, anon;
revoke all on function public.falhar_etapa(uuid, uuid, text, boolean) from public, anon;
revoke all on function public.resolver_resultado_incerto(uuid, boolean) from public, anon;
revoke all on function public.cancelar_execucao(uuid) from public, anon;
revoke all on function public.desbloquear_etapas(uuid, text) from public, anon;
grant execute on function public.criar_execucao(uuid, text, jsonb, jsonb, jsonb, text, jsonb) to authenticated, service_role;
grant execute on function public.recuperar_etapas_expiradas(uuid) to authenticated, service_role;
grant execute on function public.reservar_etapa(uuid) to authenticated, service_role;
grant execute on function public.concluir_etapa(uuid, uuid, integer, jsonb) to authenticated, service_role;
grant execute on function public.falhar_etapa(uuid, uuid, text, boolean) to authenticated, service_role;
grant execute on function public.resolver_resultado_incerto(uuid, boolean) to authenticated, service_role;
grant execute on function public.cancelar_execucao(uuid) to authenticated, service_role;
grant execute on function public.desbloquear_etapas(uuid, text) to authenticated, service_role;