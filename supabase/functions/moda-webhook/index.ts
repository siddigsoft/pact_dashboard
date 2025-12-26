import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface GPSData {
  latitude: number | null
  longitude: number | null
  altitude: number | null
  precision: number | null
}

interface ParsedSubmission {
  submissionId: string
  siteId: string | null
  siteName: string | null
  state: string | null
  locality: string | null
  siteGps: GPSData
  residenceGps: GPSData
  rawData: Record<string, any>
  formId: string | null
  submittedAt: string | null
}

const GPS_COLUMN_PATTERNS = {
  latitude: [/[/_]A06[/_]latitude$/i, /A06.*latitude/i, /site.*latitude/i, /_latitude$/i, /^latitude$/i, /^lat$/i, /_lat$/i, /:latitude$/i],
  longitude: [/[/_]A06[/_]longitude$/i, /A06.*longitude/i, /site.*longitude/i, /_longitude$/i, /^longitude$/i, /^lng$/i, /^lon$/i, /_lon$/i, /_lng$/i, /:longitude$/i],
  altitude: [/[/_]A06[/_]altitude$/i, /A06.*altitude/i, /site.*altitude/i, /_altitude$/i, /^altitude$/i, /^alt$/i, /_alt$/i, /:altitude$/i],
  precision: [/[/_]A06[/_]precision$/i, /A06.*precision/i, /site.*precision/i, /_precision$/i, /^precision$/i, /^accuracy$/i, /_accuracy$/i, /:precision$/i, /:accuracy$/i],
  combined: [/gps.*coordinates.*site/i, /site.*gps/i, /gps.*coordinates/i, /^gps$/i, /coordinates/i, /geopoint/i, /[/_]A06$/i],
  residenceLatitude: [/[/_]A05[/_]latitude$/i, /A05.*latitude/i, /residence.*latitude/i],
  residenceLongitude: [/[/_]A05[/_]longitude$/i, /A05.*longitude/i, /residence.*longitude/i],
  residenceAltitude: [/[/_]A05[/_]altitude$/i, /A05.*altitude/i, /residence.*altitude/i],
  residencePrecision: [/[/_]A05[/_]precision$/i, /A05.*precision/i, /residence.*precision/i],
  residenceCombined: [/gps.*coordinates.*residence/i, /residence.*gps/i, /residence.*coordinates/i, /[/_]A05$/i],
}

function findFieldByPatterns(data: Record<string, any>, patterns: RegExp[]): { key: string; value: any } | null {
  const keys = Object.keys(data)
  for (const pattern of patterns) {
    for (const key of keys) {
      if (pattern.test(key)) {
        return { key, value: data[key] }
      }
    }
  }
  return null
}

function parseGPSString(gpsValue: any): GPSData {
  const result: GPSData = { latitude: null, longitude: null, altitude: null, precision: null }
  
  if (!gpsValue) return result
  
  if (typeof gpsValue === 'string') {
    const parts = gpsValue.trim().split(/\s+/)
    if (parts.length >= 2) {
      const lat = parseFloat(parts[0])
      const lng = parseFloat(parts[1])
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        result.latitude = lat
        result.longitude = lng
        if (parts.length >= 3) result.altitude = parseFloat(parts[2]) || null
        if (parts.length >= 4) result.precision = parseFloat(parts[3]) || null
      }
    }
  }
  
  return result
}

function parseNumericValue(value: any): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = parseFloat(String(value))
  return isNaN(num) ? null : num
}

function extractGPSFromSubmission(data: Record<string, any>, type: 'site' | 'residence'): GPSData {
  const patterns = type === 'site' ? {
    lat: GPS_COLUMN_PATTERNS.latitude,
    lng: GPS_COLUMN_PATTERNS.longitude,
    alt: GPS_COLUMN_PATTERNS.altitude,
    prec: GPS_COLUMN_PATTERNS.precision,
    combined: GPS_COLUMN_PATTERNS.combined,
  } : {
    lat: GPS_COLUMN_PATTERNS.residenceLatitude,
    lng: GPS_COLUMN_PATTERNS.residenceLongitude,
    alt: GPS_COLUMN_PATTERNS.residenceAltitude,
    prec: GPS_COLUMN_PATTERNS.residencePrecision,
    combined: GPS_COLUMN_PATTERNS.residenceCombined,
  }

  const combinedField = findFieldByPatterns(data, patterns.combined)
  if (combinedField?.value) {
    const parsed = parseGPSString(combinedField.value)
    if (parsed.latitude !== null && parsed.longitude !== null) {
      return parsed
    }
  }

  const latField = findFieldByPatterns(data, patterns.lat)
  const lngField = findFieldByPatterns(data, patterns.lng)
  
  if (latField?.value !== undefined && lngField?.value !== undefined) {
    const lat = parseNumericValue(latField.value)
    const lng = parseNumericValue(lngField.value)
    
    if (lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      const altField = findFieldByPatterns(data, patterns.alt)
      const precField = findFieldByPatterns(data, patterns.prec)
      
      return {
        latitude: lat,
        longitude: lng,
        altitude: parseNumericValue(altField?.value),
        precision: parseNumericValue(precField?.value),
      }
    }
  }

  return { latitude: null, longitude: null, altitude: null, precision: null }
}

function findSiteIdentifier(data: Record<string, any>): { id: string | null; name: string | null } {
  const siteIdPatterns = [/site_id/i, /site_code/i, /siteid/i, /^_uuid$/i, /^_id$/i, /^id$/i]
  const siteNamePatterns = [/site_name/i, /sitename/i, /^name$/i, /location.*name/i]
  
  const idField = findFieldByPatterns(data, siteIdPatterns)
  const nameField = findFieldByPatterns(data, siteNamePatterns)
  
  return {
    id: idField?.value ? String(idField.value).trim() : null,
    name: nameField?.value ? String(nameField.value).trim() : null,
  }
}

function findLocationInfo(data: Record<string, any>): { state: string | null; locality: string | null } {
  const statePatterns = [/^state$/i, /state_name/i, /admin.*1/i, /governorate/i]
  const localityPatterns = [/^locality$/i, /locality_name/i, /admin.*2/i, /district/i]
  
  const stateField = findFieldByPatterns(data, statePatterns)
  const localityField = findFieldByPatterns(data, localityPatterns)
  
  return {
    state: stateField?.value ? String(stateField.value).trim() : null,
    locality: localityField?.value ? String(localityField.value).trim() : null,
  }
}

function flattenNestedData(data: any, prefix = ''): Record<string, any> {
  const result: Record<string, any> = {}
  
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data)) {
      const newKey = prefix ? `${prefix}/${key}` : key
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, flattenNestedData(value, newKey))
      } else {
        result[newKey] = value
      }
    }
  }
  
  return result
}

function parseModaSubmission(rawPayload: any): ParsedSubmission {
  const flatData = flattenNestedData(rawPayload)
  
  const submissionId = rawPayload._uuid || rawPayload._id || rawPayload.instanceId || 
                        rawPayload.meta?.instanceID || `moda-${Date.now()}`
  
  const siteInfo = findSiteIdentifier(flatData)
  const locationInfo = findLocationInfo(flatData)
  
  const siteGps = extractGPSFromSubmission(flatData, 'site')
  const residenceGps = extractGPSFromSubmission(flatData, 'residence')
  
  return {
    submissionId: String(submissionId),
    siteId: siteInfo.id,
    siteName: siteInfo.name,
    state: locationInfo.state,
    locality: locationInfo.locality,
    siteGps,
    residenceGps,
    rawData: rawPayload,
    formId: rawPayload._xform_id_string || rawPayload.formhub?.uuid || null,
    submittedAt: rawPayload._submission_time || rawPayload.end || new Date().toISOString(),
  }
}

function generateSiteCode(state: string, locality: string, siteName: string): string {
  const stateCode = (state || 'XX').substring(0, 2).toUpperCase()
  const localityCode = (locality || 'XX').substring(0, 2).toUpperCase()
  const siteCode = (siteName || 'SITE').substring(0, 4).toUpperCase().replace(/\s+/g, '')
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4)
  return `${stateCode}-${localityCode}-${siteCode}-${timestamp}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Only POST requests are accepted' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
    )
  }

  try {
    const webhookSecret = Deno.env.get('MODA_WEBHOOK_SECRET')
    const providedSecret = req.headers.get('x-webhook-secret') || req.headers.get('authorization')?.replace('Bearer ', '')
    
    if (webhookSecret) {
      if (providedSecret !== webhookSecret) {
        console.warn('[MoDa Webhook] Invalid webhook secret provided')
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid webhook secret' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        )
      }
    } else {
      console.warn('[MoDa Webhook] No MODA_WEBHOOK_SECRET configured - webhook is accepting all requests. Set this secret in Supabase Edge Function settings for production use.')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[MoDa Webhook] Missing Supabase configuration')
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const rawPayload = await req.json()
    console.log('[MoDa Webhook] Received submission:', JSON.stringify(rawPayload).substring(0, 500))

    const parsed = parseModaSubmission(rawPayload)
    console.log('[MoDa Webhook] Parsed data:', {
      submissionId: parsed.submissionId,
      siteId: parsed.siteId,
      siteName: parsed.siteName,
      state: parsed.state,
      locality: parsed.locality,
      siteGps: parsed.siteGps,
      residenceGps: parsed.residenceGps,
    })

    const hasSiteGps = parsed.siteGps.latitude !== null && parsed.siteGps.longitude !== null
    const hasResidenceGps = parsed.residenceGps.latitude !== null && parsed.residenceGps.longitude !== null
    const hasGps = hasSiteGps || hasResidenceGps

    if (!hasGps) {
      console.log('[MoDa Webhook] No GPS coordinates found in submission')
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Submission received but no GPS coordinates detected',
          site_created: false,
          submission_id: parsed.submissionId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!parsed.siteName && !parsed.siteId) {
      console.log('[MoDa Webhook] No site identifier found in submission')
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Submission received but no site name/ID detected',
          site_created: false,
          submission_id: parsed.submissionId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const siteCode = parsed.siteId || generateSiteCode(
      parsed.state || '', 
      parsed.locality || '', 
      parsed.siteName || ''
    )

    const { data: existingSite } = await supabase
      .from('sites_registry')
      .select('id, site_code, site_name')
      .or(`site_code.eq.${siteCode},site_name.ilike.${parsed.siteName || 'NONE'}`)
      .limit(1)
      .single()

    let result: any
    let operation: 'created' | 'updated' = 'created'

    const siteData = {
      site_code: siteCode,
      site_name: parsed.siteName || siteCode,
      state_name: parsed.state || 'Unknown',
      state_id: parsed.state?.toLowerCase().replace(/\s+/g, '-') || 'unknown',
      locality_name: parsed.locality || 'Unknown',
      locality_id: parsed.locality?.toLowerCase().replace(/\s+/g, '-') || 'unknown',
      gps_latitude: hasSiteGps ? parsed.siteGps.latitude : (hasResidenceGps ? parsed.residenceGps.latitude : null),
      gps_longitude: hasSiteGps ? parsed.siteGps.longitude : (hasResidenceGps ? parsed.residenceGps.longitude : null),
      gps_altitude: hasSiteGps ? parsed.siteGps.altitude : (hasResidenceGps ? parsed.residenceGps.altitude : null),
      gps_precision: hasSiteGps ? parsed.siteGps.precision : (hasResidenceGps ? parsed.residenceGps.precision : null),
      residence_gps_latitude: hasResidenceGps ? parsed.residenceGps.latitude : null,
      residence_gps_longitude: hasResidenceGps ? parsed.residenceGps.longitude : null,
      residence_gps_altitude: hasResidenceGps ? parsed.residenceGps.altitude : null,
      residence_gps_precision: hasResidenceGps ? parsed.residenceGps.precision : null,
      activity_type: 'MoDa',
      status: 'active',
      moda_form_id: parsed.formId,
      moda_submission_id: parsed.submissionId,
      updated_at: new Date().toISOString(),
    }

    if (existingSite) {
      operation = 'updated'
      const { data, error } = await supabase
        .from('sites_registry')
        .update(siteData)
        .eq('id', existingSite.id)
        .select()
        .single()
      
      if (error) throw error
      result = data
      console.log(`[MoDa Webhook] Updated existing site: ${existingSite.site_code}`)
    } else {
      const { data, error } = await supabase
        .from('sites_registry')
        .insert({
          ...siteData,
          created_at: new Date().toISOString(),
        })
        .select()
        .single()
      
      if (error) throw error
      result = data
      console.log(`[MoDa Webhook] Created new site: ${siteCode}`)
    }

    try {
      await supabase.from('audit_logs').insert({
        module: 'hub_operations',
        action: operation === 'created' ? 'site_registered' : 'site_updated',
        entity_type: 'site',
        entity_id: result.id,
        entity_name: result.site_name,
        description: `Site ${operation} via MoDa webhook: ${result.site_name} (${result.site_code})`,
        success: true,
        actor_id: 'moda-webhook',
        actor_name: 'MoDa Integration',
        metadata: {
          source: 'moda_webhook',
          form_id: parsed.formId,
          submission_id: parsed.submissionId,
          has_site_gps: hasSiteGps,
          has_residence_gps: hasResidenceGps,
          state: parsed.state,
          locality: parsed.locality,
        }
      })
    } catch (auditError) {
      console.warn('[MoDa Webhook] Failed to create audit log:', auditError)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Site ${operation} successfully`,
        operation,
        site_id: result.id,
        site_code: result.site_code,
        site_name: result.site_name,
        has_site_gps: hasSiteGps,
        has_residence_gps: hasResidenceGps,
        submission_id: parsed.submissionId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[MoDa Webhook] Error processing submission:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: (error as Error).message || 'Failed to process submission'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
