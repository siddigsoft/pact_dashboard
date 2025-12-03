import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'

async function main() {
  const [,, inputPath, ...flags] = process.argv
  if (!inputPath) {
    console.error('Usage: node scripts/import-users.js <users.json> [--no-wallet] [--assign-role]')
    process.exit(1)
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.')
    process.exit(1)
  }

  const createWallet = !flags.includes('--no-wallet')
  const assignRole = flags.includes('--assign-role')

  const raw = await fs.readFile(inputPath, 'utf8')
  let users
  try {
    users = JSON.parse(raw)
  } catch (e) {
    console.error('Failed to parse JSON. Ensure the file is a JSON array of users.')
    throw e
  }
  if (!Array.isArray(users)) {
    console.error('Input file must be a JSON array of user objects.')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  let success = 0
  let failed = 0

  for (const u of users) {
    const email = (u.email || '').trim()
    if (!email) {
      console.warn('Skipping record without email:', u)
      failed++
      continue
    }
    const full_name = u.full_name || u.name || ''
    const password = u.password || crypto.randomUUID()

    try {
      const userId = await ensureAuthUser(supabase, email, password, { full_name, username: u.username, phone: u.phone })

      const profile = {
        id: userId,
        email,
        username: u.username ?? null,
        full_name: full_name || null,
        role: u.role || null,
        avatar_url: u.avatar_url || null,
        hub_id: u.hub_id || null,
        state_id: u.state_id || null,
        locality_id: u.locality_id || null,
        employee_id: u.employee_id || null,
        phone: u.phone || null,
        status: u.status || 'active',
        availability: u.availability || null,
        location: u.location || null,
        location_sharing: u.location_sharing ?? false,
        bank_account: u.bank_account || null,
      }

      {
        const { error } = await supabase.from('profiles').upsert(profile, { onConflict: 'id' })
        if (error) throw error
      }

      if (createWallet) {
        const wallet = {
          user_id: userId,
          currency: u.currency || 'SDG',
        }
        const { error } = await supabase.from('wallets').upsert(wallet, { onConflict: 'user_id' })
        if (error) throw error
      }

      if (assignRole && u.role) {
        if (!isAllowedRole(u.role)) {
          console.warn(`Role "${u.role}" is not in allowed list; skipping role assignment for ${email}`)
        } else {
          const { error } = await supabase.from('user_roles').insert({ user_id: userId, role: u.role })
          if (error && !isDuplicateInsertError(error)) throw error
        }
      }

      console.log(`OK  ${email}`)
      success++
    } catch (err) {
      console.error(`ERR ${email}:`, err?.message || err)
      failed++
    }
  }

  console.log('---')
  console.log(`Done. Success: ${success}, Failed: ${failed}`)
}

function isAllowedRole(role) {
  const allowed = new Set(['admin','ict','fom','financialAdmin','supervisor','coordinator','dataCollector','reviewer'])
  return allowed.has(role)
}

function isDuplicateInsertError(error) {
  const msg = (error?.message || '').toLowerCase()
  return msg.includes('duplicate') || msg.includes('unique constraint')
}

async function ensureAuthUser(supabase, email, password, metadata) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata || {}
  })
  if (!error && data?.user?.id) return data.user.id

  if (error && typeof error.message === 'string' && error.message.toLowerCase().includes('already')) {
    const existing = await findAuthUserByEmail(supabase, email)
    if (existing?.id) return existing.id
  }
  if (error) throw error
  throw new Error('Failed to create or find user for email ' + email)
}

async function findAuthUserByEmail(supabase, email) {
  const perPage = 1000
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const found = data?.users?.find(u => (u.email || '').toLowerCase() === email.toLowerCase())
    if (found) return found
    if (!data || !Array.isArray(data.users) || data.users.length < perPage) break
  }
  return null
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
