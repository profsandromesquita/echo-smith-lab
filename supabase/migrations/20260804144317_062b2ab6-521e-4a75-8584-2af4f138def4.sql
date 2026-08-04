CREATE OR REPLACE FUNCTION public.autorizar_execucao(_execucao_id uuid, _categorias text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  ex record; cat text; etapa record; t record;
  _finalidade text; concedidas text[] := array[]::text[]; inseridas integer := 0; liberadas integer := 0;
begin
  if uid is null then raise exception 'Sessao ausente.'; end if;
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;

  select * into ex from public.execucoes where id = _execucao_id;
  if ex.fotografia_id is null then raise exception 'Execucao sem fotografia de consentimento.'; end if;
  if ex.estado in ('concluida','parcialmente_concluida','falhou','cancelada') then
    raise exception 'Execucao encerrada.';
  end if;

  foreach cat in array coalesce(_categorias, array[]::text[]) loop
    if cat in ('memoria_local_estilo','exemplos_locais','preferencias_inferidas') then
      raise exception 'Categoria local nao pode ser autorizada.';
    end if;

    select tc.id, tc.versao into t from public.termos_consentimento tc
      where tc.chave = cat and tc.vigente limit 1;
    if t.id is null then raise exception 'Categoria desconhecida.'; end if;

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
      _finalidade := case cat
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
          and f.etapa = etapa.papel and f.finalidade = _finalidade
      ) then
        insert into public.fotografias_consentimento
          (user_id, fotografia_id, categoria, provedor, etapa, finalidade, decisao, termos_id, termos_versao, origem)
        values (uid, ex.fotografia_id, cat, etapa.provedor, etapa.papel, _finalidade, 'concedido', t.id, t.versao, 'execucao');
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
$function$;