import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing or invalid authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    if (!token || token === 'null' || token === 'undefined') {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        headers: { Authorization: `Bearer ${token}` }
      }
    })

    const { data: { user: currentUser }, error: authError } = await supabaseAnon.auth.getUser(token)
    
    if (authError || !currentUser) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired session' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const { currentPassword, newPassword } = await req.json()

    if (!currentPassword || !newPassword) {
      return new Response(
        JSON.stringify({ success: false, error: 'Current password and new password are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (newPassword.length < 8) {
      return new Response(
        JSON.stringify({ success: false, error: 'New password must be at least 8 characters' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const supabaseVerify = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const { error: verifyError } = await supabaseVerify.auth.signInWithPassword({
      email: currentUser.email!,
      password: currentPassword
    })

    if (verifyError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Current password is incorrect' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(currentUser.id, {
      password: newPassword
    })

    if (updateError) {
      console.error('Password update error:', updateError)
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    try {
      await supabaseAdmin.from('audit_logs').insert({
        action: 'password_change',
        entity_type: 'user',
        entity_name: currentUser.email,
        description: `User ${currentUser.email} changed their password`,
        success: true,
        actor_id: currentUser.id,
        actor_name: currentUser.email,
        metadata: {
          method: 'self_service',
          timestamp: new Date().toISOString()
        }
      })
    } catch (logError) {
      console.error('Audit log failed:', logError)
    }

    console.log(`Password change successful for ${currentUser.email}`)

    return new Response(
      JSON.stringify({ success: true, message: 'Password changed successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'An unexpected error occurred' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
