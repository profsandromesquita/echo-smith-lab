CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- PASTAS
CREATE TABLE public.pastas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 1 AND 80),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pastas TO authenticated;
GRANT ALL ON public.pastas TO service_role;
ALTER TABLE public.pastas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pastas_select_own" ON public.pastas FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "pastas_insert_own" ON public.pastas FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "pastas_update_own" ON public.pastas FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "pastas_delete_own" ON public.pastas FOR DELETE TO authenticated USING (user_id = auth.uid());

-- CHATS
CREATE TABLE public.chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  pasta_id uuid REFERENCES public.pastas(id) ON DELETE SET NULL,
  titulo text NOT NULL DEFAULT 'Novo chat' CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 120),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  ultima_atividade_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chats TO authenticated;
GRANT ALL ON public.chats TO service_role;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.pasta_e_minha(_pasta_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT _pasta_id IS NULL OR EXISTS (
    SELECT 1 FROM public.pastas p WHERE p.id = _pasta_id AND p.user_id = auth.uid()
  )
$$;

REVOKE ALL ON FUNCTION public.pasta_e_minha(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pasta_e_minha(uuid) TO authenticated, service_role;

CREATE POLICY "chats_select_own" ON public.chats FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "chats_insert_own" ON public.chats FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.pasta_e_minha(pasta_id));
CREATE POLICY "chats_update_own" ON public.chats FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.pasta_e_minha(pasta_id));
CREATE POLICY "chats_delete_own" ON public.chats FOR DELETE TO authenticated USING (user_id = auth.uid());

-- MENSAGENS
CREATE TABLE public.mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  autor text NOT NULL CHECK (autor IN ('usuario', 'plataforma')),
  texto text NOT NULL CHECK (char_length(texto) BETWEEN 1 AND 8000),
  criado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mensagens TO authenticated;
GRANT ALL ON public.mensagens TO service_role;
ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.chat_e_meu(_chat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chats c WHERE c.id = _chat_id AND c.user_id = auth.uid()
  )
$$;

REVOKE ALL ON FUNCTION public.chat_e_meu(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_e_meu(uuid) TO authenticated, service_role;

CREATE POLICY "mensagens_select_own" ON public.mensagens FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "mensagens_insert_own" ON public.mensagens FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.chat_e_meu(chat_id));
CREATE POLICY "mensagens_update_own" ON public.mensagens FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "mensagens_delete_own" ON public.mensagens FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ÍNDICES
CREATE INDEX idx_chats_atividade ON public.chats (user_id, ultima_atividade_em DESC);
CREATE INDEX idx_chats_pasta ON public.chats (user_id, pasta_id);
CREATE INDEX idx_pastas_nome ON public.pastas (user_id, nome);
CREATE INDEX idx_mensagens_chat ON public.mensagens (chat_id, criado_em);
CREATE INDEX idx_chats_titulo_trgm ON public.chats USING gin (titulo gin_trgm_ops);
CREATE INDEX idx_mensagens_texto_trgm ON public.mensagens USING gin (texto gin_trgm_ops);

-- TRIGGERS
CREATE OR REPLACE FUNCTION public.tocar_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pastas_atualizado BEFORE UPDATE ON public.pastas
FOR EACH ROW EXECUTE FUNCTION public.tocar_atualizado_em();

CREATE TRIGGER trg_chats_atualizado BEFORE UPDATE ON public.chats
FOR EACH ROW EXECUTE FUNCTION public.tocar_atualizado_em();

-- coerência de dono entre mensagem e chat
CREATE OR REPLACE FUNCTION public.mensagem_coerente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  dono uuid;
BEGIN
  SELECT c.user_id INTO dono FROM public.chats c WHERE c.id = NEW.chat_id;
  IF dono IS NULL OR dono <> NEW.user_id THEN
    RAISE EXCEPTION 'mensagem nao pertence ao dono do chat';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mensagens_coerentes BEFORE INSERT OR UPDATE ON public.mensagens
FOR EACH ROW EXECUTE FUNCTION public.mensagem_coerente();

-- coerência de dono entre chat e pasta
CREATE OR REPLACE FUNCTION public.chat_coerente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  dono uuid;
BEGIN
  IF NEW.pasta_id IS NOT NULL THEN
    SELECT p.user_id INTO dono FROM public.pastas p WHERE p.id = NEW.pasta_id;
    IF dono IS NULL OR dono <> NEW.user_id THEN
      RAISE EXCEPTION 'pasta nao pertence ao dono do chat';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_chats_coerentes BEFORE INSERT OR UPDATE ON public.chats
FOR EACH ROW EXECUTE FUNCTION public.chat_coerente();

-- atividade e título automático
CREATE OR REPLACE FUNCTION public.registrar_atividade_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  resumo text;
BEGIN
  resumo := btrim(regexp_replace(NEW.texto, '\s+', ' ', 'g'));
  IF char_length(resumo) > 60 THEN
    resumo := left(resumo, 57) || '...';
  END IF;

  UPDATE public.chats c
  SET ultima_atividade_em = now(),
      titulo = CASE
        WHEN c.titulo = 'Novo chat' AND NEW.autor = 'usuario' AND char_length(resumo) > 0
        THEN resumo ELSE c.titulo END
  WHERE c.id = NEW.chat_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mensagens_atividade AFTER INSERT ON public.mensagens
FOR EACH ROW EXECUTE FUNCTION public.registrar_atividade_chat();