ALTER TABLE public.execucoes DROP CONSTRAINT execucoes_estado_check;
ALTER TABLE public.execucoes ADD CONSTRAINT execucoes_estado_check CHECK (estado = ANY (ARRAY['criada'::text,'aguardando_consentimento'::text,'aguardando_complemento'::text,'pronta'::text,'em_processamento'::text,'resultado_incerto'::text,'parcialmente_concluida'::text,'concluida'::text,'falhou'::text,'cancelamento_solicitado'::text,'cancelada'::text]));

CREATE OR REPLACE FUNCTION public.aplicar_transicao_execucao(_execucao_id uuid, _para text, _motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'aguardando_complemento>em_processamento','aguardando_complemento>aguardando_consentimento',
    'aguardando_complemento>cancelamento_solicitado','aguardando_complemento>cancelada','aguardando_complemento>falhou',
    'pronta>em_processamento','pronta>cancelamento_solicitado','pronta>cancelada','pronta>falhou',
    'pronta>parcialmente_concluida','pronta>concluida','pronta>resultado_incerto',
    'em_processamento>concluida','em_processamento>parcialmente_concluida','em_processamento>falhou',
    'em_processamento>aguardando_consentimento','em_processamento>aguardando_complemento','em_processamento>resultado_incerto',
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
end; $function$;

CREATE OR REPLACE FUNCTION public.aplicar_transicao_etapa(_etapa_id uuid, _para text, _motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare de_estado text; exec_id uuid;
begin
  select estado, execucao_id into de_estado, exec_id from public.execucao_etapas where id = _etapa_id for update;
  if de_estado is null then raise exception 'Etapa inexistente.'; end if;
  if de_estado = _para then return; end if;
  if not ((de_estado || '>' || _para) = any (array[
    'bloqueada>pendente','bloqueada>cancelada','bloqueada>falhou',
    'pendente>em_execucao','pendente>cancelada','pendente>bloqueada','pendente>falhou',
    'em_execucao>concluida','em_execucao>falhou','em_execucao>cancelada',
    'em_execucao>resultado_incerto','em_execucao>pendente',
    'concluida>pendente',
    'falhou>pendente','falhou>cancelada',
    'resultado_incerto>pendente','resultado_incerto>concluida','resultado_incerto>cancelada','resultado_incerto>falhou'])) then
    raise exception 'Transicao de etapa invalida: % -> %', de_estado, _para;
  end if;
  update public.execucao_etapas set estado = _para where id = _etapa_id;
  insert into public.execucao_eventos (execucao_id, etapa_id, de, para, motivo) values (exec_id, _etapa_id, de_estado, _para, _motivo);
end;
$function$;

CREATE OR REPLACE FUNCTION public.responder_complemento_briefing(_execucao_id uuid, _mensagem_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  ex record;
  etapa record;
  complementos jsonb;
begin
  if uid is null then raise exception 'Sessao ausente.'; end if;
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;

  select * into ex from public.execucoes where id = _execucao_id for update;
  if ex.estado <> 'aguardando_complemento' then
    raise exception 'Esta execucao nao esta aguardando complemento.';
  end if;

  if not exists (
    select 1 from public.mensagens m
     where m.id = _mensagem_id and m.user_id = uid and m.chat_id = ex.chat_id and m.autor = 'usuario'
  ) then
    raise exception 'Recurso indisponivel.';
  end if;

  select * into etapa from public.execucao_etapas
   where execucao_id = _execucao_id and papel = 'gatekeeper'
   for update;
  if etapa is null then raise exception 'Etapa de triagem inexistente.'; end if;

  complementos := coalesce(ex.snapshot_chat -> 'complementos', '[]'::jsonb) || to_jsonb(_mensagem_id::text);
  update public.execucoes
     set snapshot_chat = jsonb_set(ex.snapshot_chat, '{complementos}', complementos, true)
   where id = _execucao_id;

  update public.execucao_etapas
     set lease_token = null, lease_ate = null, proxima_tentativa_em = null,
         ultimo_codigo_erro = null, tentativas_limite = tentativas_limite + 1
   where id = etapa.id;
  perform public.aplicar_transicao_etapa(etapa.id, 'pendente', 'complemento de briefing recebido');
  perform public.aplicar_transicao_execucao(_execucao_id, 'em_processamento', 'complemento de briefing recebido');

  return jsonb_build_object('etapa_id', etapa.id, 'complementos', jsonb_array_length(complementos));
end; $function$;