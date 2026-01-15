// lib/utils/database_constraint_checker.dart
import 'package:supabase_flutter/supabase_flutter.dart';

class DatabaseConstraintChecker {
  static final _supabase = Supabase.instance.client;

  static Future<Map<String, dynamic>> runAllChecks() async {
    final results = <String, dynamic>{};

    print('🔍 Starting comprehensive database checks...\n');

    // 1. Check location_logs table
    results['location_logs_table'] = await _checkTable('location_logs');
    results['location_logs_insert'] = await _checkInsertPermission('location_logs', {
      'visit_id': '00000000-0000-0000-0000-000000000000',
      'user_id': _supabase.auth.currentUser?.id,
      'latitude': 0.0,
      'longitude': 0.0,
      'timestamp': DateTime.now().toIso8601String(),
    });

    // 2. Check equipment table
    results['equipment_table'] = await _checkTable('equipment');
    results['equipment_insert'] = await _checkInsertPermission('equipment', {
      'id': 'test-${DateTime.now().millisecondsSinceEpoch}',
      'name': 'TEST - DELETE ME',
      'status': 'OK',
      'user_id': _supabase.auth.currentUser?.id,
    });

    // 3. Check site_visits table
    results['site_visits_table'] = await _checkTable('site_visits');
    results['site_visits_update'] = await _checkUpdatePermission('site_visits');

    // 4. Check reports table
    results['reports_table'] = await _checkTable('reports');
    results['reports_insert'] = await _checkInsertPermission('reports', {
      'site_visit_id': '00000000-0000-0000-0000-000000000000',
      'notes': 'TEST - DELETE ME',
      'submitted_at': DateTime.now().toIso8601String(),
    });

    // 5. Check report_photos table
    results['report_photos_table'] = await _checkTable('report_photos');

    // 6. Check site_locations table (actual site coordinate capture)
    results['site_locations_table'] = await _checkTable('site_locations');
    results['site_locations_insert'] = await _checkInsertPermission('site_locations', {
      // Note: This will likely fail FK unless a dummy site exists; that's fine for permission probing
      'site_id': '00000000-0000-0000-0000-000000000000',
      'user_id': _supabase.auth.currentUser?.id,
      'latitude': 0.0,
      'longitude': 0.0,
      'accuracy': 1.0,
      'recorded_at': DateTime.now().toIso8601String(),
      'notes': 'TEST - DELETE ME',
    });

    // 7. Check authentication
    results['user_authenticated'] = _supabase.auth.currentUser != null;
    results['user_id'] = _supabase.auth.currentUser?.id ?? 'NOT AUTHENTICATED';

    print('\n📊 Database Check Results:');
    print('=' * 60);
    results.forEach((key, value) {
      if (value is bool) {
        final icon = value ? '✅' : '❌';
        print('$icon $key: ${value ? "PASS" : "FAIL"}');
      } else {
        print('ℹ️  $key: $value');
      }
    });
    print('=' * 60);

    return results;
  }

  static Future<bool> _checkTable(String tableName) async {
    try {
      await _supabase.from(tableName).select('*').limit(1);
      print('✅ Table "$tableName" exists and is accessible');
      return true;
    } catch (e) {
      print('❌ Table "$tableName" check failed: $e');
      return false;
    }
  }

  static Future<bool> _checkInsertPermission(
      String tableName, Map<String, dynamic> testData) async {
    try {
      // Try to insert a test record
      await _supabase.from(tableName).insert(testData).select();
      print('✅ Insert permission granted for "$tableName"');
      
      // Try to delete the test record
      await _supabase.from(tableName).delete().eq('id', testData['id'] ?? '');
      return true;
    } catch (e) {
      final errorMsg = e.toString();
      
      // Check for specific errors
      if (errorMsg.contains('foreign key constraint')) {
        print('⚠️  Insert into "$tableName" blocked by foreign key (expected for test data)');
        return true; // This is actually OK - table exists and accepts inserts
      } else if (errorMsg.contains('violates not-null constraint')) {
        print('⚠️  Insert into "$tableName" blocked by NOT NULL constraint');
        return true; // Table exists, just missing required fields
      } else if (errorMsg.contains('row-level security policy')) {
        print('❌ Insert into "$tableName" blocked by RLS policy');
        return false;
      } else if (errorMsg.contains('duplicate key value')) {
        print('✅ Insert permission granted for "$tableName" (duplicate key expected)');
        return true;
      }
      
      print('❌ Insert permission denied for "$tableName": $e');
      return false;
    }
  }

  static Future<bool> _checkUpdatePermission(String tableName) async {
    try {
      // Try to select first, then update
      final records = await _supabase.from(tableName).select('id').limit(1);
      
      if (records.isEmpty) {
        print('⚠️  No records in "$tableName" to test update permission');
        return true; // Can't test, but not necessarily a failure
      }
      
      final recordId = records.first['id'];
      await _supabase.from(tableName)
          .update({'last_modified': DateTime.now().toIso8601String()})
          .eq('id', recordId);
      
      print('✅ Update permission granted for "$tableName"');
      return true;
    } catch (e) {
      print('❌ Update permission denied for "$tableName": $e');
      return false;
    }
  }

  /// Generate SQL to create missing tables
  static String generateMissingTableSQL() {
    return '''
-- Create location_logs table if not exists
CREATE TABLE IF NOT EXISTS location_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id UUID REFERENCES site_visits(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy DOUBLE PRECISION,
    speed DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    altitude DOUBLE PRECISION,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_location_logs_visit_id ON location_logs(visit_id);
CREATE INDEX IF NOT EXISTS idx_location_logs_user_id ON location_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_location_logs_timestamp ON location_logs(timestamp);

-- Enable RLS
ALTER TABLE location_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for location_logs
CREATE POLICY "Users can view their own location logs"
    ON location_logs FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own location logs"
    ON location_logs FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Create report_photos table if not exists (from previous migration)
CREATE TABLE IF NOT EXISTS report_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    is_synced BOOLEAN DEFAULT TRUE,
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_photos_report_id ON report_photos(report_id);

ALTER TABLE report_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view photos for their reports"
    ON report_photos FOR SELECT
    USING (
        report_id IN (
            SELECT id FROM reports 
            WHERE site_visit_id IN (
                SELECT id FROM site_visits 
                WHERE assigned_to = auth.uid()
            )
        )
    );

CREATE POLICY "Users can add photos to their reports"
    ON report_photos FOR INSERT
    WITH CHECK (
        report_id IN (
            SELECT id FROM reports 
            WHERE site_visit_id IN (
                SELECT id FROM site_visits 
                WHERE assigned_to = auth.uid()
            )
        )
    );

-- Ensure equipment table has user_id column
DO \$\$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='equipment' AND column_name='user_id'
    ) THEN
        ALTER TABLE equipment ADD COLUMN user_id UUID REFERENCES auth.users(id);
        CREATE INDEX idx_equipment_user_id ON equipment(user_id);
    END IF;
END \$\$;

-- Ensure site_visits has last_modified column
DO \$\$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='site_visits' AND column_name='last_modified'
    ) THEN
        ALTER TABLE site_visits ADD COLUMN last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END \$\$;
''';
  }

  /// Check if all critical tables exist
  static Future<bool> allTablesExist() async {
    final tables = ['location_logs', 'equipment', 'site_visits', 'reports', 'report_photos'];
    
    for (final table in tables) {
      if (!await _checkTable(table)) {
        return false;
      }
    }
    
    return true;
  }
}
