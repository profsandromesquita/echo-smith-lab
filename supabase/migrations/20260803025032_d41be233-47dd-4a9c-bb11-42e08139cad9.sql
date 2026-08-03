create or replace function public.pesos_ranking_da_execucao(_execucao_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p jsonb;
begin
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  select rv.parametros->'pesos' into p
    from public.execucao_registry_versoes erv
    join public.registry_versoes rv on rv.id = erv.registry_versao_id
   where erv.execucao_id = _execucao_id and erv.papel = 'ranking';
  return coalesce(p, '{}'::jsonb);
end;
$$;
revoke all on function public.pesos_ranking_da_execucao(uuid) from public, anon;
grant execute on function public.pesos_ranking_da_execucao(uuid) to authenticated, service_role;