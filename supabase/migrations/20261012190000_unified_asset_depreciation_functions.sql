-- Depreciation preview + posting for the Unified Asset Register.
-- Replaces the never-applied drafts in 20260803d / 20260803f, which targeted
-- columns that no longer exist (period_label, fiscal_year_code, bridge_log.notes)
-- and skipped required journal fields. Posting goes through
-- acct_bridge_post_journal like every other ledger bridge, so it is gated by the
-- acct.bridge.unified_assets feature flag (off by default) and by the
-- 'asset_depreciation' accounts in GL Bridge Settings.

insert into public.feature_flags (key, description, is_enabled)
values ('acct.bridge.unified_assets', 'Post Unified Asset Register depreciation to the general ledger', false)
on conflict (key) do nothing;

-- Preview runs as the caller, so unified_assets RLS (fixed_assets:read) applies.
create or replace function public.preview_asset_depreciation(p_periods_per_year int default 12)
returns table (
  asset_id            uuid,
  asset_code          text,
  asset_name          text,
  depreciation_method text,
  purchase_value      numeric,
  accumulated_dep     numeric,
  nbv                 numeric,
  period_charge       numeric,
  already_fully_dep   boolean
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_periods_per_year is null or p_periods_per_year not in (1, 4, 12) then
    raise exception 'Invalid p_periods_per_year: must be 1, 4, or 12.';
  end if;

  return query
  select
    ua.id,
    ua.asset_code,
    ua.name,
    ua.depreciation_method,
    ua.purchase_value,
    ua.accumulated_depreciation,
    greatest(0, ua.purchase_value - ua.accumulated_depreciation),
    case
      when ua.accumulated_depreciation >= ua.purchase_value then 0::numeric
      when ua.depreciation_method = 'declining_balance' then
        least(
          round(greatest(0, ua.purchase_value - ua.accumulated_depreciation)
                * coalesce(ua.depreciation_rate, 1.0 / ua.useful_life_years)
                / p_periods_per_year, 4),
          ua.purchase_value - ua.accumulated_depreciation)
      else
        least(
          round(ua.purchase_value / (ua.useful_life_years * p_periods_per_year), 4),
          ua.purchase_value - ua.accumulated_depreciation)
    end,
    (ua.accumulated_depreciation >= ua.purchase_value)
  from public.unified_assets ua
  where ua.status in ('available', 'assigned', 'maintenance')
    and ua.purchase_value > 0
    and ua.useful_life_years > 0
    and ua.depreciation_method is not null
  order by ua.asset_code;
end;
$$;

revoke all on function public.preview_asset_depreciation(int) from public, anon;
grant execute on function public.preview_asset_depreciation(int) to authenticated;

create or replace function public.post_asset_depreciation_to_gl(
  p_fiscal_period_id uuid,
  p_periods_per_year int default 12
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_period       record;
  v_label        text;
  v_asset        record;
  v_event        text;
  v_charge       numeric(20,4);
  v_dep_code     text;
  v_acc_code     text;
  v_country_id   uuid;
  v_entry_id     uuid;
  v_err          text;
  v_posted       int := 0;
  v_skipped      int := 0;
  v_errors       int := 0;
  v_total        numeric(20,4) := 0;
  v_run_id       uuid;
begin
  if not public.current_user_has_resource_permission('fixed_assets', 'update') then
    raise exception 'Access denied: the Run Depreciation permission (fixed_assets:update) is required.';
  end if;

  if p_periods_per_year is null or p_periods_per_year not in (1, 4, 12) then
    raise exception 'Invalid p_periods_per_year: must be 1, 4, or 12.';
  end if;

  select fp.id, fp.end_date, fp.status, fp.period_no, fy.code as fy_code
    into v_period
    from public.acct_fiscal_periods fp
    join public.acct_fiscal_years fy on fy.id = fp.fiscal_year_id
   where fp.id = p_fiscal_period_id;

  if not found then
    raise exception 'Fiscal period not found.';
  end if;
  if v_period.status not in ('open', 'soft_closed') then
    raise exception 'Fiscal period % is not open.', v_period.fy_code || '-P' || lpad(v_period.period_no::text, 2, '0');
  end if;

  v_label := v_period.fy_code || '-P' || lpad(v_period.period_no::text, 2, '0');
  v_event := 'asset_depreciation:' || p_fiscal_period_id::text;

  for v_asset in
    select *
      from public.unified_assets ua
     where ua.status in ('available', 'assigned', 'maintenance')
       and ua.purchase_value > 0
       and ua.useful_life_years > 0
       and ua.depreciation_method is not null
     for update
  loop
    begin
      if exists (
        select 1 from public.acct_journal_entries
         where idempotency_key = 'unified_assets::' || v_asset.id::text || '::' || v_event
      ) then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      if v_asset.accumulated_depreciation >= v_asset.purchase_value then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      if v_asset.depreciation_method = 'declining_balance' then
        v_charge := (v_asset.purchase_value - v_asset.accumulated_depreciation)
                    * coalesce(v_asset.depreciation_rate, 1.0 / v_asset.useful_life_years)
                    / p_periods_per_year;
      else
        v_charge := v_asset.purchase_value / (v_asset.useful_life_years * p_periods_per_year);
      end if;
      v_charge := least(round(v_charge, 4), v_asset.purchase_value - v_asset.accumulated_depreciation);

      if v_charge <= 0 then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      select code, country_id into v_dep_code, v_country_id from public.acct_accounts
       where id = coalesce(v_asset.dep_expense_account_id, public.gl_bridge_account('asset_depreciation', 'debit'));
      select code into v_acc_code from public.acct_accounts
       where id = coalesce(v_asset.accum_dep_account_id, public.gl_bridge_account('asset_depreciation', 'credit'));

      if v_dep_code is null or v_acc_code is null then
        insert into public.acct_gl_bridge_log (source_table, source_id, event_type, status, error_message, amount)
        values ('unified_assets', v_asset.id, v_event, 'skipped',
                'Depreciation accounts not configured (GL Bridge Settings: asset_depreciation, or per-asset override)',
                v_charge);
        v_skipped := v_skipped + 1;
        continue;
      end if;

      v_entry_id := public.acct_bridge_post_journal(
        'unified_assets', v_asset.id, v_event, v_period.end_date,
        'Depreciation: ' || v_asset.name || ' (' || v_label || ')', null,
        jsonb_build_array(
          jsonb_build_object('account_code', v_dep_code, 'debit_credit', 'DR', 'amount', v_charge,
                             'currency', v_asset.currency, 'function', 'mng',
                             'description', 'Depreciation expense - ' || v_asset.name),
          jsonb_build_object('account_code', v_acc_code, 'debit_credit', 'CR', 'amount', v_charge,
                             'currency', v_asset.currency, 'function', 'mng',
                             'description', 'Accumulated depreciation - ' || v_asset.name)
        ),
        v_uid,
        v_country_id
      );

      update public.unified_assets
         set accumulated_depreciation = accumulated_depreciation + v_charge
       where id = v_asset.id;

      insert into public.acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id, amount)
      values ('unified_assets', v_asset.id, v_event, 'success', v_entry_id, v_charge);

      v_posted := v_posted + 1;
      v_total  := v_total + v_charge;
    exception when others then
      get stacked diagnostics v_err = message_text;
      if v_err like 'BRIDGE_SKIP:%' then
        v_skipped := v_skipped + 1;
        insert into public.acct_gl_bridge_log (source_table, source_id, event_type, status, error_message, amount)
        values ('unified_assets', v_asset.id, v_event, 'skipped', v_err, v_charge);
      else
        v_errors := v_errors + 1;
        insert into public.acct_gl_bridge_log (source_table, source_id, event_type, status, error_message, amount)
        values ('unified_assets', v_asset.id, v_event, 'error', v_err, v_charge);
      end if;
    end;
  end loop;

  insert into public.asset_depreciation_runs (
    fiscal_period_id, period_label, periods_per_year, asset_count,
    total_depreciation, skipped_count, error_count, status, posted_by
  ) values (
    p_fiscal_period_id, v_label, p_periods_per_year, v_posted,
    v_total, v_skipped, v_errors,
    case when v_errors = 0 then 'completed' when v_posted > 0 then 'partial' else 'error' end,
    v_uid
  )
  returning id into v_run_id;

  return jsonb_build_object(
    'run_id', v_run_id,
    'posted', v_posted,
    'skipped', v_skipped,
    'errors', v_errors,
    'total_depreciation', v_total
  );
end;
$$;

revoke all on function public.post_asset_depreciation_to_gl(uuid, int) from public, anon;
grant execute on function public.post_asset_depreciation_to_gl(uuid, int) to authenticated;
