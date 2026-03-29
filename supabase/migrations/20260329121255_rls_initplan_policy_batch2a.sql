-- Applied on remote as: rls_initplan_policy_batch2a
-- auth_rls_initplan (continued): INSERT policies using (select auth.uid()).
-- Drops redundant chat_participants FOR ALL policy (multiple permissive policies).

DROP POLICY IF EXISTS "Users can insert their own signatures" ON public.handwriting_signatures;
CREATE POLICY "Users can insert their own signatures"
  ON public.handwriting_signatures FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own payment methods" ON public.payment_methods;
CREATE POLICY "Users can insert own payment methods"
  ON public.payment_methods FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own signatures" ON public.digital_signatures;
CREATE POLICY "Users can insert own signatures"
  ON public.digital_signatures FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create own support tickets" ON public.support_tickets;
CREATE POLICY "Users can create own support tickets"
  ON public.support_tickets FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert messages on own tickets" ON public.ticket_messages;
CREATE POLICY "Users can insert messages on own tickets"
  ON public.ticket_messages FOR INSERT
  WITH CHECK (
    sender_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.support_tickets st
      WHERE st.id = ticket_messages.ticket_id
        AND st.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create submissions" ON public.site_visit_cost_submissions;
CREATE POLICY "Users can create submissions"
  ON public.site_visit_cost_submissions FOR INSERT
  WITH CHECK (submitted_by = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert call logs" ON public.call_logs;
CREATE POLICY "Users can insert call logs"
  ON public.call_logs FOR INSERT
  WITH CHECK (
    (select auth.uid()) = caller_id OR (select auth.uid()) = callee_id
  );

DROP POLICY IF EXISTS "Users can insert their analytics" ON public.call_analytics;
CREATE POLICY "Users can insert their analytics"
  ON public.call_analytics FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert their call history" ON public.call_history;
CREATE POLICY "Users can insert their call history"
  ON public.call_history FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert their call notes" ON public.call_notes;
CREATE POLICY "Users can insert their call notes"
  ON public.call_notes FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS coordinator_locality_permits_insert_own ON public.coordinator_locality_permits;
CREATE POLICY coordinator_locality_permits_insert_own
  ON public.coordinator_locality_permits FOR INSERT
  WITH CHECK (coordinator_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can manage their own chat participants" ON public.chat_participants;

DROP POLICY IF EXISTS chat_participants_insert_self_or_chat_creator ON public.chat_participants;
CREATE POLICY chat_participants_insert_self_or_chat_creator
  ON public.chat_participants FOR INSERT
  WITH CHECK (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.chats c
      WHERE c.id = chat_participants.chat_id
        AND c.created_by = (select auth.uid())
    )
  );
