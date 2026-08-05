create or replace function public.reservar_custo_v2(_execucao_id uuid, _etapa_id uuid, _tentativa integer, _tipo text, _escopo text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare ex record; et record; total numeric; teto numeric; reserva numeric; v_chave text;
begin
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  if _tipo not in ('etapa','correcao') then raise exception 'Tipo de reserva invalido.'; end if;
  if _tentativa is null or _tentativa < 1 then raise exception 'Tentativa invalida.'; end if;
  if _tipo = 'correcao' and coalesce(_escopo, '') = '' then raise exception 'Escopo obrigatorio.'; end if;

  select * into ex from public.execucoes where id = _execucao_id for update;
  if ex is null then return false; end if;
  if ex.estado in ('concluida','parcialmente_concluida','falhou','cancelada','cancelamento_solicitado') then
    return false;
  end if;

  select * into et from public.execucao_etapas where id = _etapa_id and execucao_id = _execucao_id;
  if et is null or et.registry_versao_id is null then return false; end if;
  if et.estado = 'resultado_incerto' then return false; end if;
  if et.tentativas is distinct from _tentativa then return false; end if;

  if ex.estado = 'resultado_incerto' then
    if et.estado <> 'em_execucao' then return false; end if;
    if et.lease_token is null or et.lease_ate is null or et.lease_ate < now() then return false; end if;
    if public.etapa_depende_de_incerta(_etapa_id) then return false; end if;
  end if;

  if _tipo = 'etapa' then
    v_chave := 'etapa:' || _etapa_id::text || ':' || _tentativa::text;
  else
    v_chave := 'correcao:' || _escopo || ':' || _etapa_id::text || ':' || _tentativa::text;
  end if;

  if exists (select 1 from public.execucao_reservas_custo r where r.execucao_id = _execucao_id and r.chave = v_chave) then
    return true;
  end if;

  if _tipo = 'correcao' and exists (
    select 1 from public.execucao_reservas_custo r
     where r.execucao_id = _execucao_id and r.chave like 'correcao:' || _escopo || ':%'
  ) then
    return false;
  end if;

  reserva := public.custo_maximo_versao(et.registry_versao_id);
  teto := public.teto_execucao(_execucao_id);
  select coalesce(sum(coalesce(r.custo_real, r.custo_reservado)), 0) into total
    from public.execucao_reservas_custo r where r.execucao_id = _execucao_id;
  if total + reserva > teto then return false; end if;

  insert into public.execucao_reservas_custo (execucao_id, etapa_id, chave, custo_reservado)
    values (_execucao_id, _etapa_id, v_chave, reserva);
  return true;
end; $$;