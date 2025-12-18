import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ProcessRecallRequest {
  recallEventId: string;
  mmpId: string;
  tier: 'admin_to_fom' | 'fom_to_coordinator' | 'coordinator_to_collector';
  scopeType: string;
  scopeFilters?: Record<string, any>;
  reason?: string;
  isForceRecall?: boolean;
  recoveryMethod?: 'deduct_future' | 'cash_return' | 'write_off';
  affectedSiteIds: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const allowedRoles = ['super_admin', 'admin', 'ict', 'fom', 'hub_supervisor', 'coordinator']
    if (!allowedRoles.includes(profile.role)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Not authorized to initiate recalls' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body: ProcessRecallRequest = await req.json()
    const { 
      recallEventId, 
      mmpId, 
      tier, 
      scopeType, 
      scopeFilters, 
      reason, 
      isForceRecall,
      recoveryMethod,
      affectedSiteIds 
    } = body

    const tierPermissions: Record<string, string[]> = {
      admin_to_fom: ['super_admin', 'admin', 'ict'],
      fom_to_coordinator: ['super_admin', 'admin', 'ict', 'fom', 'hub_supervisor'],
      coordinator_to_collector: ['super_admin', 'admin', 'ict', 'fom', 'hub_supervisor', 'coordinator']
    }

    const allowedForTier = tierPermissions[tier] || []
    if (!allowedForTier.includes(profile.role)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Role ${profile.role} cannot initiate ${tier} recalls` 
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const forceRecallRoles = ['super_admin', 'admin']
    if (isForceRecall && !forceRecallRoles.includes(profile.role)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Only Super Admin and Admin can perform force recalls' 
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: mmpData, error: mmpError } = await supabase
      .from('mmp_files')
      .select('*, mmp_site_entries(*)')
      .eq('id', mmpId)
      .single()

    if (mmpError || !mmpData) {
      return new Response(
        JSON.stringify({ success: false, error: 'MMP not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { error: eventError } = await supabase
      .from('recall_events')
      .insert({
        recall_event_id: recallEventId,
        mmp_id: mmpId,
        tier,
        scope_type: scopeType,
        scope_filters: scopeFilters || null,
        affected_site_ids: affectedSiteIds,
        reason,
        is_force_recall: isForceRecall || false,
        status: isForceRecall ? 'completed' : 'pending',
        affected_site_count: affectedSiteIds.length,
        recovery_method: recoveryMethod,
        initiated_by: user.id,
        initiated_by_name: profile.full_name || profile.email,
        previous_state: {
          workflow: mmpData.workflow
        }
      })

    if (eventError) {
      console.error('Error creating recall event:', eventError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create recall event' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (isForceRecall && affectedSiteIds.length > 0) {
      const { error: updateError } = await supabase
        .from('mmp_site_entries')
        .update({
          status: 'recalled',
          recalled_at: new Date().toISOString(),
          recalled_by: profile.full_name || profile.email,
          recall_event_id: recallEventId
        })
        .in('id', affectedSiteIds)

      if (updateError) {
        console.error('Error updating site entries:', updateError)
      }

      if (recoveryMethod) {
        const recoveryRecords = affectedSiteIds.map(siteId => ({
          recall_event_id: recallEventId,
          mmp_id: mmpId,
          site_entry_id: siteId,
          original_amount: 0,
          recovery_method: recoveryMethod,
          status: 'pending'
        }))

        const { error: recoveryError } = await supabase
          .from('recovery_records')
          .insert(recoveryRecords)

        if (recoveryError) {
          console.error('Error creating recovery records:', recoveryError)
        }
      }
    }

    const existingLogs = (mmpData.logs as any[]) || []
    const recallLog = {
      action: isForceRecall ? 'recall_completed' : 'recall_initiated',
      recallEventId,
      tier,
      by: profile.full_name || profile.email,
      byEmail: profile.email,
      date: new Date().toISOString(),
      scopeType,
      affectedSites: affectedSiteIds.length,
      reason,
      isForceRecall
    }

    const { error: logError } = await supabase
      .from('mmp_files')
      .update({ logs: [...existingLogs, recallLog] })
      .eq('id', mmpId)

    if (logError) {
      console.error('Error updating MMP logs:', logError)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        recallEventId,
        affectedSites: affectedSiteIds.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Process recall error:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
