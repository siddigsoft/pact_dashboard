-- =============================================================================
-- PACT Accounting — Phase 1 · Sprint 1.3
-- Posting-engine unit-test suite + synthetic data generator
-- =============================================================================
-- Closes Phase 1 acceptance criteria #6 (posting-engine test suite) and #7
-- (reproducible synthetic data generator).
--
-- Apply prerequisites (in order):
--   1. supabase/migrations/20260501_acct_phase1_sprint1_1.sql  (applied + clean ≥ 24h)
--   2. supabase/migrations/20260508_acct_phase1_sprint1_2.sql  (applied + clean ≥ 24h)
--
-- Apply procedure (manual, pactdb SQL editor):
--   See docs/sql/PHASE1_SPRINT1_3_MANUAL_APPLY.md
--
-- Rollback:
--   See docs/sql/PHASE1_SPRINT1_3_ROLLBACK.sql
-- =============================================================================

set search_path = public;

-- -----------------------------------------------------------------------------
-- 1. acct_synthetic_marker — registry of rows created by the seed function
-- -----------------------------------------------------------------------------
-- Used by acct_seed_synthetic(p_reset := true) to clean up exactly what it
-- previously inserted, never touching real data. Each row records the table
-- and the row_id so reset can DELETE in dependency-safe order.

create table if not exists public.acct_synthetic_marker (
  id           bigserial primary key,
  table_name   text not null,
  row_id       uuid not null,
  inserted_at  timestamptz not null default now(),
  inserted_by  uuid references public.profiles(id),
  unique (table_name, row_id)
);

create index if not exists idx_acct_synth_table on public.acct_synthetic_marker(table_name);

alter table public.acct_synthetic_marker enable row level security;

drop policy if exists acct_synth_select_admin on public.acct_synthetic_marker;
create policy acct_synth_select_admin on public.acct_synthetic_marker
  for select using (
    exists (select 1 from public.profiles
             where id = auth.uid()
               and role in ('super_admin','finance','accountant','auditor'))
  );

-- No INSERT/UPDATE/DELETE policies — written exclusively via the seed function
-- (security definer), so direct mutations are not granted.

comment on table public.acct_synthetic_marker is
  'Registry of rows inserted by acct_seed_synthetic so a reset can clean them '
  'up without touching real data. Written only via the seed function.';

-- -----------------------------------------------------------------------------
-- 2. acct_seed_synthetic — reproducible test ledger generator
-- -----------------------------------------------------------------------------
-- Behaviour:
--   * Authorization: super_admin only.
--   * Refuses to run if feature flag acct.parallel_run.enabled is true
--     (proxy for "production cut-over has occurred").
--   * If p_reset is true: deletes every row registered in
--     acct_synthetic_marker in dependency-safe order, then re-seeds.
--   * Otherwise: idempotently tops up missing fixtures and appends entries.
--   * Reproducible-on-demand via p_seed (passed to setseed()).
-- Returns: jsonb summary of what was created.

create or replace function public.acct_seed_synthetic(
  p_target_entries int     default 50,
  p_reset          boolean default false,
  p_seed           numeric default 0.42
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user_id      uuid := auth.uid();
  v_user_role    text;
  v_fy_id        uuid;
  v_period_ids   uuid[];
  v_fund_general uuid;
  v_fund_usaid   uuid;
  v_fund_board   uuid;
  v_fund_endow   uuid;
  v_acc_cash     uuid;
  v_acc_revenue  uuid;
  v_acc_expense  uuid;
  v_partner_ok   uuid;
  v_partner_bad  uuid;
  v_sanc_row_id  uuid;
  v_entry_id     uuid;
  v_partners_tbl boolean := to_regclass('public.partners') is not null;
  v_partner_name_col text;
  v_inserted_funds      int := 0;
  v_inserted_partners   int := 0;
  v_inserted_sanctions  int := 0;
  v_inserted_entries    int := 0;
  v_skipped_entries     int := 0;
  v_amt          numeric;
  v_idx          int;
  v_period_id    uuid;
  v_fund_id      uuid;
  v_post_date    date;
begin
  -- A. Auth
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED: acct_seed_synthetic must be called by an authenticated user';
  end if;
  select role into v_user_role from public.profiles where id = v_user_id;
  if v_user_role <> 'super_admin' then
    raise exception 'AUTHORIZATION_FAILED: only super_admin may seed synthetic data (got %)', v_user_role;
  end if;

  -- B. Production guardrail
  if public.feature_enabled('acct.parallel_run.enabled') then
    raise exception 'PRODUCTION_GUARD: acct.parallel_run.enabled is true — refusing to seed synthetic data into a live cutover environment';
  end if;

  -- C. Reset (children first, then parents, then the registry)
  if p_reset then
    delete from public.acct_journal_lines
      where entry_id in (
        select row_id from public.acct_synthetic_marker
         where table_name = 'acct_journal_entries'
      );
    delete from public.acct_journal_entries
      where id in (
        select row_id from public.acct_synthetic_marker
         where table_name = 'acct_journal_entries'
      );
    delete from public.acct_aml_alerts
      where partner_id in (
        select row_id from public.acct_synthetic_marker
         where table_name = 'partners'
      );
    delete from public.acct_sanctioned_parties
      where id in (
        select row_id from public.acct_synthetic_marker
         where table_name = 'acct_sanctioned_parties'
      );
    -- partners is an external table; only delete rows we inserted
    if v_partners_tbl then
      execute 'delete from public.partners where id in (select row_id from public.acct_synthetic_marker where table_name = ''partners'')';
    end if;
    delete from public.acct_funds
      where id in (
        select row_id from public.acct_synthetic_marker
         where table_name = 'acct_funds'
      );
    delete from public.acct_synthetic_marker;
  end if;

  -- D. Resolve FY2026 (must exist from Sprint 1.1 seed)
  select id into v_fy_id from public.acct_fiscal_years where code = 'FY2026';
  if v_fy_id is null then
    raise exception 'FY2026 fiscal year not found — run Sprint 1.1 seed first';
  end if;
  select array_agg(id order by period_no) into v_period_ids
    from public.acct_fiscal_periods
   where fiscal_year_id = v_fy_id and status in ('open','soft_closed');
  if v_period_ids is null or array_length(v_period_ids, 1) = 0 then
    raise exception 'No open/soft_closed periods in FY2026';
  end if;

  -- E. Resolve / create funds (idempotent + registered)
  select id into v_fund_general from public.acct_funds where code = 'GENERAL';
  if v_fund_general is null then
    insert into public.acct_funds (code, name_en, name_ar, restriction_type, created_by)
      values ('GENERAL', 'General Fund', 'الصندوق العام', 'without_restriction', v_user_id)
      returning id into v_fund_general;
    insert into public.acct_synthetic_marker (table_name, row_id, inserted_by)
      values ('acct_funds', v_fund_general, v_user_id) on conflict do nothing;
    v_inserted_funds := v_inserted_funds + 1;
  end if;

  select id into v_fund_usaid from public.acct_funds where code = 'TEST-USAID-EDU-2026';
  if v_fund_usaid is null then
    insert into public.acct_funds (code, name_en, name_ar, restriction_type, created_by)
      values ('TEST-USAID-EDU-2026', 'USAID Education 2026 (TEST)', 'يوإس إيه آي دي تعليم 2026 (اختبار)', 'with_restriction', v_user_id)
      returning id into v_fund_usaid;
    insert into public.acct_synthetic_marker (table_name, row_id, inserted_by)
      values ('acct_funds', v_fund_usaid, v_user_id);
    v_inserted_funds := v_inserted_funds + 1;
  end if;

  select id into v_fund_board from public.acct_funds where code = 'TEST-BOARD-RES';
  if v_fund_board is null then
    insert into public.acct_funds (code, name_en, name_ar, restriction_type, created_by)
      values ('TEST-BOARD-RES', 'Board Reserve (TEST)', 'احتياطي مجلس الإدارة (اختبار)', 'board_designated', v_user_id)
      returning id into v_fund_board;
    insert into public.acct_synthetic_marker (table_name, row_id, inserted_by)
      values ('acct_funds', v_fund_board, v_user_id);
    v_inserted_funds := v_inserted_funds + 1;
  end if;

  select id into v_fund_endow from public.acct_funds where code = 'TEST-ENDOW';
  if v_fund_endow is null then
    insert into public.acct_funds (code, name_en, name_ar, restriction_type, created_by)
      values ('TEST-ENDOW', 'Endowment (TEST)', 'الوقف (اختبار)', 'quasi_endowment', v_user_id)
      returning id into v_fund_endow;
    insert into public.acct_synthetic_marker (table_name, row_id, inserted_by)
      values ('acct_funds', v_fund_endow, v_user_id);
    v_inserted_funds := v_inserted_funds + 1;
  end if;

  -- F. Resolve postable accounts (must exist from Sprint 1.1 starter COA)
  select id into v_acc_cash    from public.acct_accounts where code = '1110' and is_postable limit 1;
  select id into v_acc_revenue from public.acct_accounts where account_type = 'revenue' and is_postable limit 1;
  select id into v_acc_expense from public.acct_accounts where account_type = 'expense' and is_postable limit 1;
  if v_acc_cash is null or v_acc_revenue is null or v_acc_expense is null then
    raise exception 'Required postable accounts missing — apply Sprint 1.1 starter COA first';
  end if;

  -- G. Partners + sanctions (only if partners table exists in this DB)
  if v_partners_tbl then
    -- discover partner name column (matches acct_screen_party logic)
    select column_name into v_partner_name_col
      from information_schema.columns
     where table_schema = 'public' and table_name = 'partners'
       and column_name in ('name','full_name','partner_name')
     order by case column_name when 'name' then 1 when 'full_name' then 2 else 3 end
     limit 1;

    if v_partner_name_col is not null then
      -- Insert a clean test partner
      execute format(
        'insert into public.partners (%I) values ($1) returning id',
        v_partner_name_col
      ) using 'TEST_PARTNER_CLEAN_BBB' into v_partner_ok;
      insert into public.acct_synthetic_marker (table_name, row_id, inserted_by)
        values ('partners', v_partner_ok, v_user_id);
      v_inserted_partners := v_inserted_partners + 1;

      -- Insert a sanctioned test partner
      execute format(
        'insert into public.partners (%I) values ($1) returning id',
        v_partner_name_col
      ) using 'TEST_SANCTIONED_PARTY_AAA' into v_partner_bad;
      insert into public.acct_synthetic_marker (table_name, row_id, inserted_by)
        values ('partners', v_partner_bad, v_user_id);
      v_inserted_partners := v_inserted_partners + 1;

      -- Add the matching sanctions list entry. Schema (per Sprint 1.2):
      -- (id, list, external_id, full_name, aliases, country, match_hash, raw, loaded_at)
      insert into public.acct_sanctioned_parties
        (list, external_id, full_name, aliases, country, match_hash, raw)
      values
        ('OFAC_SDN'::acct_sanctions_list,
         'TEST-SDN-AAA',
         'TEST_SANCTIONED_PARTY_AAA',
         array['Test Sanctioned AAA','TEST SANCTIONED PARTY AAA'],
         'XX',
         public.acct_normalize_name('TEST_SANCTIONED_PARTY_AAA'),
         jsonb_build_object('synthetic', true, 'inserted_by', v_user_id))
      on conflict (list, external_id) do update
        set full_name = excluded.full_name,
            aliases   = excluded.aliases
      returning id into v_sanc_row_id;

      insert into public.acct_synthetic_marker (table_name, row_id, inserted_by)
        values ('acct_sanctioned_parties', v_sanc_row_id, v_user_id)
        on conflict (table_name, row_id) do nothing;
      v_inserted_sanctions := v_inserted_sanctions + 1;
    end if;
  end if;

  -- H. Generate balanced journal entries
  perform setseed(p_seed);
  v_idx := 0;
  while v_idx < p_target_entries loop
    v_idx := v_idx + 1;
    v_amt := round((random() * 9000 + 1000)::numeric, 2);
    v_period_id := v_period_ids[1 + (random() * (array_length(v_period_ids, 1) - 1))::int];
    v_fund_id := (array[v_fund_general, v_fund_usaid, v_fund_board, v_fund_endow])[1 + (random() * 3)::int];

    -- Resolve the picked period's posting date (any date inside)
    select start_date into v_post_date
      from public.acct_fiscal_periods where id = v_period_id;

    begin
      v_entry_id := public.acct_post_journal(
        jsonb_build_object(
          'period_id',       v_period_id,
          'posting_date',    v_post_date::text,
          'description_en',  'Synthetic seed entry #' || v_idx,
          'description_ar',  'قيد بيانات اختبار رقم ' || v_idx,
          'source_type',     'synthetic',
          'lines', jsonb_build_array(
            jsonb_build_object(
              'account_id',          v_acc_cash,
              'fund_id',             v_fund_id,
              'function',            'none',
              'debit_credit',        'DR',
              'functional_amount',   v_amt,
              'original_amount',     v_amt,
              'original_currency',   'SDG',
              'functional_currency', 'SDG',
              'description',         'Cash receipt'
            ),
            jsonb_build_object(
              'account_id',          v_acc_revenue,
              'fund_id',             v_fund_id,
              'function',            'none',
              'debit_credit',        'CR',
              'functional_amount',   v_amt,
              'original_amount',     v_amt,
              'original_currency',   'SDG',
              'functional_currency', 'SDG',
              'description',         'Revenue'
            )
          )
        ),
        'SYNTH-' || gen_random_uuid()::text
      );
      insert into public.acct_synthetic_marker (table_name, row_id, inserted_by)
        values ('acct_journal_entries', v_entry_id, v_user_id)
        on conflict do nothing;
      v_inserted_entries := v_inserted_entries + 1;
    exception when others then
      v_skipped_entries := v_skipped_entries + 1;
    end;
  end loop;

  return jsonb_build_object(
    'reset_performed',     p_reset,
    'funds_inserted',      v_inserted_funds,
    'partners_inserted',   v_inserted_partners,
    'sanctions_inserted',  v_inserted_sanctions,
    'entries_inserted',    v_inserted_entries,
    'entries_skipped',     v_skipped_entries,
    'fy_id',               v_fy_id,
    'period_count',        array_length(v_period_ids, 1)
  );
end $$;

comment on function public.acct_seed_synthetic(int, boolean, numeric) is
  'Generates a reproducible synthetic test ledger. super_admin only. Refuses '
  'to run if acct.parallel_run.enabled is true. Set p_reset=true to wipe '
  'previously seeded rows first. p_seed feeds setseed() for reproducibility.';

-- -----------------------------------------------------------------------------
-- 3. acct_run_test_suite — posting-engine unit-test runner
-- -----------------------------------------------------------------------------
-- Returns a results table. EVERY caller MUST wrap the call in a transaction
-- they will roll back, e.g.:
--
--   begin;
--   set local request.jwt.claim.sub = '<finance-user-uuid>';
--   select * from public.acct_run_test_suite(
--     '<finance-user-uuid>'::uuid,
--     '<non-finance-user-uuid>'::uuid
--   );
--   rollback;
--
-- The suite creates fresh test fixtures inside the transaction; the rollback
-- discards all writes (test entries, sanctioned parties, fixtures, alerts).

create or replace function public.acct_run_test_suite(
  p_finance_user_id     uuid,
  p_non_finance_user_id uuid
) returns table (
  test_id  text,
  name     text,
  status   text,
  detail   text
)
language plpgsql security definer set search_path = public as $$
declare
  v_caller         uuid := auth.uid();
  v_caller_role    text;
  v_fin_role       text;
  v_nonfin_role    text;

  -- Test fixtures
  v_fy_id          uuid;
  v_period_open   uuid;
  v_period_closed uuid;
  v_fund_a        uuid;
  v_fund_b        uuid;
  v_acc_cash      uuid;
  v_acc_revenue   uuid;
  v_acc_expense   uuid;
  v_acc_header    uuid;
  v_acc_inactive  uuid;
  v_acc_expense_h uuid;  -- header used to create inactive variant
  v_partner_ok    uuid;
  v_partner_bad   uuid;
  v_partner_name_col text;
  v_partners_tbl  boolean := to_regclass('public.partners') is not null;

  v_entry_id      uuid;
  v_entry_id2     uuid;
  v_idem_key      text;
  v_idem_count    int;
  v_flag_orig     boolean;
  v_jwt_orig      text;
  v_dummy         numeric;
  v_run_tag       text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
  v_tb_dr         numeric := 0;
  v_tb_cr         numeric := 0;
  v_sod_ok        boolean;
begin
  -- A. Caller validation ------------------------------------------------------
  if v_caller is null or v_caller <> p_finance_user_id then
    return query select
      'T00'::text, 'caller-context'::text, 'FAIL'::text,
      'auth.uid() must equal p_finance_user_id. Did you set request.jwt.claim.sub before calling?'::text;
    return;
  end if;
  select role into v_caller_role from public.profiles where id = v_caller;
  if v_caller_role not in ('super_admin','finance','accountant') then
    return query select
      'T00'::text, 'caller-role'::text, 'FAIL'::text,
      ('caller role must be finance/accountant/super_admin (got ' || coalesce(v_caller_role,'NULL') || ')')::text;
    return;
  end if;
  select role into v_nonfin_role from public.profiles where id = p_non_finance_user_id;
  if v_nonfin_role is null or v_nonfin_role in ('super_admin','finance','accountant') then
    return query select
      'T00'::text, 'non-finance-user'::text, 'FAIL'::text,
      'p_non_finance_user_id must reference a profile whose role is NOT super_admin/finance/accountant'::text;
    return;
  end if;

  -- B. Setup test fixtures (rolled back by caller) ---------------------------
  select id into v_fy_id from public.acct_fiscal_years where code = 'FY2026';
  if v_fy_id is null then
    return query select 'T00'::text, 'setup'::text, 'FAIL'::text,
      'FY2026 not seeded — apply Sprint 1.1 first'::text;
    return;
  end if;
  -- A second test fiscal year so we can have a CLOSED period without altering
  -- production periods.
  insert into public.acct_fiscal_years (code, start_date, end_date)
    values ('FY_TEST_'||v_run_tag, '2099-01-01', '2099-12-31')
    returning id into v_fy_id;

  insert into public.acct_fiscal_periods (fiscal_year_id, period_no, start_date, end_date, status)
    values (v_fy_id, 1, '2099-01-01', '2099-01-31', 'open')
    returning id into v_period_open;
  insert into public.acct_fiscal_periods (fiscal_year_id, period_no, start_date, end_date, status)
    values (v_fy_id, 2, '2099-02-01', '2099-02-28', 'closed')
    returning id into v_period_closed;

  insert into public.acct_funds (code, name_en, name_ar, restriction_type, created_by)
    values ('T_FUND_A_'||v_run_tag, 'Test Fund A', 'صندوق اختبار أ', 'without_restriction', v_caller)
    returning id into v_fund_a;
  insert into public.acct_funds (code, name_en, name_ar, restriction_type, created_by)
    values ('T_FUND_B_'||v_run_tag, 'Test Fund B', 'صندوق اختبار ب', 'with_restriction', v_caller)
    returning id into v_fund_b;

  insert into public.acct_accounts (code, name_en, name_ar, account_type, subtype, is_postable, is_active, created_by)
    values ('T_CASH_'||v_run_tag,    'Test Cash',     'نقد اختبار',     'asset',   'current_asset',     true, true, v_caller) returning id into v_acc_cash;
  insert into public.acct_accounts (code, name_en, name_ar, account_type, subtype, is_postable, is_active, created_by)
    values ('T_REV_'||v_run_tag,     'Test Revenue',  'إيراد اختبار',   'revenue', 'operating_revenue', true, true, v_caller) returning id into v_acc_revenue;
  insert into public.acct_accounts (code, name_en, name_ar, account_type, subtype, is_postable, is_active, created_by)
    values ('T_EXP_'||v_run_tag,     'Test Expense',  'مصروف اختبار',   'expense', 'program_expense',   true, true, v_caller) returning id into v_acc_expense;
  insert into public.acct_accounts (code, name_en, name_ar, account_type, subtype, is_postable, is_active, created_by)
    values ('T_HEADER_'||v_run_tag,  'Test Header',   'رأس اختبار',     'asset',   'current_asset',     false, true, v_caller) returning id into v_acc_header;
  insert into public.acct_accounts (code, name_en, name_ar, account_type, subtype, is_postable, is_active, created_by)
    values ('T_INACT_'||v_run_tag,   'Test Inactive', 'غير نشط اختبار', 'asset',   'current_asset',     true, false, v_caller) returning id into v_acc_inactive;

  -- ===========================================================================
  -- TESTS
  -- ===========================================================================

  -- T01: Happy path — 2-line balanced post returns a uuid
  begin
    v_idem_key := 'T01-'||v_run_tag;
    v_entry_id := public.acct_post_journal(
      jsonb_build_object(
        'period_id', v_period_open,
        'posting_date', '2099-01-15',
        'description_en','T01 happy', 'description_ar','اختبار 1',
        'lines', jsonb_build_array(
          jsonb_build_object('account_id',v_acc_cash,'fund_id',v_fund_a,'function','none','debit_credit','DR','functional_amount',100,'original_amount',100,'original_currency','SDG','functional_currency','SDG'),
          jsonb_build_object('account_id',v_acc_revenue,'fund_id',v_fund_a,'function','none','debit_credit','CR','functional_amount',100,'original_amount',100,'original_currency','SDG','functional_currency','SDG')
        )
      ), v_idem_key);
    if v_entry_id is null then
      return query select 'T01'::text, 'happy-path'::text, 'FAIL'::text, 'returned NULL entry_id'::text;
    else
      return query select 'T01'::text, 'happy-path'::text, 'PASS'::text, ('entry='||v_entry_id::text)::text;
    end if;
  exception when others then
    return query select 'T01'::text, 'happy-path'::text, 'FAIL'::text, sqlerrm::text;
  end;

  -- T02: IDEMPOTENCY_KEY_REQUIRED with empty key
  begin
    perform public.acct_post_journal(jsonb_build_object('period_id',v_period_open,'lines',jsonb_build_array()), '');
    return query select 'T02'::text, 'idempotency-key-required'::text, 'FAIL'::text, 'expected raise'::text;
  exception when others then
    if sqlerrm like 'IDEMPOTENCY_KEY_REQUIRED%' then
      return query select 'T02'::text, 'idempotency-key-required'::text, 'PASS'::text, sqlerrm::text;
    else
      return query select 'T02'::text, 'idempotency-key-required'::text, 'FAIL'::text, ('wrong error: '||sqlerrm)::text;
    end if;
  end;

  -- T03: POSTING_ENGINE_DISABLED with master switch off.
  -- Hardened: capture original BEFORE the mutation; ensure restore runs even
  -- if the test body raises an unexpected error. We also catch outer errors
  -- so a failure in T03 cannot taint T04+.
  v_flag_orig := (select is_enabled from public.feature_flags
                   where key = 'acct.posting_engine.enabled');
  begin
    update public.feature_flags set is_enabled = false
     where key = 'acct.posting_engine.enabled';
    begin
      perform public.acct_post_journal(
        jsonb_build_object(
          'period_id', v_period_open,
          'lines', jsonb_build_array(
            jsonb_build_object('account_id',v_acc_cash,'fund_id',v_fund_a,'function','none','debit_credit','DR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG'),
            jsonb_build_object('account_id',v_acc_revenue,'fund_id',v_fund_a,'function','none','debit_credit','CR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG')
          )
        ), 'T03-'||v_run_tag);
      return query select 'T03'::text, 'engine-disabled'::text, 'FAIL'::text, 'expected raise'::text;
    exception when others then
      if sqlerrm like 'POSTING_ENGINE_DISABLED%' then
        return query select 'T03'::text, 'engine-disabled'::text, 'PASS'::text, sqlerrm::text;
      else
        return query select 'T03'::text, 'engine-disabled'::text, 'FAIL'::text, ('wrong error: '||sqlerrm)::text;
      end if;
    end;
  exception when others then
    return query select 'T03'::text, 'engine-disabled'::text, 'FAIL'::text, ('outer error: '||sqlerrm)::text;
  end;
  -- Always restore (runs whether the inner block succeeded, the test asserted,
  -- or the outer exception handler fired):
  update public.feature_flags set is_enabled = coalesce(v_flag_orig, true)
   where key = 'acct.posting_engine.enabled';

  -- T04: AUTHORIZATION_FAILED with non-finance role.
  -- Hardened: capture original JWT BEFORE the mutation; restore unconditionally.
  v_jwt_orig := current_setting('request.jwt.claim.sub', true);
  begin
    perform set_config('request.jwt.claim.sub', p_non_finance_user_id::text, true);
    begin
      perform public.acct_post_journal(
        jsonb_build_object(
          'period_id', v_period_open,
          'lines', jsonb_build_array(
            jsonb_build_object('account_id',v_acc_cash,'fund_id',v_fund_a,'function','none','debit_credit','DR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG'),
            jsonb_build_object('account_id',v_acc_revenue,'fund_id',v_fund_a,'function','none','debit_credit','CR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG')
          )
        ), 'T04-'||v_run_tag);
      return query select 'T04'::text, 'authorization-failed'::text, 'FAIL'::text, 'expected raise'::text;
    exception when others then
      if sqlerrm like 'AUTHORIZATION_FAILED%' then
        return query select 'T04'::text, 'authorization-failed'::text, 'PASS'::text, sqlerrm::text;
      else
        return query select 'T04'::text, 'authorization-failed'::text, 'FAIL'::text, ('wrong error: '||sqlerrm)::text;
      end if;
    end;
  exception when others then
    return query select 'T04'::text, 'authorization-failed'::text, 'FAIL'::text, ('outer error: '||sqlerrm)::text;
  end;
  -- Always restore JWT to the finance user for T05+:
  perform set_config('request.jwt.claim.sub',
                     coalesce(nullif(v_jwt_orig, ''), p_finance_user_id::text),
                     true);

  -- T05: PERIOD_NOT_FOUND
  begin
    perform public.acct_post_journal(
      jsonb_build_object(
        'period_id', gen_random_uuid(),
        'lines', jsonb_build_array(
          jsonb_build_object('account_id',v_acc_cash,'fund_id',v_fund_a,'function','none','debit_credit','DR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG'),
          jsonb_build_object('account_id',v_acc_revenue,'fund_id',v_fund_a,'function','none','debit_credit','CR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG')
        )
      ), 'T05-'||v_run_tag);
    return query select 'T05'::text, 'period-not-found'::text, 'FAIL'::text, 'expected raise'::text;
  exception when others then
    if sqlerrm like 'PERIOD_NOT_FOUND%' then
      return query select 'T05'::text, 'period-not-found'::text, 'PASS'::text, sqlerrm::text;
    else
      return query select 'T05'::text, 'period-not-found'::text, 'FAIL'::text, ('wrong error: '||sqlerrm)::text;
    end if;
  end;

  -- T06: PERIOD_CLOSED
  begin
    perform public.acct_post_journal(
      jsonb_build_object(
        'period_id', v_period_closed,
        'posting_date','2099-02-15',
        'lines', jsonb_build_array(
          jsonb_build_object('account_id',v_acc_cash,'fund_id',v_fund_a,'function','none','debit_credit','DR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG'),
          jsonb_build_object('account_id',v_acc_revenue,'fund_id',v_fund_a,'function','none','debit_credit','CR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG')
        )
      ), 'T06-'||v_run_tag);
    return query select 'T06'::text, 'period-closed'::text, 'FAIL'::text, 'expected raise'::text;
  exception when others then
    if sqlerrm like 'PERIOD_CLOSED%' then
      return query select 'T06'::text, 'period-closed'::text, 'PASS'::text, sqlerrm::text;
    else
      return query select 'T06'::text, 'period-closed'::text, 'FAIL'::text, ('wrong error: '||sqlerrm)::text;
    end if;
  end;

  -- T07: POSTING_DATE_OUT_OF_PERIOD
  begin
    perform public.acct_post_journal(
      jsonb_build_object(
        'period_id', v_period_open,
        'posting_date', '2098-12-31',
        'lines', jsonb_build_array(
          jsonb_build_object('account_id',v_acc_cash,'fund_id',v_fund_a,'function','none','debit_credit','DR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG'),
          jsonb_build_object('account_id',v_acc_revenue,'fund_id',v_fund_a,'function','none','debit_credit','CR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG')
        )
      ), 'T07-'||v_run_tag);
    return query select 'T07'::text, 'posting-date-out-of-period'::text, 'FAIL'::text, 'expected raise'::text;
  exception when others then
    if sqlerrm like 'POSTING_DATE_OUT_OF_PERIOD%' then
      return query select 'T07'::text, 'posting-date-out-of-period'::text, 'PASS'::text, sqlerrm::text;
    else
      return query select 'T07'::text, 'posting-date-out-of-period'::text, 'FAIL'::text, ('wrong error: '||sqlerrm)::text;
    end if;
  end;

  -- T08: INSUFFICIENT_LINES with 1 line
  begin
    perform public.acct_post_journal(
      jsonb_build_object(
        'period_id', v_period_open,
        'posting_date','2099-01-15',
        'lines', jsonb_build_array(
          jsonb_build_object('account_id',v_acc_cash,'fund_id',v_fund_a,'function','none','debit_credit','DR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG')
        )
      ), 'T08-'||v_run_tag);
    return query select 'T08'::text, 'insufficient-lines'::text, 'FAIL'::text, 'expected raise'::text;
  exception when others then
    if sqlerrm like 'INSUFFICIENT_LINES%' then
      return query select 'T08'::text, 'insufficient-lines'::text, 'PASS'::text, sqlerrm::text;
    else
      return query select 'T08'::text, 'insufficient-lines'::text, 'FAIL'::text, ('wrong error: '||sqlerrm)::text;
    end if;
  end;

  -- T09: MISSING_FUND when fund_required and line.fund_id null
  begin
    perform public.acct_post_journal(
      jsonb_build_object(
        'period_id', v_period_open,
        'posting_date','2099-01-15',
        'lines', jsonb_build_array(
          jsonb_build_object('account_id',v_acc_cash,'function','none','debit_credit','DR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG'),
          jsonb_build_object('account_id',v_acc_revenue,'function','none','debit_credit','CR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG')
        )
      ), 'T09-'||v_run_tag);
    return query select 'T09'::text, 'missing-fund'::text, 'FAIL'::text, 'expected raise'::text;
  exception when others then
    if sqlerrm like 'MISSING_FUND%' then
      return query select 'T09'::text, 'missing-fund'::text, 'PASS'::text, sqlerrm::text;
    else
      return query select 'T09'::text, 'missing-fund'::text, 'FAIL'::text, ('wrong error: '||sqlerrm)::text;
    end if;
  end;

  -- T10: MISSING_FUNCTION on expense line with function='none'
  begin
    perform public.acct_post_journal(
      jsonb_build_object(
        'period_id', v_period_open,
        'posting_date','2099-01-15',
        'lines', jsonb_build_array(
          jsonb_build_object('account_id',v_acc_expense,'fund_id',v_fund_a,'function','none','debit_credit','DR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG'),
          jsonb_build_object('account_id',v_acc_cash,'fund_id',v_fund_a,'function','none','debit_credit','CR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG')
        )
      ), 'T10-'||v_run_tag);
    return query select 'T10'::text, 'missing-function-on-expense'::text, 'FAIL'::text, 'expected raise'::text;
  exception when others then
    if sqlerrm like 'MISSING_FUNCTION%' then
      return query select 'T10'::text, 'missing-function-on-expense'::text, 'PASS'::text, sqlerrm::text;
    else
      return query select 'T10'::text, 'missing-function-on-expense'::text, 'FAIL'::text, ('wrong error: '||sqlerrm)::text;
    end if;
  end;

  -- T11: ACCOUNT_NOT_FOUND with random uuid
  begin
    perform public.acct_post_journal(
      jsonb_build_object(
        'period_id', v_period_open,
        'posting_date','2099-01-15',
        'lines', jsonb_build_array(
          jsonb_build_object('account_id',gen_random_uuid(),'fund_id',v_fund_a,'function','none','debit_credit','DR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG'),
          jsonb_build_object('account_id',v_acc_revenue,'fund_id',v_fund_a,'function','none','debit_credit','CR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG')
        )
      ), 'T11-'||v_run_tag);
    return query select 'T11'::text, 'account-not-found'::text, 'FAIL'::text, 'expected raise'::text;
  exception when others then
    if sqlerrm like 'ACCOUNT_NOT_FOUND%' then
      return query select 'T11'::text, 'account-not-found'::text, 'PASS'::text, sqlerrm::text;
    else
      return query select 'T11'::text, 'account-not-found'::text, 'FAIL'::text, ('wrong error: '||sqlerrm)::text;
    end if;
  end;

  -- T12: ACCOUNT_INACTIVE
  begin
    perform public.acct_post_journal(
      jsonb_build_object(
        'period_id', v_period_open,
        'posting_date','2099-01-15',
        'lines', jsonb_build_array(
          jsonb_build_object('account_id',v_acc_inactive,'fund_id',v_fund_a,'function','none','debit_credit','DR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG'),
          jsonb_build_object('account_id',v_acc_revenue,'fund_id',v_fund_a,'function','none','debit_credit','CR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG')
        )
      ), 'T12-'||v_run_tag);
    return query select 'T12'::text, 'account-inactive'::text, 'FAIL'::text, 'expected raise'::text;
  exception when others then
    if sqlerrm like 'ACCOUNT_INACTIVE%' then
      return query select 'T12'::text, 'account-inactive'::text, 'PASS'::text, sqlerrm::text;
    else
      return query select 'T12'::text, 'account-inactive'::text, 'FAIL'::text, ('wrong error: '||sqlerrm)::text;
    end if;
  end;

  -- T13: ACCOUNT_NOT_POSTABLE (header account)
  begin
    perform public.acct_post_journal(
      jsonb_build_object(
        'period_id', v_period_open,
        'posting_date','2099-01-15',
        'lines', jsonb_build_array(
          jsonb_build_object('account_id',v_acc_header,'fund_id',v_fund_a,'function','none','debit_credit','DR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG'),
          jsonb_build_object('account_id',v_acc_revenue,'fund_id',v_fund_a,'function','none','debit_credit','CR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG')
        )
      ), 'T13-'||v_run_tag);
    return query select 'T13'::text, 'account-not-postable'::text, 'FAIL'::text, 'expected raise'::text;
  exception when others then
    if sqlerrm like 'ACCOUNT_NOT_POSTABLE%' then
      return query select 'T13'::text, 'account-not-postable'::text, 'PASS'::text, sqlerrm::text;
    else
      return query select 'T13'::text, 'account-not-postable'::text, 'FAIL'::text, ('wrong error: '||sqlerrm)::text;
    end if;
  end;

  -- T14: FX_RATE_MISSING when currencies cross without fx_rate
  begin
    perform public.acct_post_journal(
      jsonb_build_object(
        'period_id', v_period_open,
        'posting_date','2099-01-15',
        'lines', jsonb_build_array(
          jsonb_build_object('account_id',v_acc_cash,'fund_id',v_fund_a,'function','none','debit_credit','DR','functional_amount',1,'original_amount',1,'original_currency','USD','functional_currency','SDG'),
          jsonb_build_object('account_id',v_acc_revenue,'fund_id',v_fund_a,'function','none','debit_credit','CR','functional_amount',1,'original_amount',1,'original_currency','SDG','functional_currency','SDG')
        )
      ), 'T14-'||v_run_tag);
    return query select 'T14'::text, 'fx-rate-missing'::text, 'FAIL'::text, 'expected raise'::text;
  exception when others then
    if sqlerrm like 'FX_RATE_MISSING%' then
      return query select 'T14'::text, 'fx-rate-missing'::text, 'PASS'::text, sqlerrm::text;
    else
      return query select 'T14'::text, 'fx-rate-missing'::text, 'FAIL'::text, ('wrong error: '||sqlerrm)::text;
    end if;
  end;

  -- T15: BALANCE_MISMATCH
  begin
    perform public.acct_post_journal(
      jsonb_build_object(
        'period_id', v_period_open,
        'posting_date','2099-01-15',
        'lines', jsonb_build_array(
          jsonb_build_object('account_id',v_acc_cash,'fund_id',v_fund_a,'function','none','debit_credit','DR','functional_amount',100,'original_amount',100,'original_currency','SDG','functional_currency','SDG'),
          jsonb_build_object('account_id',v_acc_revenue,'fund_id',v_fund_a,'function','none','debit_credit','CR','functional_amount',99,'original_amount',99,'original_currency','SDG','functional_currency','SDG')
        )
      ), 'T15-'||v_run_tag);
    return query select 'T15'::text, 'balance-mismatch'::text, 'FAIL'::text, 'expected raise'::text;
  exception when others then
    if sqlerrm like 'BALANCE_MISMATCH%' then
      return query select 'T15'::text, 'balance-mismatch'::text, 'PASS'::text, sqlerrm::text;
    else
      return query select 'T15'::text, 'balance-mismatch'::text, 'FAIL'::text, ('wrong error: '||sqlerrm)::text;
    end if;
  end;

  -- T16: Multi-fund balance — two funds, one balanced one NOT → must raise
  begin
    perform public.acct_post_journal(
      jsonb_build_object(
        'period_id', v_period_open,
        'posting_date','2099-01-15',
        'lines', jsonb_build_array(
          jsonb_build_object('account_id',v_acc_cash,'fund_id',v_fund_a,'function','none','debit_credit','DR','functional_amount',100,'original_amount',100,'original_currency','SDG','functional_currency','SDG'),
          jsonb_build_object('account_id',v_acc_revenue,'fund_id',v_fund_a,'function','none','debit_credit','CR','functional_amount',100,'original_amount',100,'original_currency','SDG','functional_currency','SDG'),
          jsonb_build_object('account_id',v_acc_cash,'fund_id',v_fund_b,'function','none','debit_credit','DR','functional_amount',50,'original_amount',50,'original_currency','SDG','functional_currency','SDG'),
          jsonb_build_object('account_id',v_acc_revenue,'fund_id',v_fund_b,'function','none','debit_credit','CR','functional_amount',49,'original_amount',49,'original_currency','SDG','functional_currency','SDG')
        )
      ), 'T16-'||v_run_tag);
    return query select 'T16'::text, 'per-fund-balance'::text, 'FAIL'::text, 'expected raise'::text;
  exception when others then
    if sqlerrm like 'BALANCE_MISMATCH%' then
      return query select 'T16'::text, 'per-fund-balance'::text, 'PASS'::text, sqlerrm::text;
    else
      return query select 'T16'::text, 'per-fund-balance'::text, 'FAIL'::text, ('wrong error: '||sqlerrm)::text;
    end if;
  end;

  -- T17: Idempotency replay — second call with same key returns the same id
  begin
    v_idem_key := 'T17-'||v_run_tag;
    v_entry_id := public.acct_post_journal(
      jsonb_build_object(
        'period_id', v_period_open,
        'posting_date','2099-01-15',
        'lines', jsonb_build_array(
          jsonb_build_object('account_id',v_acc_cash,'fund_id',v_fund_a,'function','none','debit_credit','DR','functional_amount',7,'original_amount',7,'original_currency','SDG','functional_currency','SDG'),
          jsonb_build_object('account_id',v_acc_revenue,'fund_id',v_fund_a,'function','none','debit_credit','CR','functional_amount',7,'original_amount',7,'original_currency','SDG','functional_currency','SDG')
        )
      ), v_idem_key);
    v_entry_id2 := public.acct_post_journal(
      jsonb_build_object(
        'period_id', v_period_open,
        'posting_date','2099-01-15',
        'lines', jsonb_build_array(
          jsonb_build_object('account_id',v_acc_cash,'fund_id',v_fund_a,'function','none','debit_credit','DR','functional_amount',999,'original_amount',999,'original_currency','SDG','functional_currency','SDG'),
          jsonb_build_object('account_id',v_acc_revenue,'fund_id',v_fund_a,'function','none','debit_credit','CR','functional_amount',999,'original_amount',999,'original_currency','SDG','functional_currency','SDG')
        )
      ), v_idem_key);
    select count(*) into v_idem_count
      from public.acct_journal_entries
     where idempotency_key = v_idem_key;
    if v_entry_id = v_entry_id2 and v_idem_count = 1 then
      return query select 'T17'::text, 'idempotency-replay'::text, 'PASS'::text,
        ('same entry='||v_entry_id::text||' rows='||v_idem_count::text)::text;
    elsif v_entry_id = v_entry_id2 and v_idem_count <> 1 then
      return query select 'T17'::text, 'idempotency-replay'::text, 'FAIL'::text,
        ('id matched but row count='||v_idem_count::text||' (expected 1)')::text;
    else
      return query select 'T17'::text, 'idempotency-replay'::text, 'FAIL'::text,
        ('different entries returned: '||v_entry_id::text||' vs '||v_entry_id2::text||
         ' rows='||v_idem_count::text)::text;
    end if;
  exception when others then
    return query select 'T17'::text, 'idempotency-replay'::text, 'FAIL'::text, sqlerrm::text;
  end;

  -- T18: Sanctions block — only runnable if partners table exists
  if v_partners_tbl then
    select column_name into v_partner_name_col
      from information_schema.columns
     where table_schema='public' and table_name='partners'
       and column_name in ('name','full_name','partner_name')
     order by case column_name when 'name' then 1 when 'full_name' then 2 else 3 end limit 1;

    if v_partner_name_col is not null then
      execute format(
        'insert into public.partners (%I) values ($1) returning id',
        v_partner_name_col
      ) using ('TEST_BAD_PARTNER_'||v_run_tag) into v_partner_bad;
      -- Schema (Sprint 1.2): list, external_id, full_name, aliases, country, match_hash, raw, loaded_at
      insert into public.acct_sanctioned_parties
        (list, external_id, full_name, aliases, country, match_hash, raw)
      values
        ('OFAC_SDN'::acct_sanctions_list,
         'TEST-SDN-'||v_run_tag,
         'TEST_BAD_PARTNER_'||v_run_tag,
         array['Test Bad Partner '||v_run_tag],
         'XX',
         public.acct_normalize_name('TEST_BAD_PARTNER_'||v_run_tag),
         jsonb_build_object('test_suite', true, 'run_tag', v_run_tag));

      begin
        perform public.acct_post_journal(
          jsonb_build_object(
            'period_id', v_period_open,
            'posting_date','2099-01-15',
            'lines', jsonb_build_array(
              jsonb_build_object('account_id',v_acc_cash,'fund_id',v_fund_a,'function','none','debit_credit','DR','functional_amount',5,'original_amount',5,'original_currency','SDG','functional_currency','SDG','partner_id',v_partner_bad),
              jsonb_build_object('account_id',v_acc_revenue,'fund_id',v_fund_a,'function','none','debit_credit','CR','functional_amount',5,'original_amount',5,'original_currency','SDG','functional_currency','SDG','partner_id',v_partner_bad)
            )
          ), 'T18-'||v_run_tag);
        return query select 'T18'::text, 'sanctions-block'::text, 'FAIL'::text, 'expected raise'::text;
      exception when others then
        if sqlerrm like 'SANCTIONS_BLOCK%' then
          return query select 'T18'::text, 'sanctions-block'::text, 'PASS'::text, sqlerrm::text;
        else
          return query select 'T18'::text, 'sanctions-block'::text, 'FAIL'::text, ('wrong error: '||sqlerrm)::text;
        end if;
      end;
    else
      return query select 'T18'::text, 'sanctions-block'::text, 'SKIP'::text, 'no recognised partner name column'::text;
    end if;
  else
    return query select 'T18'::text, 'sanctions-block'::text, 'SKIP'::text, 'partners table absent'::text;
  end if;

  -- T19: SoD same-entry — caller posted, can't approve own entry
  --   Use the T01 entry: caller is creator → acct_check_sod must return false
  begin
    select id into v_entry_id from public.acct_journal_entries
     where idempotency_key = 'T01-'||v_run_tag;
    v_sod_ok := public.acct_check_sod(
      v_caller, 'journal.approve',
      jsonb_build_object('entry_id', v_entry_id)
    );
    if v_sod_ok = false then
      return query select 'T19'::text, 'sod-same-entry'::text, 'PASS'::text,
        'creator cannot approve own entry'::text;
    else
      return query select 'T19'::text, 'sod-same-entry'::text, 'FAIL'::text,
        'acct_check_sod returned true; expected false'::text;
    end if;
  exception when others then
    return query select 'T19'::text, 'sod-same-entry'::text, 'FAIL'::text, sqlerrm::text;
  end;

  -- T20: Trial balance is balanced (DR total = CR total) for the test period
  begin
    select coalesce(sum(debit_total),0), coalesce(sum(credit_total),0)
      into v_tb_dr, v_tb_cr
      from public.acct_trial_balance(v_period_open);
    if v_tb_dr = v_tb_cr then
      return query select 'T20'::text, 'trial-balance-balanced'::text, 'PASS'::text,
        ('dr='||v_tb_dr::text||' cr='||v_tb_cr::text)::text;
    else
      return query select 'T20'::text, 'trial-balance-balanced'::text, 'FAIL'::text,
        ('dr='||v_tb_dr::text||' cr='||v_tb_cr::text)::text;
    end if;
  exception when others then
    return query select 'T20'::text, 'trial-balance-balanced'::text, 'FAIL'::text, sqlerrm::text;
  end;

  return;
end $$;

comment on function public.acct_run_test_suite(uuid, uuid) is
  'Posting-engine unit-test suite. MUST be called inside a transaction the '
  'caller will roll back (BEGIN; set local request.jwt.claim.sub; SELECT...; ROLLBACK). '
  'Returns rows of (test_id, name, status, detail). Status is PASS / FAIL / SKIP.';

-- -----------------------------------------------------------------------------
-- 4. Grants
-- -----------------------------------------------------------------------------
grant execute on function public.acct_seed_synthetic(int, boolean, numeric)  to authenticated;
grant execute on function public.acct_run_test_suite(uuid, uuid)             to authenticated;
grant select on public.acct_synthetic_marker to authenticated;

-- =============================================================================
-- End of Sprint 1.3 migration.
-- After applying, run the suite (see runbook) and capture results in §Sign-off.
-- =============================================================================
