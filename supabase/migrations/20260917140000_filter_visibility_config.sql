-- Filter visibility is deliberately separate from column visibility and data scope.
-- Apply manually in Supabase Studio. Safe to run more than once.
CREATE TABLE IF NOT EXISTS public.filter_visibility_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role text,
  filter_key text NOT NULL,
  is_hidden boolean NOT NULL DEFAULT false,
  set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT filter_visibility_config_target CHECK ((user_id IS NOT NULL) <> (role IS NOT NULL)),
  CONSTRAINT filter_visibility_config_key CHECK (length(trim(filter_key)) > 0)
);
-- Compatibility guards for environments that created an early draft table.
ALTER TABLE public.filter_visibility_config ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.filter_visibility_config ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.filter_visibility_config ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.filter_visibility_config ADD COLUMN IF NOT EXISTS filter_key text;
ALTER TABLE public.filter_visibility_config ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.filter_visibility_config ADD COLUMN IF NOT EXISTS set_by uuid;
ALTER TABLE public.filter_visibility_config ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.filter_visibility_config ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DO $$
DECLARE v_type text; v_udt text;
BEGIN
  SELECT data_type, udt_name INTO v_type, v_udt FROM information_schema.columns WHERE table_schema='public' AND table_name='filter_visibility_config' AND column_name='id';
  IF v_udt <> 'uuid' THEN RAISE EXCEPTION 'filter_visibility_config.id has incompatible type %; expected uuid.', v_udt; END IF;
  SELECT data_type, udt_name INTO v_type, v_udt FROM information_schema.columns WHERE table_schema='public' AND table_name='filter_visibility_config' AND column_name='filter_key';
  IF v_udt <> 'text' THEN RAISE EXCEPTION 'filter_visibility_config.filter_key has incompatible type %; expected text.', v_udt; END IF;
  SELECT data_type, udt_name INTO v_type, v_udt FROM information_schema.columns WHERE table_schema='public' AND table_name='filter_visibility_config' AND column_name='is_hidden';
  IF v_udt <> 'bool' THEN RAISE EXCEPTION 'filter_visibility_config.is_hidden has incompatible type %; expected boolean.', v_udt; END IF;
  FOR v_udt IN SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='filter_visibility_config'
      AND column_name IN ('user_id','set_by') AND udt_name <> 'uuid' LOOP
    RAISE EXCEPTION 'filter_visibility_config.% has incompatible type; expected uuid.', v_udt;
  END LOOP;
  UPDATE public.filter_visibility_config SET id = gen_random_uuid() WHERE id IS NULL;
  UPDATE public.filter_visibility_config SET is_hidden = false WHERE is_hidden IS NULL;
  UPDATE public.filter_visibility_config SET created_at = now() WHERE created_at IS NULL;
  UPDATE public.filter_visibility_config SET updated_at = now() WHERE updated_at IS NULL;
  IF EXISTS (SELECT 1 FROM public.filter_visibility_config WHERE filter_key IS NULL OR length(trim(filter_key)) = 0) THEN
    RAISE EXCEPTION 'Legacy filter_visibility_config contains null/blank filter_key rows; repair them before rerunning.';
  END IF;
  IF EXISTS (SELECT user_id, filter_key FROM public.filter_visibility_config WHERE user_id IS NOT NULL GROUP BY user_id, filter_key HAVING count(*) > 1)
     OR EXISTS (SELECT role, filter_key FROM public.filter_visibility_config WHERE role IS NOT NULL GROUP BY role, filter_key HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Legacy filter_visibility_config contains duplicate identities; repair them before rerunning.';
  END IF;
END $$;
ALTER TABLE public.filter_visibility_config ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.filter_visibility_config ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.filter_visibility_config ALTER COLUMN filter_key SET NOT NULL;
ALTER TABLE public.filter_visibility_config ALTER COLUMN is_hidden SET DEFAULT false;
ALTER TABLE public.filter_visibility_config ALTER COLUMN is_hidden SET NOT NULL;
ALTER TABLE public.filter_visibility_config ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.filter_visibility_config ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.filter_visibility_config ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.filter_visibility_config ALTER COLUMN updated_at SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.filter_visibility_config'::regclass AND contype='p') THEN
    ALTER TABLE public.filter_visibility_config ADD PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
    WHERE c.conrelid='public.filter_visibility_config'::regclass AND c.contype='f' AND c.confrelid='auth.users'::regclass AND a.attname='user_id') THEN
    ALTER TABLE public.filter_visibility_config ADD CONSTRAINT filter_visibility_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
    WHERE c.conrelid='public.filter_visibility_config'::regclass AND c.contype='f' AND c.confrelid='auth.users'::regclass AND a.attname='set_by') THEN
    ALTER TABLE public.filter_visibility_config ADD CONSTRAINT filter_visibility_set_by_fk FOREIGN KEY (set_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.filter_visibility_config'::regclass AND contype='c'
    AND pg_get_constraintdef(oid) ILIKE '%user_id%IS NOT NULL%role%IS NOT NULL%') THEN
    ALTER TABLE public.filter_visibility_config ADD CONSTRAINT filter_visibility_target_xor CHECK ((user_id IS NOT NULL) <> (role IS NOT NULL));
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.filter_visibility_config'::regclass
      AND conname IN ('filter_visibility_config_key', 'filter_visibility_key_nonblank')
      AND (
        pg_get_constraintdef(oid) NOT ILIKE '%filter_key%'
        OR pg_get_constraintdef(oid) NOT ILIKE '%length%'
      )
  ) THEN
    RAISE EXCEPTION 'A known filter visibility key constraint has an incompatible definition.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.filter_visibility_config'::regclass
      AND conname IN ('filter_visibility_config_key', 'filter_visibility_key_nonblank')
  ) THEN
    ALTER TABLE public.filter_visibility_config ADD CONSTRAINT filter_visibility_key_nonblank CHECK (length(trim(filter_key)) > 0);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS filter_visibility_config_user_key ON public.filter_visibility_config(user_id, filter_key) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS filter_visibility_config_role_key ON public.filter_visibility_config(role, filter_key) WHERE role IS NOT NULL;
CREATE INDEX IF NOT EXISTS filter_visibility_config_filter_idx ON public.filter_visibility_config(filter_key);
ALTER TABLE public.filter_visibility_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS filter_visibility_config_select ON public.filter_visibility_config;
DROP POLICY IF EXISTS filter_visibility_config_write ON public.filter_visibility_config;
CREATE POLICY filter_visibility_config_select ON public.filter_visibility_config FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY filter_visibility_config_write ON public.filter_visibility_config FOR ALL USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
COMMENT ON TABLE public.filter_visibility_config IS 'UI filter visibility only; never used for authorization, RLS, data scope, or exports.';

-- Reuse the immutable access-control audit stream when it is installed.
DO $$
BEGIN
  IF to_regclass('public.access_control_audit_events') IS NULL
     OR to_regprocedure('public.log_access_control_change()') IS NULL THEN
    RAISE EXCEPTION 'access-control audit migration is required before filter visibility migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.filter_visibility_config'::regclass
      AND tgname = 'filter_visibility_config_audit'
  ) THEN
    CREATE TRIGGER filter_visibility_config_audit
      AFTER INSERT OR UPDATE OR DELETE ON public.filter_visibility_config
      FOR EACH ROW EXECUTE FUNCTION public.log_access_control_change();
  END IF;
END $$;