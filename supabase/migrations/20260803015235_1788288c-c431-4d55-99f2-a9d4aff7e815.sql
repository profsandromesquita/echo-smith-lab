CREATE OR REPLACE FUNCTION public.bloquear_alteracao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Somente o processo privilegiado (exclusao de conta) pode remover.
  IF TG_OP = 'DELETE' AND current_user = 'service_role' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'registro imutavel';
END;
$$;

REVOKE ALL ON FUNCTION public.bloquear_alteracao() FROM PUBLIC, anon;