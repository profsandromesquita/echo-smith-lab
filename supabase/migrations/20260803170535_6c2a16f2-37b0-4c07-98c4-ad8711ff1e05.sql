create or replace function public.registry_rascunho_editado()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if old.estado = 'rascunho' and new.estado = 'rascunho' then
    if (new.provedor, new.modelo, new.instrucoes_sistema, new.schema_entrada, new.schema_saida,
        new.limite_entrada, new.limite_saida, new.timeout_ms, new.tentativas_max, new.backoff_base_ms,
        new.concorrencia, new.orcamento_estimado, new.parametros, new.fallback, new.ativo)
       is distinct from
       (old.provedor, old.modelo, old.instrucoes_sistema, old.schema_entrada, old.schema_saida,
        old.limite_entrada, old.limite_saida, old.timeout_ms, old.tentativas_max, old.backoff_base_ms,
        old.concorrencia, old.orcamento_estimado, old.parametros, old.fallback, old.ativo) then
      new.editada_em := now();
      new.validada_em := null; new.resultado_validacao := null;
      new.testada_em := null; new.resultado_teste := null;
    end if;
  end if;
  return new;
end;
$function$;