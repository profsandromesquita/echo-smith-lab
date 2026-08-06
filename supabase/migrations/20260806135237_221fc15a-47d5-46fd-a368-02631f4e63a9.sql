-- ---------------------------------------------------------------
-- 1. Identidade canônica de provedor (separada do rótulo de exibição)
-- ---------------------------------------------------------------
create or replace function public.provedor_canonico(_rotulo text)
returns text language sql immutable set search_path = public as $$
  select case
    when _rotulo in ('openai','anthropic','simulado','desconhecido') then _rotulo
    when _rotulo ilike '%openai%' or _rotulo ilike 'Provedor de nuvem A%'
      or _rotulo ilike '%auditoria%' then 'openai'
    when _rotulo ilike '%anthropic%' or _rotulo ilike 'Provedor de nuvem B%'
      or _rotulo ilike '%especialistas%' then 'anthropic'
    else 'desconhecido'
  end
$$;

update public.consentimentos
   set provedor = public.provedor_canonico(provedor)
 where provedor is distinct from public.provedor_canonico(provedor);

alter table public.consentimentos_historico disable trigger historico_imutavel;
update public.consentimentos_historico
   set provedor = public.provedor_canonico(provedor)
 where provedor is distinct from public.provedor_canonico(provedor);
alter table public.consentimentos_historico enable trigger historico_imutavel;

alter table public.fotografias_consentimento disable trigger fotografias_imutavel;
update public.fotografias_consentimento
   set provedor = public.provedor_canonico(provedor)
 where provedor is distinct from public.provedor_canonico(provedor);
alter table public.fotografias_consentimento enable trigger fotografias_imutavel;

alter table public.consentimentos
  drop constraint if exists consentimentos_provedor_canonico,
  add constraint consentimentos_provedor_canonico
  check (provedor in ('openai','anthropic','simulado','desconhecido'));

alter table public.consentimentos_historico
  drop constraint if exists consentimentos_historico_provedor_canonico,
  add constraint consentimentos_historico_provedor_canonico
  check (provedor in ('openai','anthropic','simulado','desconhecido'));

alter table public.fotografias_consentimento
  drop constraint if exists fotografias_consentimento_provedor_canonico,
  add constraint fotografias_consentimento_provedor_canonico
  check (provedor in ('openai','anthropic','simulado','desconhecido'));

-- ---------------------------------------------------------------
-- 2. registrar_consentimento passa a exigir provedor canônico real
-- ---------------------------------------------------------------
create or replace function public.registrar_consentimento(_escopo text, _escopo_id uuid, _categoria text, _provedor text, _etapa text, _finalidade text, _decisao text, _origem text)
 returns uuid language plpgsql security definer set search_path to '' as $function$
DECLARE
  _uid uuid := auth.uid();
  _termos public.termos_consentimento%ROWTYPE;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'nao autenticado'; END IF;
  IF _decisao NOT IN ('concedido','recusado') THEN RAISE EXCEPTION 'decisao invalida'; END IF;
  IF _escopo = 'conta' AND _escopo_id IS NOT NULL THEN RAISE EXCEPTION 'escopo invalido'; END IF;
  IF _escopo <> 'conta' AND _escopo_id IS NULL THEN RAISE EXCEPTION 'escopo invalido'; END IF;
  IF _provedor NOT IN ('openai','anthropic','simulado') THEN RAISE EXCEPTION 'provedor invalido'; END IF;

  SELECT * INTO _termos FROM public.termos_consentimento
   WHERE chave = _categoria AND vigente LIMIT 1;
  IF _termos.id IS NULL THEN RAISE EXCEPTION 'termos indisponiveis'; END IF;

  UPDATE public.consentimentos c
     SET estado = _decisao, termos_id = _termos.id, finalidade = _finalidade
   WHERE c.user_id = _uid AND c.escopo = _escopo
     AND c.escopo_id IS NOT DISTINCT FROM _escopo_id
     AND c.categoria = _categoria AND c.provedor = _provedor AND c.etapa = _etapa
  RETURNING c.id INTO _id;

  IF _id IS NULL THEN
    INSERT INTO public.consentimentos
      (user_id, escopo, escopo_id, categoria, provedor, etapa, finalidade, estado, termos_id)
    VALUES (_uid, _escopo, _escopo_id, _categoria, _provedor, _etapa, _finalidade, _decisao, _termos.id)
    RETURNING id INTO _id;
  END IF;

  INSERT INTO public.consentimentos_historico
    (user_id, consentimento_id, escopo, escopo_id, categoria, provedor, etapa, finalidade,
     acao, origem, termos_id, termos_versao)
  VALUES (_uid, _id, _escopo, _escopo_id, _categoria, _provedor, _etapa, _finalidade,
          _decisao, _origem, _termos.id, _termos.versao);

  RETURN _id;
END;
$function$;

-- ---------------------------------------------------------------
-- 3. Bloqueio de etapa passa a considerar o provedor da versão fixada
-- ---------------------------------------------------------------
create or replace function public.etapa_consentida(_fotografia_id uuid, _categoria text, _provedor text)
returns boolean language sql stable security definer set search_path = public as $$
  select _categoria is null or exists (
    select 1 from public.fotografias_consentimento f
     where f.fotografia_id = _fotografia_id
       and f.categoria = _categoria
       and f.decisao = 'concedido'
       and (f.provedor = _provedor or _provedor = 'simulado')
  )
$$;

create or replace function public.criar_execucao(_chat_id uuid, _formato text, _snapshot_chat jsonb, _snapshot_marca jsonb, _snapshot_privacidade jsonb, _modo_privacidade text, _permissoes jsonb)
 returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  uid uuid := auth.uid();
  exec_id uuid; foto_id uuid;
  especialistas text[]; papeis text[]; p text; papel_registry text; i integer := 0;
  dep text[]; vid uuid; cat text; bloqueada boolean; alguma_bloqueada boolean := false;
  vrec record; custo numeric := 0; perm jsonb;
begin
  if uid is null then raise exception 'Sessao ausente.'; end if;
  if _chat_id is not null and not public.chat_e_meu(_chat_id) then raise exception 'Recurso indisponivel.'; end if;

  if _formato = 'hook' then especialistas := array['hook_master'];
  elsif _formato in ('headline_video','headline_imagem') then especialistas := array['headline_architect'];
  elsif _formato = 'cta' then especialistas := array['cta_specialist'];
  elsif _formato = 'pacote_completo' then especialistas := array['hook_master','headline_architect','cta_specialist'];
  else raise exception 'Formato invalido.'; end if;

  papeis := array['gatekeeper','analise_psicologica'] || especialistas
            || array['auditor','correcao','auditoria_final','adaptador_local','validador_preservacao','ranking','consolidador'];

  insert into public.execucoes (user_id, chat_id, formato_solicitado, snapshot_chat, snapshot_marca, snapshot_privacidade)
    values (uid, _chat_id, _formato, coalesce(_snapshot_chat,'{}'::jsonb), coalesce(_snapshot_marca,'{}'::jsonb), coalesce(_snapshot_privacidade,'{}'::jsonb))
    returning id into exec_id;

  insert into public.execucao_fotografias (user_id, execucao_id, modo_privacidade)
    values (uid, exec_id, _modo_privacidade) returning id into foto_id;
  update public.execucoes set fotografia_id = foto_id where id = exec_id;

  for perm in select * from jsonb_array_elements(coalesce(_permissoes, '[]'::jsonb)) loop
    -- provedor sempre normalizado no servidor: rotulo de exibicao nunca vira autorizacao
    insert into public.fotografias_consentimento
      (user_id, fotografia_id, categoria, provedor, etapa, finalidade, decisao, termos_id, termos_versao, origem)
    values (uid, foto_id, perm->>'categoria', public.provedor_canonico(perm->>'provedor'),
            perm->>'etapa', perm->>'finalidade',
            perm->>'decisao', (perm->>'termos_id')::uuid, (perm->>'termos_versao')::integer, perm->>'origem');
  end loop;

  foreach p in array papeis loop
    i := i + 1;
    papel_registry := case
      when p = 'correcao' then especialistas[1]
      when p = 'auditoria_final' then 'auditor'
      else p end;

    select rv.* into vrec from public.registry_versoes rv
      join public.registry_agentes ra on ra.id = rv.agente_id
      where ra.papel = papel_registry and rv.id = ra.versao_publicada_id and rv.ativo;
    if vrec is null then raise exception 'Papel % sem versao publicada ativa.', papel_registry; end if;
    vid := vrec.id;
    custo := custo + vrec.orcamento_estimado;

    insert into public.execucao_registry_versoes (execucao_id, papel, registry_versao_id)
      values (exec_id, p, vid);

    dep := case
      when p = 'gatekeeper' then '{}'::text[]
      when p = 'analise_psicologica' then array['gatekeeper']
      when p = any(especialistas) then array['analise_psicologica']
      when p = 'auditor' then especialistas
      when p = 'correcao' then array['auditor']
      when p = 'auditoria_final' then array['correcao']
      when p = 'adaptador_local' then array['auditoria_final']
      when p = 'validador_preservacao' then array['adaptador_local']
      when p = 'ranking' then array['validador_preservacao']
      else array['ranking'] end;

    cat := case
      when p in ('adaptador_local','validador_preservacao','ranking','consolidador') then null
      when p in ('auditor','auditoria_final') then 'variacoes_para_auditoria'
      when p = 'correcao' then 'feedback_para_correcao'
      else 'briefing' end;

    bloqueada := cat is not null and not public.etapa_consentida(foto_id, cat, vrec.provedor);
    if bloqueada then alguma_bloqueada := true; end if;

    insert into public.execucao_etapas (execucao_id, papel, ordem, estado, categoria_requerida, depende_de,
      registry_versao_id, tentativas_limite, backoff_base_ms, timeout_ms)
    values (exec_id, p, i, case when bloqueada then 'bloqueada' else 'pendente' end, cat, dep,
      vid, vrec.tentativas_max, vrec.backoff_base_ms, vrec.timeout_ms);
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
$function$;

-- ---------------------------------------------------------------
-- 4. Reconciliacao respeita o provedor da etapa
-- ---------------------------------------------------------------
create or replace function public.reconciliar_consentimento_execucao(_execucao_id uuid)
 returns integer language plpgsql security definer set search_path to 'public' as $function$
declare n integer := 0; r record; ex record;
begin
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  select * into ex from public.execucoes where id = _execucao_id;
  if ex.id is null or ex.fotografia_id is null then return 0; end if;
  if ex.estado in ('concluida','parcialmente_concluida','falhou','cancelada') then return 0; end if;

  for r in
    select e.id from public.execucao_etapas e
    join public.registry_versoes rv on rv.id = e.registry_versao_id
    where e.execucao_id = _execucao_id
      and e.estado = 'bloqueada'
      and e.categoria_requerida is not null
      and public.etapa_consentida(ex.fotografia_id, e.categoria_requerida, rv.provedor)
  loop
    perform public.aplicar_transicao_etapa(r.id, 'pendente', 'consentimento da execucao');
    n := n + 1;
  end loop;

  if ex.estado = 'aguardando_consentimento'
     and not exists (select 1 from public.execucao_etapas where execucao_id = _execucao_id and estado = 'bloqueada') then
    perform public.aplicar_transicao_execucao(_execucao_id, 'pronta', 'consentimentos satisfeitos');
  end if;

  return n;
end;
$function$;

-- ---------------------------------------------------------------
-- 5. Autorizacao por execucao com recorte por provedor
-- ---------------------------------------------------------------
drop function if exists public.autorizar_execucao(uuid, text[]);
drop function if exists public.autorizar_execucao_persistente(uuid, text[], text);
drop function if exists public.desbloquear_etapas(uuid, text);

create or replace function public.autorizar_execucao(_execucao_id uuid, _categorias text[], _provedores text[] default null)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  uid uuid := auth.uid();
  ex record; cat text; etapa record; t record;
  _finalidade text; concedidas text[] := array[]::text[]; inseridas integer := 0; liberadas integer := 0;
  filtro text[] := nullif(_provedores, array[]::text[]);
begin
  if uid is null then raise exception 'Sessao ausente.'; end if;
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  if filtro is not null and exists (select 1 from unnest(filtro) x where x not in ('openai','anthropic')) then
    raise exception 'Provedor invalido.';
  end if;

  select * into ex from public.execucoes where id = _execucao_id;
  if ex.fotografia_id is null then raise exception 'Execucao sem fotografia de consentimento.'; end if;
  if ex.estado in ('concluida','parcialmente_concluida','falhou','cancelada') then
    raise exception 'Execucao encerrada.';
  end if;

  foreach cat in array coalesce(_categorias, array[]::text[]) loop
    if cat in ('memoria_local_estilo','exemplos_locais','preferencias_inferidas') then
      raise exception 'Categoria local nao pode ser autorizada.';
    end if;

    select tc.id, tc.versao into t from public.termos_consentimento tc
      where tc.chave = cat and tc.vigente limit 1;
    if t.id is null then raise exception 'Categoria desconhecida.'; end if;

    for etapa in
      select distinct e.papel, rv.provedor
      from public.execucao_etapas e
      join public.registry_versoes rv on rv.id = e.registry_versao_id
      where e.execucao_id = _execucao_id
        and (
          e.categoria_requerida = cat
          or (cat in ('resumo_voz_marca','resumo_voz_marca_explicita')
              and e.papel in ('hook_master','headline_architect','cta_specialist','correcao','auditor','auditoria_final'))
        )
        and rv.provedor <> 'simulado'
        and (filtro is null or rv.provedor = any (filtro))
    loop
      _finalidade := case cat
        when 'briefing' then 'Interpretar o briefing nesta execucao'
        when 'variacoes_para_auditoria' then 'Avaliar qualidade e conformidade das variacoes desta execucao'
        when 'feedback_para_correcao' then 'Enviar as observacoes da auditoria para a correcao unica desta execucao'
        when 'resumo_voz_marca_explicita' then 'Adequar as variacoes ao perfil explicito de Voz de Marca'
        when 'resumo_voz_marca' then 'Adequar as variacoes ao perfil explicito de Voz de Marca'
        when 'texto_gerado' then 'Processar o texto gerado nesta execucao'
        else 'Registrar metadados tecnicos desta execucao'
      end;

      if not exists (
        select 1 from public.fotografias_consentimento f
        where f.fotografia_id = ex.fotografia_id
          and f.categoria = cat and f.provedor = etapa.provedor
          and f.etapa = etapa.papel and f.finalidade = _finalidade
      ) then
        insert into public.fotografias_consentimento
          (user_id, fotografia_id, categoria, provedor, etapa, finalidade, decisao, termos_id, termos_versao, origem)
        values (uid, ex.fotografia_id, cat, etapa.provedor, etapa.papel, _finalidade, 'concedido', t.id, t.versao, 'execucao');
        inseridas := inseridas + 1;
      end if;
      if not (cat = any (concedidas)) then concedidas := concedidas || cat; end if;
    end loop;
  end loop;

  if inseridas = 0 and array_length(concedidas, 1) is null then
    raise exception 'Nenhuma etapa desta execucao depende das categorias informadas.';
  end if;

  liberadas := public.reconciliar_consentimento_execucao(_execucao_id);

  perform public.registrar_evento_tecnico(
    _tipo := 'consentimento_execucao', _etapa := null, _provedor := null, _modelo := null,
    _duracao_ms := null, _status := 'ok', _codigo_erro := null, _tentativas := 0, _custo := 0,
    _chat_id := ex.chat_id, _tokens_entrada := 0, _tokens_saida := 0);

  return jsonb_build_object('concedidas', to_jsonb(concedidas), 'desbloqueadas', liberadas, 'registradas', inseridas);
end;
$function$;

create or replace function public.autorizar_execucao_persistente(_execucao_id uuid, _categorias text[], _escopo text, _provedores text[] default null)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  uid uuid := auth.uid();
  ex record; cat text; etapa record;
  _finalidade text; aplicaveis text[] := array[]::text[]; persistidos integer := 0;
  filtro text[] := nullif(_provedores, array[]::text[]);
  res jsonb := jsonb_build_object('concedidas', '[]'::jsonb, 'desbloqueadas', 0, 'registradas', 0);
begin
  if uid is null then raise exception 'Sessao ausente.'; end if;
  if _escopo not in ('chat','conta') then raise exception 'Escopo invalido.'; end if;
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  if filtro is not null and exists (select 1 from unnest(filtro) x where x not in ('openai','anthropic')) then
    raise exception 'Provedor invalido.';
  end if;

  select * into ex from public.execucoes where id = _execucao_id;
  if ex.estado in ('concluida','parcialmente_concluida','falhou','cancelada') then
    raise exception 'Execucao encerrada.';
  end if;
  if _escopo = 'chat' and ex.chat_id is null then raise exception 'Execucao sem chat.'; end if;

  foreach cat in array coalesce(_categorias, array[]::text[]) loop
    if cat in ('memoria_local_estilo','exemplos_locais','preferencias_inferidas') then
      raise exception 'Categoria local nao pode ser autorizada.';
    end if;

    for etapa in
      select distinct e.papel, rv.provedor
      from public.execucao_etapas e
      join public.registry_versoes rv on rv.id = e.registry_versao_id
      where e.execucao_id = _execucao_id
        and (
          e.categoria_requerida = cat
          or (cat in ('resumo_voz_marca','resumo_voz_marca_explicita')
              and e.papel in ('hook_master','headline_architect','cta_specialist','correcao','auditor','auditoria_final'))
        )
        and rv.provedor <> 'simulado'
        and (filtro is null or rv.provedor = any (filtro))
    loop
      _finalidade := case cat
        when 'briefing' then 'Interpretar o briefing nesta execucao'
        when 'variacoes_para_auditoria' then 'Avaliar qualidade e conformidade das variacoes desta execucao'
        when 'feedback_para_correcao' then 'Enviar as observacoes da auditoria para a correcao unica desta execucao'
        when 'resumo_voz_marca_explicita' then 'Adequar as variacoes ao perfil explicito de Voz de Marca'
        when 'resumo_voz_marca' then 'Adequar as variacoes ao perfil explicito de Voz de Marca'
        when 'texto_gerado' then 'Processar o texto gerado nesta execucao'
        else 'Registrar metadados tecnicos desta execucao'
      end;

      perform public.registrar_consentimento(
        _escopo := _escopo,
        _escopo_id := case when _escopo = 'chat' then ex.chat_id else null end,
        _categoria := cat, _provedor := etapa.provedor, _etapa := etapa.papel,
        _finalidade := _finalidade, _decisao := 'concedido', _origem := 'modal');
      persistidos := persistidos + 1;

      if not (cat = any (aplicaveis)) then aplicaveis := aplicaveis || cat; end if;
    end loop;
  end loop;

  if array_length(aplicaveis, 1) is not null then
    res := public.autorizar_execucao(_execucao_id, aplicaveis, filtro);
  end if;

  return res || jsonb_build_object('escopo', _escopo, 'persistidos', persistidos);
end;
$function$;
