-- 1. Novas categorias com origem explícita do dado
alter table public.consentimentos drop constraint if exists consentimentos_categoria_check;
alter table public.consentimentos add constraint consentimentos_categoria_check
  check (categoria = any (array[
    'briefing','resumo_voz_marca','texto_gerado','metadados',
    'variacoes_para_auditoria','feedback_para_correcao',
    'resumo_voz_marca_explicita','memoria_local_estilo','exemplos_locais','preferencias_inferidas'
  ]));

insert into public.termos_consentimento (chave, versao, titulo, corpo, vigente)
values
  ('resumo_voz_marca_explicita', 1, 'Envio do resumo explicito de Voz de Marca',
   'Envio apenas do perfil de Voz de Marca preenchido e salvo por voce. Nao inclui memoria local de estilo, exemplos locais nem preferencias inferidas.', true),
  ('memoria_local_estilo', 1, 'Memoria local de estilo',
   'Memoria adaptativa de estilo derivada de favoritos e edicoes. Permanece no dispositivo.', true),
  ('exemplos_locais', 1, 'Exemplos locais',
   'Exemplos guardados apenas no dispositivo. Permanecem no dispositivo.', true),
  ('preferencias_inferidas', 1, 'Preferencias inferidas',
   'Preferencias deduzidas do seu uso. Permanecem no dispositivo.', true)
on conflict do nothing;

-- 2. Reconciliação idempotente: libera etapas já cobertas pela fotografia
create or replace function public.reconciliar_consentimento_execucao(_execucao_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer := 0; r record; ex record;
begin
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  select * into ex from public.execucoes where id = _execucao_id;
  if ex.id is null or ex.fotografia_id is null then return 0; end if;
  if ex.estado in ('concluida','parcialmente_concluida','falhou','cancelada') then return 0; end if;

  for r in
    select e.id from public.execucao_etapas e
    where e.execucao_id = _execucao_id
      and e.estado = 'bloqueada'
      and e.categoria_requerida is not null
      and exists (
        select 1 from public.fotografias_consentimento f
        where f.fotografia_id = ex.fotografia_id
          and f.categoria = e.categoria_requerida
          and f.decisao = 'concedido'
      )
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
$$;

revoke all on function public.reconciliar_consentimento_execucao(uuid) from public, anon;
grant execute on function public.reconciliar_consentimento_execucao(uuid) to authenticated;

-- 3. Autorização válida somente para a execução atual
create or replace function public.autorizar_execucao(_execucao_id uuid, _categorias text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ex record; cat text; etapa record; t record;
  finalidade text; concedidas text[] := array[]::text[]; inseridas integer := 0; liberadas integer := 0;
begin
  if uid is null then raise exception 'Sessao ausente.'; end if;
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;

  select * into ex from public.execucoes where id = _execucao_id;
  if ex.fotografia_id is null then raise exception 'Execucao sem fotografia de consentimento.'; end if;
  if ex.estado in ('concluida','parcialmente_concluida','falhou','cancelada') then
    raise exception 'Execucao encerrada.';
  end if;

  foreach cat in array coalesce(_categorias, array[]::text[]) loop
    -- memoria privada local nunca sai do dispositivo
    if cat in ('memoria_local_estilo','exemplos_locais','preferencias_inferidas') then
      raise exception 'Categoria local nao pode ser autorizada.';
    end if;

    select tc.id, tc.versao into t from public.termos_consentimento tc
      where tc.chave = cat and tc.vigente limit 1;
    if t.id is null then raise exception 'Categoria desconhecida.'; end if;

    -- etapa real da execucao que justifica a categoria; provedor/modelo vem do Registry fixado
    for etapa in
      select distinct e.papel, rv.provedor, rv.modelo
      from public.execucao_etapas e
      join public.registry_versoes rv on rv.id = e.registry_versao_id
      where e.execucao_id = _execucao_id
        and (
          e.categoria_requerida = cat
          or (cat in ('resumo_voz_marca','resumo_voz_marca_explicita')
              and e.papel in ('hook_master','headline_architect','cta_specialist','correcao'))
        )
        and rv.provedor <> 'simulado'
    loop
      finalidade := case cat
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
          and f.etapa = etapa.papel and f.finalidade = finalidade
      ) then
        insert into public.fotografias_consentimento
          (user_id, fotografia_id, categoria, provedor, etapa, finalidade, decisao, termos_id, termos_versao, origem)
        values (uid, ex.fotografia_id, cat, etapa.provedor, etapa.papel, finalidade, 'concedido', t.id, t.versao, 'execucao');
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
    _tipo := 'consentimento_execucao',
    _etapa := null,
    _provedor := null,
    _modelo := null,
    _duracao_ms := null,
    _status := 'ok',
    _codigo_erro := null,
    _tentativas := 0,
    _custo := 0,
    _chat_id := ex.chat_id,
    _tokens_entrada := 0,
    _tokens_saida := 0
  );

  return jsonb_build_object('concedidas', to_jsonb(concedidas), 'desbloqueadas', liberadas, 'registradas', inseridas);
end;
$$;

revoke all on function public.autorizar_execucao(uuid, text[]) from public, anon;
grant execute on function public.autorizar_execucao(uuid, text[]) to authenticated;