create or replace function public.criar_execucao_para_mensagem(
  _chat_id uuid,
  _mensagem_id uuid,
  _formato text,
  _snapshot_marca jsonb,
  _snapshot_privacidade jsonb,
  _modo_privacidade text,
  _permissoes jsonb,
  _reexecutar boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  existente record;
  proxima integer;
  novo uuid;
begin
  if uid is null then raise exception 'Sessao ausente.'; end if;
  if not public.chat_e_meu(_chat_id) then raise exception 'Recurso indisponivel.'; end if;
  if not exists (
    select 1 from public.mensagens m
    where m.id = _mensagem_id and m.user_id = uid and m.chat_id = _chat_id and m.autor = 'usuario'
  ) then
    raise exception 'Recurso indisponivel.';
  end if;

  -- Trava canonica: liberada no fim da transacao. Impede criacao concorrente duplicada.
  perform pg_advisory_xact_lock(
    hashtextextended(uid::text || ':' || _chat_id::text || ':' || _mensagem_id::text, 0)
  );

  select e.id as id,
         e.estado as estado,
         coalesce((e.snapshot_chat->>'reexecucao')::int, 0) as reexec
    into existente
  from public.execucoes e
  where e.user_id = uid
    and e.chat_id = _chat_id
    and e.snapshot_chat->>'mensagem_id' = _mensagem_id::text
  order by coalesce((e.snapshot_chat->>'reexecucao')::int, 0) desc, e.criada_em desc
  limit 1;

  if existente.id is not null then
    if existente.estado not in ('concluida','parcialmente_concluida','falhou','cancelada')
       or not _reexecutar then
      return jsonb_build_object('id', existente.id, 'criada', false, 'reexecucao', existente.reexec);
    end if;
  end if;

  proxima := case when existente.id is null then 0 else existente.reexec + 1 end;

  novo := public.criar_execucao(
    _chat_id,
    _formato,
    jsonb_build_object(
      'chat_id', _chat_id,
      'formato', _formato,
      'mensagem_id', _mensagem_id,
      'reexecucao', proxima
    ),
    coalesce(_snapshot_marca, '{}'::jsonb),
    coalesce(_snapshot_privacidade, '{}'::jsonb),
    _modo_privacidade,
    coalesce(_permissoes, '[]'::jsonb)
  );

  return jsonb_build_object('id', novo, 'criada', true, 'reexecucao', proxima);
end;
$function$;

grant execute on function public.criar_execucao_para_mensagem(uuid, uuid, text, jsonb, jsonb, text, jsonb, boolean) to authenticated;