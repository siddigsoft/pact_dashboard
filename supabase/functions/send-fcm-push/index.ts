import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PushPayload {
  user_ids?: string[]
  fcm_tokens?: string[]
  title: string
  body: string
  data?: Record<string, string>
  notification_id?: string
  action_url?: string
  priority?: 'normal' | 'high'
}

async function getAccessToken(serviceAccount: Record<string, string>): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const headerB64 = encode(header)
  const payloadB64 = encode(payload)
  const unsigned = `${headerB64}.${payloadB64}`

  // Import the private key
  const pemKey = serviceAccount.private_key.replace(/\\n/g, '\n')
  const pemBody = pemKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const binaryKey = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsigned)
  )

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${unsigned}.${signatureB64}`

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenResponse.json()
  if (!tokenData.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`)
  }
  return tokenData.access_token
}

async function sendFCMMessage(
  accessToken: string,
  projectId: string,
  fcmToken: string,
  title: string,
  body: string,
  data: Record<string, string> = {},
  priority: 'normal' | 'high' = 'high'
): Promise<{ success: boolean; error?: string }> {
  const message = {
    message: {
      token: fcmToken,
      notification: { title, body },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: priority === 'high' ? 'HIGH' : 'NORMAL',
        notification: {
          sound: 'default',
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    },
  }

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    }
  )

  if (!response.ok) {
    const errorData = await response.json()
    const errorCode = errorData?.error?.details?.[0]?.errorCode || ''
    // Token is invalid/unregistered — caller should clean it up
    if (errorCode === 'UNREGISTERED' || errorCode === 'INVALID_ARGUMENT') {
      return { success: false, error: `TOKEN_INVALID:${fcmToken}` }
    }
    return { success: false, error: JSON.stringify(errorData) }
  }

  return { success: true }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const serviceAccountRaw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON')
    if (!serviceAccountRaw) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firebase service account not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const serviceAccount = JSON.parse(serviceAccountRaw)
    const projectId = serviceAccount.project_id

    if (!projectId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid service account: missing project_id' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const payload: PushPayload = await req.json()
    const { user_ids = [], fcm_tokens: directTokens = [], title, body, data = {}, notification_id, action_url, priority = 'high' } = payload

    if (!title || !body) {
      return new Response(
        JSON.stringify({ success: false, error: 'title and body are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabase = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Collect FCM tokens from user profiles
    let allTokens: string[] = [...directTokens]

    if (user_ids.length > 0) {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, fcm_tokens')
        .in('id', user_ids)

      if (!error && profiles) {
        for (const profile of profiles) {
          const tokens = profile.fcm_tokens as string[] | null
          if (tokens && tokens.length > 0) {
            allTokens.push(...tokens)
          }
        }
      }
    }

    // Deduplicate
    allTokens = [...new Set(allTokens)]

    if (allTokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No FCM tokens found for recipients', sent: 0, failed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get OAuth access token
    const accessToken = await getAccessToken(serviceAccount)

    const notificationData: Record<string, string> = {
      ...data,
    }
    if (notification_id) notificationData.notification_id = notification_id
    if (action_url) notificationData.action_url = action_url

    // Send to all tokens in parallel
    const results = await Promise.allSettled(
      allTokens.map(token =>
        sendFCMMessage(accessToken, projectId, token, title, body, notificationData, priority)
      )
    )

    let sent = 0
    let failed = 0
    const invalidTokens: string[] = []

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          sent++
        } else {
          failed++
          // Track invalid tokens for cleanup
          if (result.value.error?.startsWith('TOKEN_INVALID:')) {
            const badToken = result.value.error.replace('TOKEN_INVALID:', '')
            invalidTokens.push(badToken)
          }
          console.error('FCM send failed:', result.value.error)
        }
      } else {
        failed++
        console.error('FCM send rejected:', result.reason)
      }
    }

    // Clean up invalid tokens from profiles
    if (invalidTokens.length > 0 && user_ids.length > 0) {
      try {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, fcm_tokens')
          .in('id', user_ids)

        if (profiles) {
          for (const profile of profiles) {
            const tokens = (profile.fcm_tokens as string[]) || []
            const cleaned = tokens.filter(t => !invalidTokens.includes(t))
            if (cleaned.length !== tokens.length) {
              await supabase
                .from('profiles')
                .update({ fcm_tokens: cleaned })
                .eq('id', profile.id)
            }
          }
        }
      } catch (cleanupErr) {
        console.warn('Failed to clean up invalid tokens:', cleanupErr)
      }
    }

    console.log(`FCM push: ${sent} sent, ${failed} failed, ${invalidTokens.length} invalid tokens cleaned`)

    return new Response(
      JSON.stringify({ success: true, sent, failed, tokens_targeted: allTokens.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('send-fcm-push error:', error)
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message || 'Unexpected error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
