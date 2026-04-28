import 'package:hive_flutter/hive_flutter.dart';
import 'package:flutter/foundation.dart';
import '../models/agora_incoming_call.dart';

/// Service for managing call state persistence in database
/// Provides database-backed storage for call events and recovery
class CallStatePersistenceService {
  static final CallStatePersistenceService _instance =
      CallStatePersistenceService._internal();

  factory CallStatePersistenceService() => _instance;
  CallStatePersistenceService._internal();

  static const String _boxName = 'call_state_persistence';
  static const String _missedCallsKey = 'missed_calls_list';
  static const String _activeCallsKey = 'active_calls_list';
  static const String _callHistoryKey = 'call_history_list';

  bool _initialized = false;
  late Box _box;

  /// Initialize the persistence service
  Future<void> initialize() async {
    if (_initialized) return;

    try {
      _box = await Hive.openBox(_boxName);
      _initialized = true;
      debugPrint('[CallStatePersistence] Initialized successfully');
    } catch (e) {
      debugPrint('[CallStatePersistence] Initialization error: $e');
    }
  }

  /// Record a missed call
  Future<void> recordMissedCall({
    required String callId,
    required String callerId,
    required String callerName,
    String? callerAvatar,
    required bool isAudioOnly,
  }) async {
    if (!_initialized) return;

    try {
      final missedCalls =
          _box.get(_missedCallsKey, defaultValue: <Map>[]) as List;

      missedCalls.add({
        'callId': callId,
        'callerId': callerId,
        'callerName': callerName,
        'callerAvatar': callerAvatar,
        'isAudioOnly': isAudioOnly,
        'missedAt': DateTime.now().toIso8601String(),
      });

      await _box.put(_missedCallsKey, missedCalls);

      debugPrint(
        '[CallStatePersistence] Recorded missed call: $callId from $callerName',
      );
    } catch (e) {
      debugPrint('[CallStatePersistence] Error recording missed call: $e');
    }
  }

  /// Get all missed calls
  Future<List<Map<String, dynamic>>> getMissedCalls() async {
    if (!_initialized) return [];

    try {
      final missedCalls =
          _box.get(_missedCallsKey, defaultValue: <Map>[]) as List;
      return List<Map<String, dynamic>>.from(missedCalls);
    } catch (e) {
      debugPrint('[CallStatePersistence] Error getting missed calls: $e');
      return [];
    }
  }

  /// Clear a missed call
  Future<void> clearMissedCall(String callId) async {
    if (!_initialized) return;

    try {
      final missedCalls =
          _box.get(_missedCallsKey, defaultValue: <Map>[]) as List;
      missedCalls.removeWhere((call) => call['callId'] == callId);
      await _box.put(_missedCallsKey, missedCalls);

      debugPrint('[CallStatePersistence] Cleared missed call: $callId');
    } catch (e) {
      debugPrint('[CallStatePersistence] Error clearing missed call: $e');
    }
  }

  /// Clear all missed calls
  Future<void> clearAllMissedCalls() async {
    if (!_initialized) return;

    try {
      await _box.put(_missedCallsKey, []);
      debugPrint('[CallStatePersistence] Cleared all missed calls');
    } catch (e) {
      debugPrint('[CallStatePersistence] Error clearing all missed calls: $e');
    }
  }

  /// Record an active call
  Future<void> recordActiveCall({
    required String callId,
    required String remoteUserId,
    required String remoteUserName,
    String? remoteUserAvatar,
    required bool isAudioOnly,
    required bool isOutgoing,
  }) async {
    if (!_initialized) return;

    try {
      final activeCalls =
          _box.get(_activeCallsKey, defaultValue: <Map>[]) as List;

      activeCalls.add({
        'callId': callId,
        'remoteUserId': remoteUserId,
        'remoteUserName': remoteUserName,
        'remoteUserAvatar': remoteUserAvatar,
        'isAudioOnly': isAudioOnly,
        'isOutgoing': isOutgoing,
        'startedAt': DateTime.now().toIso8601String(),
      });

      await _box.put(_activeCallsKey, activeCalls);

      debugPrint(
        '[CallStatePersistence] Recorded active call: $callId with $remoteUserName',
      );
    } catch (e) {
      debugPrint('[CallStatePersistence] Error recording active call: $e');
    }
  }

  /// Get active calls
  Future<List<Map<String, dynamic>>> getActiveCalls() async {
    if (!_initialized) return [];

    try {
      final activeCalls =
          _box.get(_activeCallsKey, defaultValue: <Map>[]) as List;
      return List<Map<String, dynamic>>.from(activeCalls);
    } catch (e) {
      debugPrint('[CallStatePersistence] Error getting active calls: $e');
      return [];
    }
  }

  /// Clear an active call
  Future<void> clearActiveCall(String callId) async {
    if (!_initialized) return;

    try {
      final activeCalls =
          _box.get(_activeCallsKey, defaultValue: <Map>[]) as List;
      activeCalls.removeWhere((call) => call['callId'] == callId);
      await _box.put(_activeCallsKey, activeCalls);

      debugPrint('[CallStatePersistence] Cleared active call: $callId');
    } catch (e) {
      debugPrint('[CallStatePersistence] Error clearing active call: $e');
    }
  }

  /// Clear all active calls
  Future<void> clearAllActiveCalls() async {
    if (!_initialized) return;

    try {
      await _box.put(_activeCallsKey, []);
      debugPrint('[CallStatePersistence] Cleared all active calls');
    } catch (e) {
      debugPrint('[CallStatePersistence] Error clearing all active calls: $e');
    }
  }

  /// Record call in history
  Future<void> recordCallHistory({
    required String callId,
    required String remoteUserId,
    required String remoteUserName,
    String? remoteUserAvatar,
    required bool isAudioOnly,
    required bool isOutgoing,
    required bool wasAccepted,
    required int durationSeconds,
  }) async {
    if (!_initialized) return;

    try {
      final history = _box.get(_callHistoryKey, defaultValue: <Map>[]) as List;

      history.add({
        'callId': callId,
        'remoteUserId': remoteUserId,
        'remoteUserName': remoteUserName,
        'remoteUserAvatar': remoteUserAvatar,
        'isAudioOnly': isAudioOnly,
        'isOutgoing': isOutgoing,
        'wasAccepted': wasAccepted,
        'durationSeconds': durationSeconds,
        'timestamp': DateTime.now().toIso8601String(),
      });

      // Keep only last 100 calls in history
      if (history.length > 100) {
        history.removeRange(0, history.length - 100);
      }

      await _box.put(_callHistoryKey, history);

      debugPrint('[CallStatePersistence] Recorded call in history: $callId');
    } catch (e) {
      debugPrint('[CallStatePersistence] Error recording call history: $e');
    }
  }

  /// Get call history
  Future<List<Map<String, dynamic>>> getCallHistory({int limit = 50}) async {
    if (!_initialized) return [];

    try {
      final history = _box.get(_callHistoryKey, defaultValue: <Map>[]) as List;
      final result = List<Map<String, dynamic>>.from(history);

      // Return most recent calls first
      if (result.length > limit) {
        return result.sublist(result.length - limit);
      }
      return result.reversed.toList();
    } catch (e) {
      debugPrint('[CallStatePersistence] Error getting call history: $e');
      return [];
    }
  }

  /// Clear all data
  Future<void> clearAll() async {
    if (!_initialized) return;

    try {
      await _box.clear();
      debugPrint('[CallStatePersistence] Cleared all call state data');
    } catch (e) {
      debugPrint('[CallStatePersistence] Error clearing all data: $e');
    }
  }

  bool get isInitialized => _initialized;
}
