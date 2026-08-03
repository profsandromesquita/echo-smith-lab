alter table public.consentimentos drop constraint consentimentos_categoria_check;
alter table public.consentimentos add constraint consentimentos_categoria_check
  check (categoria = any (array['briefing','resumo_voz_marca','texto_gerado','metadados','variacoes_para_auditoria']));

insert into public.termos_consentimento (chave, versao, vigente, titulo, corpo)
select 'variacoes_para_auditoria', 1, true,
  'Envio das variacoes geradas para auditoria',
  'As variacoes produzidas pelos especialistas (provedor Anthropic) sao enviadas ao provedor OpenAI para auditoria de qualidade e conformidade. Nenhum texto e enviado sem esta autorizacao.'
where not exists (select 1 from public.termos_consentimento where chave = 'variacoes_para_auditoria');

create or replace function public.criar_execucao(
  _chat_id uuid, _formato text, _snapshot_chat jsonb, _snapshot_marca jsonb,
  _snapshot_privacidade jsonb, _modo_privacidade text, _permissoes jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
  if _formato = 'hook' then papeis := papeis || array['hook_master'];
  elsif _formato in ('headline_video','headline_imagem') then papeis := papeis || array['headline_architect'];
  elsif _formato = 'cta' then papeis := papeis || array['cta_specialist'];
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

    cat := case
      when p in ('adaptador_local','validador_preservacao','ranking','consolidador') then null
      when p = 'auditor' then 'variacoes_para_auditoria'
      else 'briefing' end;
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

create or replace function public.registry_validar(_versao_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v record; problemas text[] := '{}'; ag record; esforco text;
begin
  perform public.registry_exigir_admin();
  select * into v from public.registry_versoes where id = _versao_id;
  if v is null or v.estado <> 'rascunho' then raise exception 'Apenas rascunhos podem ser validados.'; end if;
  select * into ag from public.registry_agentes where id = v.agente_id;

  if jsonb_typeof(v.schema_entrada) <> 'object' then problemas := problemas || 'schema de entrada invalido'::text; end if;
  if jsonb_typeof(v.schema_saida) <> 'object' then problemas := problemas || 'schema de saida invalido'::text; end if;
  if length(trim(coalesce(v.instrucoes_sistema,''))) < 10 then problemas := problemas || 'instrucoes muito curtas'::text; end if;
  if v.limite_saida > v.limite_entrada then problemas := problemas || 'limite de saida maior que o de entrada'::text; end if;

  if v.provedor not in ('simulado','openai','anthropic') then
    problemas := problemas || 'provedor nao suportado nesta fase'::text;
  end if;

  if v.provedor = 'openai' then
    if ag.papel not in ('gatekeeper','analise_psicologica','auditor') then
      problemas := problemas || 'nesta fase somente gatekeeper, analise psicologica e auditor podem usar o provedor openai'::text;
    end if;
    if v.modelo not in ('gpt-5.6','gpt-5.6-sol') then
      problemas := problemas || 'modelo nao permitido para o provedor openai'::text;
    end if;
    esforco := coalesce(v.parametros->>'reasoning_effort', '');
    if ag.papel = 'auditor' then
      if esforco not in ('high','xhigh','max') then
        problemas := problemas || 'esforco do auditor deve ser high, xhigh ou max'::text;
      end if;
    else
      if esforco not in ('low','medium') then
        problemas := problemas || 'esforco de raciocinio deve ser low ou medium neste papel'::text;
      end if;
    end if;
    if coalesce((v.parametros->>'structured_outputs')::boolean, true) is not true then
      problemas := problemas || 'saida estruturada estrita e obrigatoria'::text;
    end if;
    if v.limite_saida > 128000 then
      problemas := problemas || 'limite de saida acima do maximo do modelo'::text;
    end if;
    if v.orcamento_estimado <= 0 then
      problemas := problemas || 'defina um orcamento estimado maior que zero para provedor real'::text;
    end if;
  elsif v.provedor = 'anthropic' then
    if ag.papel not in ('hook_master','headline_architect') then
      problemas := problemas || 'nesta fase somente hook master e headline architect podem usar o provedor anthropic'::text;
    end if;
    if v.modelo <> 'claude-fable-5' then
      problemas := problemas || 'modelo nao permitido para o provedor anthropic'::text;
    end if;
    esforco := coalesce(v.parametros->>'effort', '');
    if esforco not in ('low','medium','high','xhigh','max') then
      problemas := problemas || 'nivel de esforco deve ser low, medium, high, xhigh ou max'::text;
    end if;
    if coalesce((v.parametros->>'structured_outputs')::boolean, true) is not true then
      problemas := problemas || 'saida estruturada estrita e obrigatoria'::text;
    end if;
    if v.limite_saida > 128000 then
      problemas := problemas || 'limite de saida acima do maximo do modelo'::text;
    end if;
    if v.orcamento_estimado <= 0 then
      problemas := problemas || 'defina um orcamento estimado maior que zero para provedor real'::text;
    end if;
  elsif v.modelo not like 'mock-%' then
    problemas := problemas || 'modelo simulado deve comecar com mock-'::text;
  end if;

  if array_length(problemas, 1) is null then
    update public.registry_versoes set validada_em = now(), resultado_validacao = '{"ok":true}'::jsonb where id = _versao_id;
    return '{"ok":true}'::jsonb;
  end if;
  update public.registry_versoes set validada_em = null,
    resultado_validacao = jsonb_build_object('ok', false, 'problemas', to_jsonb(problemas)) where id = _versao_id;
  return jsonb_build_object('ok', false, 'problemas', to_jsonb(problemas));
end;
$$;