import { createClient } from '@supabase/supabase-js'

const USER_ID = process.argv[2] || '7943f569-b5fb-4ad6-b788-7194bd36a9e6'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.')
  process.exit(1)
}

if (!USER_ID) {
  console.error('Usage: node scripts/verify-user.js <user-id>')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const { data, error } = await supabase.auth.admin.updateUserById(USER_ID, { email_confirm: true })
  if (error) throw error

  const identifier = data?.user?.email || data?.user?.id || USER_ID
  console.log(`User verified: ${identifier}`)
}

main().catch((err) => {
  console.error('Failed to verify user:', err?.message || err)
  process.exit(1)
})

