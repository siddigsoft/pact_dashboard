/**
 * google-calendar-event: Create a Google Calendar event for the authenticated user.
 *
 * POST /google-calendar-event
 * Body: {
 *   summary: string,
 *   start: string,        // ISO datetime
 *   end: string,          // ISO datetime
 *   location?: string,
 *   description?: string,
 *   attendeeEmails?: string[],
 * }
 * Returns: { eventId: string } or { error: string }
 *
 * Requires user to have completed Google Calendar OAuth (via google-calendar-oauth edge fn).
 * Token is read from user_integration_tokens where user_id = auth user and service = 'google_calendar'.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY= Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GOOGLE_CLIENT_ID         = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const GOOGLE_CLIENT_SECRET     = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
const GOOGLE_TOKEN_ENDPOINT    = 'https://oauth2.googleapis.com/token'

async function getUserIdFromJwt(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null
  const token = authHeader.replace('Bearer ', '')
  const client = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '')
  const { data: { user } } = await client.auth.getUser(token)
  return user?.id ?? null
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.access_token ?? null
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  // Auth
  const userId = await getUserIdFromJwt(req.headers.get('Authorization'))
  if (!userId) return json({ error: 'Unauthorized' }, 401)

  // Body
  let body: {
    summary: string
    start: string
    end: string
    location?: string
    description?: string
    attendeeEmails?: string[]
  }
  try { body = await req.json() } catch {
    return json({ error: 'Invalid request body' }, 400)
  }
  if (!body.summary || !body.start || !body.end) {
    return json({ error: 'summary, start, and end are required' }, 400)
  }

  // Get stored tokens from user_integration_tokens
  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data: tokenRow, error: tokenErr } = await svc
    .from('user_integration_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('service', 'google_calendar')
    .maybeSingle()

  if (tokenErr || !tokenRow) {
    return json({ error: 'Google Calendar not connected. Please connect in Integrations Settings.' }, 403)
  }

  // Refresh token if expired (or close to expiry)
  let accessToken: string = tokenRow.access_token
  if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date(Date.now() + 60_000)) {
    const refreshed = await refreshAccessToken(tokenRow.refresh_token)
    if (!refreshed) return json({ error: 'Failed to refresh Google token. Please reconnect.' }, 401)
    accessToken = refreshed
    // Update stored token
    await svc.from('user_integration_tokens')
      .update({ access_token: refreshed, expires_at: new Date(Date.now() + 3600_000).toISOString() })
      .eq('user_id', userId)
      .eq('service', 'google_calendar')
  }

  // Build event payload
  const eventPayload: Record<string, unknown> = {
    summary: body.summary,
    start: { dateTime: body.start, timeZone: 'UTC' },
    end:   { dateTime: body.end,   timeZone: 'UTC' },
  }
  if (body.location)    eventPayload.location    = body.location
  if (body.description) eventPayload.description = body.description
  if (body.attendeeEmails?.length) {
    eventPayload.attendees = body.attendeeEmails.map(email => ({ email }))
    eventPayload.guestsCanSeeOtherGuests = true
    eventPayload.sendUpdates = 'all'  // sends email invites to attendees
  }

  // Create event via Google Calendar API
  const calRes = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventPayload),
    },
  )

  if (!calRes.ok) {
    const errBody = await calRes.json().catch(() => ({}))
    console.error('[google-calendar-event] API error:', errBody)
    return json({ error: (errBody as any)?.error?.message ?? `Google API error ${calRes.status}` }, 502)
  }

  const created = await calRes.json()
  return json({ eventId: created.id, htmlLink: created.htmlLink })
})
