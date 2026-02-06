-- Fix: infinite recursion in support_tickets/ticket_messages RLS
-- Cause: policies queried super_admins directly, which triggered super_admins RLS.
-- Fix: use public.is_super_admin() (SECURITY DEFINER) instead of querying super_admins.

-- =============================================================================
-- support_tickets: drop and recreate admin policies
-- =============================================================================
DROP POLICY IF EXISTS "Admins can view all support tickets" ON public.support_tickets;
CREATE POLICY "Admins can view all support tickets"
  ON public.support_tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND (p.role IN ('admin', 'SuperAdmin') OR public.is_super_admin())
    )
  );

DROP POLICY IF EXISTS "Admins can update all support tickets" ON public.support_tickets;
CREATE POLICY "Admins can update all support tickets"
  ON public.support_tickets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND (p.role IN ('admin', 'SuperAdmin') OR public.is_super_admin())
    )
  )
  WITH CHECK (true);

-- =============================================================================
-- ticket_messages: drop and recreate admin policies
-- =============================================================================
DROP POLICY IF EXISTS "Admins can view all ticket messages" ON public.ticket_messages;
CREATE POLICY "Admins can view all ticket messages"
  ON public.ticket_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND (p.role IN ('admin', 'SuperAdmin') OR public.is_super_admin())
    )
  );

DROP POLICY IF EXISTS "Admins can insert messages on any ticket" ON public.ticket_messages;
CREATE POLICY "Admins can insert messages on any ticket"
  ON public.ticket_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'SuperAdmin'))
      OR public.is_super_admin()
    )
  );
