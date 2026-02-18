-- Ready-to-run recreate SQL (deduplicated)
-- This file is generated from project schema artifacts.
-- It contains:
--  1) extension and sequence creation
--  2) CREATE TABLE IF NOT EXISTS blocks (deduplicated)
--  3) core helper functions and RLS policies (from supabase/schema.sql)
--  4) ALTER TABLE ... ADD CONSTRAINT (foreign keys) reattached at the end in dependency-safe order

-- IMPORTANT: Review before running. This file assumes `auth` schema exists (Supabase auth) and that any required extensions (postgis, citext) are available. Run as a superuser if needed for extension install.

SET client_min_messages = WARNING;

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS postgis;

-- Sequences used by integer PK defaults
CREATE SEQUENCE IF NOT EXISTS public.app_versions_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.hub_states_id_seq;

-- ===================================================================
-- Table definitions (sanitized, IF NOT EXISTS)
-- Source: scripts/target_ready_no_fks_if_not_exists.sql
-- ===================================================================

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

-- Additional table definitions from the Supabase schema provided by the user.
-- These CREATEs are inserted here to ensure referenced tables exist before FK reattachment.

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
  cycle_status text DEFAULT 'active'::text CHECK (cycle_status = ANY (ARRAY['active'::text, 'closing'::text, 'closed'::text])),
  cycle_closed_at timestamp with time zone,
  cycle_closed_by uuid,
  cycle_closing_started_at timestamp with time zone,
  cycle_closing_started_by uuid,
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

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  entity_type text,
  entity_id text,
  priority text DEFAULT 'normal'::text,
  status text DEFAULT 'pending'::text,
  recipient_id uuid,
  recipient_email text,
  recipient_role text,
  title_en text NOT NULL,
  title_ar text,
  message_en text NOT NULL,
  message_ar text,
  triggered_by uuid,
  triggered_by_name text,
  workflow_stage text,
  action_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  email_sent boolean DEFAULT false,
  email_sent_at timestamp with time zone,
  email_error text,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  user_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  type text,
  title text,
  message text,
  link text,
  related_entity_id text,
  related_entity_type text,
  CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.operational_cost_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  expense_category text NOT NULL CHECK (expense_category = ANY (ARRAY['permits'::text, 'incentives'::text, 'communications'::text, 'training'::text, 'general_transport'::text, 'equipment'::text, 'printing'::text, 'meetings'::text, 'other'::text])),
  hub_id text,
  project_id uuid,
  mmp_file_id uuid,
  submitted_by uuid NOT NULL,
  submitted_at timestamp with time zone DEFAULT now(),
  submitter_role text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text DEFAULT 'SDG'::text,
  description text NOT NULL,
  expense_date date NOT NULL,
  vendor text,
  reference_number text,
  supporting_documents jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'under_review'::text, 'approved'::text, 'rejected'::text, 'paid'::text, 'cancelled'::text, 'reconciled'::text])),
  tier1_status text NOT NULL DEFAULT 'pending'::text CHECK (tier1_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'changes_requested'::text])),
  tier1_approved_by uuid,
  tier1_approved_at timestamp with time zone,
  tier1_notes text,
  rejection_reason text,
  tier2_status text NOT NULL DEFAULT 'pending'::text CHECK (tier2_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  tier2_approved_by uuid,
  tier2_approved_at timestamp with time zone,
  tier2_notes text,
  wallet_transaction_id uuid,
  paid_at timestamp with time zone,
  paid_amount_cents integer,
  payment_notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  tier3_status text CHECK (tier3_status IS NULL OR (tier3_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
  tier3_approved_by uuid,
  tier3_approved_at timestamp with time zone,
  tier3_notes text,
  CONSTRAINT operational_cost_submissions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  otp text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['bank'::text, 'mobile_money'::text, 'card'::text])),
  name text NOT NULL,
  account_number text,
  bank_name text,
  phone_number text,
  card_number text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payment_methods_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.payout_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  method text NOT NULL,
  destination jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'requested'::text,
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  decided_at timestamp with time zone,
  decided_by uuid,
  paid_at timestamp with time zone,
  wallet_id uuid,
  currency text DEFAULT 'SDG'::text,
  request_reason text,
  supervisor_id uuid,
  supervisor_notes text,
  approved_at timestamp with time zone,
  rejected_at timestamp with time zone,
  payment_method text,
  payment_details jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT payout_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  role_id uuid,
  resource character varying NOT NULL,
  action character varying NOT NULL,
  conditions jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT permissions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  email text,
  username text,
  full_name text,
  role text,
  avatar_url text,
  hub_id text,
  state_id text,
  locality_id text,
  employee_id text,
  phone text,
  status text DEFAULT 'pending'::text,
  availability text,
  location jsonb,
  location_sharing boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  bank_account jsonb,
  fcm_token text,
  fcm_token_updated_at timestamp with time zone,
  phone_verified boolean DEFAULT false,
  phone_verified_at timestamp with time zone,
  email_verified boolean DEFAULT false,
  email_verified_at timestamp with time zone,
  last_active_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.project_activities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  name text,
  description text,
  start_date date,
  end_date date,
  status text,
  is_active boolean DEFAULT true,
  assigned_to uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT project_activities_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.project_budgets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  total_budget_cents bigint NOT NULL DEFAULT 0,
  allocated_budget_cents bigint NOT NULL DEFAULT 0,
  spent_budget_cents bigint NOT NULL DEFAULT 0,
  remaining_budget_cents bigint NOT NULL DEFAULT 0,
  budget_period character varying NOT NULL,
  period_start_date date,
  period_end_date date,
  category_allocations jsonb DEFAULT '{"meals": 0, "other": 0, "equipment": 0, "site_visits": 0, "accommodation": 0, "transportation": 0}'::jsonb,
  status character varying DEFAULT 'draft'::character varying,
  approved_by uuid,
  approved_at timestamp with time zone,
  fiscal_year integer,
  budget_notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT project_budgets_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.project_scopes (
  id text NOT NULL,
  project_id uuid,
  hub_id text,
  states text[] DEFAULT '{}'::text[],
  localities jsonb DEFAULT '{}'::jsonb,
  site_ids text[] DEFAULT '{}'::text[],
  scope_type character varying DEFAULT 'hub'::character varying,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by text,
  CONSTRAINT project_scopes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  project_code text,
  description text,
  project_type text,
  status text,
  start_date date,
  end_date date,
  budget jsonb,
  location jsonb,
  team jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT projects_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.report_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  report_id uuid,
  photo_url text NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  deleted_at timestamp without time zone,
  storage_path text,
  is_synced boolean DEFAULT false,
  last_modified timestamp without time zone DEFAULT now(),
  CONSTRAINT report_photos_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  site_visit_id uuid,
  notes text NOT NULL,
  submitted_at timestamp without time zone DEFAULT now(),
  is_synced boolean DEFAULT false,
  last_modified timestamp without time zone DEFAULT now(),
  activities text,
  duration_minutes integer,
  coordinates jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_by uuid,
  CONSTRAINT reports_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL UNIQUE,
  display_name character varying NOT NULL,
  description text,
  is_system_role boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  CONSTRAINT roles_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.safety_checklists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  items jsonb,
  completed_by uuid,
  site_visit_id uuid,
  completed_at timestamp without time zone,
  is_synced boolean DEFAULT false,
  last_modified timestamp without time zone DEFAULT now(),
  CONSTRAINT safety_checklists_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.site_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL UNIQUE,
  user_id uuid,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  notes text,
  geom geography,
  CONSTRAINT site_locations_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.site_visit_cost_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  site_visit_id uuid,
  mmp_file_id uuid,
  project_id uuid,
  submitted_by uuid,
  submitted_at timestamp with time zone DEFAULT now(),
  transportation_cost_cents bigint NOT NULL DEFAULT 0,
  accommodation_cost_cents bigint NOT NULL DEFAULT 0,
  meal_allowance_cents bigint NOT NULL DEFAULT 0,
  other_costs_cents bigint NOT NULL DEFAULT 0,
  total_cost_cents bigint NOT NULL DEFAULT 0,
  currency character varying NOT NULL DEFAULT 'SDG'::character varying,
  transportation_details text,
  accommodation_details text,
  meal_details text,
  other_details text,
  submission_notes text,
  supporting_documents jsonb DEFAULT '[]'::jsonb,
  status character varying NOT NULL DEFAULT 'pending'::character varying,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  reviewer_notes text,
  approval_notes text,
  wallet_transaction_id uuid,
  paid_at timestamp with time zone,
  paid_amount_cents bigint,
  payment_notes text,
  classification_level character varying,
  role_scope character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT site_visit_cost_submissions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.site_visit_costs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  site_visit_id uuid NOT NULL UNIQUE,
  transportation_cost numeric NOT NULL DEFAULT 0 CHECK (transportation_cost >= 0::numeric),
  accommodation_cost numeric NOT NULL DEFAULT 0 CHECK (accommodation_cost >= 0::numeric),
  meal_allowance numeric NOT NULL DEFAULT 0 CHECK (meal_allowance >= 0::numeric),
  other_costs numeric NOT NULL DEFAULT 0 CHECK (other_costs >= 0::numeric),
  total_cost numeric,
  currency text NOT NULL DEFAULT 'SDG'::text,
  assigned_by uuid,
  adjusted_by uuid,
  adjustment_reason text,
  cost_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  cost_status text DEFAULT 'estimated'::text,
  calculated_by uuid,
  calculation_notes text,
  CONSTRAINT site_visit_costs_pkey PRIMARY KEY (id)
);

  -- Maintain total_cost as the sum of cost components via trigger
  -- (Postgres DEFAULT cannot reference other columns; use a trigger to compute)
  CREATE OR REPLACE FUNCTION public.set_site_visit_costs_total_cost()
  RETURNS trigger AS $$
  BEGIN
    NEW.total_cost := COALESCE(NEW.transportation_cost, 0)
                    + COALESCE(NEW.accommodation_cost, 0)
                    + COALESCE(NEW.meal_allowance, 0)
                    + COALESCE(NEW.other_costs, 0);
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER trg_site_visit_costs_set_total_cost
  BEFORE INSERT OR UPDATE ON public.site_visit_costs
  FOR EACH ROW EXECUTE FUNCTION public.set_site_visit_costs_total_cost();

CREATE TABLE IF NOT EXISTS public.site_visits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  site_name text,
  site_code text,
  locality text,
  state text,
  hub text,
  status text DEFAULT 'pending'::text,
  assigned_to uuid,
  assigned_by uuid,
  assigned_at timestamp with time zone,
  due_date timestamp with time zone,
  scheduled_date timestamp with time zone,
  completed_at timestamp with time zone,
  mmp_id text,
  mmp_file_id uuid,
  mmp_site_entry_id uuid,
  main_activity text,
  activity text,
  project_activities text[],
  visit_type text,
  monitoring_type text,
  complexity text,
  priority text DEFAULT 'medium'::text,
  location jsonb DEFAULT '{}'::jsonb,
  coordinates jsonb DEFAULT '{}'::jsonb,
  fees jsonb DEFAULT '{}'::jsonb,
  cost numeric,
  enumerator_fee numeric,
  transport_fee numeric,
  permit_details jsonb DEFAULT '{}'::jsonb,
  description text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  not_covered_flag boolean DEFAULT false,
  not_covered_reason text,
  not_covered_reason_other text,
  not_covered_at timestamp with time zone,
  not_covered_by uuid,
  CONSTRAINT site_visits_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.sites_registry (
  id text NOT NULL,
  site_code character varying NOT NULL UNIQUE,
  site_name character varying NOT NULL,
  state_id text NOT NULL,
  state_name character varying NOT NULL,
  locality_id text NOT NULL,
  locality_name character varying NOT NULL,
  hub_id text,
  hub_name character varying,
  gps_latitude numeric,
  gps_longitude numeric,
  activity_type character varying NOT NULL DEFAULT 'TPM'::character varying,
  status character varying DEFAULT 'registered'::character varying,
  mmp_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by text,
  residence_latitude numeric,
  residence_longitude numeric,
  residence_altitude numeric,
  residence_precision numeric,
  gps_altitude numeric,
  gps_precision numeric,
  cp_name character varying,
  tool_type character varying,
  CONSTRAINT sites_registry_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.spatial_ref_sys (
  srid integer NOT NULL,
  auth_name character varying,
  auth_srid integer,
  srtext character varying,
  proj4text character varying,
  CONSTRAINT spatial_ref_sys_pkey PRIMARY KEY (srid)
);

CREATE TABLE IF NOT EXISTS public.sub_activities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  activity_id uuid,
  name text,
  description text,
  status text,
  is_active boolean DEFAULT true,
  due_date date,
  assigned_to uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT sub_activities_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.super_admins (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  appointed_by uuid,
  appointed_at timestamp with time zone DEFAULT now(),
  appointment_reason text NOT NULL,
  is_active boolean DEFAULT true,
  deactivated_at timestamp with time zone,
  deactivated_by uuid,
  deactivation_reason text,
  last_activity_at timestamp with time zone,
  deletion_count integer DEFAULT 0,
  adjustment_count integer DEFAULT 0,
  total_actions_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT super_admins_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.support_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_ar text,
  role text,
  role_ar text,
  email text,
  phone text,
  whatsapp text,
  avatar_url text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  CONSTRAINT support_contacts_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject text NOT NULL,
  description text NOT NULL,
  category text DEFAULT 'general'::text,
  priority text NOT NULL DEFAULT 'medium'::text,
  status text NOT NULL DEFAULT 'open'::text,
  source text NOT NULL DEFAULT 'mobile'::text,
  assigned_to uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  CONSTRAINT support_tickets_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.task_budget_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_budget_id uuid NOT NULL,
  transaction_type character varying NOT NULL,
  amount_cents bigint NOT NULL,
  category character varying,
  description text,
  reference_id character varying,
  balance_before_cents bigint,
  balance_after_cents bigint,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT task_budget_transactions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.task_budgets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id character varying NOT NULL,
  task_name character varying NOT NULL,
  project_id uuid NOT NULL,
  mmp_file_id uuid,
  allocated_budget_cents bigint NOT NULL DEFAULT 0,
  spent_budget_cents bigint NOT NULL DEFAULT 0,
  remaining_budget_cents bigint NOT NULL DEFAULT 0,
  planned_start_date date,
  planned_end_date date,
  actual_start_date date,
  actual_end_date date,
  estimated_hours integer,
  actual_hours integer,
  category_breakdown jsonb DEFAULT '{"labor": 0, "other": 0, "materials": 0, "transportation": 0}'::jsonb,
  variance jsonb,
  status character varying NOT NULL DEFAULT 'draft'::character varying,
  priority character varying NOT NULL DEFAULT 'medium'::character varying,
  assigned_to uuid,
  created_by uuid,
  approved_by uuid,
  approved_at timestamp with time zone,
  budget_notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT task_budgets_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  project_id uuid,
  role text DEFAULT 'member'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT team_members_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  sender_name text NOT NULL,
  message text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ticket_messages_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.user_classifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  classification_level text NOT NULL,
  role_scope text NOT NULL,
  effective_from timestamp with time zone NOT NULL DEFAULT now(),
  effective_until timestamp with time zone,
  has_retainer boolean DEFAULT false,
  retainer_amount_cents integer DEFAULT 0 CHECK (retainer_amount_cents >= 0),
  retainer_currency text DEFAULT 'SDG'::text,
  retainer_frequency text DEFAULT 'monthly'::text,
  assigned_by uuid,
  change_reason text,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_classifications_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  role text,
  created_at timestamp with time zone DEFAULT now(),
  role_id uuid,
  assigned_by uuid,
  assigned_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'offline'::text,
  CONSTRAINT user_roles_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.user_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  settings jsonb,
  last_updated timestamp with time zone DEFAULT now(),
  CONSTRAINT user_settings_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.user_signatures (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name character varying NOT NULL,
  signature_data text NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_signatures_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.visit_rejections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL,
  user_id uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT visit_rejections_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.visit_status (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  site_visit_id uuid,
  status text NOT NULL,
  updated_at timestamp without time zone DEFAULT now(),
  updated_by uuid,
  is_synced boolean DEFAULT false,
  last_modified timestamp without time zone DEFAULT now(),
  CONSTRAINT visit_status_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.wallet_balances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  balance_cents bigint NOT NULL DEFAULT 0,
  currency character varying DEFAULT 'SDG'::character varying,
  status character varying DEFAULT 'active'::character varying,
  last_transaction_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wallet_balances_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.wallet_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  notification_prefs jsonb,
  auto_withdraw boolean DEFAULT false,
  last_updated timestamp with time zone DEFAULT now(),
  CONSTRAINT wallet_settings_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'SDG'::text,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  posted_at timestamp with time zone,
  memo text,
  related_site_visit_id uuid,
  visit_code text,
  wallet_id uuid,
  amount numeric,
  site_visit_id uuid,
  withdrawal_request_id uuid,
  description text,
  metadata jsonb,
  balance_before numeric,
  balance_after numeric,
  created_by uuid,
  CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  currency text NOT NULL DEFAULT 'SDG'::text,
  balance_cents bigint NOT NULL DEFAULT 0,
  total_earned_cents bigint NOT NULL DEFAULT 0,
  total_paid_out_cents bigint NOT NULL DEFAULT 0,
  pending_payout_cents bigint NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  balances jsonb DEFAULT '{"SDG": 0}'::jsonb,
  total_earned numeric DEFAULT 0,
  total_withdrawn numeric DEFAULT 0,
  CONSTRAINT wallets_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.wallets_backup (
  id uuid,
  user_id uuid,
  currency text,
  balance_cents bigint,
  total_earned_cents bigint,
  total_paid_out_cents bigint,
  pending_payout_cents bigint,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  balances jsonb,
  total_earned numeric,
  total_withdrawn numeric
);

CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  wallet_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0::numeric),
  currency text NOT NULL DEFAULT 'SDG'::text,
  status text NOT NULL DEFAULT 'pending'::text,
  request_reason text,
  supervisor_id uuid,
  supervisor_notes text,
  approved_at timestamp with time zone,
  rejected_at timestamp with time zone,
  payment_method text,
  payment_details jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  admin_notes text,
  admin_processed_by uuid,
  admin_processed_at timestamp with time zone,
  CONSTRAINT withdrawal_requests_pkey PRIMARY KEY (id)
);

-- ===================================================================
-- Re-attached foreign key constraints moved out of CREATE TABLE bodies
-- Source: scripts/target_ready_no_fks_if_not_exists.sql
-- Run this section after all CREATE TABLE statements are present above.
-- ===================================================================

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


-- Final notes:
-- 1) This script is large. Run on a staging DB first.
-- 2) If any FK ALTER fails due to missing referenced table, ensure that table's CREATE TABLE block exists earlier in this file or in your DB.
-- 3) To import: psql "postgresql://user:pass@host:5432/dbname" -f scripts/recreate_schema_ready.sql
-- 4) After import, set sequence values where applicable (SELECT setval(...)) and verify RLS/policies.

