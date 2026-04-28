import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'call_notification_service.dart';
import 'call_state_persistence_service.dart';

class BackgroundCallHandler {
  static final BackgroundCallHandler _instance =
      BackgroundCallHandler._internal();
  factory BackgroundCallHandler() => _instance;
  BackgroundCallHandler._internal();

  static const String _isolateName = 'background_call_isolate';
  static const String _portName = 'background_call_port';

  RealtimeChannel? _backgroundChannel;
  String? _currentUserId;
  String? _currentUserName;
  bool _isInitialized = false;

  final _incomingCallController =
      StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get incomingCallStream =>
      _incomingCallController.stream;

  /// Persistence service for tracking call state
  final _callStatePersistence = CallStatePersistenceService();

  Future<void> initialize({
    required String userId,
    required String userName,
  }) async {
    if (_isInitialized) return;

    _currentUserId = userId;
    _currentUserName = userName;

    await CallNotificationService().initialize();
    await _callStatePersistence.initialize();
    await _setupBackgroundSignaling();

    _isInitialized = true;
    debugPrint('[BackgroundCall] Handler initialized for user: $userName');
  }

  Future<void> _setupBackgroundSignaling() async {
    if (_currentUserId == null) return;

    final supabase = Supabase.instance.client;

    // Use same channel name & event as AgoraCallService for unified signaling
    _backgroundChannel = supabase.channel('agora-signaling:$_currentUserId');

    _backgroundChannel!.onBroadcast(
      event: 'agora-signal',
      callback: (payload) async {
        debugPrint('[BackgroundCall] Received signal in background: $payload');
        await _handleBackgroundSignal(payload);
      },
    );

    _backgroundChannel!.subscribe((status, error) {
      debugPrint('[BackgroundCall] Channel status: $status');
      if (error != null) {
        debugPrint('[BackgroundCall] Channel error: $error');
      }
    });

    debugPrint('[BackgroundCall] Background signaling ready');
  }

  Future<void> _handleBackgroundSignal(Map<String, dynamic> payload) async {
    final type = payload['type'] as String?;
    final from = payload['from'] as String?;
    final fromName = payload['fromName'] as String?;
    final to = payload['to'] as String?;
    final callId = payload['callId'] as String?;
    final isAudioOnly = payload['isAudioOnly'] as bool? ?? true;
    final fromAvatar = payload['fromAvatar'] as String?;

    if (to != _currentUserId) return;

    if (type == 'call-request' || type == 'callRequest') {
      _incomingCallController.add(payload);

      // Record as active call for potential recovery
      if (callId != null && from != null && fromName != null) {
        await _callStatePersistence.recordActiveCall(
          callId: callId,
          remoteUserId: from,
          remoteUserName: fromName,
          remoteUserAvatar: fromAvatar,
          isAudioOnly: isAudioOnly,
          isOutgoing: false,
        );
      }

      await CallNotificationService().showIncomingCallNotification(
        callId:
            callId ?? 'unknown-$from-${DateTime.now().millisecondsSinceEpoch}',
        callerId: from ?? '',
        callerName: fromName ?? 'Unknown Caller',
        isVideoCall: !isAudioOnly,
        channelName: (payload['channelName'] ?? '').toString(),
      );

      debugPrint(
        '[BackgroundCall] Incoming call from: $fromName, callId: $callId',
      );
    } else if (type == 'call-ended' ||
        type == 'callEnd' ||
        type == 'call-rejected' ||
        type == 'callReject') {
      // If call was missed (not answered), record it
      if (callId != null && from != null && fromName != null) {
        await _callStatePersistence.recordMissedCall(
          callId: callId,
          callerId: from,
          callerName: fromName,
          callerAvatar: fromAvatar,
          isAudioOnly: isAudioOnly,
        );
        await _callStatePersistence.clearActiveCall(callId);
      }

      if (callId != null) {
        await CallNotificationService().dismissIncomingCallNotification(callId);
      } else {
        await CallNotificationService().dismissAllIncomingCallNotifications();
      }
      debugPrint('[BackgroundCall] Call ended/rejected');
    }
  }

  Future<void> showMissedCall(String callerId, String callerName) async {
    await CallNotificationService().showMissedCallNotification(
      callerId: callerId,
      callerName: callerName,
    );
  }

  Future<void> dismissCallNotification(String callId) async {
    await CallNotificationService().dismissIncomingCallNotification(callId);
  }

  Future<void> dispose() async {
    if (_backgroundChannel != null) {
      await Supabase.instance.client.removeChannel(_backgroundChannel!);
      _backgroundChannel = null;
    }

    await _incomingCallController.close();
    _isInitialized = false;

    debugPrint('[BackgroundCall] Handler disposed');
  }
}
