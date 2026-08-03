-- 1. Registry: liberar provedor openai e lista fechada de modelos
ALTER TABLE public.registry_versoes DROP CONSTRAINT IF EXISTS registry_versoes_provedor_check;
ALTER TABLE public.registry_versoes ADD CONSTRAINT registry_versoes_provedor_check
  CHECK (provedor IN ('simulado','openai'));

ALTER TABLE public.registry_versoes DROP CONSTRAINT IF EXISTS registry_versoes_modelo_check;
ALTER TABLE public.registry_versoes ADD CONSTRAINT registry_versoes_modelo_check
  CHECK (modelo LIKE 'mock-%' OR modelo IN ('gpt-5.6','gpt-5.6-sol'));

ALTER TABLE public.registry_versoes DROP CONSTRAINT IF EXISTS registry_versoes_provedor_modelo_check;
ALTER TABLE public.registry_versoes ADD CONSTRAINT registry_versoes_provedor_modelo_check
  CHECK (
    (provedor = 'simulado' AND modelo LIKE 'mock-%')
    OR (provedor = 'openai' AND modelo IN ('gpt-5.6','gpt-5.6-sol'))
  );

-- 2. Validação: coerência de provedor, modelo e esforço de raciocínio
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

  if jsonb_typeof(v.schema_entrada) <> 'object' then problemas := problemas || 'schema de entrada invalido'; end if;
  if jsonb_typeof(v.schema_saida) <> 'object' then problemas := problemas || 'schema de saida invalido'; end if;
  if length(trim(v.instrucoes_sistema)) < 10 then problemas := problemas || 'instrucoes muito curtas'; end if;
  if v.limite_saida > v.limite_entrada then problemas := problemas || 'limite de saida maior que o de entrada'; end if;

  if v.provedor not in ('simulado','openai') then
    problemas := problemas || 'provedor nao suportado nesta fase';
  end if;

  if v.provedor = 'openai' then
    if ag.papel <> 'gatekeeper' then
      problemas := problemas || 'nesta fase somente o gatekeeper pode usar provedor real';
    end if;
    if v.modelo not in ('gpt-5.6','gpt-5.6-sol') then
      problemas := problemas || 'modelo nao permitido para o provedor openai';
    end if;
    esforco := coalesce(v.parametros->>'reasoning_effort', '');
    if esforco not in ('low','medium') then
      problemas := problemas || 'esforco de raciocinio deve ser low ou medium nesta fase';
    end if;
    if coalesce((v.parametros->>'structured_outputs')::boolean, true) is not true then
      problemas := problemas || 'saida estruturada estrita e obrigatoria';
    end if;
    if v.limite_saida > 128000 then
      problemas := problemas || 'limite de saida acima do maximo do modelo';
    end if;
    if v.orcamento_estimado <= 0 then
      problemas := problemas || 'defina um orcamento estimado maior que zero para provedor real';
    end if;
  elsif v.modelo not like 'mock-%' then
    problemas := problemas || 'modelo simulado deve comecar com mock-';
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

-- 3. Telemetria: consumo de tokens (sem conteudo)
ALTER TABLE public.eventos_tecnicos ADD COLUMN IF NOT EXISTS tokens_entrada integer NOT NULL DEFAULT 0;
ALTER TABLE public.eventos_tecnicos ADD COLUMN IF NOT EXISTS tokens_saida integer NOT NULL DEFAULT 0;

DROP FUNCTION IF EXISTS public.registrar_evento_tecnico(text, text, text, text, integer, text, text, integer, numeric, uuid);

CREATE OR REPLACE FUNCTION public.registrar_evento_tecnico(
  _tipo text,
  _etapa text,
  _provedor text,
  _modelo text,
  _duracao_ms integer,
  _status text,
  _codigo_erro text DEFAULT NULL,
  _tentativas integer DEFAULT 1,
  _custo numeric DEFAULT 0,
  _chat_id uuid DEFAULT NULL,
  _tokens_entrada integer DEFAULT 0,
  _tokens_saida integer DEFAULT 0
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'nao autenticado'; END IF;
  IF _chat_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.chats c WHERE c.id = _chat_id AND c.user_id = _uid
  ) THEN RAISE EXCEPTION 'chat invalido'; END IF;

  INSERT INTO public.eventos_tecnicos
    (user_id, chat_id, tipo, etapa, provedor, modelo, duracao_ms, status, codigo_erro, tentativas,
     custo_estimado, tokens_entrada, tokens_saida)
  VALUES (_uid, _chat_id, _tipo, _etapa, _provedor, _modelo, _duracao_ms, _status,
          nullif(left(coalesce(_codigo_erro, ''), 80), ''), coalesce(_tentativas, 1), coalesce(_custo, 0),
          greatest(coalesce(_tokens_entrada, 0), 0), greatest(coalesce(_tokens_saida, 0), 0));
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_evento_tecnico(text, text, text, text, integer, text, text, integer, numeric, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_evento_tecnico(text, text, text, text, integer, text, text, integer, numeric, uuid, integer, integer) TO authenticated;