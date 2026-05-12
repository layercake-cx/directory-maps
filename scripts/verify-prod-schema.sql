-- =============================================================================
-- Production schema verification & reconciliation script
-- Run in: Supabase Dashboard → SQL Editor (against production project)
-- Safe to re-run: all statements use IF NOT EXISTS / IF EXISTS guards.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Tables (create if missing — should already exist)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.clients (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.maps (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  default_lat double precision NULL,
  default_lng double precision NULL,
  default_zoom integer NULL,
  show_list_panel boolean NOT NULL DEFAULT true,
  enable_clustering boolean NOT NULL DEFAULT true,
  marker_style text NOT NULL DEFAULT 'pin',
  marker_color text NOT NULL DEFAULT '#4A9BAA',
  theme_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id text NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  color text NULL
);

CREATE TABLE IF NOT EXISTS public.listings (
  id text PRIMARY KEY,
  map_id text NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  group_id uuid NULL REFERENCES public.groups(id) ON DELETE SET NULL,
  name text NOT NULL,
  address text NULL,
  postcode text NULL,
  country text NULL,
  city text NULL,
  lat double precision NULL,
  lng double precision NULL,
  is_active boolean NOT NULL DEFAULT true,
  website_url text NULL,
  email text NULL,
  phone text NULL,
  logo_url text NULL,
  notes_html text NULL,
  allow_html boolean NOT NULL DEFAULT false,
  geocode_status text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NULL
);

CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NULL,
  email text NOT NULL,
  name text NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.map_data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id text NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'google_sheets',
  drive_file_id text NULL,
  spreadsheet_id text NULL,
  sheet_name text NULL,
  sheet_id integer NULL,
  refresh_token text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz NULL,
  last_sync_status text NULL,
  last_sync_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL,
  severity text NOT NULL DEFAULT 'error',
  message text NOT NULL,
  stack text,
  component_stack text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  environment text,
  route text,
  user_agent text
);

CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('manager', 'member')),
  invited_by_contact_id uuid NULL REFERENCES public.contacts(id) ON DELETE SET NULL,
  map_ids text[] NOT NULL DEFAULT array[]::text[],
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_map_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  map_id text NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, map_id)
);

CREATE TABLE IF NOT EXISTS public.map_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id text NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  version integer NOT NULL,
  config jsonb NOT NULL,
  note text,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES auth.users(id),
  UNIQUE (map_id, version)
);

-- ---------------------------------------------------------------------------
-- 2. Missing columns (ALTER TABLE ADD COLUMN IF NOT EXISTS)
-- ---------------------------------------------------------------------------

-- maps
ALTER TABLE public.maps ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.maps ADD COLUMN IF NOT EXISTS custom_pin_url text NULL;
ALTER TABLE public.maps ADD COLUMN IF NOT EXISTS cluster_radius integer NOT NULL DEFAULT 80;
ALTER TABLE public.maps ADD COLUMN IF NOT EXISTS published_config jsonb;
ALTER TABLE public.maps ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE public.maps ADD COLUMN IF NOT EXISTS current_publication_id uuid NULL;

-- groups
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS theme_json jsonb;

-- listings
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS notes_html text NULL;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS allow_html boolean NOT NULL DEFAULT false;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS geocoded_at timestamptz NULL;

-- contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS can_manage_maps boolean NOT NULL DEFAULT false;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS can_manage_users boolean NOT NULL DEFAULT false;

-- contacts role (needs DO block for the CHECK constraint)
DO $$ BEGIN
  ALTER TABLE public.contacts ADD COLUMN role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'manager', 'member'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- map_data_sources
ALTER TABLE public.map_data_sources ADD COLUMN IF NOT EXISTS sync_schedule text NULL;

-- map_data_sources unique constraint on map_id
DO $$ BEGIN
  ALTER TABLE public.map_data_sources ADD CONSTRAINT map_data_sources_map_id_unique UNIQUE (map_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Backfill: existing primary contacts should be owners
UPDATE public.contacts SET role = 'owner' WHERE is_primary = true AND role = 'member';

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_slug ON public.clients(slug);
CREATE INDEX IF NOT EXISTS idx_maps_client_id ON public.maps(client_id);
CREATE INDEX IF NOT EXISTS idx_groups_map_id ON public.groups(map_id);
CREATE INDEX IF NOT EXISTS idx_listings_map_id ON public.listings(map_id);
CREATE INDEX IF NOT EXISTS idx_listings_group_id ON public.listings(group_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role) WHERE role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_client_id ON public.contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_map_data_sources_map_id ON public.map_data_sources(map_id);
CREATE INDEX IF NOT EXISTS idx_map_data_sources_enabled ON public.map_data_sources(enabled);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON public.error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations(lower(email)) WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invitations_client_id ON public.invitations(client_id);
CREATE INDEX IF NOT EXISTS idx_cmp_contact ON public.contact_map_permissions(contact_id);
CREATE INDEX IF NOT EXISTS idx_cmp_map ON public.contact_map_permissions(map_id);
CREATE INDEX IF NOT EXISTS idx_map_publications_map_id_version_desc ON public.map_publications(map_id, version DESC);

-- ---------------------------------------------------------------------------
-- 4. View
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.public_listings;
CREATE VIEW public.public_listings AS SELECT * FROM public.listings;

-- ---------------------------------------------------------------------------
-- 5. RLS — enable on all required tables
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_publications ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 6. RLS policies (DROP + CREATE to ensure correct definition)
-- ---------------------------------------------------------------------------

-- profiles
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- clients
DROP POLICY IF EXISTS "clients_authenticated_all" ON public.clients;
CREATE POLICY "clients_authenticated_all"
  ON public.clients FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- maps
DROP POLICY IF EXISTS "maps_authenticated_all" ON public.maps;
CREATE POLICY "maps_authenticated_all"
  ON public.maps FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "maps_anon_select" ON public.maps;
CREATE POLICY "maps_anon_select"
  ON public.maps FOR SELECT TO anon
  USING (true);

-- groups
DROP POLICY IF EXISTS "groups_authenticated_all" ON public.groups;
CREATE POLICY "groups_authenticated_all"
  ON public.groups FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "groups_anon_select" ON public.groups;
CREATE POLICY "groups_anon_select"
  ON public.groups FOR SELECT TO anon
  USING (true);

-- listings
DROP POLICY IF EXISTS "listings_authenticated_all" ON public.listings;
CREATE POLICY "listings_authenticated_all"
  ON public.listings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "listings_anon_select" ON public.listings;
CREATE POLICY "listings_anon_select"
  ON public.listings FOR SELECT TO anon
  USING (true);

-- contacts
DROP POLICY IF EXISTS "contacts_authenticated_all" ON public.contacts;
CREATE POLICY "contacts_authenticated_all"
  ON public.contacts FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- map_data_sources
DROP POLICY IF EXISTS "map_data_sources_authenticated_all" ON public.map_data_sources;
CREATE POLICY "map_data_sources_authenticated_all"
  ON public.map_data_sources FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- error_logs
DROP POLICY IF EXISTS "error_logs_insert_anon_authenticated" ON public.error_logs;
CREATE POLICY "error_logs_insert_anon_authenticated"
  ON public.error_logs FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "error_logs_select_admin" ON public.error_logs;
CREATE POLICY "error_logs_select_admin"
  ON public.error_logs FOR SELECT TO authenticated
  USING (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));

-- map_publications
DROP POLICY IF EXISTS "map_publications_select_current_for_map" ON public.map_publications;
CREATE POLICY "map_publications_select_current_for_map"
  ON public.map_publications FOR SELECT TO anon, authenticated
  USING (exists (select 1 from public.maps m where m.id = map_publications.map_id and m.current_publication_id = map_publications.id));

-- ---------------------------------------------------------------------------
-- 7. Functions / RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_client_slug_available(p_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE lower(trim(c.slug)) = lower(trim(p_slug))
  );
$$;

REVOKE ALL ON FUNCTION public.is_client_slug_available(text) FROM public;
GRANT EXECUTE ON FUNCTION public.is_client_slug_available(text) TO anon, authenticated;

-- error_logs trigger function
CREATE OR REPLACE FUNCTION public.error_logs_set_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  new.user_id := auth.uid();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_error_logs_set_user_id ON public.error_logs;
CREATE TRIGGER trg_error_logs_set_user_id
  BEFORE INSERT ON public.error_logs
  FOR EACH ROW EXECUTE FUNCTION public.error_logs_set_user_id();

-- publish_map
CREATE OR REPLACE FUNCTION public.publish_map(p_map_id text, p_config jsonb, p_note text DEFAULT NULL)
RETURNS public.map_publications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_ver integer;
  v_pub public.map_publications%rowtype;
  v_note text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.maps WHERE id = p_map_id) THEN
    RAISE EXCEPTION 'Map not found';
  END IF;
  IF coalesce((p_config->>'schemaVersion')::integer, 0) <> 1 THEN
    RAISE EXCEPTION 'Invalid publication config: schemaVersion must be 1';
  END IF;
  IF p_config->'map' IS NULL THEN
    RAISE EXCEPTION 'Invalid publication config: missing map';
  END IF;
  IF p_config->'groups' IS NULL THEN
    RAISE EXCEPTION 'Invalid publication config: missing groups';
  END IF;

  SELECT coalesce(max(version), 0) + 1 INTO v_next_ver
  FROM public.map_publications WHERE map_id = p_map_id;

  v_note := nullif(trim(coalesce(p_note, '')), '');

  INSERT INTO public.map_publications (map_id, version, config, note, published_by)
  VALUES (p_map_id, v_next_ver, p_config, v_note, auth.uid())
  RETURNING * INTO v_pub;

  UPDATE public.maps
  SET current_publication_id = v_pub.id,
      published_config = p_config->'map',
      published_at = v_pub.published_at
  WHERE id = p_map_id;

  RETURN v_pub;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_map(text, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.publish_map(text, jsonb, text) TO authenticated;

-- rollback_map_to
CREATE OR REPLACE FUNCTION public.rollback_map_to(p_map_id text, p_publication_id uuid)
RETURNS public.map_publications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src public.map_publications%rowtype;
  v_next_ver integer;
  v_pub public.map_publications%rowtype;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.maps WHERE id = p_map_id) THEN
    RAISE EXCEPTION 'Map not found';
  END IF;

  SELECT * INTO v_src FROM public.map_publications
  WHERE id = p_publication_id AND map_id = p_map_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Publication not found for this map';
  END IF;

  SELECT coalesce(max(version), 0) + 1 INTO v_next_ver
  FROM public.map_publications WHERE map_id = p_map_id;

  INSERT INTO public.map_publications (map_id, version, config, note, published_by)
  VALUES (p_map_id, v_next_ver, v_src.config, format('Restore version %s', v_src.version), auth.uid())
  RETURNING * INTO v_pub;

  UPDATE public.maps
  SET current_publication_id = v_pub.id,
      published_config = v_pub.config->'map',
      published_at = v_pub.published_at
  WHERE id = p_map_id;

  RETURN v_pub;
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_map_to(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rollback_map_to(text, uuid) TO authenticated;

-- list_map_publications
CREATE OR REPLACE FUNCTION public.list_map_publications(p_map_id text)
RETURNS SETOF public.map_publications
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.map_publications
  WHERE map_id = p_map_id
  ORDER BY version DESC;
$$;

REVOKE ALL ON FUNCTION public.list_map_publications(text) FROM public;
GRANT EXECUTE ON FUNCTION public.list_map_publications(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Done. All tables, columns, indexes, policies, functions, and triggers
-- should now match the migration definitions.
-- ---------------------------------------------------------------------------
