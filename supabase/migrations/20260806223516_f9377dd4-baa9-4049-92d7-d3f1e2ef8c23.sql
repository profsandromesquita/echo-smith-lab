CREATE OR REPLACE FUNCTION public.marcar_briefing_insuficiente(_execucao_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare est text;
begin
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  select estado into est from public.execucoes where id = _execucao_id for update;
  if est <> 'em_processamento' then return est; end if;
  if not exists (
    select 1 from public.execucao_etapas
     where execucao_id = _execucao_id and papel = 'gatekeeper' and estado = 'concluida'
  ) then
    raise exception 'Triagem nao concluida.';
  end if;
  perform public.aplicar_transicao_execucao(_execucao_id, 'aguardando_complemento', 'briefing insuficiente');
  return 'aguardando_complemento';
end; $function$;

REVOKE ALL ON FUNCTION public.marcar_briefing_insuficiente(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.marcar_briefing_insuficiente(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.responder_complemento_briefing(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.responder_complemento_briefing(uuid, uuid) TO authenticated, service_role;