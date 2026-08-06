-- Feedback do usuário sobre itens entregues (Etapa 1 — Captura)
CREATE TABLE public.feedback_resultado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  execucao_id uuid NOT NULL REFERENCES public.execucoes(id) ON DELETE CASCADE,
  resultado_id uuid REFERENCES public.execucao_resultados(id) ON DELETE SET NULL,
  item_id text NOT NULL,
  perfil_marca_id uuid REFERENCES public.perfis_marca(id) ON DELETE SET NULL,
  formato text NOT NULL DEFAULT '',
  papel text NOT NULL DEFAULT '',
  sinal text NOT NULL CHECK (sinal IN ('positivo','negativo')),
  motivos text[] NOT NULL DEFAULT '{}',
  comentario text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_resultado_item_nao_vazio CHECK (length(btrim(item_id)) > 0),
  CONSTRAINT feedback_resultado_comentario_limite CHECK (length(comentario) <= 1000),
  CONSTRAINT feedback_resultado_unico UNIQUE (user_id, execucao_id, item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_resultado TO authenticated;
GRANT ALL ON public.feedback_resultado TO service_role;

ALTER TABLE public.feedback_resultado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feedback_select_proprio" ON public.feedback_resultado
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "feedback_insert_proprio" ON public.feedback_resultado
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.execucao_e_minha(execucao_id));
CREATE POLICY "feedback_update_proprio" ON public.feedback_resultado
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "feedback_delete_proprio" ON public.feedback_resultado
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX feedback_resultado_execucao_idx ON public.feedback_resultado (user_id, execucao_id);

CREATE TRIGGER feedback_resultado_tocar
  BEFORE UPDATE ON public.feedback_resultado
  FOR EACH ROW EXECUTE FUNCTION public.tocar_atualizado_em();

-- Edições do usuário, preservando sempre o texto original
CREATE TABLE public.edicoes_resultado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  execucao_id uuid NOT NULL REFERENCES public.execucoes(id) ON DELETE CASCADE,
  resultado_id uuid REFERENCES public.execucao_resultados(id) ON DELETE SET NULL,
  item_id text NOT NULL,
  perfil_marca_id uuid REFERENCES public.perfis_marca(id) ON DELETE SET NULL,
  texto_original text NOT NULL,
  texto_editado text NOT NULL,
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  virou_exemplo boolean NOT NULL DEFAULT false,
  exemplo_id uuid REFERENCES public.exemplos_marca(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT edicoes_resultado_item_nao_vazio CHECK (length(btrim(item_id)) > 0),
  CONSTRAINT edicoes_resultado_texto_limite CHECK (length(texto_editado) <= 4000),
  CONSTRAINT edicoes_resultado_unico UNIQUE (user_id, execucao_id, item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.edicoes_resultado TO authenticated;
GRANT ALL ON public.edicoes_resultado TO service_role;

ALTER TABLE public.edicoes_resultado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "edicoes_select_proprio" ON public.edicoes_resultado
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "edicoes_insert_proprio" ON public.edicoes_resultado
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.execucao_e_minha(execucao_id));
CREATE POLICY "edicoes_update_proprio" ON public.edicoes_resultado
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "edicoes_delete_proprio" ON public.edicoes_resultado
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX edicoes_resultado_execucao_idx ON public.edicoes_resultado (user_id, execucao_id);

CREATE TRIGGER edicoes_resultado_tocar
  BEFORE UPDATE ON public.edicoes_resultado
  FOR EACH ROW EXECUTE FUNCTION public.tocar_atualizado_em();

-- Origem dos exemplos de marca: manual (formulário) ou feedback (resultado aprovado)
ALTER TABLE public.exemplos_marca
  ADD COLUMN origem text NOT NULL DEFAULT 'manual',
  ADD COLUMN execucao_id uuid REFERENCES public.execucoes(id) ON DELETE SET NULL,
  ADD COLUMN item_id text;

ALTER TABLE public.exemplos_marca
  ADD CONSTRAINT exemplos_marca_origem_check CHECK (origem IN ('manual','feedback'));