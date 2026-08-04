CREATE OR REPLACE FUNCTION public.reconciliar_custo(_execucao_id uuid, _chave text, _custo_real numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare r record;
begin
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;

  update public.execucao_reservas_custo set custo_real = greatest(coalesce(_custo_real, 0), 0)
    where execucao_id = _execucao_id and chave = _chave
    returning * into r;

  if r.id is not null and r.custo_real > r.custo_reservado then
    insert into public.eventos_tecnicos
      (user_id, chat_id, tipo, etapa, status, codigo_erro, tentativas, custo_estimado)
    select e.user_id, e.chat_id, 'excedente_orcamento', et.papel, 'erro',
           'custo_real_acima_da_reserva', 1, r.custo_real - r.custo_reservado
      from public.execucoes e
      left join public.execucao_etapas et on et.id = r.etapa_id
     where e.id = _execucao_id;
  end if;

  update public.execucoes set custo_real = (
    select coalesce(sum(coalesce(custo_real, custo_reservado)), 0)
      from public.execucao_reservas_custo where execucao_id = _execucao_id)
    where id = _execucao_id;
end;
$$;