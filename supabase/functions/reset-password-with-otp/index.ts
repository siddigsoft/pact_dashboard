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
    const { email, otp, newPassword } = await req.json()

    if (!email || !otp || !newPassword) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email, OTP, and new password are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (newPassword.length < 6) {
      return new Response(
        JSON.stringify({ success: false, error: 'Password must be at least 6 characters' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    console.log(`Password reset attempt for email: ${email.toLowerCase()}, OTP provided: ${otp}`)

    // Verify the OTP first - try to find any token for this email
    const { data: storedToken, error: tokenError } = await supabase
      .from('password_reset_tokens')
      .select('*')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    console.log('Token lookup result:', { storedToken, tokenError })

    if (tokenError) {
      console.error('Token lookup error:', tokenError)
      return new Response(
        JSON.stringify({ success: false, error: 'Database error. Please try again.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    if (!storedToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'No reset code found for this email. Please request a new one.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (storedToken.used) {
      return new Response(
        JSON.stringify({ success: false, error: 'This reset code has already been used. Please request a new one.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const isExpired = new Date(storedToken.expires_at) < new Date()
    if (isExpired) {
      return new Response(
        JSON.stringify({ success: false, error: 'Reset code has expired. Please request a new one.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (storedToken.otp !== otp) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid verification code.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Find the user by email
    const { data: users, error: userLookupError } = await supabase.auth.admin.listUsers()
    
    if (userLookupError) {
      console.error('User lookup error:', userLookupError)
      return new Response(
        JSON.stringify({ success: false, error: 'Could not find user account.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const targetUser = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    
    if (!targetUser) {
      return new Response(
        JSON.stringify({ success: false, error: 'No account found with this email.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Update the password
    const { error: updateError } = await supabase.auth.admin.updateUserById(targetUser.id, {
      password: newPassword
    })

    if (updateError) {
      console.error('Password update error:', updateError)
      return new Response(
        JSON.stringify({ success: false, error: updateError.message || 'Failed to update password.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Mark the OTP as used
    await supabase
      .from('password_reset_tokens')
      .update({ used: true })
      .eq('email', email.toLowerCase())

    // Log the password reset
    try {
      await supabase.from('audit_logs').insert({
        action: 'password_reset',
        entity_type: 'user',
        entity_name: email,
        description: `Password reset completed for ${email}`,
        success: true,
        actor_id: targetUser.id,
        actor_name: email,
        metadata: {
          method: 'otp_verification',
          timestamp: new Date().toISOString()
        }
      })
    } catch (logError) {
      console.error('Audit log failed:', logError)
    }

    console.log(`Password reset successful for ${email}`)

    return new Response(
      JSON.stringify({ success: true, message: 'Password has been reset successfully.' }),
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
