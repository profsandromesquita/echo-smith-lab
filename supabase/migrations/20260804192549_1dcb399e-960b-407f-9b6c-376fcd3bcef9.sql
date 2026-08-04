-- 1) Precos por modelo
CREATE TABLE public.precos_modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provedor text NOT NULL,
  modelo text NOT NULL,
  entrada_por_milhao numeric NOT NULL DEFAULT 0,
  saida_por_milhao numeric NOT NULL DEFAULT 0,
  margem numeric NOT NULL DEFAULT 1.2,
  vigente boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provedor, modelo)
);

GRANT SELECT ON public.precos_modelos TO authenticated;
GRANT ALL ON public.precos_modelos TO service_role;

ALTER TABLE public.precos_modelos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "precos legiveis por autenticados"
ON public.precos_modelos FOR SELECT TO authenticated USING (true);

CREATE TRIGGER precos_modelos_tocar_atualizado_em
BEFORE UPDATE ON public.precos_modelos
FOR EACH ROW EXECUTE FUNCTION public.tocar_atualizado_em();

INSERT INTO public.precos_modelos (provedor, modelo, entrada_por_milhao, saida_por_milhao) VALUES
  ('openai', 'gpt-5.6', 5, 30),
  ('openai', 'gpt-5.6-sol', 5, 30),
  ('anthropic', 'claude-fable-5', 10, 50);

-- 2) Custo maximo autorizado por versao do registry
CREATE OR REPLACE FUNCTION public.custo_maximo_versao(_versao_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    round(((rv.limite_entrada * p.entrada_por_milhao) + (rv.limite_saida * p.saida_por_milhao))
          / 1000000.0 * p.margem, 4), 0)
  FROM public.registry_versoes rv
  LEFT JOIN public.precos_modelos p
    ON p.provedor = rv.provedor AND p.modelo = rv.modelo AND p.vigente
  WHERE rv.id = _versao_id
$$;

-- 3) Teto autoritativo da execucao: soma dos custos maximos das etapas
CREATE OR REPLACE FUNCTION public.teto_execucao(_execucao_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(sum(public.custo_maximo_versao(e.registry_versao_id)), 0)
  FROM public.execucao_etapas e
  WHERE e.execucao_id = _execucao_id
$$;

-- 4) Reserva atomica pelo custo maximo autorizado da chamada
DROP FUNCTION IF EXISTS public.reservar_custo(uuid, uuid, text, numeric);

CREATE OR REPLACE FUNCTION public.reservar_custo(_execucao_id uuid, _etapa_id uuid, _chave text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare ex record; total numeric; teto numeric; reserva numeric; vid uuid;
begin
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;
  select * into ex from public.execucoes where id = _execucao_id for update;
  if ex is null then return false; end if;
  if exists (select 1 from public.execucao_reservas_custo where execucao_id = _execucao_id and chave = _chave) then
    return true;
  end if;

  select registry_versao_id into vid from public.execucao_etapas
    where id = _etapa_id and execucao_id = _execucao_id;
  if vid is null then return false; end if;

  reserva := public.custo_maximo_versao(vid);
  teto := public.teto_execucao(_execucao_id);

  select coalesce(sum(coalesce(custo_real, custo_reservado)), 0) into total
    from public.execucao_reservas_custo where execucao_id = _execucao_id;

  if total + reserva > teto then return false; end if;

  insert into public.execucao_reservas_custo (execucao_id, etapa_id, chave, custo_reservado)
    values (_execucao_id, _etapa_id, _chave, reserva);
  return true;
end;
$$;

-- 5) Reconciliacao: libera excedente reservado e registra excedente real
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
    select e.user_id, e.chat_id, 'excedente_orcamento', et.papel, 'alerta',
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

-- 6) Consentimento persistente a partir de uma execucao aberta
CREATE OR REPLACE FUNCTION public.autorizar_execucao_persistente(
  _execucao_id uuid, _categorias text[], _escopo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  uid uuid := auth.uid();
  ex record; cat text; etapa record;
  _finalidade text; aplicaveis text[] := array[]::text[]; persistidos integer := 0;
  res jsonb := jsonb_build_object('concedidas', '[]'::jsonb, 'desbloqueadas', 0, 'registradas', 0);
begin
  if uid is null then raise exception 'Sessao ausente.'; end if;
  if _escopo not in ('chat','conta') then raise exception 'Escopo invalido.'; end if;
  if not public.execucao_e_minha(_execucao_id) then raise exception 'Recurso indisponivel.'; end if;

  select * into ex from public.execucoes where id = _execucao_id;
  if ex.estado in ('concluida','parcialmente_concluida','falhou','cancelada') then
    raise exception 'Execucao encerrada.';
  end if;
  if _escopo = 'chat' and ex.chat_id is null then raise exception 'Execucao sem chat.'; end if;

  foreach cat in array coalesce(_categorias, array[]::text[]) loop
    if cat in ('memoria_local_estilo','exemplos_locais','preferencias_inferidas') then
      raise exception 'Categoria local nao pode ser autorizada.';
    end if;

    for etapa in
      select distinct e.papel, rv.provedor
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

      perform public.registrar_consentimento(
        _escopo := _escopo,
        _escopo_id := case when _escopo = 'chat' then ex.chat_id else null end,
        _categoria := cat,
        _provedor := etapa.provedor,
        _etapa := etapa.papel,
        _finalidade := _finalidade,
        _decisao := 'concedido',
        _origem := 'modal');
      persistidos := persistidos + 1;

      if not (cat = any (aplicaveis)) then aplicaveis := aplicaveis || cat; end if;
    end loop;
  end loop;

  if array_length(aplicaveis, 1) is not null then
    res := public.autorizar_execucao(_execucao_id, aplicaveis);
  end if;

  return res || jsonb_build_object('escopo', _escopo, 'persistidos', persistidos);
end;
$$;