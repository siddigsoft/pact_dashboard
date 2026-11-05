-- wallet_tx_type has no 'penalty' value, so comparing NEW.type against it raised
-- 22P02 and aborted every posted wallet_transactions insert/update. Compare as text.

create or replace function public.update_wallet_balance()
returns trigger
language plpgsql
as $function$
declare delta bigint; new_balance bigint; abs_amount bigint;
begin
  if NEW.status = 'posted' and (OLD.status is null or OLD.status <> 'posted') then
    abs_amount := abs(NEW.amount_cents);
    delta := case when NEW.amount_cents < 0 then NEW.amount_cents
      when NEW.type::text in ('withdrawal','adjustment_debit','penalty') then -abs_amount
      else abs_amount end;
    select balance_cents into new_balance from public.wallets where id = NEW.wallet_id;
    new_balance := coalesce(new_balance,0) + delta;
    if new_balance < 0 and not (
      current_setting('app.claimant_reassignment', true) = 'true'
      and NEW.type = 'adjustment_debit'
      and (NEW.metadata ->> 'reassignment_rpc_marker')::boolean is true
      and nullif(NEW.metadata ->> 'reassignment_site_id', '') is not null
      and nullif(NEW.metadata ->> 'original_earning_transaction_id', '') is not null
      and exists (
        select 1 from public.mmp_site_entries e
        where e.id = (NEW.metadata ->> 'reassignment_site_id')::uuid
      )
      and exists (
        select 1 from public.wallet_transactions original
        where original.id = (NEW.metadata ->> 'original_earning_transaction_id')::uuid
          and original.type::text in ('earning','site_visit_fee')
          and original.status::text = 'posted'
      )
    ) then
      raise exception 'Insufficient wallet balance. Current: %, Requested: %',
        (select balance_cents from public.wallets where id = NEW.wallet_id),
        abs_amount;
    end if;
    update public.wallets set balance_cents = new_balance,
      total_earned_cents = case when NEW.type::text in ('site_visit_fee','earning','bonus','adjustment_credit')
        or (NEW.amount_cents > 0 and NEW.type::text not in ('withdrawal','adjustment_debit','penalty'))
        then total_earned_cents + abs_amount else total_earned_cents end,
      total_paid_out_cents = case when NEW.type::text in ('withdrawal','adjustment_debit')
        or NEW.amount_cents < 0 then total_paid_out_cents + abs_amount else total_paid_out_cents end,
      total_earned = case when NEW.type::text in ('site_visit_fee','earning','bonus','adjustment_credit')
        or (NEW.amount_cents > 0 and NEW.type::text not in ('withdrawal','adjustment_debit','penalty'))
        then coalesce(total_earned,0)+abs_amount/100.0 else total_earned end,
      total_withdrawn = case when NEW.type::text in ('withdrawal','adjustment_debit')
        or NEW.amount_cents < 0 then coalesce(total_withdrawn,0)+abs_amount/100.0 else total_withdrawn end,
      balances = jsonb_set(coalesce(balances,'{}'::jsonb),
        array[coalesce(NEW.currency,'SDG')],
        to_jsonb((coalesce((balances ->> coalesce(NEW.currency,'SDG'))::numeric,0)
          + delta / 100.0)), true), updated_at = now()
    where id = NEW.wallet_id;
  end if;
  return NEW;
end
$function$;
