CREATE OR REPLACE FUNCTION public.registry_validar(_versao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if v.provedor not in ('simulado','openai') then
    problemas := problemas || 'provedor nao suportado nesta fase'::text;
  end if;

  if v.provedor = 'openai' then
    if ag.papel <> 'gatekeeper' then
      problemas := problemas || 'nesta fase somente o gatekeeper pode usar provedor real'::text;
    end if;
    if v.modelo not in ('gpt-5.6','gpt-5.6-sol') then
      problemas := problemas || 'modelo nao permitido para o provedor openai'::text;
    end if;
    esforco := coalesce(v.parametros->>'reasoning_effort', '');
    if esforco not in ('low','medium') then
      problemas := problemas || 'esforco de raciocinio deve ser low ou medium nesta fase'::text;
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
$function$;