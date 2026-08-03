CREATE OR REPLACE FUNCTION public.bloquear_alteracao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _papel text := coalesce(current_setting('role', true), '');
  _claim text := coalesce(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF TG_OP = 'DELETE' AND (_papel = 'service_role' OR _claim = 'service_role') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'registro imutavel';
END;
$$;

REVOKE ALL ON FUNCTION public.bloquear_alteracao() FROM PUBLIC, anon;