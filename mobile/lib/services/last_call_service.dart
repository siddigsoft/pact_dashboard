import 'package:hive/hive.dart';

/// Service for managing last call information for contacts
class LastCallService {
  static const String _lastCallBoxName = 'contact_last_calls';

  static Future<void> initializeBoxes() async {
    try {
      if (!Hive.isBoxOpen(_lastCallBoxName)) {
        await Hive.openBox<String>(_lastCallBoxName);
      }
    } catch (e) {
      print('Error initializing last call box: $e');
    }
  }

  /// Store last call info for a contact
  /// Format: "type|timestamp" where type is "incoming", "outgoing", or "missed"
  static Future<void> setLastCall(
    String contactId,
    String callType,
    DateTime callTime,
  ) async {
    try {
      final box = Hive.box<String>(_lastCallBoxName);
      final data = '$callType|${callTime.toIso8601String()}';
      await box.put(contactId, data);
    } catch (e) {
      print('Error setting last call: $e');
    }
  }

  /// Get last call info for a contact
  static Future<LastCallInfo?> getLastCall(String contactId) async {
    try {
      final box = Hive.box<String>(_lastCallBoxName);
      final data = box.get(contactId);
      if (data == null) return null;

      final parts = data.split('|');
      if (parts.length != 2) return null;

      final callType = parts[0];
      final callTime = DateTime.tryParse(parts[1]);
      if (callTime == null) return null;

      return LastCallInfo(
        contactId: contactId,
        callType: callType,
        callTime: callTime,
      );
    } catch (e) {
      print('Error getting last call: $e');
      return null;
    }
  }

  /// Clear last call info for a contact
  static Future<void> clearLastCall(String contactId) async {
    try {
      final box = Hive.box<String>(_lastCallBoxName);
      await box.delete(contactId);
    } catch (e) {
      print('Error clearing last call: $e');
    }
  }

  /// Get all last call info
  static Future<List<LastCallInfo>> getAllLastCalls() async {
    try {
      final box = Hive.box<String>(_lastCallBoxName);
      final results = <LastCallInfo>[];

      for (final entry in box.toMap().entries) {
        final contactId = entry.key as String;
        final data = entry.value;

        final parts = data.split('|');
        if (parts.length != 2) continue;

        final callType = parts[0];
        final callTime = DateTime.tryParse(parts[1]);
        if (callTime == null) continue;

        results.add(
          LastCallInfo(
            contactId: contactId,
            callType: callType,
            callTime: callTime,
          ),
        );
      }

      return results;
    } catch (e) {
      print('Error getting all last calls: $e');
      return [];
    }
  }
}

/// Data class for last call information
class LastCallInfo {
  final String contactId;
  final String callType; // "incoming", "outgoing", "missed"
  final DateTime callTime;

  LastCallInfo({
    required this.contactId,
    required this.callType,
    required this.callTime,
  });

  /// Get time ago display string
  String getTimeAgoDisplay() {
    final now = DateTime.now();
    final difference = now.difference(callTime);

    if (difference.inMinutes < 1) return 'Just now';
    if (difference.inHours < 1) return '${difference.inMinutes}m ago';
    if (difference.inDays < 1) return '${difference.inHours}h ago';
    if (difference.inDays == 1) return 'Yesterday';
    if (difference.inDays < 7) return '${difference.inDays}d ago';

    return '${difference.inDays ~/ 7}w ago';
  }

  /// Get call type display string
  String getTypeDisplay() {
    switch (callType) {
      case 'incoming':
        return '📲 Incoming';
      case 'outgoing':
        return '📞 Outgoing';
      case 'missed':
        return '❌ Missed';
      default:
        return callType;
    }
  }
}
