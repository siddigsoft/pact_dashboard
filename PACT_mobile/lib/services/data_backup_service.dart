import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Data backup and restore service for wallet data security
class DataBackupService {
  static final DataBackupService _instance = DataBackupService._internal();

  factory DataBackupService() {
    return _instance;
  }

  DataBackupService._internal();

  final String _tableName = 'wallet_backups';

  /// Create backup of wallet data
  Future<void> createBackup({
    required String userId,
    required Map<String, dynamic> walletData,
    String? notes,
  }) async {
    try {
      final now = DateTime.now().toIso8601String();
      final backupData = _encryptBackup(walletData);

      await Supabase.instance.client.from(_tableName).insert({
        'user_id': userId,
        'backup_name': 'Backup ${DateTime.now().toString().split('.')[0]}',
        'backup_data': backupData,
        'size_kb': backupData.length / 1024,
        'notes': notes,
        'created_at': now,
        'is_encrypted': true,
        'backup_type': 'manual',
      });

      debugPrint('[Backup] Backup created successfully');
    } catch (e) {
      debugPrint('[Backup] Error creating backup: $e');
    }
  }

  /// Get all backups for user
  Future<List<Map<String, dynamic>>> getBackups(String userId) async {
    try {
      final data = await Supabase.instance.client
          .from(_tableName)
          .select('id, backup_name, size_kb, created_at, notes')
          .eq('user_id', userId)
          .order('created_at', ascending: false)
          .limit(20);

      return List<Map<String, dynamic>>.from(data as List);
    } catch (e) {
      debugPrint('[Backup] Error fetching backups: $e');
      return [];
    }
  }

  /// Restore from backup
  Future<Map<String, dynamic>?> restoreBackup(String backupId) async {
    try {
      final data = await Supabase.instance.client
          .from(_tableName)
          .select('backup_data')
          .eq('id', backupId)
          .single();

      final backupData = data['backup_data'] as String?;
      if (backupData == null) return null;

      final restored = _decryptBackup(backupData);

      debugPrint('[Backup] Backup restored successfully');
      return restored;
    } catch (e) {
      debugPrint('[Backup] Error restoring backup: $e');
      return null;
    }
  }

  /// Delete backup
  Future<void> deleteBackup(String backupId) async {
    try {
      await Supabase.instance.client
          .from(_tableName)
          .delete()
          .eq('id', backupId);

      debugPrint('[Backup] Backup deleted');
    } catch (e) {
      debugPrint('[Backup] Error deleting backup: $e');
    }
  }

  /// Schedule automatic backup
  Future<void> scheduleAutoBackup({
    required String userId,
    required String frequency, // 'daily', 'weekly', 'monthly'
  }) async {
    try {
      final now = DateTime.now().toIso8601String();

      await Supabase.instance.client.from('backup_schedules').upsert({
        'user_id': userId,
        'frequency': frequency,
        'enabled': true,
        'updated_at': now,
      });

      debugPrint('[Backup] Auto backup scheduled: $frequency');
    } catch (e) {
      debugPrint('[Backup] Error scheduling auto backup: $e');
    }
  }

  /// Get backup statistics
  Future<Map<String, dynamic>> getBackupStats(String userId) async {
    try {
      final backups = await getBackups(userId);

      double totalSize = 0;
      for (final backup in backups) {
        totalSize += (backup['size_kb'] as num?)?.toDouble() ?? 0;
      }

      return {
        'totalBackups': backups.length,
        'totalSizeKB': totalSize,
        'totalSizeMB': (totalSize / 1024).toStringAsFixed(2),
        'lastBackup': backups.isNotEmpty ? backups.first['created_at'] : null,
      };
    } catch (e) {
      debugPrint('[Backup] Error getting stats: $e');
      return {};
    }
  }

  /// Export data as JSON
  static String exportAsJSON(Map<String, dynamic> walletData) {
    try {
      return jsonEncode(walletData);
    } catch (e) {
      debugPrint('[Backup] Error exporting JSON: $e');
      return '{}';
    }
  }

  /// Import data from JSON
  static Map<String, dynamic>? importFromJSON(String jsonString) {
    try {
      return jsonDecode(jsonString) as Map<String, dynamic>;
    } catch (e) {
      debugPrint('[Backup] Error importing JSON: $e');
      return null;
    }
  }

  /// Simple encryption (in production, use proper encryption)
  static String _encryptBackup(Map<String, dynamic> data) {
    final json = jsonEncode(data);
    // TODO: Implement proper encryption
    return base64Encode(utf8.encode(json));
  }

  /// Simple decryption (in production, use proper decryption)
  static Map<String, dynamic>? _decryptBackup(String encrypted) {
    try {
      final json = utf8.decode(base64Decode(encrypted));
      return jsonDecode(json) as Map<String, dynamic>;
    } catch (e) {
      debugPrint('[Backup] Error decrypting backup: $e');
      return null;
    }
  }

  /// Validate backup integrity
  static bool validateBackupIntegrity(Map<String, dynamic> backup) {
    // Check required fields
    final requiredFields = ['id', 'user_id', 'backup_name', 'created_at'];

    for (final field in requiredFields) {
      if (!backup.containsKey(field)) {
        debugPrint('[Backup] Missing field: $field');
        return false;
      }
    }

    return true;
  }
}
