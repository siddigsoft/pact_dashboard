-- Non-destructive variant of target_ready.sql
-- This file was generated from scripts/target_ready.sql by inserting
-- "IF NOT EXISTS" into CREATE TABLE statements so running it will
-- create missing tables without failing on tables that already exist.
-- Review before running. It does NOT alter existing tables or reconcile
-- schema differences. If constraints/indexes/alter statements in the
-- original file expect a fresh schema, they may still fail.

SET client_min_messages = WARNING;

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS postgis;

-- Sequences used by integer PK defaults
CREATE SEQUENCE IF NOT EXISTS public.app_versions_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.hub_states_id_seq;

-- Tables (non-destructive)

CREATE TABLE IF NOT EXISTS public.app_versions (
  id integer NOT NULL DEFAULT nextval('public.app_versions_id_seq'::regclass),
  platform character varying NOT NULL CHECK (platform::text = ANY (ARRAY['web'::character varying, 'mobile'::character varying]::text[])),
  current_version character varying NOT NULL,
  minimum_supported character varying NOT NULL,
  latest_version character varying NOT NULL,
  changelog text,
  download_url character varying,
  force_update boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT app_versions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  module text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  entity_name text,
  actor_id text NOT NULL DEFAULT 'system'::text,
  actor_name text NOT NULL DEFAULT 'System'::text,
  actor_role text DEFAULT 'system'::text,
  actor_email text,
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  severity text NOT NULL DEFAULT 'info'::text,
  workflow_step text,
  previous_state jsonb,
  new_state jsonb,
  changes jsonb,
  metadata jsonb,
  ip_address text,
  user_agent text,
  session_id text,
  description text NOT NULL,
  details text,
  tags text[],
  related_entity_ids text[],
  duration integer,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.budget_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_budget_id uuid,
  mmp_budget_id uuid,
  alert_type character varying NOT NULL,
  severity character varying DEFAULT 'warning'::character varying,
  threshold_percentage integer,
  title character varying NOT NULL,
  message text,
  status character varying DEFAULT 'active'::character varying,
  acknowledged_by uuid,
  acknowledged_at timestamp with time zone,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now(),
  resolved_at timestamp with time zone,
  CONSTRAINT budget_alerts_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.budget_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_budget_id uuid,
  mmp_budget_id uuid,
  site_visit_id uuid,
  wallet_transaction_id uuid,
  transaction_type character varying NOT NULL,
  amount_cents bigint NOT NULL,
  currency character varying DEFAULT 'SDG'::character varying,
  category character varying,
  balance_before_cents bigint,
  balance_after_cents bigint,
  description text,
  metadata jsonb,
  reference_number character varying,
  requires_approval boolean DEFAULT false,
  approved_by uuid,
  approved_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT budget_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT budget_transactions_mmp_budget_id_fkey FOREIGN KEY (mmp_budget_id) REFERENCES public.mmp_budgets(id),
  CONSTRAINT budget_transactions_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id),
  CONSTRAINT budget_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
  CONSTRAINT budget_transactions_site_visit_id_fkey FOREIGN KEY (site_visit_id) REFERENCES public.mmp_site_entries(id),
  CONSTRAINT budget_transactions_wallet_transaction_id_fkey FOREIGN KEY (wallet_transaction_id) REFERENCES public.wallet_transactions(id),
  CONSTRAINT budget_transactions_project_budget_id_fkey FOREIGN KEY (project_budget_id) REFERENCES public.project_budgets(id)
);

CREATE TABLE IF NOT EXISTS public.call_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  call_id text,
  caller_id uuid NOT NULL,
  callee_id uuid NOT NULL,
  caller_name text,
  callee_name text,
  caller_avatar text,
  callee_avatar text,
  is_video boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ended'::text CHECK (status = ANY (ARRAY['connected'::text, 'missed'::text, 'rejected'::text, 'busy'::text, 'failed'::text, 'ended'::text])),
  duration_seconds integer,
  notes text,
  was_recorded boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone,
  CONSTRAINT call_history_pkey PRIMARY KEY (id),
  CONSTRAINT call_history_caller_id_fkey FOREIGN KEY (caller_id) REFERENCES public.profiles(id),
  CONSTRAINT call_history_callee_id_fkey FOREIGN KEY (callee_id) REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.call_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL,
  callee_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction = ANY (ARRAY['outgoing'::text, 'incoming'::text])),
  status text NOT NULL CHECK (status = ANY (ARRAY['completed'::text, 'missed'::text, 'rejected'::text, 'no_answer'::text])),
  duration integer DEFAULT 0,
  started_at timestamp with time zone DEFAULT now(),
  ended_at timestamp with time zone,
  call_type text DEFAULT 'audio'::text CHECK (call_type = ANY (ARRAY['audio'::text, 'video'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT call_logs_pkey PRIMARY KEY (id),
  CONSTRAINT call_logs_caller_id_fkey FOREIGN KEY (caller_id) REFERENCES public.profiles(id),
  CONSTRAINT call_logs_callee_id_fkey FOREIGN KEY (callee_id) REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.chat_message_reads (
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chat_message_reads_pkey PRIMARY KEY (message_id, user_id),
  CONSTRAINT chat_message_reads_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id),
  CONSTRAINT chat_message_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  content text,
  content_type text NOT NULL DEFAULT 'text'::text CHECK (content_type = ANY (ARRAY['text'::text, 'image'::text, 'file'::text, 'location'::text, 'audio'::text])),
  attachments jsonb,
  metadata jsonb,
  status text NOT NULL DEFAULT 'sent'::text CHECK (status = ANY (ARRAY['sent'::text, 'delivered'::text, 'read'::text, 'failed'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT chat_messages_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id),
  CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.chat_participants (
  chat_id uuid NOT NULL,
  user_id uuid NOT NULL,
  joined_at timestamp with time zone DEFAULT now(),
  CONSTRAINT chat_participants_pkey PRIMARY KEY (chat_id, user_id),
  CONSTRAINT chat_participants_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id),
  CONSTRAINT chat_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.chats (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Chat'::text,
  type text NOT NULL CHECK (type = ANY (ARRAY['private'::text, 'group'::text, 'state-group'::text])),
  is_group boolean NOT NULL DEFAULT false,
  created_by uuid,
  state_id text,
  related_entity_id text,
  related_entity_type text CHECK (related_entity_type = ANY (ARRAY['mmpFile'::text, 'project'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  pair_key text,
  CONSTRAINT chats_pkey PRIMARY KEY (id),
  CONSTRAINT chats_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.classification_fee_structures (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  classification_level text NOT NULL,
  role_scope text NOT NULL,
  site_visit_base_fee_cents integer NOT NULL DEFAULT 0,
  site_visit_transport_fee_cents integer NOT NULL DEFAULT 0,
  complexity_multiplier numeric DEFAULT 1.0 CHECK (complexity_multiplier >= 0::numeric),
  currency text DEFAULT 'SDG'::text,
  effective_from timestamp with time zone NOT NULL DEFAULT now(),
  effective_until timestamp with time zone,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_by uuid,
  updated_by uuid,
  change_notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT classification_fee_structures_pkey PRIMARY KEY (id),
  CONSTRAINT classification_fee_structures_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
  CONSTRAINT classification_fee_structures_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.comprehensive_monitoring_checklists (
  id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid,
  enumerator_name text NOT NULL,
  enumerator_contact text NOT NULL,
  team_leader text NOT NULL,
  location_hub text NOT NULL,
  site_name_id text NOT NULL,
  visit_date timestamp with time zone NOT NULL,
  visit_time text NOT NULL,
  activities_monitored text[] NOT NULL,
  activity_monitoring jsonb DEFAULT '{}'::jsonb,
  activity_priorities jsonb DEFAULT '{}'::jsonb,
  activity_photos text[] DEFAULT '{}'::text[],
  distribution_monitoring jsonb DEFAULT '{}'::jsonb,
  distribution_photos text[] DEFAULT '{}'::text[],
  post_distribution_monitoring jsonb DEFAULT '{}'::jsonb,
  post_distribution_photos text[] DEFAULT '{}'::text[],
  post_harvest_loss jsonb DEFAULT '{}'::jsonb,
  post_harvest_photos text[] DEFAULT '{}'::text[],
  market_diversion_monitoring jsonb DEFAULT '{}'::jsonb,
  market_diversion_photos text[] DEFAULT '{}'::text[],
  additional_notes text DEFAULT ''::text,
  is_synced boolean DEFAULT true,
  last_modified timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT comprehensive_monitoring_checklists_pkey PRIMARY KEY (id),
  CONSTRAINT comprehensive_monitoring_checklists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.cost_adjustment_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  site_visit_cost_id uuid,
  site_visit_id uuid,
  mmp_site_entry_id uuid,
  site_name text,
  previous_transportation_cost numeric,
  previous_accommodation_cost numeric,
  previous_meal_allowance numeric,
  previous_other_costs numeric,
  previous_total_cost numeric,
  new_transportation_cost numeric,
  new_accommodation_cost numeric,
  new_meal_allowance numeric,
  new_other_costs numeric,
  new_total_cost numeric,
  adjustment_type text NOT NULL CHECK (adjustment_type = ANY (ARRAY['increase'::text, 'decrease'::text, 'correction'::text])),
  adjustment_reason text NOT NULL,
  supporting_documents jsonb DEFAULT '[]'::jsonb,
  adjusted_by uuid NOT NULL,
  adjusted_by_role text NOT NULL,
  adjusted_by_name text,
  adjusted_at timestamp with time zone DEFAULT now(),
  additional_payment_needed numeric DEFAULT 0,
  additional_payment_transaction_id uuid,
  additional_payment_processed boolean DEFAULT false,
  additional_payment_processed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT cost_adjustment_audit_pkey PRIMARY KEY (id),
  CONSTRAINT cost_adjustment_audit_adjusted_by_fkey FOREIGN KEY (adjusted_by) REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.cost_approval_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  submission_id uuid,
  action character varying NOT NULL,
  actor_id uuid,
  actor_role character varying,
  action_timestamp timestamp with time zone DEFAULT now(),
  previous_status character varying,
  new_status character varying,
  previous_amount_cents bigint,
  new_amount_cents bigint,
  notes text,
  changes jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cost_approval_history_pkey PRIMARY KEY (id),
  CONSTRAINT cost_approval_history_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.site_visit_cost_submissions(id)
});
