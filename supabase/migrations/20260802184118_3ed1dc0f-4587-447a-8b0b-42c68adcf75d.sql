-- 1. perfis_marca
CREATE TABLE public.perfis_marca (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 80),
  descricao text NOT NULL DEFAULT '' CHECK (char_length(descricao) <= 1000),
  publico text NOT NULL DEFAULT '' CHECK (char_length(publico) <= 600),
  posicionamento text NOT NULL DEFAULT '' CHECK (char_length(posicionamento) <= 1000),
  personalidade text NOT NULL DEFAULT '' CHECK (char_length(personalidade) <= 600),
  tom_de_voz text NOT NULL DEFAULT '' CHECK (char_length(tom_de_voz) <= 300),
  preferidas text[] NOT NULL DEFAULT '{}' CHECK (array_length(preferidas, 1) IS NULL OR array_length(preferidas, 1) <= 60),
  evitadas text[] NOT NULL DEFAULT '{}' CHECK (array_length(evitadas, 1) IS NULL OR array_length(evitadas, 1) <= 60),
  principios text NOT NULL DEFAULT '' CHECK (char_length(principios) <= 1500),
  orientacoes text NOT NULL DEFAULT '' CHECK (char_length(orientacoes) <= 2000),
  padrao boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.perfis_marca TO authenticated;
GRANT ALL ON public.perfis_marca TO service_role;

ALTER TABLE public.perfis_marca ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perfis_marca_select" ON public.perfis_marca FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "perfis_marca_insert" ON public.perfis_marca FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "perfis_marca_update" ON public.perfis_marca FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "perfis_marca_delete" ON public.perfis_marca FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_perfis_marca_user_nome ON public.perfis_marca (user_id, nome);
CREATE UNIQUE INDEX idx_perfis_marca_padrao_unico ON public.perfis_marca (user_id) WHERE padrao;

CREATE TRIGGER trg_perfis_marca_atualizado_em
  BEFORE UPDATE ON public.perfis_marca
  FOR EACH ROW EXECUTE FUNCTION public.tocar_atualizado_em();

-- 2. exemplos_marca
CREATE TABLE public.exemplos_marca (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  perfil_id uuid NOT NULL REFERENCES public.perfis_marca(id) ON DELETE CASCADE,
  titulo text NOT NULL DEFAULT '' CHECK (char_length(titulo) <= 120),
  texto text NOT NULL CHECK (char_length(texto) BETWEEN 1 AND 4000),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exemplos_marca TO authenticated;
GRANT ALL ON public.exemplos_marca TO service_role;

ALTER TABLE public.exemplos_marca ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exemplos_marca_select" ON public.exemplos_marca FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "exemplos_marca_insert" ON public.exemplos_marca FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "exemplos_marca_update" ON public.exemplos_marca FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "exemplos_marca_delete" ON public.exemplos_marca FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_exemplos_marca_perfil ON public.exemplos_marca (perfil_id, criado_em);

CREATE TRIGGER trg_exemplos_marca_atualizado_em
  BEFORE UPDATE ON public.exemplos_marca
  FOR EACH ROW EXECUTE FUNCTION public.tocar_atualizado_em();

-- 3. propriedade do perfil referenciado
CREATE OR REPLACE FUNCTION public.perfil_e_meu(_perfil_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT _perfil_id IS NULL OR EXISTS (
    SELECT 1 FROM public.perfis_marca p WHERE p.id = _perfil_id AND p.user_id = _user_id
  )
$$;

REVOKE EXECUTE ON FUNCTION public.perfil_e_meu(uuid, uuid) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.validar_perfil_do_dono()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.perfil_marca_id IS NOT NULL AND NOT public.perfil_e_meu(NEW.perfil_marca_id, NEW.user_id) THEN
    RAISE EXCEPTION 'perfil de voz de marca invalido';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_exemplo_do_dono()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.perfil_e_meu(NEW.perfil_id, NEW.user_id) THEN
    RAISE EXCEPTION 'perfil de voz de marca invalido';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_exemplos_marca_dono
  BEFORE INSERT OR UPDATE ON public.exemplos_marca
  FOR EACH ROW EXECUTE FUNCTION public.validar_exemplo_do_dono();

-- 4. vínculos em pastas e chats
ALTER TABLE public.pastas ADD COLUMN perfil_marca_id uuid REFERENCES public.perfis_marca(id) ON DELETE SET NULL;
ALTER TABLE public.chats ADD COLUMN perfil_marca_id uuid REFERENCES public.perfis_marca(id) ON DELETE SET NULL;

CREATE INDEX idx_pastas_perfil_marca ON public.pastas (perfil_marca_id);
CREATE INDEX idx_chats_perfil_marca ON public.chats (perfil_marca_id);

CREATE TRIGGER trg_pastas_perfil_dono
  BEFORE INSERT OR UPDATE ON public.pastas
  FOR EACH ROW EXECUTE FUNCTION public.validar_perfil_do_dono();

CREATE TRIGGER trg_chats_perfil_dono
  BEFORE INSERT OR UPDATE ON public.chats
  FOR EACH ROW EXECUTE FUNCTION public.validar_perfil_do_dono();