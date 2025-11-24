import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials!');
  console.error('Required: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runMigration() {
  console.log('🚀 Running Classification System Migration...\n');
  
  try {
    // Read the migration file
    const migrationPath = join(process.cwd(), 'database/migrations/user_classification_system.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');
    
    console.log('📄 Migration file loaded');
    console.log(`📦 Size: ${migrationSQL.length} characters\n`);
    
    // Execute the migration
    console.log('⏳ Executing migration on Supabase...');
    
    // Note: Supabase JS client doesn't support raw SQL execution directly
    // User needs to run this via Supabase Dashboard SQL Editor
    console.log('\n' + '='.repeat(80));
    console.log('⚠️  IMPORTANT: Supabase requires migrations to be run via Dashboard');
    console.log('='.repeat(80));
    console.log('\n📋 Follow these steps:\n');
    console.log('1. Open Supabase Dashboard: https://supabase.com/dashboard');
    console.log('2. Select your project: abznugnirnlrqnnfkein');
    console.log('3. Go to: SQL Editor');
    console.log('4. Create a new query');
    console.log('5. Copy the migration file content from:');
    console.log('   database/migrations/user_classification_system.sql');
    console.log('6. Paste and Run the SQL');
    console.log('\n✅ After running, your classification system will be live!');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

runMigration();
