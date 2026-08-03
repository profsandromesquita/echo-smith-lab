-- 1. nova categoria de consentimento: feedback da auditoria para o especialista de origem
alter table public.consentimentos drop constraint consentimentos_categoria_check;
alter table public.consentimentos add constraint consentimentos_categoria_check
  check (categoria = any (array['briefing','resumo_voz_marca','texto_gerado','metadados','variacoes_para_auditoria','feedback_para_correcao']));

insert into public.termos_consentimento (chave, versao, vigente, titulo, corpo)
select 'feedback_para_correcao', 1, true,
  'Envio do feedback da auditoria para correcao',
  'As observacoes da auditoria (provedor OpenAI) e os textos reprovados sao enviados de volta ao especialista de origem (provedor Anthropic) para uma unica correcao. Sem esta autorizacao a correcao nao acontece e as variacoes reprovadas ficam fora da entrega.'
where not exists (select 1 from public.termos_consentimento where chave = 'feedback_para_correcao');

-- 2. reservas de custo por chamada real
create table if not exists public.execucao_reservas_custo (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references public.execucoes(id) on delete cascade,
  etapa_id uuid references public.execucao_etapas(id) on delete set null,
  chave text not null,
  custo_reservado numeric(10,4) not null,
  custo_real numeric(10,4),
  criado_em timestamptz not null default now(),
  unique (execucao_id, chave)
);
create index if not exists execucao_reservas_custo_exec_idx on public.execucao_reservas_custo (execucao_id);
grant select on public.execucao_reservas_custo to authenticated;
grant all on public.execucao_reservas_custo to service_role;
alter table public.execucao_reservas_custo enable row level security;
drop policy if exists "Le reservas da propria execucao" on public.execucao_reservas_custo;
create policy "Le reservas da propria execucao" on public.execucao_reservas_custo
  for select to authenticated using (public.execucao_e_minha(execucao_id));

create or replace function public.reservar_custo(_execucao_id uuid, _etapa_id uuid, _chave text, _custo numeric)
returns boolean language plpgsql security definer set search_path = '' as $$
declare ex record; total numeric; teto numeric;
begin
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  select * into ex from public.execucoes where id = _execucao_id for update;
  if ex is null then return false; end if;
  if exists (select 1 from public.execucao_reservas_custo where execucao_id = _execucao_id and chave = _chave) then
    return true;
  end if;
  select coalesce(sum(coalesce(custo_real, custo_reservado)), 0) into total
    from public.execucao_reservas_custo where execucao_id = _execucao_id;
  -- teto autoritativo: orcamento publicado da execucao mais margem fixa de correcao
  teto := round(coalesce(ex.custo_estimado, 0) * 1.5, 4);
  if total + coalesce(_custo, 0) > teto then return false; end if;
  insert into public.execucao_reservas_custo (execucao_id, etapa_id, chave, custo_reservado)
    values (_execucao_id, _etapa_id, _chave, coalesce(_custo, 0));
  return true;
end;
$$;
revoke all on function public.reservar_custo(uuid, uuid, text, numeric) from public, anon;
grant execute on function public.reservar_custo(uuid, uuid, text, numeric) to authenticated, service_role;

create or replace function public.reconciliar_custo(_execucao_id uuid, _chave text, _custo_real numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  update public.execucao_reservas_custo set custo_real = coalesce(_custo_real, 0)
    where execucao_id = _execucao_id and chave = _chave;
  update public.execucoes set custo_real = (
    select coalesce(sum(coalesce(custo_real, custo_reservado)), 0)
      from public.execucao_reservas_custo where execucao_id = _execucao_id)
    where id = _execucao_id;
end;
$$;
revoke all on function public.reconciliar_custo(uuid, text, numeric) from public, anon;
grant execute on function public.reconciliar_custo(uuid, text, numeric) to authenticated, service_role;

-- 3. grafo do pipeline: especialistas em paralelo, correcao e auditoria final
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
    insert into public.fotografias_consentimento
      (user_id, fotografia_id, categoria, provedor, etapa, finalidade, decisao, termos_id, termos_versao, origem)
    values (uid, foto_id, perm->>'categoria', perm->>'provedor', perm->>'etapa', perm->>'finalidade',
            perm->>'decisao', (perm->>'termos_id')::uuid, (perm->>'termos_versao')::integer, perm->>'origem');
  end loop;

  foreach p in array papeis loop
    i := i + 1;
    -- a correcao roda no especialista de origem e a auditoria final no auditor:
    -- ambas herdam a versao publicada desses papeis, sem criar agente novo
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

    bloqueada := cat is not null and not exists (
      select 1 from public.fotografias_consentimento f
      where f.fotografia_id = foto_id and f.categoria = cat and f.decisao = 'concedido');
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
$$;

-- 4. paralelismo controlado: no maximo tres etapas em execucao por execucao
create or replace function public.reservar_etapa(_execucao_id uuid)
returns table (etapa_id uuid, papel text, lease_token uuid, tentativa integer)
language plpgsql security definer set search_path = '' as $$
declare e record; alvo record; token uuid; ativas integer;
begin
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  perform public.recuperar_etapas_expiradas(_execucao_id);
  select * into e from public.execucoes where id = _execucao_id;
  if e.estado = 'pronta' then perform public.aplicar_transicao_execucao(_execucao_id, 'em_processamento', 'primeiro avanco');
  elsif e.estado <> 'em_processamento' then return; end if;

  select count(*) into ativas from public.execucao_etapas
    where execucao_id = _execucao_id and estado = 'em_execucao';
  if ativas >= 3 then return; end if;

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
revoke all on function public.reservar_etapa(uuid) from public, anon;
grant execute on function public.reservar_etapa(uuid) to authenticated, service_role;

-- 5. Registry: o CTA Specialist passa a ser permitido no provedor Anthropic
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
    if ag.papel not in ('hook_master','headline_architect','cta_specialist') then
      problemas := problemas || 'nesta fase somente hook master, headline architect e cta specialist podem usar o provedor anthropic'::text;
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