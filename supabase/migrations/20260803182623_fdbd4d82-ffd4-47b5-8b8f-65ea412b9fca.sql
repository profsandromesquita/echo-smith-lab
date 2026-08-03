CREATE OR REPLACE FUNCTION public.registry_atualizar_rascunho(_versao_id uuid, _dados jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record;
begin
  perform public.registry_exigir_admin();
  select * into v from public.registry_versoes where id = _versao_id;
  if v is null or v.estado <> 'rascunho' then raise exception 'Apenas rascunhos podem ser editados.'; end if;
  update public.registry_versoes set
    ativo = coalesce((_dados->>'ativo')::boolean, ativo),
    provedor = coalesce(_dados->>'provedor', provedor),
    modelo = coalesce(_dados->>'modelo', modelo),
    instrucoes_sistema = coalesce(_dados->>'instrucoes_sistema', instrucoes_sistema),
    schema_entrada = coalesce(_dados->'schema_entrada', schema_entrada),
    schema_saida = coalesce(_dados->'schema_saida', schema_saida),
    limite_entrada = coalesce((_dados->>'limite_entrada')::integer, limite_entrada),
    limite_saida = coalesce((_dados->>'limite_saida')::integer, limite_saida),
    timeout_ms = coalesce((_dados->>'timeout_ms')::integer, timeout_ms),
    tentativas_max = coalesce((_dados->>'tentativas_max')::integer, tentativas_max),
    backoff_base_ms = coalesce((_dados->>'backoff_base_ms')::integer, backoff_base_ms),
    concorrencia = coalesce((_dados->>'concorrencia')::integer, concorrencia),
    orcamento_estimado = coalesce((_dados->>'orcamento_estimado')::numeric, orcamento_estimado),
    parametros = coalesce(_dados->'parametros', parametros),
    fallback = coalesce(_dados->'fallback', fallback),
    observacoes = coalesce(_dados->>'observacoes', observacoes),
    motivo_alteracao = coalesce(_dados->>'motivo_alteracao', motivo_alteracao),
    autor_id = auth.uid()
  where id = _versao_id;
end;
$function$;