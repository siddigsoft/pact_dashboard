-- Retainer columns are no longer directly selectable; use user_classification_retainers.
revoke select on public.user_classifications from authenticated;
grant select (
  id, user_id, classification_level, role_scope, effective_from, effective_until,
  assigned_by, change_reason, notes, is_active, created_at, updated_at
) on public.user_classifications to authenticated;

-- Owner-rights again (it reads retainer columns), limited to rows the caller may see.
create or replace view public.current_user_classifications
with (security_invoker = false) as
  select distinct on (uc.user_id)
    uc.id, uc.user_id, uc.classification_level, uc.role_scope, uc.effective_from, uc.effective_until,
    uc.has_retainer, uc.retainer_amount_cents, uc.retainer_currency, uc.retainer_payout_currency,
    uc.retainer_frequency, uc.is_active, uc.created_at, uc.updated_at,
    p.full_name, p.email, p.role as user_role
  from public.user_classifications uc
  join public.profiles p on uc.user_id = p.id
  where uc.is_active = true
    and uc.effective_from <= now()
    and (uc.effective_until is null or uc.effective_until > now())
    and (uc.user_id = auth.uid() or (select public.current_user_can_see_retainers()))
  order by uc.user_id, uc.effective_from desc;

revoke all on public.current_user_classifications from anon;
