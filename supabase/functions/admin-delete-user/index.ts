import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createRateLimitResponse, enforceRateLimits, getRequestIp } from '../_shared/rate-limit.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Return a 200 JSON response so the caller always receives the structured body.
 *  Non-2xx responses cause supabase.functions.invoke to set a generic fnError
 *  message that loses the specific reason — use HTTP 200 + success:false for all
 *  expected business-logic failures so the frontend can display them clearly.
 *  Reserve non-2xx for infrastructure / auth errors only. */
const ok = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  })

const httpErr = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return httpErr({ success: false, error: 'Server configuration error' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return httpErr({ success: false, error: 'Missing or invalid authorization header' }, 401)
    }

    const token = authHeader.replace('Bearer ', '')
    if (!token || token === 'null' || token === 'undefined') {
      return httpErr({ success: false, error: 'Invalid token' }, 401)
    }

    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    const { data: { user: callerUser }, error: authError } = await supabaseAnon.auth.getUser(token)
    if (authError || !callerUser) {
      return httpErr({ success: false, error: 'Invalid or expired token' }, 401)
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .single()

    if (profileError || !callerProfile) {
      return httpErr({ success: false, error: 'Could not verify caller permissions' }, 403)
    }

    const { data: callerRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUser.id)

    // Only Super Admins may permanently delete auth accounts.
    const allowedRoles = ['superAdmin']
    const hasPermission =
      allowedRoles.includes(callerProfile.role) ||
      (callerRoles && callerRoles.some(r => allowedRoles.includes(r.role as string)))

    if (!hasPermission) {
      return httpErr(
        { success: false, error: 'Insufficient permissions. Only Super Admins can permanently delete user accounts.' },
        403
      )
    }

    const requestIp = getRequestIp(req)
    const rateLimit = await enforceRateLimits(supabaseUrl, serviceRoleKey, [
      {
        key: `admin-delete-user:ip:${requestIp}`,
        windowMs: 60_000,
        maxRequests: 20,
        name: 'admin_delete_user_ip',
      },
      {
        key: `admin-delete-user:caller:${callerUser.id}`,
        windowMs: 60_000,
        maxRequests: 10,
        name: 'admin_delete_user_caller',
      },
    ])

    if (!rateLimit.allowed) {
      return createRateLimitResponse('Too many delete requests. Please try again shortly.', rateLimit.retryAfterSec, corsHeaders)
    }

    const { userId } = await req.json()

    if (!userId) {
      // Business logic failure — return 200 so the caller receives the error text.
      return ok({ success: false, error: 'Missing userId in request body.' })
    }

    if (userId === callerUser.id) {
      // Business logic failure — return 200 with a clear message.
      return ok({ success: false, error: 'You cannot delete your own account.' })
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteError) {
      console.error('Auth delete error:', deleteError)

      const isNotFound =
        deleteError.message?.toLowerCase().includes('not found') ||
        deleteError.message?.toLowerCase().includes('user not found') ||
        (deleteError as any).status === 404

      // Business logic failures — return 200 so the body reaches the frontend.
      if (isNotFound) {
        return ok({
          success: false,
          error: 'Auth account not found for this user. The profile has been removed but the auth record may have already been deleted separately.',
        })
      }

      return ok({ success: false, error: deleteError.message })
    }

    return ok({ success: true, message: 'User auth account deleted successfully' })
  } catch (error) {
    console.error('Unexpected error:', error)
    return httpErr(
      { success: false, error: error.message || 'An unexpected error occurred' },
      500
    )
  }
})
