import 'package:flutter/foundation.dart';
import 'background_call_handler.dart';
import 'background_call_router.dart';
import 'call_state_persistence_service.dart';
import 'persistent_call_state_service.dart';
import 'call_notification_service.dart';

/// Central manager for orchestrating all background call operations
/// Coordinates between multiple services to handle calls reliably in background
class BackgroundCallManager {
  static final BackgroundCallManager _instance =
      BackgroundCallManager._internal();

  factory BackgroundCallManager() => _instance;
  BackgroundCallManager._internal();

  final _handler = BackgroundCallHandler();
  final _router = BackgroundCallRouter();
  final _statePersistence = CallStatePersistenceService();
  final _persistentCallState = PersistentCallStateService();
  final _notificationService = CallNotificationService();

  bool _initialized = false;
  String? _currentUserId;

  /// Initialize the background call manager
  Future<void> initialize({
    required String userId,
    required String userName,
  }) async {
    if (_initialized && _currentUserId == userId) {
      debugPrint(
        '[BackgroundCallManager] Already initialized for user: $userId',
      );
      return;
    }

    try {
      _currentUserId = userId;

      // Initialize all dependent services
      await _notificationService.initialize();
      await _persistentCallState.initialize();
      await _statePersistence.initialize();
      await _handler.initialize(userId: userId, userName: userName);
      await _router.initialize();

      _initialized = true;
      debugPrint(
        '[BackgroundCallManager] Initialized successfully for user: $userName',
      );
    } catch (e) {
      debugPrint('[BackgroundCallManager] Initialization error: $e');
    }
  }

  /// Get background call handler stream
  Stream<Map<String, dynamic>> get incomingCallStream =>
      _handler.incomingCallStream;

  /// Get stored call if available (e.g., from notification tap)
  Future<dynamic> getStoredCall() async {
    return _persistentCallState.getStoredIncomingCall();
  }

  /// Clear stored call
  Future<void> clearStoredCall() async {
    await _persistentCallState.clearStoredCall();
  }

  /// Get list of missed calls
  Future<List<Map<String, dynamic>>> getMissedCalls() async {
    return _statePersistence.getMissedCalls();
  }

  /// Clear a missed call record
  Future<void> clearMissedCall(String callId) async {
    await _statePersistence.clearMissedCall(callId);
  }

  /// Clear all missed calls
  Future<void> clearAllMissedCalls() async {
    await _statePersistence.clearAllMissedCalls();
  }

  /// Get active calls
  Future<List<Map<String, dynamic>>> getActiveCalls() async {
    return _statePersistence.getActiveCalls();
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
    await _statePersistence.recordActiveCall(
      callId: callId,
      remoteUserId: remoteUserId,
      remoteUserName: remoteUserName,
      remoteUserAvatar: remoteUserAvatar,
      isAudioOnly: isAudioOnly,
      isOutgoing: isOutgoing,
    );
  }

  /// Record a call in history
  Future<void> recordCallInHistory({
    required String callId,
    required String remoteUserId,
    required String remoteUserName,
    String? remoteUserAvatar,
    required bool isAudioOnly,
    required bool isOutgoing,
    required bool wasAccepted,
    required int durationSeconds,
  }) async {
    await _statePersistence.recordCallHistory(
      callId: callId,
      remoteUserId: remoteUserId,
      remoteUserName: remoteUserName,
      remoteUserAvatar: remoteUserAvatar,
      isAudioOnly: isAudioOnly,
      isOutgoing: isOutgoing,
      wasAccepted: wasAccepted,
      durationSeconds: durationSeconds,
    );
  }

  /// Get call history
  Future<List<Map<String, dynamic>>> getCallHistory({int limit = 50}) async {
    return _statePersistence.getCallHistory(limit: limit);
  }

  /// Dismiss a specific call notification
  Future<void> dismissCallNotification(String callId) async {
    await _notificationService.dismissIncomingCallNotification(callId);
  }

  /// Dismiss all call notifications
  Future<void> dismissAllCallNotifications() async {
    await _notificationService.dismissAllIncomingCallNotifications();
  }

  /// Clean up all background call state
  Future<void> cleanup() async {
    try {
      await _notificationService.dismissAllIncomingCallNotifications();
      await _statePersistence.clearAll();
      await _persistentCallState.clearStoredCall();
      debugPrint('[BackgroundCallManager] Cleanup completed');
    } catch (e) {
      debugPrint('[BackgroundCallManager] Cleanup error: $e');
    }
  }

  /// Get connectivity status of background calls
  bool get isInitialized => _initialized;

  /// Get current user ID
  String? get currentUserId => _currentUserId;
}
