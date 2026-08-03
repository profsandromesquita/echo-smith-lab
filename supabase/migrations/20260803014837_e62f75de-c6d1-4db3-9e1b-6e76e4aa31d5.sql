-- =========================================================
-- F4: privacidade, consentimentos, retenção e observabilidade
-- =========================================================

-- ---------- utilitários ----------
CREATE OR REPLACE FUNCTION public.bloquear_alteracao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'registro imutavel';
END;
$$;

-- ---------- 1. preferencias_privacidade ----------
CREATE TABLE public.preferencias_privacidade (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() UNIQUE,
  modo_padrao text NOT NULL DEFAULT 'local_estrita'
    CHECK (modo_padrao IN ('local_estrita','hibrido_autorizado')),
  alerta_dados_pessoais boolean NOT NULL DEFAULT true,
  bloquear_envio_com_alerta boolean NOT NULL DEFAULT false,
  retencao_logs_dias integer NOT NULL DEFAULT 90 CHECK (retencao_logs_dias IN (30,90,180)),
  retencao_conteudo text NOT NULL DEFAULT 'indefinida'
    CHECK (retencao_conteudo IN ('indefinida','12_meses','6_meses')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.preferencias_privacidade TO authenticated;
GRANT ALL ON public.preferencias_privacidade TO service_role;
ALTER TABLE public.preferencias_privacidade ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prefs_select_own" ON public.preferencias_privacidade
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "prefs_insert_own" ON public.preferencias_privacidade
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "prefs_update_own" ON public.preferencias_privacidade
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER prefs_touch
  BEFORE UPDATE ON public.preferencias_privacidade
  FOR EACH ROW EXECUTE FUNCTION public.tocar_atualizado_em();

-- ---------- 2. modo por chat ----------
ALTER TABLE public.chats
  ADD COLUMN modo_privacidade text NULL
  CHECK (modo_privacidade IS NULL OR modo_privacidade IN ('local_estrita','hibrido_autorizado'));

-- ---------- 3. termos_consentimento ----------
CREATE TABLE public.termos_consentimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL,
  versao integer NOT NULL,
  titulo text NOT NULL,
  corpo text NOT NULL,
  vigente boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chave, versao)
);

CREATE UNIQUE INDEX termos_vigente_unico ON public.termos_consentimento (chave) WHERE vigente;

GRANT SELECT ON public.termos_consentimento TO authenticated;
GRANT ALL ON public.termos_consentimento TO service_role;
ALTER TABLE public.termos_consentimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "termos_select_autenticado" ON public.termos_consentimento
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.termos_consentimento (chave, versao, titulo, corpo) VALUES
  ('briefing_nuvem', 1, 'Envio do briefing para processamento em nuvem',
   'Autorizo o envio do texto do briefing desta solicitacao a um provedor de nuvem, exclusivamente para gerar as variacoes de copy solicitadas. O conteudo nao e usado para treinar modelos.'),
  ('resumo_voz_marca', 1, 'Envio do resumo de Voz de Marca',
   'Autorizo o envio de um resumo do perfil de Voz de Marca (tom, palavras-chave e restricoes) a um provedor de nuvem, para adequar as variacoes ao meu posicionamento.'),
  ('texto_gerado', 1, 'Envio do texto gerado para auditoria',
   'Autorizo o envio das variacoes geradas a um provedor de nuvem para auditoria de qualidade e conformidade.');

-- ---------- 4. consentimentos ----------
CREATE TABLE public.consentimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  escopo text NOT NULL CHECK (escopo IN ('conta','pasta','chat')),
  escopo_id uuid NULL,
  categoria text NOT NULL CHECK (categoria IN ('briefing','resumo_voz_marca','texto_gerado','metadados')),
  provedor text NOT NULL,
  etapa text NOT NULL,
  finalidade text NOT NULL,
  estado text NOT NULL CHECK (estado IN ('concedido','recusado','revogado')),
  termos_id uuid NOT NULL REFERENCES public.termos_consentimento(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT escopo_conta_sem_id CHECK (escopo <> 'conta' OR escopo_id IS NULL),
  CONSTRAINT escopo_nao_conta_com_id CHECK (escopo = 'conta' OR escopo_id IS NOT NULL)
);

CREATE UNIQUE INDEX consentimento_unico_conta
  ON public.consentimentos (user_id, categoria, provedor, etapa)
  WHERE escopo = 'conta' AND escopo_id IS NULL;

CREATE UNIQUE INDEX consentimento_unico_escopo
  ON public.consentimentos (user_id, escopo, escopo_id, categoria, provedor, etapa)
  WHERE escopo <> 'conta' AND escopo_id IS NOT NULL;

GRANT SELECT ON public.consentimentos TO authenticated;
GRANT ALL ON public.consentimentos TO service_role;
ALTER TABLE public.consentimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consentimentos_select_own" ON public.consentimentos
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.validar_escopo_consentimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.escopo = 'pasta' THEN
    IF NOT EXISTS (SELECT 1 FROM public.pastas p WHERE p.id = NEW.escopo_id AND p.user_id = NEW.user_id) THEN
      RAISE EXCEPTION 'escopo invalido';
    END IF;
  ELSIF NEW.escopo = 'chat' THEN
    IF NOT EXISTS (SELECT 1 FROM public.chats c WHERE c.id = NEW.escopo_id AND c.user_id = NEW.user_id) THEN
      RAISE EXCEPTION 'escopo invalido';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER consentimentos_valida_escopo
  BEFORE INSERT OR UPDATE ON public.consentimentos
  FOR EACH ROW EXECUTE FUNCTION public.validar_escopo_consentimento();

CREATE TRIGGER consentimentos_touch
  BEFORE UPDATE ON public.consentimentos
  FOR EACH ROW EXECUTE FUNCTION public.tocar_atualizado_em();

-- ---------- 5. consentimentos_historico ----------
CREATE TABLE public.consentimentos_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  consentimento_id uuid NULL,
  escopo text NOT NULL,
  escopo_id uuid NULL,
  categoria text NOT NULL,
  provedor text NOT NULL,
  etapa text NOT NULL,
  finalidade text NOT NULL,
  acao text NOT NULL CHECK (acao IN ('concedido','recusado','revogado')),
  origem text NOT NULL CHECK (origem IN ('modal','configuracoes','painel_chat','sistema')),
  termos_id uuid NOT NULL REFERENCES public.termos_consentimento(id),
  termos_versao integer NOT NULL,
  ocorrido_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.consentimentos_historico TO authenticated;
GRANT ALL ON public.consentimentos_historico TO service_role;
ALTER TABLE public.consentimentos_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "historico_select_own" ON public.consentimentos_historico
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER historico_imutavel
  BEFORE UPDATE OR DELETE ON public.consentimentos_historico
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_alteracao();

-- ---------- 6. fotografias_consentimento ----------
CREATE TABLE public.fotografias_consentimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fotografia_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  categoria text NOT NULL,
  provedor text NOT NULL,
  etapa text NOT NULL,
  finalidade text NOT NULL,
  termos_id uuid NOT NULL REFERENCES public.termos_consentimento(id),
  termos_versao integer NOT NULL,
  origem text NOT NULL,
  decisao text NOT NULL CHECK (decisao IN ('concedido','recusado')),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fotografias_por_grupo ON public.fotografias_consentimento (user_id, fotografia_id);

GRANT SELECT ON public.fotografias_consentimento TO authenticated;
GRANT ALL ON public.fotografias_consentimento TO service_role;
ALTER TABLE public.fotografias_consentimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fotografias_select_own" ON public.fotografias_consentimento
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER fotografias_imutavel
  BEFORE UPDATE OR DELETE ON public.fotografias_consentimento
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_alteracao();

-- ---------- 7. eventos_tecnicos ----------
CREATE TABLE public.eventos_tecnicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  chat_id uuid NULL,
  tipo text NOT NULL,
  etapa text NULL,
  provedor text NULL,
  modelo text NULL,
  duracao_ms integer NULL CHECK (duracao_ms IS NULL OR duracao_ms >= 0),
  status text NOT NULL CHECK (status IN ('ok','erro','cancelado','unknown_outcome')),
  codigo_erro text NULL CHECK (codigo_erro IS NULL OR length(codigo_erro) <= 80),
  tentativas integer NOT NULL DEFAULT 1,
  custo_estimado numeric(10,4) NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX eventos_por_usuario ON public.eventos_tecnicos (user_id, criado_em DESC);

GRANT SELECT ON public.eventos_tecnicos TO authenticated;
GRANT ALL ON public.eventos_tecnicos TO service_role;
ALTER TABLE public.eventos_tecnicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eventos_select_own" ON public.eventos_tecnicos
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ---------- 8. solicitacoes_conta ----------
CREATE TABLE public.solicitacoes_conta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  tipo text NOT NULL CHECK (tipo IN ('exportacao','exclusao_conta')),
  estado text NOT NULL DEFAULT 'pendente'
    CHECK (estado IN ('pendente','confirmada','concluida','cancelada')),
  confirmado_em timestamptz NULL,
  concluido_em timestamptz NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.solicitacoes_conta TO authenticated;
GRANT ALL ON public.solicitacoes_conta TO service_role;
ALTER TABLE public.solicitacoes_conta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solicitacoes_select_own" ON public.solicitacoes_conta
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER solicitacoes_touch
  BEFORE UPDATE ON public.solicitacoes_conta
  FOR EACH ROW EXECUTE FUNCTION public.tocar_atualizado_em();

-- =========================================================
-- Funcoes seguras de escrita (unico caminho de gravacao)
-- =========================================================

CREATE OR REPLACE FUNCTION public.registrar_consentimento(
  _escopo text,
  _escopo_id uuid,
  _categoria text,
  _provedor text,
  _etapa text,
  _finalidade text,
  _decisao text,
  _origem text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _termos public.termos_consentimento%ROWTYPE;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'nao autenticado'; END IF;
  IF _decisao NOT IN ('concedido','recusado') THEN RAISE EXCEPTION 'decisao invalida'; END IF;
  IF _escopo = 'conta' AND _escopo_id IS NOT NULL THEN RAISE EXCEPTION 'escopo invalido'; END IF;
  IF _escopo <> 'conta' AND _escopo_id IS NULL THEN RAISE EXCEPTION 'escopo invalido'; END IF;

  SELECT * INTO _termos FROM public.termos_consentimento
   WHERE chave = _categoria AND vigente LIMIT 1;
  IF _termos.id IS NULL THEN RAISE EXCEPTION 'termos indisponiveis'; END IF;

  UPDATE public.consentimentos c
     SET estado = _decisao, termos_id = _termos.id, finalidade = _finalidade
   WHERE c.user_id = _uid AND c.escopo = _escopo
     AND c.escopo_id IS NOT DISTINCT FROM _escopo_id
     AND c.categoria = _categoria AND c.provedor = _provedor AND c.etapa = _etapa
  RETURNING c.id INTO _id;

  IF _id IS NULL THEN
    INSERT INTO public.consentimentos
      (user_id, escopo, escopo_id, categoria, provedor, etapa, finalidade, estado, termos_id)
    VALUES (_uid, _escopo, _escopo_id, _categoria, _provedor, _etapa, _finalidade, _decisao, _termos.id)
    RETURNING id INTO _id;
  END IF;

  INSERT INTO public.consentimentos_historico
    (user_id, consentimento_id, escopo, escopo_id, categoria, provedor, etapa, finalidade,
     acao, origem, termos_id, termos_versao)
  VALUES (_uid, _id, _escopo, _escopo_id, _categoria, _provedor, _etapa, _finalidade,
          _decisao, _origem, _termos.id, _termos.versao);

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_consentimento(text,uuid,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_consentimento(text,uuid,text,text,text,text,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revogar_consentimento(_id uuid, _origem text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _c public.consentimentos%ROWTYPE;
  _versao integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'nao autenticado'; END IF;
  SELECT * INTO _c FROM public.consentimentos WHERE id = _id AND user_id = _uid;
  IF _c.id IS NULL THEN RETURN false; END IF;

  UPDATE public.consentimentos SET estado = 'revogado' WHERE id = _id;
  SELECT versao INTO _versao FROM public.termos_consentimento WHERE id = _c.termos_id;

  INSERT INTO public.consentimentos_historico
    (user_id, consentimento_id, escopo, escopo_id, categoria, provedor, etapa, finalidade,
     acao, origem, termos_id, termos_versao)
  VALUES (_uid, _c.id, _c.escopo, _c.escopo_id, _c.categoria, _c.provedor, _c.etapa, _c.finalidade,
          'revogado', _origem, _c.termos_id, _versao);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.revogar_consentimento(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revogar_consentimento(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.registrar_evento_tecnico(
  _tipo text, _etapa text, _provedor text, _modelo text,
  _duracao_ms integer, _status text, _codigo_erro text,
  _tentativas integer, _custo numeric, _chat_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'nao autenticado'; END IF;
  IF _chat_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.chats c WHERE c.id = _chat_id AND c.user_id = _uid
  ) THEN RAISE EXCEPTION 'chat invalido'; END IF;

  INSERT INTO public.eventos_tecnicos
    (user_id, chat_id, tipo, etapa, provedor, modelo, duracao_ms, status, codigo_erro, tentativas, custo_estimado)
  VALUES (_uid, _chat_id, _tipo, _etapa, _provedor, _modelo, _duracao_ms, _status,
          nullif(left(coalesce(_codigo_erro, ''), 80), ''), coalesce(_tentativas, 1), _custo);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_evento_tecnico(text,text,text,text,integer,text,text,integer,numeric,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_evento_tecnico(text,text,text,text,integer,text,text,integer,numeric,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.criar_solicitacao_conta(_tipo text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE _uid uuid := auth.uid(); _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'nao autenticado'; END IF;
  IF _tipo NOT IN ('exportacao','exclusao_conta') THEN RAISE EXCEPTION 'tipo invalido'; END IF;
  INSERT INTO public.solicitacoes_conta (user_id, tipo) VALUES (_uid, _tipo) RETURNING id INTO _id;
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_solicitacao_conta(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_solicitacao_conta(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancelar_solicitacao_conta(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE _uid uuid := auth.uid(); _n integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'nao autenticado'; END IF;
  UPDATE public.solicitacoes_conta
     SET estado = 'cancelada'
   WHERE id = _id AND user_id = _uid AND estado IN ('pendente','confirmada');
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.cancelar_solicitacao_conta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_solicitacao_conta(uuid) TO authenticated, service_role;