import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import './debug_log_service.dart';

class CallDiagnosticsStore {
  static const _keyLastIncomingInvite = 'diag.last_incoming_invite_v1';
  static const _keyPendingCallAction = 'diag.pending_call_action_v1';

  static Future<void> saveLastIncomingInvite(Map<String, dynamic> data) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final payload = jsonEncode({
        'ts': DateTime.now().toIso8601String(),
        'data': data,
      });
      await prefs.setString(_keyLastIncomingInvite, payload);
      debugLog(
        'CALL_DIAG',
        'Saved last incoming invite (keys=${data.keys.toList()})',
      );
    } catch (e) {
      debugLog('CALL_DIAG', 'Failed saving last invite: $e');
    }
  }

  static Future<String?> loadLastIncomingInviteRaw() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString(_keyLastIncomingInvite);
    } catch (e) {
      debugLog('CALL_DIAG', 'Failed loading last invite: $e');
      return null;
    }
  }

  /// Clear the stored last incoming invite to prevent stale calls
  /// after the invite has been consumed or has expired.
  static Future<void> clearLastIncomingInvite() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_keyLastIncomingInvite);
      debugLog('CALL_DIAG', 'Cleared last incoming invite');
    } catch (e) {
      debugLog('CALL_DIAG', 'Failed clearing last invite: $e');
    }
  }

  static Future<void> savePendingCallAction({
    required String actionId,
    required Map<String, dynamic> callData,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final payload = jsonEncode({
        'ts': DateTime.now().toIso8601String(),
        'actionId': actionId,
        'callData': callData,
      });
      await prefs.setString(_keyPendingCallAction, payload);
      debugLog(
        'CALL_DIAG',
        'Saved pending call action=$actionId callId=${callData['call_id'] ?? callData['callId']}',
      );
    } catch (e) {
      debugLog('CALL_DIAG', 'Failed saving pending call action: $e');
    }
  }

  static Future<Map<String, dynamic>?> loadAndClearPendingCallAction() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_keyPendingCallAction);
      // #region agent log
      debugLog(
        'CALL_DIAG',
        '[H4] loadAndClearPendingCallAction() foundRaw=${raw != null && raw.isNotEmpty}',
      );
      // #endregion

      if (raw == null || raw.isEmpty) return null;
      await prefs.remove(_keyPendingCallAction);
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) {
        // #region agent log
        debugLog(
          'CALL_DIAG',
          '[H4] loadAndClearPendingCallAction() returning actionId=${decoded['actionId']} callId=${(decoded['callData'] as Map?)?['call_id'] ?? (decoded['callData'] as Map?)?['callId']}',
        );
        // #endregion
        return decoded;
      }
      return null;
    } catch (e) {
      debugLog('CALL_DIAG', 'Failed loading/clearing pending call action: $e');
      return null;
    }
  }
}
