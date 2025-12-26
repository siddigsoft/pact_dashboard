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

// Sudan states configuration - must match frontend sudanStates.ts
const SUDAN_STATES = [
  { id: 'khartoum', name: 'Khartoum', code: 'KH', localities: ['kh-khartoum', 'kh-bahri', 'kh-omdurman', 'kh-jebel-awlia', 'kh-karrari', 'kh-sharg-an-neel', 'kh-um-bada'] },
  { id: 'gezira', name: 'Aj Jazirah', code: 'GZ', localities: ['gz-medani-al-kubra', 'gz-al-hasahisa', 'gz-al-kamlin', 'gz-al-manaqil', 'gz-al-qurashi', 'gz-janub-al-jazirah', 'gz-sharg-al-jazirah', 'gz-um-algura'] },
  { id: 'red-sea', name: 'Red Sea', code: 'RS', localities: ['rs-port-sudan', 'rs-sawakin', 'rs-agig', 'rs-al-ganab', 'rs-dordieb', 'rs-halaib', 'rs-haya', 'rs-jubayt-elmaadin', 'rs-sinkat', 'rs-tawkar'] },
  { id: 'kassala', name: 'Kassala', code: 'KS', localities: ['ks-madeinat-kassala', 'ks-halfa-aj-jadeedah', 'ks-reifi-aroma', 'ks-reifi-gharb-kassala', 'ks-reifi-hamashkureib', 'ks-reifi-kassla', 'ks-reifi-khashm-elgirba', 'ks-reifi-nahr-atbara', 'ks-reifi-shamal-ad-delta', 'ks-reifi-telkok', 'ks-reifi-wad-elhilaiw'] },
  { id: 'gedaref', name: 'Gedaref', code: 'GD', localities: ['gd-madeinat-al-gedaref', 'gd-wasat-al-gedaref', 'gd-al-butanah', 'gd-al-fao', 'gd-al-fashaga', 'gd-al-galabat-al-gharbyah', 'gd-al-mafaza', 'gd-al-qureisha', 'gd-ar-rahad', 'gd-basundah', 'gd-al-galabat-ash-sharqiya', 'gd-gala-en-nahal'] },
  { id: 'white-nile', name: 'White Nile', code: 'WN', localities: ['wn-kosti', 'wn-rabak', 'wn-aj-jabalain', 'wn-as-salam', 'wn-guli', 'wn-tandalti', 'wn-um-rimta', 'wn-ad-douiem'] },
  { id: 'blue-nile', name: 'Blue Nile', code: 'BN', localities: ['bn-ad-damazin', 'bn-at-tadamon', 'bn-al-kurmuk', 'bn-al-roseiris', 'bn-bau', 'bn-gaisan', 'bn-wad-al-mahi'] },
  { id: 'sennar', name: 'Sennar', code: 'SN', localities: ['sn-sennar', 'sn-singa', 'sn-abu-hujar', 'sn-ad-dali', 'sn-al-dinder', 'sn-as-suki', 'sn-sharq-sennar'] },
  { id: 'north-kordofan', name: 'North Kordofan', code: 'NK', localities: ['nk-al-ubayyid', 'nk-shaykan', 'nk-an-nuhud', 'nk-abu-zabad', 'nk-al-khiwai', 'nk-bara', 'nk-gabrat-al-sheikh', 'nk-gharb-bara', 'nk-sodari', 'nk-um-dam-haj-ahmed', 'nk-um-rawaba', 'nk-wad-banda'] },
  { id: 'south-kordofan', name: 'South Kordofan', code: 'SK', localities: ['sk-kaduqli', 'sk-dilling', 'sk-al-buram', 'sk-al-liri', 'sk-ar-rashad', 'sk-as-sunut', 'sk-at-tadamon', 'sk-dalami', 'sk-habila', 'sk-heiban', 'sk-talodi', 'sk-um-durein', 'sk-abu-jubaihah', 'sk-ghadeer', 'sk-reif-asharqi', 'sk-al-quoz', 'sk-al-abassiya'] },
  { id: 'west-kordofan', name: 'West Kordofan', code: 'WK', localities: ['wk-al-fula', 'wk-abyei', 'wk-al-idia', 'wk-al-khiwai', 'wk-al-meiram', 'wk-an-nuhud', 'wk-as-salam', 'wk-at-tubun', 'wk-babanusa', 'wk-ghubaish', 'wk-lagawa', 'wk-wad-banda'] },
  { id: 'north-darfur', name: 'North Darfur', code: 'ND', localities: ['nd-al-fasher', 'nd-kutum', 'nd-al-lait', 'nd-al-malha', 'nd-at-tawisha', 'nd-al-waha', 'nd-dar-as-salam', 'nd-kelemando', 'nd-kebkabiya', 'nd-kornoi', 'nd-al-kuma', 'nd-melit', 'nd-saraf-omra', 'nd-tawila', 'nd-um-baru', 'nd-um-kadada', 'nd-al-serief'] },
  { id: 'south-darfur', name: 'South Darfur', code: 'SD', localities: ['sd-nyala', 'sd-al-radoom', 'sd-as-salam', 'sd-buram', 'sd-damso', 'sd-ed-al-fursan', 'sd-gereida', 'sd-idd-al-ghanam', 'sd-kas', 'sd-katila', 'sd-kubum', 'sd-marshing', 'sd-nitega', 'sd-rehaid-elbirdi', 'sd-sharg-aj-jabal', 'sd-shattaya', 'sd-tulus', 'sd-um-dafoug', 'sd-al-wihda', 'sd-beleil'] },
  { id: 'west-darfur', name: 'West Darfur', code: 'WD', localities: ['wd-al-geneina', 'wd-beida', 'wd-habila', 'wd-jebel-moon', 'wd-kereinik', 'wd-kulbus', 'wd-sirba', 'wd-um-dukhun'] },
  { id: 'east-darfur', name: 'East Darfur', code: 'ED', localities: ['ed-ed-daein', 'ed-abu-jabra', 'ed-abu-karinka', 'ed-adila', 'ed-al-firdous', 'ed-assalaya', 'ed-bahr-al-arab', 'ed-sheiria', 'ed-yassin'] },
  { id: 'central-darfur', name: 'Central Darfur', code: 'CD', localities: ['cd-zalingei', 'cd-azum', 'cd-bendasi', 'cd-jebel-marra', 'cd-mukjar', 'cd-nertiti', 'cd-rokero', 'cd-um-dukhun', 'cd-wadi-salih'] },
  { id: 'river-nile', name: 'River Nile', code: 'RN', localities: ['rn-atbara', 'rn-shendi', 'rn-ad-damar', 'rn-al-buhaira', 'rn-al-matammah', 'rn-barbar', 'rn-abu-hamad'] },
  { id: 'northern', name: 'Northern', code: 'NR', localities: ['nr-dongola', 'nr-al-golid', 'nr-al-burgaig', 'nr-al-dabbah', 'nr-delgo', 'nr-halfa', 'nr-merowe'] },
]

const STATE_NAME_ALIASES: { [key: string]: string } = {
  'khartoum': 'khartoum', 'khartum': 'khartoum', 'al khartoum': 'khartoum',
  'gezira': 'gezira', 'aj jazirah': 'gezira', 'al jazirah': 'gezira', 'al-jazirah': 'gezira', 'jazirah': 'gezira',
  'red sea': 'red-sea', 'redsea': 'red-sea', 'al bahr al ahmar': 'red-sea',
  'kassala': 'kassala',
  'gedaref': 'gedaref', 'gadaref': 'gedaref', 'al qadarif': 'gedaref', 'qadarif': 'gedaref',
  'white nile': 'white-nile', 'whitenile': 'white-nile', 'an nil al abyad': 'white-nile',
  'blue nile': 'blue-nile', 'bluenile': 'blue-nile', 'an nil al azraq': 'blue-nile',
  'sennar': 'sennar', 'sinnar': 'sennar',
  'north kordofan': 'north-kordofan', 'northkordofan': 'north-kordofan', 'shamal kurdufan': 'north-kordofan',
  'south kordofan': 'south-kordofan', 'southkordofan': 'south-kordofan', 'janub kurdufan': 'south-kordofan',
  'west kordofan': 'west-kordofan', 'westkordofan': 'west-kordofan', 'gharb kurdufan': 'west-kordofan',
  'north darfur': 'north-darfur', 'northdarfur': 'north-darfur', 'shamal darfur': 'north-darfur',
  'south darfur': 'south-darfur', 'southdarfur': 'south-darfur', 'janub darfur': 'south-darfur',
  'west darfur': 'west-darfur', 'westdarfur': 'west-darfur', 'gharb darfur': 'west-darfur',
  'east darfur': 'east-darfur', 'eastdarfur': 'east-darfur', 'sharq darfur': 'east-darfur',
  'central darfur': 'central-darfur', 'centraldarfur': 'central-darfur', 'wasat darfur': 'central-darfur',
  'river nile': 'river-nile', 'rivernile': 'river-nile', 'nahr an nil': 'river-nile',
  'northern': 'northern', 'ash shamaliyah': 'northern',
}

function normalizeStateId(stateName: string | null): string | null {
  if (!stateName) return null
  
  const normalized = stateName.toLowerCase().trim().replace(/[\s_-]+/g, ' ')
  
  if (STATE_NAME_ALIASES[normalized]) {
    return STATE_NAME_ALIASES[normalized]
  }
  
  const noSpaces = normalized.replace(/\s+/g, '')
  if (STATE_NAME_ALIASES[noSpaces]) {
    return STATE_NAME_ALIASES[noSpaces]
  }
  
  const hyphenated = normalized.replace(/\s+/g, '-')
  const matchByExactId = SUDAN_STATES.find(s => s.id === hyphenated)
  if (matchByExactId) return matchByExactId.id
  
  const matchByName = SUDAN_STATES.find(s => 
    s.name.toLowerCase() === normalized ||
    s.name.toLowerCase().replace(/\s+/g, '-') === hyphenated
  )
  if (matchByName) return matchByName.id
  
  console.warn(`[MoDa Webhook] Unmatched state: "${stateName}"`)
  return null
}

function normalizeLocalityId(localityName: string | null, stateId: string | null): string | null {
  if (!localityName || !stateId) return null
  
  const state = SUDAN_STATES.find(s => s.id === stateId)
  if (!state) return null
  
  const normalized = localityName.toLowerCase().trim()
  const normalizedNoSpaces = normalized.replace(/[\s-]+/g, '')
  
  // Try to match locality by partial name
  const prefix = state.code.toLowerCase() + '-'
  
  // Exact match
  const exactMatch = state.localities.find(lid => 
    lid === normalized ||
    lid === prefix + normalized.replace(/\s+/g, '-')
  )
  if (exactMatch) return exactMatch
  
  // Partial match
  const partialMatch = state.localities.find(lid => {
    const localityNorm = lid.replace(prefix, '').replace(/-/g, '')
    return localityNorm === normalizedNoSpaces || 
           localityNorm.includes(normalizedNoSpaces) || 
           normalizedNoSpaces.includes(localityNorm)
  })
  if (partialMatch) return partialMatch
  
  console.warn(`[MoDa Webhook] Unmatched locality "${localityName}" in state "${stateId}"`)
  return null
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

    // Normalize state and locality IDs to match frontend expectations
    const normalizedStateId = normalizeStateId(parsed.state)
    const normalizedLocalityId = normalizeLocalityId(parsed.locality, normalizedStateId)
    
    // Find state name from normalized ID
    const stateInfo = SUDAN_STATES.find(s => s.id === normalizedStateId)
    
    console.log('[MoDa Webhook] Normalized location:', {
      rawState: parsed.state,
      normalizedStateId,
      rawLocality: parsed.locality,
      normalizedLocalityId,
      stateFound: !!stateInfo
    })

    // Only include columns that exist in the sites_registry table
    // Existing columns: id, site_code, site_name, state_id, state_name, locality_id, locality_name,
    // hub_id, hub_name, gps_latitude, gps_longitude, activity_type, status, mmp_count, created_at, updated_at, created_by
    const siteData = {
      site_code: siteCode,
      site_name: parsed.siteName || siteCode,
      state_name: stateInfo?.name || parsed.state || 'Unknown',
      state_id: normalizedStateId || 'unknown',
      locality_name: parsed.locality || 'Unknown',
      locality_id: normalizedLocalityId || 'unknown',
      gps_latitude: hasSiteGps ? parsed.siteGps.latitude : (hasResidenceGps ? parsed.residenceGps.latitude : null),
      gps_longitude: hasSiteGps ? parsed.siteGps.longitude : (hasResidenceGps ? parsed.residenceGps.longitude : null),
      activity_type: 'MoDa',
      status: 'active',
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
