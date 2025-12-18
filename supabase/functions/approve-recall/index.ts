import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ApproveRecallRequest {
  recallEventId: string;
  action: 'approve' | 'reject';
  notes?: string;
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

    const allowedRoles = ['super_admin', 'admin', 'ict', 'fom', 'hub_supervisor']
    if (!allowedRoles.includes(profile.role)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Not authorized to approve recalls' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body: ApproveRecallRequest = await req.json()
    const { recallEventId, action, notes } = body

    const { data: recallEvent, error: eventError } = await supabase
      .from('recall_events')
      .select('*')
      .eq('recall_event_id', recallEventId)
      .single()

    if (eventError || !recallEvent) {
      return new Response(
        JSON.stringify({ success: false, error: 'Recall event not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (recallEvent.status !== 'pending') {
      return new Response(
        JSON.stringify({ success: false, error: 'Recall event is not pending approval' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'approve') {
      const scopeFilters = recallEvent.scope_filters as Record<string, any> | null
      const affectedSiteIds = recallEvent.affected_site_ids as string[] | null
      const hasFilters = scopeFilters && Object.keys(scopeFilters).some(
        k => Array.isArray(scopeFilters[k]) && scopeFilters[k].length > 0
      )
      
      if (!affectedSiteIds?.length && !hasFilters) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Recall has no affected site IDs or scope filters - cannot approve safely' 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    const now = new Date().toISOString()
    const initiatedAt = new Date(recallEvent.initiated_at)
    const hoursSinceInitiation = (Date.now() - initiatedAt.getTime()) / (1000 * 60 * 60)
    
    let slaStatus: 'on_time' | 'approaching' | 'overdue' = 'on_time'
    if (hoursSinceInitiation > 48) slaStatus = 'overdue'
    else if (hoursSinceInitiation > 24) slaStatus = 'approaching'

    const { error: approvalError } = await supabase
      .from('recall_approvals')
      .insert({
        recall_event_id: recallEventId,
        approver_id: user.id,
        approver_name: profile.full_name || profile.email,
        approver_role: profile.role,
        action,
        notes,
        sla_status: slaStatus,
        acted_at: now
      })

    if (approvalError) {
      console.error('Error creating approval record:', approvalError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create approval record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const newStatus = action === 'approve' ? 'completed' : 'rejected'

    const { error: updateError } = await supabase
      .from('recall_events')
      .update({
        status: newStatus,
        approved_by: user.id,
        approved_by_name: profile.full_name || profile.email,
        approved_at: now,
        completed_at: action === 'approve' ? now : null,
        notes: notes || recallEvent.notes
      })
      .eq('recall_event_id', recallEventId)

    if (updateError) {
      console.error('Error updating recall event:', updateError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update recall event' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'approve') {
      const { data: mmpData, error: mmpError } = await supabase
        .from('mmp_files')
        .select('id, logs')
        .eq('id', recallEvent.mmp_id)
        .single()

      if (!mmpError && mmpData) {
        const scopeFilters = recallEvent.scope_filters as Record<string, any> | null
        const affectedSiteIds = recallEvent.affected_site_ids as string[] | null
        
        let siteQuery = supabase
          .from('mmp_site_entries')
          .update({
            status: 'recalled',
            recalled_at: now,
            recalled_by: profile.full_name || profile.email,
            recall_event_id: recallEventId
          })
          .eq('mmp_id', recallEvent.mmp_id)
          .is('recall_event_id', null)

        const hasFilters = scopeFilters && Object.keys(scopeFilters).some(
          k => Array.isArray(scopeFilters[k]) && scopeFilters[k].length > 0
        )
        
        if (affectedSiteIds?.length) {
          siteQuery = siteQuery.in('id', affectedSiteIds)
        } else if (hasFilters) {
          if (scopeFilters!.siteIds?.length) {
            siteQuery = siteQuery.in('id', scopeFilters!.siteIds)
          }
          if (scopeFilters!.siteNames?.length) {
            siteQuery = siteQuery.in('site_name', scopeFilters!.siteNames)
          }
          if (scopeFilters!.localities?.length) {
            siteQuery = siteQuery.in('locality', scopeFilters!.localities)
          }
          if (scopeFilters!.states?.length) {
            siteQuery = siteQuery.in('state', scopeFilters!.states)
          }
          if (scopeFilters!.activityIds?.length) {
            siteQuery = siteQuery.in('activity_id', scopeFilters!.activityIds)
          }
          if (scopeFilters!.hubs?.length) {
            siteQuery = siteQuery.in('hub', scopeFilters!.hubs)
          }
          if (scopeFilters!.cpIds?.length) {
            siteQuery = siteQuery.in('cp_id', scopeFilters!.cpIds)
          }
        }

        const { error: siteUpdateError, count: updatedCount } = await siteQuery

        if (siteUpdateError) {
          console.error('Error updating site entries:', siteUpdateError)
        }

        const existingLogs = (mmpData.logs as any[]) || []
        const approvalLog = {
          action: 'recall_approved',
          recallEventId,
          tier: recallEvent.tier,
          by: profile.full_name || profile.email,
          byEmail: profile.email,
          date: now,
          affectedSites: updatedCount || recallEvent.affected_site_count,
          scopeFilters,
          notes
        }

        await supabase
          .from('mmp_files')
          .update({ logs: [...existingLogs, approvalLog] })
          .eq('id', recallEvent.mmp_id)
      }
    }

    const { data: initiator } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', recallEvent.initiated_by)
      .single()

    if (initiator) {
      await supabase.from('notifications').insert({
        recipient_id: initiator.id,
        title_en: action === 'approve' ? 'Recall Approved' : 'Recall Rejected',
        title_ar: action === 'approve' ? 'تمت الموافقة على الاستدعاء' : 'تم رفض الاستدعاء',
        message_en: `Your recall request has been ${action === 'approve' ? 'approved' : 'rejected'} by ${profile.full_name || profile.email}. ${notes ? `Notes: ${notes}` : ''}`,
        message_ar: `تم ${action === 'approve' ? 'الموافقة على' : 'رفض'} طلب الاستدعاء الخاص بك بواسطة ${profile.full_name || profile.email}. ${notes ? `ملاحظات: ${notes}` : ''}`,
        action_url: `/mmp/${recallEvent.mmp_id}`,
        entity_id: recallEvent.mmp_id,
        entity_type: 'recall',
        event_type: 'recall_approval',
        status: 'pending',
        priority: 'high'
      })
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        action,
        recallEventId,
        status: newStatus
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Approve recall error:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
