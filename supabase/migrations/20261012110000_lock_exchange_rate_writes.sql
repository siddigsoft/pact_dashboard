drop policy if exists acct_exchange_rates_write on public.acct_exchange_rates;
revoke insert, update, delete on public.acct_exchange_rates from anon;

create policy acct_exchange_rates_insert on public.acct_exchange_rates
  for insert to authenticated
  with check ((select public.current_user_has_resource_permission('accounting', 'create'))
           or (select public.current_user_has_resource_permission('accounting', 'update')));

create policy acct_exchange_rates_update on public.acct_exchange_rates
  for update to authenticated
  using ((select public.current_user_has_resource_permission('accounting', 'update')))
  with check ((select public.current_user_has_resource_permission('accounting', 'update')));

create policy acct_exchange_rates_delete on public.acct_exchange_rates
  for delete to authenticated
  using ((select public.current_user_has_resource_permission('accounting', 'delete')));
