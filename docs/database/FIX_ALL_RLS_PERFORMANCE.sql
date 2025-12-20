-- ============================================================================
-- FIX ALL RLS PERFORMANCE ISSUES
-- ============================================================================
-- This script replaces all policies using auth.uid() with (SELECT auth.uid())
-- Run section by section to avoid timeouts
-- ============================================================================

-- ============================================================================
-- SECTION 1: APP_VERSIONS
-- ============================================================================
DROP POLICY IF EXISTS "Only admins can update app versions" ON public.app_versions;
CREATE POLICY "Only admins can update app versions" ON public.app_versions FOR UPDATE USING ((EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.user_id = (SELECT auth.uid())) AND (user_roles.role = 'Admin'::text)))));

DROP POLICY IF EXISTS "Only admins can insert app versions" ON public.app_versions;
CREATE POLICY "Only admins can insert app versions" ON public.app_versions FOR INSERT WITH CHECK ((EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.user_id = (SELECT auth.uid())) AND (user_roles.role = 'Admin'::text)))));


-- ============================================================================
-- SECTION 2: AUDIT_LOGS
-- ============================================================================
DROP POLICY IF EXISTS "Admins can read audit logs" ON public.audit_logs;
CREATE POLICY "Admins can read audit logs" ON public.audit_logs FOR SELECT USING ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'superAdmin'::text]))))));

DROP POLICY IF EXISTS "admin_select_all_audit_logs" ON public.audit_logs;
CREATE POLICY "admin_select_all_audit_logs" ON public.audit_logs FOR SELECT USING ((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = (SELECT auth.uid())) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "authenticated_select_own_audit_logs" ON public.audit_logs;
CREATE POLICY "authenticated_select_own_audit_logs" ON public.audit_logs FOR SELECT USING ((actor_id = ((SELECT auth.uid()))::text));

DROP POLICY IF EXISTS "Super admins can read audit logs" ON public.audit_logs;
CREATE POLICY "Super admins can read audit logs" ON public.audit_logs FOR SELECT USING ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'superAdmin'::text)))));

DROP POLICY IF EXISTS "Admins can read all audit logs" ON public.audit_logs;
CREATE POLICY "Admins can read all audit logs" ON public.audit_logs FOR SELECT USING ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['Super Admin'::text, 'Admin'::text, 'ICT'::text]))))));

DROP POLICY IF EXISTS "authenticated_insert_own_audit_logs" ON public.audit_logs;
CREATE POLICY "authenticated_insert_own_audit_logs" ON public.audit_logs FOR INSERT WITH CHECK (((actor_id = ((SELECT auth.uid()))::text) OR (actor_id = 'system'::text)));

DROP POLICY IF EXISTS "Users can insert own audit logs" ON public.audit_logs;
CREATE POLICY "Users can insert own audit logs" ON public.audit_logs FOR INSERT WITH CHECK ((actor_id = ((SELECT auth.uid()))::text));

DROP POLICY IF EXISTS "admin_insert_system_audit_logs" ON public.audit_logs;
CREATE POLICY "admin_insert_system_audit_logs" ON public.audit_logs FOR INSERT WITH CHECK ((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = (SELECT auth.uid())) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));


-- ============================================================================
-- SECTION 3: CHAT TABLES
-- ============================================================================
DROP POLICY IF EXISTS "chat_message_reads_select_participant" ON public.chat_message_reads;
CREATE POLICY "chat_message_reads_select_participant" ON public.chat_message_reads FOR SELECT USING ((EXISTS ( SELECT 1 FROM (chat_messages m JOIN chat_participants cp ON ((cp.chat_id = m.chat_id))) WHERE ((m.id = chat_message_reads.message_id) AND (cp.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "chat_message_reads_update_self" ON public.chat_message_reads;
CREATE POLICY "chat_message_reads_update_self" ON public.chat_message_reads FOR UPDATE USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "chat_message_reads_insert_self" ON public.chat_message_reads;
CREATE POLICY "chat_message_reads_insert_self" ON public.chat_message_reads FOR INSERT WITH CHECK ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can view messages in their chats" ON public.chat_messages;
CREATE POLICY "Users can view messages in their chats" ON public.chat_messages FOR SELECT USING ((EXISTS ( SELECT 1 FROM chat_participants cp WHERE ((cp.chat_id = chat_messages.chat_id) AND (cp.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "chat_messages_select_participant" ON public.chat_messages;
CREATE POLICY "chat_messages_select_participant" ON public.chat_messages FOR SELECT USING ((EXISTS ( SELECT 1 FROM chat_participants cp WHERE ((cp.chat_id = chat_messages.chat_id) AND (cp.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "Users can insert messages in their chats" ON public.chat_messages;
CREATE POLICY "Users can insert messages in their chats" ON public.chat_messages FOR INSERT WITH CHECK ((((SELECT auth.uid()) = sender_id) AND (EXISTS ( SELECT 1 FROM chat_participants cp WHERE ((cp.chat_id = chat_messages.chat_id) AND (cp.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "chat_messages_insert_participant" ON public.chat_messages;
CREATE POLICY "chat_messages_insert_participant" ON public.chat_messages FOR INSERT WITH CHECK (((sender_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1 FROM chat_participants cp WHERE ((cp.chat_id = chat_messages.chat_id) AND (cp.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "Users can update their own messages" ON public.chat_messages;
CREATE POLICY "Users can update their own messages" ON public.chat_messages FOR UPDATE USING ((((SELECT auth.uid()) = sender_id) OR (EXISTS ( SELECT 1 FROM chat_participants cp WHERE ((cp.chat_id = chat_messages.chat_id) AND (cp.user_id = (SELECT auth.uid()))))))) WITH CHECK ((((SELECT auth.uid()) = sender_id) OR (EXISTS ( SELECT 1 FROM chat_participants cp WHERE ((cp.chat_id = chat_messages.chat_id) AND (cp.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "chat_participants_select_self" ON public.chat_participants;
CREATE POLICY "chat_participants_select_self" ON public.chat_participants FOR SELECT USING ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "chat_participants_delete_self_or_owner" ON public.chat_participants;
CREATE POLICY "chat_participants_delete_self_or_owner" ON public.chat_participants FOR DELETE USING (((user_id = (SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM chats c WHERE ((c.id = chat_participants.chat_id) AND (c.created_by = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "chat_participants_select_in_same_chat" ON public.chat_participants;
CREATE POLICY "chat_participants_select_in_same_chat" ON public.chat_participants FOR SELECT USING (((user_id = (SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM chats c WHERE ((c.id = chat_participants.chat_id) AND (c.created_by = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "chat_participants_insert_self_or_owner" ON public.chat_participants;
CREATE POLICY "chat_participants_insert_self_or_owner" ON public.chat_participants FOR INSERT WITH CHECK (((user_id = (SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM chats c WHERE ((c.id = chat_participants.chat_id) AND (c.created_by = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "Users can manage their own chat participants" ON public.chat_participants;
CREATE POLICY "Users can manage their own chat participants" ON public.chat_participants FOR ALL USING (((SELECT auth.uid()) = user_id)) WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "chats_delete_creator" ON public.chats;
CREATE POLICY "chats_delete_creator" ON public.chats FOR DELETE USING ((created_by = (SELECT auth.uid())));

DROP POLICY IF EXISTS "chats_select_creator" ON public.chats;
CREATE POLICY "chats_select_creator" ON public.chats FOR SELECT USING ((created_by = (SELECT auth.uid())));

DROP POLICY IF EXISTS "chats_select_participant" ON public.chats;
CREATE POLICY "chats_select_participant" ON public.chats FOR SELECT USING ((EXISTS ( SELECT 1 FROM chat_participants cp WHERE ((cp.chat_id = chats.id) AND (cp.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "chats_update_creator" ON public.chats;
CREATE POLICY "chats_update_creator" ON public.chats FOR UPDATE USING ((created_by = (SELECT auth.uid()))) WITH CHECK ((created_by = (SELECT auth.uid())));

DROP POLICY IF EXISTS "chats_insert_creator" ON public.chats;
CREATE POLICY "chats_insert_creator" ON public.chats FOR INSERT WITH CHECK ((created_by = (SELECT auth.uid())));


-- ============================================================================
-- SECTION 4: CLASSIFICATION & CHECKLISTS
-- ============================================================================
DROP POLICY IF EXISTS "Admin manage classification_fee_structures" ON public.classification_fee_structures;
CREATE POLICY "Admin manage classification_fee_structures" ON public.classification_fee_structures FOR ALL USING ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'ict'::text, 'financialAdmin'::text]))))));

DROP POLICY IF EXISTS "Admins can view all checklists" ON public.comprehensive_monitoring_checklists;
CREATE POLICY "Admins can view all checklists" ON public.comprehensive_monitoring_checklists FOR SELECT USING ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'supervisor'::text, 'coordinator'::text]))))));

DROP POLICY IF EXISTS "Users can view own checklists" ON public.comprehensive_monitoring_checklists;
CREATE POLICY "Users can view own checklists" ON public.comprehensive_monitoring_checklists FOR SELECT USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete own checklists" ON public.comprehensive_monitoring_checklists;
CREATE POLICY "Users can delete own checklists" ON public.comprehensive_monitoring_checklists FOR DELETE USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own checklists" ON public.comprehensive_monitoring_checklists;
CREATE POLICY "Users can update own checklists" ON public.comprehensive_monitoring_checklists FOR UPDATE USING (((SELECT auth.uid()) = user_id)) WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own checklists" ON public.comprehensive_monitoring_checklists;
CREATE POLICY "Users can insert own checklists" ON public.comprehensive_monitoring_checklists FOR INSERT WITH CHECK (((SELECT auth.uid()) = user_id));


-- ============================================================================
-- SECTION 5: COST & APPROVAL
-- ============================================================================
DROP POLICY IF EXISTS "cost_adjustment_audit_admin_create" ON public.cost_adjustment_audit;
CREATE POLICY "cost_adjustment_audit_admin_create" ON public.cost_adjustment_audit FOR INSERT WITH CHECK ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'financialAdmin'::text, 'ict'::text]))))));

DROP POLICY IF EXISTS "Users can view relevant history" ON public.cost_approval_history;
CREATE POLICY "Users can view relevant history" ON public.cost_approval_history FOR SELECT USING ((EXISTS ( SELECT 1 FROM site_visit_cost_submissions WHERE ((site_visit_cost_submissions.id = cost_approval_history.submission_id) AND ((site_visit_cost_submissions.submitted_by = (SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.user_id = (SELECT auth.uid())) AND (lower(user_roles.role) = ANY (ARRAY['admin'::text, 'financialadmin'::text, 'fom'::text, 'ict'::text]))))))))));


-- ============================================================================
-- SECTION 6: DASHBOARD & VISIBILITY SETTINGS
-- ============================================================================
DROP POLICY IF EXISTS "dashboard_settings_delete_own" ON public.dashboard_settings;
CREATE POLICY "dashboard_settings_delete_own" ON public.dashboard_settings FOR DELETE USING ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "dashboard_settings_select_own" ON public.dashboard_settings;
CREATE POLICY "dashboard_settings_select_own" ON public.dashboard_settings FOR SELECT USING ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "dashboard_settings_insert_own" ON public.dashboard_settings;
CREATE POLICY "dashboard_settings_insert_own" ON public.dashboard_settings FOR INSERT WITH CHECK ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "dashboard_settings_update_own" ON public.dashboard_settings;
CREATE POLICY "dashboard_settings_update_own" ON public.dashboard_settings FOR UPDATE USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "dashboard_settings_modify_own" ON public.dashboard_settings;
CREATE POLICY "dashboard_settings_modify_own" ON public.dashboard_settings FOR ALL USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "data_visibility_settings_delete_own" ON public.data_visibility_settings;
CREATE POLICY "data_visibility_settings_delete_own" ON public.data_visibility_settings FOR DELETE USING ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "data_visibility_settings_select_own" ON public.data_visibility_settings;
CREATE POLICY "data_visibility_settings_select_own" ON public.data_visibility_settings FOR SELECT USING ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "data_visibility_settings_insert_own" ON public.data_visibility_settings;
CREATE POLICY "data_visibility_settings_insert_own" ON public.data_visibility_settings FOR INSERT WITH CHECK ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "data_visibility_settings_update_own" ON public.data_visibility_settings;
CREATE POLICY "data_visibility_settings_update_own" ON public.data_visibility_settings FOR UPDATE USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "data_visibility_settings_modify_own" ON public.data_visibility_settings;
CREATE POLICY "data_visibility_settings_modify_own" ON public.data_visibility_settings FOR ALL USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));


-- ============================================================================
-- SECTION 7: DELETION AUDIT LOG
-- ============================================================================
DROP POLICY IF EXISTS "deletion_audit_log_view" ON public.deletion_audit_log;
CREATE POLICY "deletion_audit_log_view" ON public.deletion_audit_log FOR SELECT USING ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'financialAdmin'::text, 'ict'::text]))))));

DROP POLICY IF EXISTS "deletion_audit_log_super_admin_create" ON public.deletion_audit_log;
CREATE POLICY "deletion_audit_log_super_admin_create" ON public.deletion_audit_log FOR INSERT WITH CHECK (((deleted_by = (SELECT auth.uid())) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'ict'::text])))))));


-- ============================================================================
-- SECTION 8: DOWN PAYMENT REQUESTS
-- ============================================================================
DROP POLICY IF EXISTS "down_payment_requests_supervisor_update" ON public.down_payment_requests;
CREATE POLICY "down_payment_requests_supervisor_update" ON public.down_payment_requests FOR UPDATE USING ((((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['supervisor'::text, 'hubSupervisor'::text])) AND ((profiles.hub_id = down_payment_requests.hub_id) OR (profiles.hub_id IS NULL)))))) AND (status = ANY (ARRAY['pending_supervisor'::text, 'pending_admin'::text]))));

DROP POLICY IF EXISTS "down_payment_requests_user_view" ON public.down_payment_requests;
CREATE POLICY "down_payment_requests_user_view" ON public.down_payment_requests FOR SELECT USING ((requested_by = (SELECT auth.uid())));

DROP POLICY IF EXISTS "down_payment_requests_admin_all" ON public.down_payment_requests;
CREATE POLICY "down_payment_requests_admin_all" ON public.down_payment_requests FOR ALL USING ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'financialAdmin'::text, 'ict'::text]))))));

DROP POLICY IF EXISTS "down_payment_requests_supervisor_view" ON public.down_payment_requests;
CREATE POLICY "down_payment_requests_supervisor_view" ON public.down_payment_requests FOR SELECT USING ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['supervisor'::text, 'hubSupervisor'::text])) AND ((profiles.hub_id = down_payment_requests.hub_id) OR (profiles.hub_id IS NULL))))));


-- ============================================================================
-- SECTION 9: FEEDBACK
-- ============================================================================
DROP POLICY IF EXISTS "feedback_select_own" ON public.feedback;
CREATE POLICY "feedback_select_own" ON public.feedback FOR SELECT USING ((((SELECT auth.uid()) = user_id) OR ((SELECT auth.uid()) IS NULL)));

DROP POLICY IF EXISTS "feedback_select_admin" ON public.feedback;
CREATE POLICY "feedback_select_admin" ON public.feedback FOR SELECT USING ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'superAdmin'::text, 'ictSupport'::text]))))));

DROP POLICY IF EXISTS "feedback_update_admin" ON public.feedback;
CREATE POLICY "feedback_update_admin" ON public.feedback FOR UPDATE USING ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'superAdmin'::text, 'ictSupport'::text]))))));


-- ============================================================================
-- SECTION 10: HANDWRITING SIGNATURES
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own signatures" ON public.handwriting_signatures;
CREATE POLICY "Users can view their own signatures" ON public.handwriting_signatures FOR SELECT USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update their own signatures" ON public.handwriting_signatures;
CREATE POLICY "Users can update their own signatures" ON public.handwriting_signatures FOR UPDATE USING (((SELECT auth.uid()) = user_id));


-- ============================================================================
-- SECTION 11: INCIDENT REPORTS
-- ============================================================================
DROP POLICY IF EXISTS "Users can update their own incident reports" ON public.incident_reports;
CREATE POLICY "Users can update their own incident reports" ON public.incident_reports FOR UPDATE USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view their own incident reports" ON public.incident_reports;
CREATE POLICY "Users can view their own incident reports" ON public.incident_reports FOR SELECT USING (((SELECT auth.uid()) = user_id));


-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT COUNT(*) as remaining_unoptimized
FROM pg_policies 
WHERE schemaname = 'public'
AND (
  (qual::text LIKE '%auth.uid()%' AND qual::text NOT LIKE '%(SELECT auth.uid())%')
  OR (with_check::text LIKE '%auth.uid()%' AND with_check::text NOT LIKE '%(SELECT auth.uid())%')
);
