-- Ensure audit_logs IDs are always database-generated UUIDs.
-- This prevents duplicate PK collisions from client-supplied IDs.

create extension if not exists pgcrypto;

alter table public.audit_logs
  alter column id set default gen_random_uuid();
