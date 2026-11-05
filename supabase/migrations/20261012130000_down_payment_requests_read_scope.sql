drop policy if exists "Allow authenticated users to read down_payment_requests" on public.down_payment_requests;
revoke select on public.down_payment_requests from anon;

create policy down_payment_requests_read on public.down_payment_requests
  for select to authenticated
  using (
    requested_by = (select auth.uid())
    or (select public.current_user_has_resource_permission('down_payments', 'read'))
  );
