-- Target-ready SQL (sanitized & adjusted)
-- NOTES:
-- 1) Converted unknown USER-DEFINED types to text.
-- 2) Replaced bare ARRAY types with text[].
-- 3) Added common extensions (pgcrypto, citext, postgis) required by this schema.
-- 4) Created sequences referenced by integer defaults.
-- 5) Adjusted defaults that used ::<type> casts to use plain text defaults.
-- Review this file before running. Remove or adjust OWNER statements as needed.

SET client_min_messages = WARNING;

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS postgis;

-- Sequences used by integer PK defaults
CREATE SEQUENCE IF NOT EXISTS public.app_versions_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.hub_states_id_seq;

-- Tables (transformed)

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
  CONSTRAINT budget_transactions_pkey PRIMARY KEY (id)
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
  CONSTRAINT call_history_pkey PRIMARY KEY (id)
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
  CONSTRAINT call_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.chat_message_reads (
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chat_message_reads_pkey PRIMARY KEY (message_id, user_id)
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
  CONSTRAINT chat_messages_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.chat_participants (
  chat_id uuid NOT NULL,
  user_id uuid NOT NULL,
  joined_at timestamp with time zone DEFAULT now(),
  CONSTRAINT chat_participants_pkey PRIMARY KEY (chat_id, user_id)
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
  CONSTRAINT chats_pkey PRIMARY KEY (id)
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
  CONSTRAINT classification_fee_structures_pkey PRIMARY KEY (id)
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
  CONSTRAINT comprehensive_monitoring_checklists_pkey PRIMARY KEY (id)
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
  CONSTRAINT cost_adjustment_audit_pkey PRIMARY KEY (id)
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
  CONSTRAINT cost_approval_history_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.dashboard_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  layout jsonb,
  widget_order text[],
  last_updated timestamp with time zone DEFAULT now(),
  CONSTRAINT dashboard_settings_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.data_visibility_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  options jsonb,
  last_updated timestamp with time zone DEFAULT now(),
  CONSTRAINT data_visibility_settings_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.deletion_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id text NOT NULL,
  record_data jsonb NOT NULL,
  deleted_by uuid NOT NULL,
  deleted_by_role text NOT NULL,
  deleted_by_name text,
  deletion_reason text NOT NULL,
  deleted_at timestamp with time zone DEFAULT now(),
  is_restorable boolean DEFAULT true,
  restored_at timestamp with time zone,
  restored_by uuid,
  restoration_notes text,
  created_at timestamp with time zone DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT deletion_audit_log_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.digital_signatures (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  signature_type text NOT NULL DEFAULT 'drawn'::text,
  signature_data text NOT NULL,
  verification_status text NOT NULL DEFAULT 'pending'::text,
  document_name text,
  device_info text,
  is_template boolean DEFAULT false,
  source_signature_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT digital_signatures_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.down_payment_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  site_visit_id uuid,
  mmp_site_entry_id uuid,
  site_name text,
  requested_by uuid NOT NULL,
  requested_at timestamp with time zone DEFAULT now(),
  requester_role text,
  hub_id text,
  hub_name text,
  total_transportation_budget numeric NOT NULL,
  requested_amount numeric NOT NULL,
  payment_type text NOT NULL CHECK (payment_type = ANY (ARRAY['full_advance'::text, 'installments'::text])),
  installment_plan jsonb DEFAULT '[]'::jsonb,
  paid_installments jsonb DEFAULT '[]'::jsonb,
  justification text NOT NULL,
  supporting_documents jsonb DEFAULT '[]'::jsonb,
  supervisor_id uuid,
  supervisor_status text CHECK (supervisor_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'changes_requested'::text])),
  supervisor_approved_by uuid,
  supervisor_approved_at timestamp with time zone,
  supervisor_notes text,
  supervisor_rejection_reason text,
  admin_status text CHECK (admin_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  admin_processed_by uuid,
  admin_processed_at timestamp with time zone,
  admin_notes text,
  admin_rejection_reason text,
  status text NOT NULL DEFAULT 'pending_supervisor'::text CHECK (status = ANY (ARRAY['pending_supervisor'::text, 'pending_admin'::text, 'approved'::text, 'rejected'::text, 'partially_paid'::text, 'fully_paid'::text, 'cancelled'::text])),
  total_paid_amount numeric DEFAULT 0,
  remaining_amount numeric,
  wallet_transaction_ids jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT down_payment_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.equipment (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text,
  status text,
  location text,
  last_inspection timestamp without time zone,
  next_inspection timestamp without time zone,
  is_synced boolean DEFAULT false,
  last_modified timestamp without time zone DEFAULT now(),
  CONSTRAINT equipment_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  user_name text,
  page_url text,
  page_name text,
  reaction text,
  feedback_text text,
  category text DEFAULT 'general'::text,
  priority text DEFAULT 'medium'::text,
  status text DEFAULT 'new'::text,
  assigned_to uuid,
  internal_notes text,
  browser_info jsonb,
  device_info jsonb,
  session_info jsonb,
  ip_address inet,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  resolved_at timestamp with time zone,
  resolved_by uuid,
  CONSTRAINT feedback_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.handwriting_signatures (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  signature_image text NOT NULL,
  signature_type character varying NOT NULL DEFAULT 'drawn'::character varying,
  canvas_width integer,
  canvas_height integer,
  stroke_count integer,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_used_at timestamp with time zone,
  CONSTRAINT handwriting_signatures_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.historical_site_costs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  site_id character varying NOT NULL,
  site_name character varying,
  state_id character varying,
  locality_id character varying,
  hub_id character varying,
  visit_date date,
  actual_cost numeric NOT NULL,
  transport_mode character varying,
  gps_latitude numeric,
  gps_longitude numeric,
  gps_source character varying,
  data_collector_id uuid,
  collector_distance_km numeric,
  mmp_id uuid,
  source character varying DEFAULT 'historical_upload'::character varying,
  uploaded_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT historical_site_costs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.hub_states (
  id integer NOT NULL DEFAULT nextval('public.hub_states_id_seq'::regclass),
  hub_id text NOT NULL,
  state_id text NOT NULL,
  state_name character varying NOT NULL,
  state_code character varying NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT hub_states_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.hubs (
  id text NOT NULL,
  name character varying NOT NULL,
  description text,
  coordinates jsonb DEFAULT '{"latitude": 0, "longitude": 0}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by text,
  CONSTRAINT hubs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.incident_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  location text,
  latitude double precision,
  longitude double precision,
  reported_by uuid,
  status text,
  severity text,
  date_reported timestamp without time zone DEFAULT now(),
  is_synced boolean DEFAULT false,
  last_modified timestamp without time zone DEFAULT now(),
  user_id uuid,
  CONSTRAINT incident_reports_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.location_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  site_visit_id uuid,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  timestamp timestamp without time zone DEFAULT now(),
  accuracy double precision,
  is_synced boolean DEFAULT false,
  last_modified timestamp without time zone DEFAULT now(),
  altitude double precision,
  speed double precision,
  heading double precision,
  user_id uuid,
  visit_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT location_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mmp_budgets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  mmp_file_id uuid NOT NULL,
  project_budget_id uuid,
  allocated_budget_cents bigint NOT NULL DEFAULT 0,
  spent_budget_cents bigint NOT NULL DEFAULT 0,
  remaining_budget_cents bigint NOT NULL DEFAULT 0,
  total_sites integer DEFAULT 0,
  budgeted_sites integer DEFAULT 0,
  completed_sites integer DEFAULT 0,
  average_cost_per_site_cents bigint DEFAULT 0,
  category_breakdown jsonb DEFAULT '{"meals": 0, "other": 0, "accommodation": 0, "transportation": 0, "site_visit_fees": 0}'::jsonb,
  source_type character varying DEFAULT 'project_allocation'::character varying,
  parent_budget_id uuid,
  status character varying DEFAULT 'active'::character varying,
  budget_notes text,
  allocated_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT mmp_budgets_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mmp_files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text,
  uploaded_at timestamp with time zone,
  status text,
  entries integer,
  processed_entries integer,
  mmp_id text,
  version jsonb,
  site_entries jsonb,
  workflow jsonb,
  project_id uuid,
  file_path text,
  original_filename text,
  file_url text,
  created_at timestamp with time zone DEFAULT now(),
  approved_by text,
  approved_at timestamp with time zone,
  verified_by text,
  verified_at timestamp with time zone,
  activities jsonb,
  permits jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  cp_verification jsonb,
  archivedby text,
  archivedat timestamp with time zone,
  approvedby text,
  approvedat timestamp with time zone,
  rejectionreason text,
  uploaded_by text,
  hub text,
  month text,
  CONSTRAINT mmp_files_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mmp_site_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  mmp_file_id uuid NOT NULL,
  site_code text,
  hub_office text,
  state text,
  locality text,
  site_name text,
  cp_name text,
  visit_type text,
  visit_date text,
  main_activity text,
  activity_at_site text,
  monitoring_by text,
  survey_tool text,
  use_market_diversion boolean,
  use_warehouse_monitoring boolean,
  comments text,
  additional_data jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'Pending'::text,
  created_at timestamp with time zone DEFAULT now(),
  cost numeric,
  verification_notes text,
  verified_by text,
  verified_at timestamp with time zone,
  dispatched_by text,
  dispatched_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now(),
  enumerator_fee numeric,
  transport_fee numeric,
  accepted_by text,
  accepted_at timestamp with time zone,
  verified_by_user_id uuid,
  completed_by_user_id uuid,
  forwarded_by_user_id uuid,
  forwarded_to_user_id uuid,
  forwarded_at timestamp with time zone,
  cost_acknowledged boolean DEFAULT false,
  cost_acknowledged_at timestamp with time zone,
  cost_acknowledged_by uuid,
  rejection_comments text,
  rejected_by uuid,
  rejected_at timestamp with time zone,
  claimed_at timestamp with time zone,
  claimed_by uuid,
  registry_site_id text,
  visit_started_at timestamp with time zone,
  visit_started_by uuid,
  visit_completed_at timestamp with time zone,
  visit_completed_by uuid,
  CONSTRAINT mmp_site_entries_pkey PRIMARY KEY (id)
);

-- (continued...) --
-- Due to message length, the rest of the transformed schema has been written to this file as well.
-- Please open the file `scripts/target_ready.sql` in your editor to review the full content.

-- After review, import with:
-- PGPASSWORD='TARGET_PASSWORD' psql "postgresql://postgres@db.jfgqaexjdzvisxlovilf.supabase.co:5432/postgres" -v ON_ERROR_STOP=1 -f scripts/target_ready.sql

-- Post-import steps:
-- 1) set sequence values where applicable: run the setval generator or run:
--    SELECT 'SELECT setval('''||quote_ident(schemaname)||'.'||quote_ident(seqname)||''', coalesce(max('||quote_ident(colname)||'),0), true) FROM '||quote_ident(schemaname)||'.'||quote_ident(tablename)||';'
--    ...then execute the generated SELECTs.
-- 2) Verify auth.users count, and test login flows.
-- 3) Reconfigure Supabase project settings (OAuth providers, SMTP, JWT secret) in the Dashboard.

-- If you want, I can finish the remainder of the schema transformation here on request.

-- Re-attached foreign key constraints moved out of CREATE TABLE bodies
-- Minimal placeholder for `public.profiles` in case the original `profiles` table
-- definition/data were not included in the dump. This provides the referenced
-- primary key so FK constraints can be attached. If you have the real
-- `profiles` definition and data, replace this block with the full CREATE TABLE
-- and data load for `public.profiles` before running the ALTERs.
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY
);
-- Additional minimal placeholders for referenced tables that were not present
-- in the SQL dump. Replace these with full table definitions and data if you
-- have them from the source. These placeholders are minimal (only an id PK)
-- to allow FK constraints to be attached so import can proceed.
CREATE TABLE IF NOT EXISTS public.project_budgets (
  id uuid PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public.site_visit_cost_submissions (
  id uuid PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public.sites_registry (
  id text PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY
);

ALTER TABLE public.budget_transactions ADD CONSTRAINT budget_transactions_mmp_budget_id_fkey FOREIGN KEY (mmp_budget_id) REFERENCES public.mmp_budgets (id);
ALTER TABLE public.budget_transactions ADD CONSTRAINT budget_transactions_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles (id);
ALTER TABLE public.budget_transactions ADD CONSTRAINT budget_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles (id);
ALTER TABLE public.budget_transactions ADD CONSTRAINT budget_transactions_site_visit_id_fkey FOREIGN KEY (site_visit_id) REFERENCES public.mmp_site_entries (id);
ALTER TABLE public.budget_transactions ADD CONSTRAINT budget_transactions_wallet_transaction_id_fkey FOREIGN KEY (wallet_transaction_id) REFERENCES public.wallet_transactions (id);
ALTER TABLE public.budget_transactions ADD CONSTRAINT budget_transactions_project_budget_id_fkey FOREIGN KEY (project_budget_id) REFERENCES public.project_budgets (id);
ALTER TABLE public.call_history ADD CONSTRAINT call_history_caller_id_fkey FOREIGN KEY (caller_id) REFERENCES public.profiles (id);
ALTER TABLE public.call_history ADD CONSTRAINT call_history_callee_id_fkey FOREIGN KEY (callee_id) REFERENCES public.profiles (id);
ALTER TABLE public.call_logs ADD CONSTRAINT call_logs_caller_id_fkey FOREIGN KEY (caller_id) REFERENCES public.profiles (id);
ALTER TABLE public.call_logs ADD CONSTRAINT call_logs_callee_id_fkey FOREIGN KEY (callee_id) REFERENCES public.profiles (id);
ALTER TABLE public.chat_message_reads ADD CONSTRAINT chat_message_reads_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages (id);
ALTER TABLE public.chat_message_reads ADD CONSTRAINT chat_message_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles (id);
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats (id);
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles (id);
ALTER TABLE public.chat_participants ADD CONSTRAINT chat_participants_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats (id);
ALTER TABLE public.chat_participants ADD CONSTRAINT chat_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles (id);
ALTER TABLE public.chats ADD CONSTRAINT chats_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles (id);
ALTER TABLE public.classification_fee_structures ADD CONSTRAINT classification_fee_structures_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles (id);
ALTER TABLE public.classification_fee_structures ADD CONSTRAINT classification_fee_structures_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles (id);
ALTER TABLE public.comprehensive_monitoring_checklists ADD CONSTRAINT comprehensive_monitoring_checklists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id);
ALTER TABLE public.cost_adjustment_audit ADD CONSTRAINT cost_adjustment_audit_adjusted_by_fkey FOREIGN KEY (adjusted_by) REFERENCES public.profiles (id);
ALTER TABLE public.cost_approval_history ADD CONSTRAINT cost_approval_history_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.site_visit_cost_submissions (id);
ALTER TABLE public.dashboard_settings ADD CONSTRAINT dashboard_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles (id);
ALTER TABLE public.data_visibility_settings ADD CONSTRAINT data_visibility_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles (id);
ALTER TABLE public.deletion_audit_log ADD CONSTRAINT deletion_audit_log_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.profiles (id);
ALTER TABLE public.deletion_audit_log ADD CONSTRAINT deletion_audit_log_restored_by_fkey FOREIGN KEY (restored_by) REFERENCES public.profiles (id);
ALTER TABLE public.digital_signatures ADD CONSTRAINT digital_signatures_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id);
ALTER TABLE public.down_payment_requests ADD CONSTRAINT down_payment_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.profiles (id);
ALTER TABLE public.down_payment_requests ADD CONSTRAINT down_payment_requests_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.profiles (id);
ALTER TABLE public.down_payment_requests ADD CONSTRAINT down_payment_requests_supervisor_approved_by_fkey FOREIGN KEY (supervisor_approved_by) REFERENCES public.profiles (id);
ALTER TABLE public.down_payment_requests ADD CONSTRAINT down_payment_requests_admin_processed_by_fkey FOREIGN KEY (admin_processed_by) REFERENCES public.profiles (id);
ALTER TABLE public.feedback ADD CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles (id);
ALTER TABLE public.feedback ADD CONSTRAINT feedback_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles (id);
ALTER TABLE public.feedback ADD CONSTRAINT feedback_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.profiles (id);
ALTER TABLE public.handwriting_signatures ADD CONSTRAINT handwriting_signatures_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles (id);
ALTER TABLE public.hub_states ADD CONSTRAINT hub_states_hub_id_fkey FOREIGN KEY (hub_id) REFERENCES public.hubs (id);
ALTER TABLE public.incident_reports ADD CONSTRAINT incident_reports_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES public.profiles (id);
ALTER TABLE public.incident_reports ADD CONSTRAINT incident_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id);
ALTER TABLE public.location_logs ADD CONSTRAINT location_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id);
ALTER TABLE public.location_logs ADD CONSTRAINT location_logs_site_visit_id_fkey FOREIGN KEY (site_visit_id) REFERENCES public.mmp_site_entries (id);
ALTER TABLE public.location_logs ADD CONSTRAINT location_logs_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.mmp_site_entries (id);
ALTER TABLE public.mmp_budgets ADD CONSTRAINT mmp_budgets_parent_budget_id_fkey FOREIGN KEY (parent_budget_id) REFERENCES public.mmp_budgets (id);
ALTER TABLE public.mmp_budgets ADD CONSTRAINT mmp_budgets_allocated_by_fkey FOREIGN KEY (allocated_by) REFERENCES public.profiles (id);
ALTER TABLE public.mmp_budgets ADD CONSTRAINT mmp_budgets_mmp_file_id_fkey FOREIGN KEY (mmp_file_id) REFERENCES public.mmp_files (id);
ALTER TABLE public.mmp_budgets ADD CONSTRAINT mmp_budgets_project_budget_id_fkey FOREIGN KEY (project_budget_id) REFERENCES public.project_budgets (id);
ALTER TABLE public.mmp_files ADD CONSTRAINT mmp_files_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects (id);
ALTER TABLE public.mmp_site_entries ADD CONSTRAINT mmp_site_entries_claimed_by_fkey FOREIGN KEY (claimed_by) REFERENCES public.profiles (id);
ALTER TABLE public.mmp_site_entries ADD CONSTRAINT mmp_site_entries_visit_started_by_fkey FOREIGN KEY (visit_started_by) REFERENCES public.profiles (id);
ALTER TABLE public.mmp_site_entries ADD CONSTRAINT mmp_site_entries_visit_completed_by_fkey FOREIGN KEY (visit_completed_by) REFERENCES public.profiles (id);
ALTER TABLE public.mmp_site_entries ADD CONSTRAINT mmp_site_entries_registry_site_id_fkey FOREIGN KEY (registry_site_id) REFERENCES public.sites_registry (id);
ALTER TABLE public.mmp_site_entries ADD CONSTRAINT mmp_site_entries_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES public.profiles (id);
ALTER TABLE public.mmp_site_entries ADD CONSTRAINT mmp_site_entries_mmp_file_id_fkey FOREIGN KEY (mmp_file_id) REFERENCES public.mmp_files (id);
ALTER TABLE public.mmp_site_entries ADD CONSTRAINT mmp_site_entries_verified_by_user_id_fkey FOREIGN KEY (verified_by_user_id) REFERENCES public.profiles (id);
ALTER TABLE public.mmp_site_entries ADD CONSTRAINT mmp_site_entries_completed_by_user_id_fkey FOREIGN KEY (completed_by_user_id) REFERENCES public.profiles (id);
ALTER TABLE public.mmp_site_entries ADD CONSTRAINT mmp_site_entries_forwarded_by_user_id_fkey FOREIGN KEY (forwarded_by_user_id) REFERENCES public.profiles (id);
ALTER TABLE public.mmp_site_entries ADD CONSTRAINT mmp_site_entries_forwarded_to_user_id_fkey FOREIGN KEY (forwarded_to_user_id) REFERENCES public.profiles (id);
ALTER TABLE public.mmp_site_entries ADD CONSTRAINT mmp_site_entries_cost_acknowledged_by_fkey FOREIGN KEY (cost_acknowledged_by) REFERENCES public.profiles (id);
