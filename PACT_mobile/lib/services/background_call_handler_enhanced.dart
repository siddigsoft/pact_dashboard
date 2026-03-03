import 'package:flutter/foundation.dart';
import 'package:workmanager/workmanager.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Enhanced background call handler for receiving calls when app is closed
class BackgroundCallHandlerEnhanced {
  static final BackgroundCallHandlerEnhanced _instance =
      BackgroundCallHandlerEnhanced._internal();

  factory BackgroundCallHandlerEnhanced() => _instance;
  BackgroundCallHandlerEnhanced._internal();

  bool _initialized = false;
  final SupabaseClient _supabase = Supabase.instance.client;

  /// Initialize background call handler
  Future<void> initialize() async {
    if (_initialized) return;

    try {
      // Initialize workmanager for periodic tasks
      Workmanager().initialize(_callbackDispatcher, isInDebugMode: kDebugMode);

      // Register periodic task to check for incoming calls
      await registerPeriodicCallCheck();

      _initialized = true;
      debugPrint('[BackgroundCallHandler] Initialized successfully');
    } catch (e) {
      debugPrint('[BackgroundCallHandler] Initialization error: $e');
    }
  }

  /// Register periodic task to check for incoming calls
  Future<void> registerPeriodicCallCheck() async {
    try {
      Workmanager().registerPeriodicTask(
        'check_incoming_calls',
        'checkIncomingCalls',
        frequency: const Duration(seconds: 15),
        constraints: Constraints(
          networkType: NetworkType.connected,
          requiresDeviceIdle: false,
          requiresBatteryNotLow: false,
          requiresCharging: false,
          requiresStorageNotLow: false,
        ),
        backoffPolicy: BackoffPolicy.exponential,
        initialDelay: const Duration(seconds: 5),
      );

      debugPrint('[BackgroundCallHandler] Periodic call check registered');
    } catch (e) {
      debugPrint('[BackgroundCallHandler] Error registering periodic task: $e');
    }
  }

  /// Register periodic task to sync messages
  Future<void> registerPeriodicMessageSync() async {
    try {
      Workmanager().registerPeriodicTask(
        'sync_messages',
        'syncMessages',
        frequency: const Duration(seconds: 30),
        constraints: Constraints(
          networkType: NetworkType.connected,
          requiresDeviceIdle: false,
          requiresBatteryNotLow: false,
        ),
        backoffPolicy: BackoffPolicy.exponential,
        initialDelay: const Duration(seconds: 10),
      );

      debugPrint('[BackgroundCallHandler] Periodic message sync registered');
    } catch (e) {
      debugPrint('[BackgroundCallHandler] Error registering message sync: $e');
    }
  }

  /// Cancel all periodic tasks
  Future<void> cancelAllTasks() async {
    try {
      await Workmanager().cancelAll();
      debugPrint('[BackgroundCallHandler] All periodic tasks cancelled');
    } catch (e) {
      debugPrint('[BackgroundCallHandler] Error cancelling tasks: $e');
    }
  }

  /// Check for pending missed calls
  Future<List<Map<String, dynamic>>> getPendingMissedCalls(
    String userId,
  ) async {
    try {
      final response = await _supabase
          .from('missed_calls')
          .select()
          .eq('user_id', userId);

      return List<Map<String, dynamic>>.from(response as List);
    } catch (e) {
      debugPrint('[BackgroundCallHandler] Error fetching missed calls: $e');
      return [];
    }
  }

  /// Mark call as missed
  Future<void> markCallAsMissed({
    required String userId,
    required String callerId,
    required String callerName,
    String? callerAvatar,
  }) async {
    try {
      await _supabase.from('missed_calls').insert({
        'user_id': userId,
        'caller_id': callerId,
        'caller_name': callerName,
        'caller_avatar': callerAvatar,
        'missed_at': DateTime.now().toIso8601String(),
      });

      debugPrint('[BackgroundCallHandler] Call marked as missed');
    } catch (e) {
      debugPrint('[BackgroundCallHandler] Error marking call as missed: $e');
    }
  }

  /// Get pending messages
  Future<List<Map<String, dynamic>>> getPendingMessages(String userId) async {
    try {
      final response = await _supabase
          .from('messages')
          .select()
          .eq('receiver_id', userId)
          .eq('read', false);

      return List<Map<String, dynamic>>.from(response as List);
    } catch (e) {
      debugPrint('[BackgroundCallHandler] Error fetching messages: $e');
      return [];
    }
  }

  /// Mark message as read
  Future<void> markMessageAsRead(String messageId) async {
    try {
      await _supabase
          .from('messages')
          .update({'read': true})
          .eq('id', messageId);

      debugPrint('[BackgroundCallHandler] Message marked as read');
    } catch (e) {
      debugPrint('[BackgroundCallHandler] Error marking message as read: $e');
    }
  }

  bool get isInitialized => _initialized;
}

/// Static callback dispatcher for background tasks
@pragma('vm:entry-point')
void _callbackDispatcher() {
  Workmanager().executeTask((taskName, inputData) async {
    try {
      if (taskName == 'checkIncomingCalls') {
        await _checkForIncomingCalls();
        return true;
      } else if (taskName == 'syncMessages') {
        await _syncMessages();
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('[BackgroundTask] Error: $e');
      return false;
    }
  });
}

/// Check for incoming calls in background
Future<bool> _checkForIncomingCalls() async {
  try {
    debugPrint('[BackgroundTask] Checking for incoming calls...');

    // Initialize Supabase if needed
    final supabase = Supabase.instance.client;

    // Get current user
    final user = supabase.auth.currentUser;
    if (user == null) {
      debugPrint('[BackgroundTask] No authenticated user');
      return false;
    }

    // Check for pending calls
    final pendingCalls = await supabase
        .from('missed_calls')
        .select()
        .eq('user_id', user.id);

    // Filter for non-cleared calls on client side
    final uncleared = (pendingCalls as List)
        .where((call) => call['cleared_at'] == null)
        .toList();

    debugPrint('[BackgroundTask] Found ${uncleared.length} pending calls');

    return true;
  } catch (e) {
    debugPrint('[BackgroundTask] Error checking calls: $e');
    return false;
  }
}

/// Sync messages in background
Future<bool> _syncMessages() async {
  try {
    debugPrint('[BackgroundTask] Syncing messages...');

    final supabase = Supabase.instance.client;
    final user = supabase.auth.currentUser;

    if (user == null) {
      debugPrint('[BackgroundTask] No authenticated user');
      return false;
    }

    // Get unread messages
    final messages = await supabase
        .from('messages')
        .select()
        .eq('receiver_id', user.id)
        .eq('read', false);

    debugPrint('[BackgroundTask] Synced ${messages.length} unread messages');

    return true;
  } catch (e) {
    debugPrint('[BackgroundTask] Error syncing messages: $e');
    return false;
  }
}
