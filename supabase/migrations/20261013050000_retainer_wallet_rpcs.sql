-- Retainer wallet credits, gated by payroll:create.
-- Wallet balances are maintained by triggers on wallet_transactions, so these
-- functions only write ledger rows. 'earning' rows require a site reference
-- (guard_ordinary_site_wallet_insert), so retainers post as 'adjustment_credit'.
-- Amounts, currency and FX rate are re-derived from the user's classification
-- and acct_exchange_rates; client-supplied values must match them.

create unique index if not exists wallet_transactions_retainer_unique
  on public.wallet_transactions (user_id, (metadata ->> 'period'))
  where metadata ->> 'type' = 'retainer';

drop function if exists public.credit_retainer_wallet(uuid, integer, text, text, uuid);
drop function if exists public.credit_retainer_wallet(uuid, integer, text, text, uuid, text, numeric);

create or replace function public.credit_retainer_wallet(
  p_user_id       uuid,
  p_amount_cents  integer,
  p_currency      text,
  p_period        text,
  p_created_by    uuid    default null,
  p_base_currency text    default null,
  p_fx_rate       numeric default null
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_class        record;
  v_month        int;
  v_freq         text;
  v_fx_rate      numeric;
  v_expected     bigint;
  v_wallet_id    uuid;
  v_balance      numeric;
  v_amount       numeric;
  v_metadata     jsonb;
  v_inserted_id  uuid;
begin
  if not public.current_user_has_resource_permission('payroll', 'create') then
    raise exception 'permission denied: payroll:create required to credit retainers'
      using errcode = '42501';
  end if;

  if p_period is null or p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'invalid period %', p_period using errcode = '22023';
  end if;
  if p_period > to_char(now() + interval '1 day', 'YYYY-MM') then
    raise exception 'cannot credit a future period (%)', p_period using errcode = '22023';
  end if;

  select uc.retainer_amount_cents, uc.retainer_currency, uc.retainer_payout_currency, uc.retainer_frequency
    into v_class
    from public.user_classifications uc
   where uc.user_id = p_user_id
     and uc.is_active
     and uc.has_retainer
     and uc.effective_from <= now()
     and (uc.effective_until is null or uc.effective_until > now())
   order by uc.effective_from desc
   limit 1;

  if not found or coalesce(v_class.retainer_amount_cents, 0) <= 0 then
    raise exception 'user % has no active retainer', p_user_id using errcode = '22023';
  end if;

  v_month := substr(p_period, 6, 2)::int;
  v_freq  := lower(coalesce(v_class.retainer_frequency, 'monthly'));
  if (v_freq = 'quarterly' and v_month not in (3, 6, 9, 12))
     or (v_freq in ('annual', 'yearly') and v_month <> 12) then
    raise exception 'retainer for user % is not due in %', p_user_id, p_period using errcode = '22023';
  end if;

  v_metadata := jsonb_build_object('type', 'retainer', 'period', p_period);

  if p_currency = v_class.retainer_currency then
    v_expected := v_class.retainer_amount_cents;
  elsif v_class.retainer_payout_currency is not null
        and p_currency = v_class.retainer_payout_currency then
    select rate into v_fx_rate
      from public.acct_exchange_rates
     where from_currency = v_class.retainer_currency
       and to_currency   = v_class.retainer_payout_currency
       and effective_date <= current_date
     order by effective_date desc
     limit 1;
    if v_fx_rate is null then
      raise exception 'no exchange rate for % to %', v_class.retainer_currency, p_currency
        using errcode = '22023';
    end if;
    v_expected := round(v_class.retainer_amount_cents * v_fx_rate);
    v_metadata := v_metadata || jsonb_build_object(
      'base_currency', v_class.retainer_currency, 'fx_rate', v_fx_rate);
  else
    raise exception 'currency % does not match the retainer for user %', p_currency, p_user_id
      using errcode = '22023';
  end if;

  if abs(p_amount_cents - v_expected) > 1 then
    raise exception 'amount % does not match the retainer amount %', p_amount_cents, v_expected
      using errcode = '22023';
  end if;

  perform public.ensure_wallet_row(p_user_id);
  select id, coalesce((balances ->> p_currency)::numeric, 0)
    into v_wallet_id, v_balance
    from public.wallets
   where user_id = p_user_id
     for update;

  v_amount := v_expected / 100.0;

  insert into public.wallet_transactions (
    wallet_id, user_id, type, status, amount, amount_cents, currency,
    description, balance_before, balance_after, created_by, metadata
  ) values (
    v_wallet_id, p_user_id, 'adjustment_credit', 'posted', v_amount, v_expected, p_currency,
    'Monthly retainer - ' || p_period, v_balance, v_balance + v_amount,
    auth.uid(), v_metadata
  )
  on conflict do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    return 'already_processed';
  end if;
  return 'ok';
end;
$$;

revoke all on function public.credit_retainer_wallet(uuid, integer, text, text, uuid, text, numeric) from public, anon;
grant execute on function public.credit_retainer_wallet(uuid, integer, text, text, uuid, text, numeric) to authenticated, service_role;

-- Reissues a retainer that was paid in the base currency (no FX rate at the
-- time) in the configured payout currency. The original row is kept for audit
-- as status 'reversed' with metadata type 'retainer_reversed'.
drop function if exists public.reverse_and_reissue_retainer(uuid, text, text, text, uuid);

create or replace function public.reverse_and_reissue_retainer(
  p_user_id         uuid,
  p_period          text,
  p_base_currency   text,
  p_payout_currency text,
  p_created_by      uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_class        record;
  v_fx_rate      numeric;
  v_tx           record;
  v_wallet_id    uuid;
  v_balances     jsonb;
  v_base_bal     numeric;
  v_payout_bal   numeric;
  v_new_cents    bigint;
  v_new_amount   numeric;
begin
  if not public.current_user_has_resource_permission('payroll', 'create') then
    raise exception 'permission denied: payroll:create required to reprocess retainers'
      using errcode = '42501';
  end if;

  select uc.retainer_currency, uc.retainer_payout_currency
    into v_class
    from public.user_classifications uc
   where uc.user_id = p_user_id
     and uc.is_active
     and uc.has_retainer
     and uc.effective_from <= now()
     and (uc.effective_until is null or uc.effective_until > now())
   order by uc.effective_from desc
   limit 1;

  if not found
     or v_class.retainer_payout_currency is null
     or v_class.retainer_payout_currency = v_class.retainer_currency
     or v_class.retainer_currency is distinct from p_base_currency
     or v_class.retainer_payout_currency is distinct from p_payout_currency then
    raise exception 'currencies do not match the retainer for user %', p_user_id
      using errcode = '22023';
  end if;

  select rate into v_fx_rate
    from public.acct_exchange_rates
   where from_currency = p_base_currency
     and to_currency   = p_payout_currency
     and effective_date <= current_date
   order by effective_date desc
   limit 1;

  if v_fx_rate is null then
    return jsonb_build_object('status', 'no_fx_rate',
      'message', 'No exchange rate found for ' || p_base_currency || '→' || p_payout_currency);
  end if;

  select id, amount_cents, currency, metadata
    into v_tx
    from public.wallet_transactions
   where user_id = p_user_id
     and metadata ->> 'type' = 'retainer'
     and metadata ->> 'period' = p_period
     for update;

  if not found then
    return jsonb_build_object('status', 'no_fallback_tx',
      'message', 'No retainer transaction found for period ' || p_period);
  end if;

  if v_tx.currency = p_payout_currency then
    return jsonb_build_object('status', 'already_correct',
      'message', 'Transaction is already in ' || p_payout_currency);
  end if;

  if v_tx.currency <> p_base_currency then
    raise exception 'retainer for % was paid in %, expected %', p_period, v_tx.currency, p_base_currency
      using errcode = '22023';
  end if;

  select id, coalesce(balances, '{}'::jsonb)
    into v_wallet_id, v_balances
    from public.wallets
   where user_id = p_user_id
     for update;

  v_base_bal := coalesce((v_balances ->> p_base_currency)::numeric, 0);
  if v_base_bal < v_tx.amount_cents / 100.0 then
    return jsonb_build_object('status', 'insufficient_balance',
      'message', 'The ' || p_base_currency || ' balance (' || v_base_bal ||
                 ') is less than the original retainer (' || (v_tx.amount_cents / 100.0) ||
                 '). Adjust the balance manually before reprocessing.');
  end if;

  -- The balance triggers recompute SDG and the cents totals, but per-currency
  -- entries in balances are only ever incremented, so remove the reversed amount here.
  update public.wallets
     set balances = jsonb_set(v_balances, array[p_base_currency],
                              to_jsonb(v_base_bal - v_tx.amount_cents / 100.0))
   where id = v_wallet_id;

  update public.wallet_transactions
     set status   = 'reversed',
         metadata = v_tx.metadata || jsonb_build_object(
           'type', 'retainer_reversed',
           'reversed_at', now(),
           'reversed_by', auth.uid())
   where id = v_tx.id;

  v_new_cents  := round(v_tx.amount_cents * v_fx_rate);
  v_new_amount := v_new_cents / 100.0;

  select coalesce((balances ->> p_payout_currency)::numeric, 0)
    into v_payout_bal
    from public.wallets
   where id = v_wallet_id;

  insert into public.wallet_transactions (
    wallet_id, user_id, type, status, amount, amount_cents, currency,
    description, balance_before, balance_after, created_by, metadata
  ) values (
    v_wallet_id, p_user_id, 'adjustment_credit', 'posted', v_new_amount, v_new_cents, p_payout_currency,
    'Monthly retainer - ' || p_period, v_payout_bal, v_payout_bal + v_new_amount,
    auth.uid(),
    jsonb_build_object('type', 'retainer', 'period', p_period,
      'base_currency', p_base_currency, 'fx_rate', v_fx_rate, 'reissue_of', v_tx.id)
  );

  return jsonb_build_object('status', 'ok',
    'reissued_currency', p_payout_currency, 'reissued_amount', v_new_amount);
end;
$$;

revoke all on function public.reverse_and_reissue_retainer(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.reverse_and_reissue_retainer(uuid, text, text, text, uuid) to authenticated, service_role;
