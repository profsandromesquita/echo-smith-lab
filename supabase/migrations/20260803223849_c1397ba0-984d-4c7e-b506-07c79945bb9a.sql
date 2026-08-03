alter table public.registry_versoes drop constraint if exists registry_versoes_modelo_check;
alter table public.registry_versoes drop constraint if exists registry_versoes_provedor_check;
alter table public.registry_versoes drop constraint if exists registry_versoes_provedor_modelo_check;

alter table public.registry_versoes add constraint registry_versoes_provedor_check
  check (provedor = any (array['simulado','openai','anthropic']));

alter table public.registry_versoes add constraint registry_versoes_modelo_check
  check (modelo like 'mock-%' or modelo = any (array['gpt-5.6','gpt-5.6-sol','claude-fable-5']));

alter table public.registry_versoes add constraint registry_versoes_provedor_modelo_check
  check (
    (provedor = 'simulado' and modelo like 'mock-%')
    or (provedor = 'openai' and modelo = any (array['gpt-5.6','gpt-5.6-sol']))
    or (provedor = 'anthropic' and modelo = 'claude-fable-5')
  );