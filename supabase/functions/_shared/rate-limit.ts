import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type JsonHeaders = Record<string, string>

export interface RateLimitRule {
  key: string
  windowMs: number
  maxRequests: number
  name: string
}

interface RateLimitResult {
  allowed: boolean
  retryAfterSec: number
}

function normalizeWindowStart(nowMs: number, windowMs: number): string {
  const start = Math.floor(nowMs / windowMs) * windowMs
  return new Date(start).toISOString()
}

function getRetryAfterSec(nowMs: number, windowMs: number): number {
  const elapsed = nowMs % windowMs
  return Math.max(1, Math.ceil((windowMs - elapsed) / 1000))
}

export function getRequestIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }

  const realIp = req.headers.get('x-real-ip')
  if (realIp) {
    return realIp.trim()
  }

  const cfIp = req.headers.get('cf-connecting-ip')
  if (cfIp) {
    return cfIp.trim()
  }

  return 'unknown'
}

export function createRateLimitResponse(message: string, retryAfterSec: number, corsHeaders: JsonHeaders): Response {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
      },
      status: 429,
    }
  )
}

async function checkSingleRule(
  supabaseUrl: string,
  serviceRoleKey: string,
  rule: RateLimitRule
): Promise<RateLimitResult> {
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const nowMs = Date.now()
  const windowStart = normalizeWindowStart(nowMs, rule.windowMs)
  const retryAfterSec = getRetryAfterSec(nowMs, rule.windowMs)

  const { data: existing, error: selectError } = await supabase
    .from('edge_rate_limits')
    .select('limit_key, request_count, window_start')
    .eq('limit_key', rule.key)
    .maybeSingle()

  if (selectError) {
    console.error(`[RateLimit:${rule.name}] select failed`, selectError)
    return { allowed: true, retryAfterSec }
  }

  if (!existing) {
    const { error: insertError } = await supabase
      .from('edge_rate_limits')
      .insert({
        limit_key: rule.key,
        request_count: 1,
        window_start: windowStart,
        updated_at: new Date().toISOString(),
      })

    if (insertError) {
      console.error(`[RateLimit:${rule.name}] insert failed`, insertError)
    }

    return { allowed: true, retryAfterSec }
  }

  const sameWindow = existing.window_start === windowStart
  if (sameWindow && existing.request_count >= rule.maxRequests) {
    return { allowed: false, retryAfterSec }
  }

  const { error: updateError } = await supabase
    .from('edge_rate_limits')
    .update({
      request_count: sameWindow ? existing.request_count + 1 : 1,
      window_start: sameWindow ? existing.window_start : windowStart,
      updated_at: new Date().toISOString(),
    })
    .eq('limit_key', rule.key)

  if (updateError) {
    console.error(`[RateLimit:${rule.name}] update failed`, updateError)
  }

  return { allowed: true, retryAfterSec }
}

export async function enforceRateLimits(
  supabaseUrl: string,
  serviceRoleKey: string,
  rules: RateLimitRule[]
): Promise<RateLimitResult> {
  for (const rule of rules) {
    const result = await checkSingleRule(supabaseUrl, serviceRoleKey, rule)
    if (!result.allowed) {
      return result
    }
  }

  return { allowed: true, retryAfterSec: 0 }
}
