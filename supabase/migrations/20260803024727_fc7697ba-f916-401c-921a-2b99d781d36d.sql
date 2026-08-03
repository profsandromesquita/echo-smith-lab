-- ============ REGISTRY ============
create table public.registry_agentes (
  id uuid primary key default gen_random_uuid(),
  papel text not null unique check (papel in ('gatekeeper','analise_psicologica','hook_master','headline_architect','cta_specialist','auditor','adaptador_local','validador_preservacao','consolidador','ranking')),
  nome_exibicao text not null,
  descricao text not null default '',
  versao_publicada_id uuid,
  versao_rascunho_id uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.registry_versoes (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references public.registry_agentes(id) on delete restrict,
  versao integer not null,
  estado text not null default 'rascunho' check (estado in ('rascunho','publicada','arquivada')),
  ativo boolean not null default true,
  provedor text not null default 'simulado' check (provedor = 'simulado'),
  modelo text not null default 'mock-generico' check (modelo like 'mock-%'),
  instrucoes_sistema text not null default '',
  schema_entrada jsonb not null default '{}'::jsonb,
  schema_saida jsonb not null default '{}'::jsonb,
  limite_entrada integer not null default 4000 check (limite_entrada between 1 and 200000),
  limite_saida integer not null default 1200 check (limite_saida between 1 and 200000),
  timeout_ms integer not null default 30000 check (timeout_ms between 1000 and 300000),
  tentativas_max integer not null default 3 check (tentativas_max between 1 and 10),
  backoff_base_ms integer not null default 1000 check (backoff_base_ms between 100 and 60000),
  concorrencia integer not null default 1 check (concorrencia between 1 and 20),
  orcamento_estimado numeric(10,4) not null default 0 check (orcamento_estimado >= 0),
  parametros jsonb not null default '{}'::jsonb,
  fallback jsonb not null default '{}'::jsonb,
  observacoes text not null default '',
  motivo_alteracao text not null default '',
  autor_id uuid,
  editada_em timestamptz not null default now(),
  validada_em timestamptz,
  resultado_validacao jsonb,
  testada_em timestamptz,
  resultado_teste jsonb,
  publicada_em timestamptz,
  publicada_por uuid,
  arquivada_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (agente_id, versao)
);

alter table public.registry_agentes
  add constraint registry_agentes_versao_publicada_fkey foreign key (versao_publicada_id) references public.registry_versoes(id) on delete restrict,
  add constraint registry_agentes_versao_rascunho_fkey foreign key (versao_rascunho_id) references public.registry_versoes(id) on delete set null;

create unique index registry_um_rascunho on public.registry_versoes (agente_id) where estado = 'rascunho';
create unique index registry_uma_publicada on public.registry_versoes (agente_id) where estado = 'publicada';
create index registry_versoes_agente_idx on public.registry_versoes (agente_id, versao desc);

grant select on public.registry_agentes to authenticated;
grant select on public.registry_versoes to authenticated;
grant all on public.registry_agentes to service_role;
grant all on public.registry_versoes to service_role;
alter table public.registry_agentes enable row level security;
alter table public.registry_versoes enable row level security;

create policy "Admin tecnico le agentes" on public.registry_agentes for select to authenticated using (public.tem_papel('admin_tecnico'));
create policy "Admin tecnico le versoes" on public.registry_versoes for select to authenticated using (public.tem_papel('admin_tecnico'));

-- imutabilidade que nao impede publicacao
create or replace function public.registry_versao_imutavel()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  publicando boolean := coalesce(current_setting('app.publicacao_em_curso', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    if old.estado <> 'rascunho' then
      raise exception 'Versao publicada ou arquivada nao pode ser apagada.';
    end if;
    if exists (select 1 from public.execucao_registry_versoes v where v.registry_versao_id = old.id) then
      raise exception 'Versao usada por execucao nao pode ser apagada.';
    end if;
    return old;
  end if;

  if old.estado = 'rascunho' and new.estado = 'rascunho' then
    return new;
  end if;

  if not publicando then
    raise exception 'Versao publicada ou arquivada e imutavel fora do fluxo de publicacao.';
  end if;

  if not ((old.estado = 'rascunho' and new.estado = 'publicada')
          or (old.estado = 'publicada' and new.estado = 'arquivada')) then
    raise exception 'Transicao de estado de versao invalida.';
  end if;

  if (new.provedor, new.modelo, new.instrucoes_sistema, new.schema_entrada, new.schema_saida,
      new.limite_entrada, new.limite_saida, new.timeout_ms, new.tentativas_max, new.backoff_base_ms,
      new.concorrencia, new.orcamento_estimado, new.parametros, new.fallback, new.ativo, new.versao)
     is distinct from
     (old.provedor, old.modelo, old.instrucoes_sistema, old.schema_entrada, old.schema_saida,
      old.limite_entrada, old.limite_saida, old.timeout_ms, old.tentativas_max, old.backoff_base_ms,
      old.concorrencia, old.orcamento_estimado, old.parametros, old.fallback, old.ativo, old.versao) then
    raise exception 'Configuracao de versao nao pode mudar durante a publicacao.';
  end if;
  return new;
end;
$$;

create trigger registry_versoes_imutabilidade
before update or delete on public.registry_versoes
for each row execute function public.registry_versao_imutavel();

-- zera validacao/teste quando o rascunho e editado
create or replace function public.registry_rascunho_editado()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.estado = 'rascunho' and new.estado = 'rascunho' then
    new.editada_em := now();
    if (new.provedor, new.modelo, new.instrucoes_sistema, new.schema_entrada, new.schema_saida,
        new.limite_entrada, new.limite_saida, new.timeout_ms, new.tentativas_max, new.backoff_base_ms,
        new.concorrencia, new.orcamento_estimado, new.parametros, new.fallback, new.ativo)
       is distinct from
       (old.provedor, old.modelo, old.instrucoes_sistema, old.schema_entrada, old.schema_saida,
        old.limite_entrada, old.limite_saida, old.timeout_ms, old.tentativas_max, old.backoff_base_ms,
        old.concorrencia, old.orcamento_estimado, old.parametros, old.fallback, old.ativo) then
      new.validada_em := null; new.resultado_validacao := null;
      new.testada_em := null; new.resultado_teste := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger registry_versoes_edicao
before update on public.registry_versoes
for each row execute function public.registry_rascunho_editado();

-- ============ EXECUCOES ============
create table public.execucao_fotografias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  execucao_id uuid,
  modo_privacidade text not null check (modo_privacidade in ('local_estrita','hibrido_autorizado')),
  criada_em timestamptz not null default now()
);

create table public.execucoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  chat_id uuid references public.chats(id) on delete set null,
  formato_solicitado text not null check (formato_solicitado in ('hook','headline_video','headline_imagem','cta','pacote_completo')),
  estado text not null default 'criada' check (estado in ('criada','aguardando_consentimento','pronta','em_processamento','parcialmente_concluida','concluida','falhou','cancelamento_solicitado','cancelada')),
  snapshot_chat jsonb not null default '{}'::jsonb,
  snapshot_marca jsonb not null default '{}'::jsonb,
  snapshot_privacidade jsonb not null default '{}'::jsonb,
  snapshot_registry jsonb not null default '{}'::jsonb,
  fotografia_id uuid references public.execucao_fotografias(id) on delete restrict,
  custo_estimado numeric(10,4) not null default 0,
  custo_real numeric(10,4),
  motivo_falha text,
  criada_em timestamptz not null default now(),
  iniciada_em timestamptz,
  finalizada_em timestamptz,
  cancelamento_solicitado_em timestamptz
);

alter table public.execucao_fotografias
  add constraint execucao_fotografias_execucao_fkey foreign key (execucao_id) references public.execucoes(id) on delete cascade;

alter table public.fotografias_consentimento
  add constraint fotografias_consentimento_pai_fkey foreign key (fotografia_id) references public.execucao_fotografias(id) on delete cascade;

create table public.execucao_registry_versoes (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references public.execucoes(id) on delete cascade,
  papel text not null,
  registry_versao_id uuid not null references public.registry_versoes(id) on delete restrict,
  criado_em timestamptz not null default now(),
  unique (execucao_id, papel),
  unique (execucao_id, papel, registry_versao_id)
);

create table public.execucao_etapas (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references public.execucoes(id) on delete cascade,
  papel text not null,
  ordem integer not null,
  estado text not null default 'pendente' check (estado in ('pendente','bloqueada','em_execucao','concluida','falhou','cancelada','resultado_incerto')),
  categoria_requerida text,
  depende_de text[] not null default '{}',
  registry_versao_id uuid not null references public.registry_versoes(id) on delete restrict,
  tentativas integer not null default 0,
  tentativas_limite integer not null default 3,
  backoff_base_ms integer not null default 1000,
  timeout_ms integer not null default 30000,
  proxima_tentativa_em timestamptz,
  ultimo_codigo_erro text,
  lease_ate timestamptz,
  lease_token uuid,
  entrada_resumo jsonb not null default '{}'::jsonb,
  duracao_ms integer,
  criado_em timestamptz not null default now(),
  unique (execucao_id, papel),
  constraint execucao_etapas_versao_fkey foreign key (execucao_id, papel, registry_versao_id)
    references public.execucao_registry_versoes (execucao_id, papel, registry_versao_id)
);

create table public.execucao_tentativas (
  id uuid primary key default gen_random_uuid(),
  etapa_id uuid not null references public.execucao_etapas(id) on delete cascade,
  numero integer not null,
  iniciada_em timestamptz not null default now(),
  encerrada_em timestamptz,
  status text not null default 'em_execucao' check (status in ('em_execucao','ok','erro','cancelado','unknown_outcome')),
  codigo_erro text,
  lease_token uuid
);

create table public.execucao_eventos (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references public.execucoes(id) on delete cascade,
  etapa_id uuid references public.execucao_etapas(id) on delete cascade,
  de text,
  para text not null,
  motivo text,
  ocorrido_em timestamptz not null default now()
);

create table public.execucao_resultados (
  id uuid primary key default gen_random_uuid(),
  etapa_id uuid not null references public.execucao_etapas(id) on delete cascade,
  tipo text not null check (tipo in ('diretriz','variacao','auditoria','correcao','adaptacao','validacao','ranking','entrega')),
  payload jsonb not null default '{}'::jsonb,
  versao text not null default 'original' check (versao in ('original','corrigida','adaptada')),
  aprovado boolean,
  nota_final numeric(5,2),
  criado_em timestamptz not null default now()
);

create index execucoes_user_idx on public.execucoes (user_id, criada_em desc);
create index execucoes_chat_idx on public.execucoes (chat_id);
create index execucoes_retomaveis_idx on public.execucoes (user_id) where estado in ('pronta','em_processamento','aguardando_consentimento');
create index execucao_etapas_ordem_idx on public.execucao_etapas (execucao_id, ordem);
create index execucao_etapas_versao_idx on public.execucao_etapas (registry_versao_id);
create index execucao_etapas_elegivel_idx on public.execucao_etapas (proxima_tentativa_em);
create index execucao_etapas_lease_idx on public.execucao_etapas (lease_ate);
create index execucao_registry_versoes_versao_idx on public.execucao_registry_versoes (registry_versao_id);
create index execucao_tentativas_etapa_idx on public.execucao_tentativas (etapa_id);
create index execucao_eventos_exec_idx on public.execucao_eventos (execucao_id, ocorrido_em desc);
create index execucao_resultados_etapa_idx on public.execucao_resultados (etapa_id);

grant select on public.execucoes to authenticated;
grant select on public.execucao_fotografias to authenticated;
grant select on public.execucao_registry_versoes to authenticated;
grant select on public.execucao_etapas to authenticated;
grant select on public.execucao_tentativas to authenticated;
grant select on public.execucao_eventos to authenticated;
grant select on public.execucao_resultados to authenticated;
grant all on public.execucoes to service_role;
grant all on public.execucao_fotografias to service_role;
grant all on public.execucao_registry_versoes to service_role;
grant all on public.execucao_etapas to service_role;
grant all on public.execucao_tentativas to service_role;
grant all on public.execucao_eventos to service_role;
grant all on public.execucao_resultados to service_role;

alter table public.execucoes enable row level security;
alter table public.execucao_fotografias enable row level security;
alter table public.execucao_registry_versoes enable row level security;
alter table public.execucao_etapas enable row level security;
alter table public.execucao_tentativas enable row level security;
alter table public.execucao_eventos enable row level security;
alter table public.execucao_resultados enable row level security;

create or replace function public.execucao_e_minha(_execucao_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.execucoes e where e.id = _execucao_id and e.user_id = auth.uid());
$$;
revoke all on function public.execucao_e_minha(uuid) from public, anon;
grant execute on function public.execucao_e_minha(uuid) to authenticated, service_role;

create or replace function public.etapa_e_minha(_etapa_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.execucao_etapas et
    join public.execucoes e on e.id = et.execucao_id
    where et.id = _etapa_id and e.user_id = auth.uid());
$$;
revoke all on function public.etapa_e_minha(uuid) from public, anon;
grant execute on function public.etapa_e_minha(uuid) to authenticated, service_role;

create policy "Le proprias execucoes" on public.execucoes for select to authenticated using (user_id = auth.uid());
create policy "Le propria fotografia" on public.execucao_fotografias for select to authenticated using (user_id = auth.uid());
create policy "Le versoes da propria execucao" on public.execucao_registry_versoes for select to authenticated using (public.execucao_e_minha(execucao_id));
create policy "Le etapas da propria execucao" on public.execucao_etapas for select to authenticated using (public.execucao_e_minha(execucao_id));
create policy "Le eventos da propria execucao" on public.execucao_eventos for select to authenticated using (public.execucao_e_minha(execucao_id));
create policy "Le tentativas da propria etapa" on public.execucao_tentativas for select to authenticated using (public.etapa_e_minha(etapa_id));
create policy "Le resultados da propria etapa" on public.execucao_resultados for select to authenticated using (public.etapa_e_minha(etapa_id));

-- append-only
create or replace function public.bloquear_escrita_append_only()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Registro imutavel.';
end;
$$;
create trigger execucao_registry_versoes_imutavel before update or delete on public.execucao_registry_versoes for each row execute function public.bloquear_escrita_append_only();
create trigger execucao_eventos_imutavel before update or delete on public.execucao_eventos for each row execute function public.bloquear_escrita_append_only();

-- seed dos papeis
do $seed$
declare
  r record;
  ag uuid;
  vs uuid;
begin
  for r in
    select * from (values
      ('gatekeeper','Gatekeeper','Verifica publico, dor e promessa.'),
      ('analise_psicologica','Analista de Psicologia Profunda','Identifica o conflito inconsciente e produz a diretriz.'),
      ('hook_master','Hook Master','Especialista em hooks.'),
      ('headline_architect','Headline Architect','Especialista em headlines de video e imagem.'),
      ('cta_specialist','Especialista em CTA','Especialista em chamadas para acao.'),
      ('auditor','Auditor','Avalia impacto, clareza de consequencia e ritmo.'),
      ('adaptador_local','Adaptador Local de Estilo','Adapta ao estilo e preferencias locais.'),
      ('validador_preservacao','Validador de Preservacao','Confere preservacao de sentido apos adaptacao.'),
      ('consolidador','Consolidador','Monta a entrega final.'),
      ('ranking','Motor de ranking deterministico','Ordena variacoes por pesos versionados.')
    ) as t(papel, nome, descricao)
  loop
    insert into public.registry_agentes (papel, nome_exibicao, descricao)
      values (r.papel, r.nome, r.descricao) returning id into ag;
    insert into public.registry_versoes (agente_id, versao, estado, ativo, modelo, instrucoes_sistema,
      motivo_alteracao, parametros, validada_em, resultado_validacao, testada_em, resultado_teste, publicada_em)
      values (ag, 1, 'publicada', true, 'mock-' || r.papel, 'Instrucoes iniciais simuladas para ' || r.nome || '.',
        'Versao inicial semeada na F5.',
        case when r.papel = 'ranking' then
          '{"pesos":{"nota_auditor":0.35,"objetivo":0.15,"formato":0.15,"voz_marca":0.15,"sem_cliches":0.1,"confianca":0.1}}'::jsonb
        else '{}'::jsonb end,
        now(), '{"ok":true}'::jsonb, now(), '{"ok":true}'::jsonb, now())
      returning id into vs;
    update public.registry_agentes set versao_publicada_id = vs where id = ag;
  end loop;
end;
$seed$;