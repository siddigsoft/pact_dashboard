-- Migration: Revoke the 'anon' EXECUTE grant on project list functions
--
-- Problem: get_all_projects() and get_projects_for_analytics() were granted to
-- the 'anon' role in the previous migration.  The visibility guard calls
-- auth.uid(), which returns NULL for unauthenticated callers, so anonymous
-- users currently receive zero rows — but this is an implicit behaviour, not
-- an explicit deny.  Removing the anon GRANT makes the intent explicit and
-- provides defence-in-depth.
--
-- Only authenticated users should be able to call these functions.

REVOKE EXECUTE ON FUNCTION public.get_all_projects()           FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_projects_for_analytics() FROM anon;

-- Ensure authenticated still has the grant (idempotent).
GRANT EXECUTE ON FUNCTION public.get_all_projects()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_projects_for_analytics() TO authenticated;
