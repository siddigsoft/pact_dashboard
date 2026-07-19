-- Add additional_roles JSONB column to profiles table.
-- This replaces the broken user_roles multi-role approach.
-- Schema: [{role: string, hub_id: string|null, assigned_at: string, assigned_by: string|null}]
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS additional_roles jsonb DEFAULT '[]'::jsonb;
