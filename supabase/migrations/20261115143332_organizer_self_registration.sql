BEGIN;

CREATE OR REPLACE FUNCTION public.register_organizer(
  p_user_id uuid,
  p_firstname text,
  p_lastname text,
  p_organization_name text,
  p_city text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club_id uuid;
BEGIN
  IF p_user_id IS NULL
    OR nullif(btrim(p_firstname), '') IS NULL
    OR nullif(btrim(p_lastname), '') IS NULL
    OR nullif(btrim(p_organization_name), '') IS NULL
    OR nullif(btrim(p_city), '') IS NULL
  THEN
    RAISE EXCEPTION 'Informations obligatoires manquantes';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text, 0)
  );

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = p_user_id
      AND email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Adresse email non confirmee';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND role = 'manager'
  ) THEN
    RAISE EXCEPTION 'Compte administrateur existant';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.club_memberships
    WHERE user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Compte partenaire deja existant';
  END IF;

  INSERT INTO public.profiles (
    id, firstname, lastname, role
  )
  VALUES (
    p_user_id,
    btrim(p_firstname),
    btrim(p_lastname),
    'customer'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.clubs (
    name, city
  )
  VALUES (
    btrim(p_organization_name),
    btrim(p_city)
  )
  RETURNING id INTO v_club_id;

  INSERT INTO public.club_memberships (
    user_id,
    club_id,
    role,
    status,
    created_by
  )
  VALUES (
    p_user_id,
    v_club_id,
    'admin',
    'active',
    p_user_id
  );

  RETURN v_club_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_organizer(
  uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.register_organizer(
  uuid, text, text, text, text
) TO service_role;

COMMIT;
