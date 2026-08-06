DROP POLICY IF EXISTS "precos legiveis por autenticados" ON public.precos_modelos;
CREATE POLICY "precos legiveis por administrador tecnico"
ON public.precos_modelos
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin_tecnico'));