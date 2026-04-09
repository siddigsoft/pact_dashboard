/**
 * google-calendar-oauth: Handles Google Calendar OAuth initiation and callback.
 *
 * POST /google-calendar-oauth/initiate
 *   Generates and returns the Google OAuth authorization URL.
 *   Requires an authenticated user (Authorization header with JWT).
 *
 * POST /google-calendar-oauth/callback
 *   Receives the authorization code, exchanges it for tokens via Google,
 *   stores tokens securely in user_integration_tokens (service_role only),
 *   and marks google_calendar_connected = true in user_integrations.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.pactorg.com'
const REDIRECT_URI = `${APP_URL}/integrations?calendar_callback=1`

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo'
const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

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

  const url = new URL(req.url)
  const action = url.searchParams.get('action') ?? url.pathname.split('/').pop()

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return new Response(
      JSON.stringify({ error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    if (action === 'initiate') {
      const userId = await getUserFromJwt(req.headers.get('Authorization'))
      if (!userId) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Encode user_id in the state parameter to verify on callback
      const state = btoa(JSON.stringify({ userId, nonce: crypto.randomUUID() }))

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID)
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', SCOPES)
      authUrl.searchParams.set('access_type', 'offline')
      authUrl.searchParams.set('prompt', 'consent')
      authUrl.searchParams.set('state', state)

      return new Response(
        JSON.stringify({ authorization_url: authUrl.toString() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'callback') {
      // Require the caller to be authenticated — this is the key authorization check.
      // The frontend sends the user's JWT in the Authorization header when posting
      // the callback, so we can verify the caller's identity server-side and confirm
      // it matches the userId embedded in state. This prevents forged-state attacks.
      const callbackUserId = await getUserFromJwt(req.headers.get('Authorization'))
      if (!callbackUserId) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized — valid user session required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const body = await req.json() as { code: string; state: string }
      const { code, state } = body

      if (!code || !state) {
        return new Response(
          JSON.stringify({ error: 'Missing code or state' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      let userId: string
      try {
        const decoded = JSON.parse(atob(state)) as { userId: string }
        userId = decoded.userId
      } catch {
        return new Response(
          JSON.stringify({ error: 'Invalid state parameter' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Critical: reject if the authenticated user does not match the userId in state.
      // This prevents an attacker from using a forged or stolen state value to
      // bind a Google token to a different user's account.
      if (callbackUserId !== userId) {
        return new Response(
          JSON.stringify({ error: 'State user mismatch — possible CSRF or replay attack' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Exchange authorization code for tokens
      const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      })

      if (!tokenResponse.ok) {
        const tokenError = await tokenResponse.text()
        console.error('Token exchange failed:', tokenError)
        return new Response(
          JSON.stringify({ error: 'Failed to exchange authorization code', detail: tokenError }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const tokens = await tokenResponse.json() as {
        access_token: string
        refresh_token?: string
        expires_in?: number
        scope?: string
      }

      // Fetch connected Google account email
      const userInfoResponse = await fetch(GOOGLE_USERINFO_ENDPOINT, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      const userInfo = userInfoResponse.ok
        ? (await userInfoResponse.json() as { email?: string })
        : {}

      const tokenExpiry = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null

      const supabase = createServiceClient()

      // Store tokens in server-only table (service_role bypasses RLS)
      const { error: tokenError } = await supabase
        .from('user_integration_tokens')
        .upsert(
          {
            user_id: userId,
            provider: 'google_calendar',
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token ?? null,
            token_expiry: tokenExpiry,
            scope: tokens.scope ?? SCOPES,
          },
          { onConflict: 'user_id,provider' }
        )

      if (tokenError) {
        console.error('Failed to store tokens:', tokenError)
        return new Response(
          JSON.stringify({ error: 'Failed to store integration tokens' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Update integration record with connected status (non-sensitive data only)
      const { error: integrationError } = await supabase
        .from('user_integrations')
        .upsert(
          {
            user_id: userId,
            google_calendar_connected: true,
            google_calendar_email: userInfo.email ?? null,
          },
          { onConflict: 'user_id' }
        )

      if (integrationError) {
        console.error('Failed to update integration record:', integrationError)
        return new Response(
          JSON.stringify({ error: 'Failed to update integration record' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({
          success: true,
          google_calendar_email: userInfo.email ?? null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use ?action=initiate or ?action=callback' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('google-calendar-oauth error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
