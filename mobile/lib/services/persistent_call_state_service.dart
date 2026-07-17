import 'package:hive_flutter/hive_flutter.dart';
import 'package:flutter/foundation.dart';
import '../models/agora_incoming_call.dart';

/// Service for persisting incoming call state across app kills
/// Allows recovery of call data when app is terminated
class PersistentCallStateService {
  static final PersistentCallStateService _instance =
      PersistentCallStateService._internal();

  factory PersistentCallStateService() => _instance;
  PersistentCallStateService._internal();

  static const String _boxName = 'persistent_call_state';
  static const String _callKey = 'pending_incoming_call';
  static const String _timestampKey = 'call_received_at';

  bool _initialized = false;
  late Box _box;

  /// Initialize the service
  Future<void> initialize() async {
    if (_initialized) return;

    try {
      _box = await Hive.openBox(_boxName);
      _initialized = true;
      debugPrint('[PersistentCallState] Initialized successfully');
    } catch (e) {
      debugPrint('[PersistentCallState] Initialization error: $e');
    }
  }

  /// Store an incoming call for persistence across app kill
  Future<void> storeIncomingCall(AgoraIncomingCall call) async {
    if (!_initialized) {
      debugPrint('[PersistentCallState] Not initialized, skipping store');
      return;
    }

    try {
      final callData = {
        'callId': call.callId,
        'channelName': call.channelName,
        'callerId': call.callerId,
        'callerName': call.callerName,
        'callerAvatar': call.callerAvatar,
        'isAudioOnly': call.isAudioOnly,
      };

      await _box.put(_callKey, callData);
      await _box.put(_timestampKey, DateTime.now().millisecondsSinceEpoch);

      debugPrint(
        '[PersistentCallState] Stored call: callId=${call.callId} from=${call.callerName}',
      );
    } catch (e) {
      debugPrint('[PersistentCallState] Error storing call: $e');
    }
  }

  /// Retrieve stored incoming call
  Future<AgoraIncomingCall?> getStoredIncomingCall() async {
    if (!_initialized) {
      debugPrint('[PersistentCallState] Not initialized, skipping retrieve');
      return null;
    }

    try {
      final callData = _box.get(_callKey) as Map<dynamic, dynamic>?;
      if (callData == null) {
        debugPrint('[PersistentCallState] No stored call found');
        return null;
      }

      // Check if call is too old (older than 5 minutes)
      final timestamp = _box.get(_timestampKey) as int?;
      if (timestamp != null) {
        final ageMs = DateTime.now().millisecondsSinceEpoch - timestamp;
        if (ageMs > 5 * 60 * 1000) {
          debugPrint(
            '[PersistentCallState] Stored call too old (${ageMs / 1000 / 60} min), discarding',
          );
          await clearStoredCall();
          return null;
        }
      }

      final call = AgoraIncomingCall(
        callId: callData['callId'] as String,
        channelName: callData['channelName'] as String,
        callerId: callData['callerId'] as String,
        callerName: callData['callerName'] as String,
        callerAvatar: callData['callerAvatar'] as String?,
        isAudioOnly: callData['isAudioOnly'] as bool? ?? false,
      );

      debugPrint(
        '[PersistentCallState] Retrieved call: callId=${call.callId} from=${call.callerName}',
      );

      return call;
    } catch (e) {
      debugPrint('[PersistentCallState] Error retrieving call: $e');
      return null;
    }
  }

  /// Clear stored call
  Future<void> clearStoredCall() async {
    if (!_initialized) return;

    try {
      await _box.delete(_callKey);
      await _box.delete(_timestampKey);
      debugPrint('[PersistentCallState] Cleared stored call');
    } catch (e) {
      debugPrint('[PersistentCallState] Error clearing call: $e');
    }
  }

  bool get isInitialized => _initialized;
}
