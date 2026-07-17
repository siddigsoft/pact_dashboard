import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Inserts notifications via `insert_notifications_secure` RPC (SECURITY DEFINER).
/// Avoids RLS failures and normalizes legacy/new column shapes.
class NotificationInsertService {
  NotificationInsertService._();

  static final SupabaseClient _supabase = Supabase.instance.client;

  static Future<List<String>> insertNotifications(
    List<Map<String, dynamic>> rows,
  ) async {
    if (rows.isEmpty) return [];
    if (_supabase.auth.currentUser == null) {
      debugPrint('[NotificationInsert] Skipped — no authenticated user');
      return [];
    }

    final normalized = rows.map(_normalizeRow).toList(growable: false);

    try {
      final response = await _supabase.rpc(
        'insert_notifications_secure',
        params: {'p_rows': normalized},
      );
      if (response == null) return [];
      return List<String>.from(response as List);
    } catch (e) {
      debugPrint('[NotificationInsert] RPC failed: $e');
      rethrow;
    }
  }

  static Future<String?> insertNotification(Map<String, dynamic> row) async {
    final ids = await insertNotifications([row]);
    return ids.isEmpty ? null : ids.first;
  }

  static Map<String, dynamic> _normalizeRow(Map<String, dynamic> row) {
    final recipientId =
        row['recipient_id']?.toString() ?? row['user_id']?.toString();
    final titleEn =
        row['title_en']?.toString() ?? row['title']?.toString() ?? 'Notification';
    final messageEn = row['message_en']?.toString() ??
        row['message']?.toString() ??
        row['body']?.toString() ??
        '';
    final eventType = row['event_type']?.toString() ??
        row['type']?.toString() ??
        row['category']?.toString() ??
        'system';

    return {
      ...row,
      if (recipientId != null) 'recipient_id': recipientId,
      if (recipientId != null) 'user_id': row['user_id'] ?? recipientId,
      'title_en': titleEn,
      'title_ar': row['title_ar'] ?? titleEn,
      'message_en': messageEn,
      'message_ar': row['message_ar'] ?? messageEn,
      'title': row['title'] ?? titleEn,
      'message': row['message'] ?? messageEn,
      'event_type': eventType,
      'type': row['type'] ?? 'info',
      'priority': row['priority'] ?? 'normal',
      'status': row['status'] ?? 'pending',
      'is_read': row['is_read'] ?? false,
      if (row['link'] != null && row['action_url'] == null)
        'action_url': row['link'],
    };
  }
}
