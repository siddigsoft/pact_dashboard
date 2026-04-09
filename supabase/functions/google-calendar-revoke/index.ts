/**
 * google-calendar-revoke: Revokes Google Calendar OAuth access for the authenticated user.
 *
 * POST /google-calendar-revoke
 *   Revokes the access token at Google's revocation endpoint,
 *   deletes tokens from user_integration_tokens,
 *   and clears google_calendar_connected in user_integrations.
 *   Requires an authenticated user (Authorization header with JWT).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'

function createServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

async function getUserFromJwt(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null
  const token = authHeader.replace('Bearer ', '')
  const anonClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '')
  const { data: { user } } = await anonClient.auth.getUser(token)
  return user?.id ?? null
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const userId = await getUserFromJwt(req.headers.get('Authorization'))
  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const supabase = createServiceClient()

    // Fetch current tokens to revoke at Google
    const { data: tokenRow } = await supabase
      .from('user_integration_tokens')
      .select('access_token, refresh_token')
      .eq('user_id', userId)
      .eq('provider', 'google_calendar')
      .maybeSingle()

    // Attempt to revoke the token at Google (best-effort; do not block on failure)
    const tokenToRevoke = tokenRow?.refresh_token ?? tokenRow?.access_token
    if (tokenToRevoke) {
      try {
        await fetch(`${GOOGLE_REVOKE_ENDPOINT}?token=${encodeURIComponent(tokenToRevoke)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      } catch (revokeErr) {
        console.warn('Google revocation request failed (continuing):', revokeErr)
      }
    }

    // Delete all stored tokens for this provider
    const { error: deleteTokenError } = await supabase
      .from('user_integration_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('provider', 'google_calendar')

    if (deleteTokenError) {
      console.error('Failed to delete tokens:', deleteTokenError)
      return new Response(
        JSON.stringify({ error: 'Failed to remove stored tokens' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Clear the connection status in the public-facing integrations record
    const { error: updateError } = await supabase
      .from('user_integrations')
      .update({
        google_calendar_connected: false,
        google_calendar_email: null,
      })
      .eq('user_id', userId)

    if (updateError) {
      console.error('Failed to update integration record:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update integration record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('google-calendar-revoke error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
