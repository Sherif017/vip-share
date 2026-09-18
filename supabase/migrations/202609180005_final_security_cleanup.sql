-- VIP Share — final security cleanup
-- 1. Harden is_manager so authenticated users cannot inspect arbitrary users.
-- 2. Remove the unused Undo Check-In RPC from the MVP.

CREATE OR REPLACE FUNCTION public.is_manager(
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    p_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'manager'
    );
$$;

REVOKE ALL ON FUNCTION public.is_manager(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_manager(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.undo_check_in_reservation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.undo_check_in_reservation(text) FROM anon;
REVOKE ALL ON FUNCTION public.undo_check_in_reservation(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.undo_check_in_reservation(text) FROM service_role;

DROP FUNCTION IF EXISTS public.undo_check_in_reservation(text);
