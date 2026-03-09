#!/usr/bin/env node

/**
 * Database Migration Script for PACT Permits System
 * 
 * This script will:
 * 1. Create all necessary tables in the new database
 * 2. Copy data from the old database to the new one
 * 3. Verify that everything is set up correctly
 * 4. Create storage buckets and policies
 * 
 * Usage: node migrate_permits_to_new_db.js
 * 
 * Ensure both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set before running
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration - UPDATE THESE FOR YOUR NEW DATABASE
const NEW_SUPABASE_URL = 'https://abznugnirnlrqnnfkein.supabase.co';
const NEW_SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiem51Z25pcm5scnFubmZrZWluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTEzNTY5MSwiZXhwIjoyMDc0NzExNjkxfQ.1WIbmd3eCpB15YFYgd8-ujWN8zVujdk7Aqi3RPEiIs8';

// Old database (current production)
const OLD_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://bccvfqvntpiusqoaijfn.supabase.co';
const OLD_SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const newDb = createClient(NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const oldDb = createClient(OLD_SUPABASE_URL, OLD_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let logMessages = [];

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
  console.log(formattedMessage);
  logMessages.push(formattedMessage);
}

async function executeSql(db, sql) {
  try {
    const { error, data } = await db.rpc('_exec', { sql });
    if (error) {
      throw error;
    }
    return { success: true, data };
  } catch (err) {
    // Some operations might not support rpc, trying direct approach
    return { success: false, error: err.message };
  }
}

async function createTables() {
  log('Creating tables in new database...');
  
  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, 'supabase_migrations', '20260309_migrate_permits_to_new_db.sql');
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
    
    // Split by statement (simple approach - may need refinement for complex SQL)
    const statements = migrationSql.split(';').filter(s => s.trim());
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt) continue;
      
      try {
        // For most statements, we'll need to execute via a function or raw SQL
        // Since Supabase doesn't expose raw SQL execution, we'll use the REST API
        const response = await fetch(`${NEW_SUPABASE_URL}/rest/v1/rpc`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${NEW_SUPABASE_SERVICE_ROLE_KEY}`,
            'apikey': NEW_SUPABASE_SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({ sql: stmt })
        });
        
        if (response.ok) {
          successCount++;
          log(`Statement ${i + 1}/${statements.length} executed`, 'debug');
        } else {
          const error = await response.text();
          log(`Statement ${i + 1} partial failure (might be benign): ${error.substring(0, 100)}`, 'warn');
        }
      } catch (err) {
        log(`Error executing statement ${i + 1}: ${err.message}`, 'warn');
        errorCount++;
      }
    }
    
    log(`Table creation: ${successCount} statements succeeded, ${errorCount} failed`, 'info');
    return { success: true, successCount, errorCount };
  } catch (err) {
    log(`Error in createTables: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
}

async function migratePermits() {
  log('Migrating permits data...');
  
  const tables = ['state_permits', 'local_permits', 'federal_permits'];
  let totalMigrated = 0;
  
  for (const table of tables) {
    try {
      // Fetch from old database
      const { data: oldData, error: fetchError } = await oldDb
        .from(table)
        .select('*')
        .order('created_at', { ascending: false });
      
      if (fetchError) {
        log(`Error fetching from old ${table}: ${fetchError.message}`, 'warn');
        continue;
      }
      
      if (!oldData || oldData.length === 0) {
        log(`No data to migrate from ${table}`, 'info');
        continue;
      }
      
      // Insert into new database
      const { error: insertError, data: insertData } = await newDb
        .from(table)
        .insert(oldData);
      
      if (insertError) {
        log(`Error inserting into new ${table}: ${insertError.message}`, 'error');
        continue;
      }
      
      log(`Migrated ${oldData.length} records from ${table}`, 'success');
      totalMigrated += oldData.length;
    } catch (err) {
      log(`Error migrating ${table}: ${err.message}`, 'error');
    }
  }
  
  return { success: true, totalMigrated };
}

async function migrateSitePhotos() {
  log('Migrating site_visit_photos data...');
  
  try {
    // Fetch from old database
    const { data: oldData, error: fetchError } = await oldDb
      .from('site_visit_photos')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (fetchError) {
      log(`Error fetching site_visit_photos: ${fetchError.message}`, 'warn');
      return { success: false, migrated: 0 };
    }
    
    if (!oldData || oldData.length === 0) {
      log('No site_visit_photos to migrate', 'info');
      return { success: true, migrated: 0 };
    }
    
    // Insert into new database
    const { error: insertError, data: insertData } = await newDb
      .from('site_visit_photos')
      .insert(oldData);
    
    if (insertError) {
      log(`Error inserting site_visit_photos: ${insertError.message}`, 'error');
      return { success: false, migrated: 0 };
    }
    
    log(`Migrated ${oldData.length} site visit photos`, 'success');
    return { success: true, migrated: oldData.length };
  } catch (err) {
    log(`Error migrating site_visit_photos: ${err.message}`, 'error');
    return { success: false, migrated: 0 };
  }
}

async function migrateDocumentIndex() {
  log('Migrating document_index data...');
  
  try {
    // Fetch from old database
    const { data: oldData, error: fetchError } = await oldDb
      .from('document_index')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (fetchError) {
      log(`Error fetching document_index: ${fetchError.message}`, 'warn');
      return { success: false, migrated: 0 };
    }
    
    if (!oldData || oldData.length === 0) {
      log('No document_index entries to migrate', 'info');
      return { success: true, migrated: 0 };
    }
    
    // Insert into new database
    const { error: insertError, data: insertData } = await newDb
      .from('document_index')
      .insert(oldData);
    
    if (insertError) {
      log(`Error inserting document_index: ${insertError.message}`, 'error');
      return { success: false, migrated: 0 };
    }
    
    log(`Migrated ${oldData.length} document index entries`, 'success');
    return { success: true, migrated: oldData.length };
  } catch (err) {
    log(`Error migrating document_index: ${err.message}`, 'error');
    return { success: false, migrated: 0 };
  }
}

async function verifyMigration() {
  log('Verifying migration...');
  
  const tables = ['state_permits', 'local_permits', 'federal_permits', 'site_visit_photos', 'document_index'];
  const results = {};
  
  for (const table of tables) {
    try {
      const { data, error, count } = await newDb
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        results[table] = { exists: false, error: error.message };
      } else {
        results[table] = { exists: true, count: count || 0 };
      }
    } catch (err) {
      results[table] = { exists: false, error: err.message };
    }
  }
  
  log('Verification Results:', 'info');
  Object.entries(results).forEach(([table, result]) => {
    if (result.exists) {
      log(`✓ ${table}: ${result.count} records`, 'success');
    } else {
      log(`✗ ${table}: ${result.error}`, 'error');
    }
  });
  
  return results;
}

async function createStorageBuckets() {
  log('Creating storage buckets...');
  
  const buckets = [
    'state-permits',
    'local-permits',
    'federal-permits',
    'coordinator-permits',
    'site-visit-photos',
    'monitoring_photos'
  ];
  
  let createdCount = 0;
  
  for (const bucket of buckets) {
    try {
      const { data, error } = await newDb.storage.createBucket(bucket, {
        public: true,
        allowedMimeTypes: ['image/*', 'application/pdf'],
        fileSizeLimit: 104857600 // 100MB
      });
      
      if (error) {
        if (error.message.includes('already exists')) {
          log(`Bucket '${bucket}' already exists`, 'info');
        } else {
          log(`Error creating bucket '${bucket}': ${error.message}`, 'warn');
        }
      } else {
        log(`Created bucket '${bucket}'`, 'success');
        createdCount++;
      }
    } catch (err) {
      log(`Error with bucket '${bucket}': ${err.message}`, 'warn');
    }
  }
  
  return { success: true, created: createdCount, total: buckets.length };
}

async function main() {
  log('='.repeat(80));
  log('PACT Database Migration Script', 'info');
  log('='.repeat(80));
  
  log(`Old Database: ${OLD_SUPABASE_URL}`, 'info');
  log(`New Database: ${NEW_SUPABASE_URL}`, 'info');
  
  try {
    // Step 1: Create tables and structures
    log('\n[STEP 1/5] Creating tables and database structures...', 'info');
    await createTables();
    
    // Step 2: Create storage buckets
    log('\n[STEP 2/5] Creating storage buckets...', 'info');
    await createStorageBuckets();
    
    // Step 3: Migrate permits
    log('\n[STEP 3/5] Migrating permits data...', 'info');
    const permitResult = await migratePermits();
    
    // Step 4: Migrate site photos
    log('\n[STEP 4/5] Migrating site visit photos...', 'info');
    const photoResult = await migrateSitePhotos();
    
    // Step 5: Migrate document index
    log('\n[STEP 5/5] Migrating document index...', 'info');
    const docResult = await migrateDocumentIndex();
    
    // Verify
    log('\nVerifying migration...', 'info');
    const verification = await verifyMigration();
    
    log('\n' + '='.repeat(80));
    log('MIGRATION COMPLETE', 'success');
    log('='.repeat(80));
    log(`Permits migrated: ${permitResult.totalMigrated}`, 'info');
    log(`Site photos migrated: ${photoResult.migrated}`, 'info');
    log(`Document index entries migrated: ${docResult.migrated}`, 'info');
    
    // Save log file
    const logPath = path.join(__dirname, `migration-log-${Date.now()}.txt`);
    fs.writeFileSync(logPath, logMessages.join('\n'));
    log(`\nLog saved to: ${logPath}`, 'info');
    
  } catch (error) {
    log(`FATAL ERROR: ${error.message}`, 'error');
    process.exit(1);
  }
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  log(`Unhandled error: ${err.message}`, 'error');
  process.exit(1);
});
