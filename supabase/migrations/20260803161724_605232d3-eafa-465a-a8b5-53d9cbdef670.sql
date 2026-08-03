CREATE OR REPLACE FUNCTION public.criar_execucao(_chat_id uuid, _formato text, _snapshot_chat jsonb, _snapshot_marca jsonb, _snapshot_privacidade jsonb, _modo_privacidade text, _permissoes jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;