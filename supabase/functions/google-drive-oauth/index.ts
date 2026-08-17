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
const REDIRECT_URI = `${APP_URL}/integrations?drive_callback=1`

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo'
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
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

async function refreshGoogleAccessToken(refreshToken: string) {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!response.ok) throw new Error('Failed to refresh Google Drive token')
  return await response.json() as { access_token: string; expires_in?: number }
}

async function getValidDriveAccessToken(userId: string): Promise<string | null> {
  const supabase = createServiceClient()
  const { data: tokenRow } = await supabase
    .from('user_integration_tokens')
    .select('access_token, refresh_token, token_expiry')
    .eq('user_id', userId)
    .eq('provider', 'google_drive')
    .maybeSingle()

  if (!tokenRow?.access_token) return null

  let accessToken = tokenRow.access_token as string
  const expiresAt = tokenRow.token_expiry ? new Date(tokenRow.token_expiry as string).getTime() : null
  if (expiresAt && Date.now() > expiresAt - 60_000 && tokenRow.refresh_token) {
    const refreshed = await refreshGoogleAccessToken(tokenRow.refresh_token as string)
    accessToken = refreshed.access_token
    await supabase
      .from('user_integration_tokens')
      .update({
        access_token: accessToken,
        token_expiry: refreshed.expires_in
          ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
          : null,
      })
      .eq('user_id', userId)
      .eq('provider', 'google_drive')
  }

  return accessToken
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const url = new URL(req.url)
  const action = url.searchParams.get('action') ?? url.pathname.split('/').pop()

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return new Response(JSON.stringify({ error: 'Google OAuth is not configured.' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    if (action === 'initiate') {
      const userId = await getUserFromJwt(req.headers.get('Authorization'))
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const state = btoa(JSON.stringify({ userId, nonce: crypto.randomUUID() }))
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID)
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', SCOPES)
      authUrl.searchParams.set('access_type', 'offline')
      authUrl.searchParams.set('prompt', 'consent')
      authUrl.searchParams.set('state', state)

      return new Response(JSON.stringify({ authorization_url: authUrl.toString() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'token') {
      const userId = await getUserFromJwt(req.headers.get('Authorization'))
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const accessToken = await getValidDriveAccessToken(userId)
      if (!accessToken) {
        return new Response(JSON.stringify({ error: 'Google Drive is not connected. Connect it in Integrations first.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ access_token: accessToken }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'callback') {
      const callbackUserId = await getUserFromJwt(req.headers.get('Authorization'))
      if (!callbackUserId) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const body = await req.json() as { code: string; state: string }
      if (!body.code || !body.state) {
        return new Response(JSON.stringify({ error: 'Missing code/state' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      let userId: string
      try {
        const decoded = JSON.parse(atob(body.state)) as { userId: string }
        userId = decoded.userId
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid state' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (callbackUserId !== userId) {
        return new Response(JSON.stringify({ error: 'State user mismatch' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: body.code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      })

      if (!tokenResponse.ok) {
        return new Response(JSON.stringify({ error: 'Failed to exchange authorization code' }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const tokens = await tokenResponse.json() as {
        access_token: string
        refresh_token?: string
        expires_in?: number
        scope?: string
      }

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

      const { error: tokenError } = await supabase
        .from('user_integration_tokens')
        .upsert({
          user_id: userId,
          provider: 'google_drive',
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token ?? null,
          token_expiry: tokenExpiry,
          scope: tokens.scope ?? SCOPES,
        }, { onConflict: 'user_id,provider' })
      if (tokenError) throw tokenError

      const { error: integrationError } = await supabase
        .from('user_integrations')
        .upsert({
          user_id: userId,
          google_drive_connected: true,
          google_drive_email: userInfo.email ?? null,
        }, { onConflict: 'user_id' })
      if (integrationError) throw integrationError

      return new Response(JSON.stringify({ success: true, google_drive_email: userInfo.email ?? null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('google-drive-oauth error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

