import 'dart:async';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

class OfflineCallQueueService {
  static final OfflineCallQueueService _instance =
      OfflineCallQueueService._internal();
  factory OfflineCallQueueService() => _instance;
  OfflineCallQueueService._internal();

  final SupabaseClient _supabase = Supabase.instance.client;
  final Connectivity _connectivity = Connectivity();

  Timer? _retryTimer;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  bool _isProcessing = false;

  /// Callbacks for queue events
  final List<Function(String queueId, Map<String, dynamic>)> _onQueueItem = [];
  final List<Function(String queueId)> _onQueueItemProcessed = [];

  /// Initialize offline call queue service with connectivity listening
  Future<void> initialize() async {
    try {
      // Set up connectivity listener for auto-sync on reconnection
      _setupConnectivityListener();

      // Start periodic retry timer
      startRetryTimer();

      debugPrint('[OfflineQueue] Service initialized with auto-sync');
    } catch (e) {
      debugPrint('[OfflineQueue] Initialization error: $e');
    }
  }

  /// Set up connectivity listener for auto-sync on reconnection
  void _setupConnectivityListener() {
    _connectivitySubscription?.cancel();

    _connectivitySubscription = _connectivity.onConnectivityChanged.listen((
      results,
    ) async {
      final hasInternet = !results.contains(ConnectivityResult.none);

      if (hasInternet) {
        debugPrint('[OfflineQueue] Internet restored - auto-syncing queue');
        await _processAllRetries();
      }
    });
  }

  /// Register callback when queue item is added
  void onQueueItem(Function(String queueId, Map<String, dynamic>) callback) {
    _onQueueItem.add(callback);
  }

  /// Register callback when queue item is processed
  void onQueueItemProcessed(Function(String queueId) callback) {
    _onQueueItemProcessed.add(callback);
  }

  /// Add call to offline queue
  Future<bool> queueOfflineCall({
    required String userId,
    required String targetUserId,
    required String targetUserName,
    required String callType, // 'audio', 'video'
    int maxRetries = 3,
  }) async {
    try {
      await _supabase.from('offline_call_queue').insert({
        'user_id': userId,
        'target_user_id': targetUserId,
        'target_user_name': targetUserName,
        'call_type': callType,
        'retry_count': 0,
        'max_retries': maxRetries,
        'next_retry_at': DateTime.now()
            .add(Duration(seconds: 10))
            .toIso8601String(),
      });
      return true;
    } catch (e) {
      debugPrint('[OfflineQueue] Error queueing call: $e');
      return false;
    }
  }

  /// Get queued calls for user
  Future<List<Map<String, dynamic>>> getQueuedCalls(String userId) async {
    try {
      final data = await _supabase
          .from('offline_call_queue')
          .select()
          .eq('user_id', userId)
          .order('created_at', ascending: true);

      return List<Map<String, dynamic>>.from(data as List);
    } catch (e) {
      debugPrint('[OfflineQueue] Error fetching queue: $e');
      return [];
    }
  }

  /// Process retry for queued call
  Future<void> processRetry(String queueId) async {
    try {
      final call = await _supabase
          .from('offline_call_queue')
          .select()
          .eq('id', queueId)
          .single()
          .then((data) => data)
          .catchError((_) => null);

      final retryCount = (call['retry_count'] ?? 0) + 1;
      final maxRetries = call['max_retries'] ?? 3;

      if (retryCount >= maxRetries) {
        // Max retries reached, mark as failed
        await _supabase.from('offline_call_queue').delete().eq('id', queueId);
      } else {
        // Schedule next retry
        final nextRetrySeconds = _exponentialBackoff(retryCount);
        await _supabase
            .from('offline_call_queue')
            .update({
              'retry_count': retryCount,
              'next_retry_at': DateTime.now()
                  .add(Duration(seconds: nextRetrySeconds))
                  .toIso8601String(),
            })
            .eq('id', queueId);
      }
    } catch (e) {
      debugPrint('[OfflineQueue] Error processing retry: $e');
    }
  }

  /// Remove call from queue
  Future<bool> removeFromQueue(String queueId) async {
    try {
      await _supabase.from('offline_call_queue').delete().eq('id', queueId);
      return true;
    } catch (e) {
      debugPrint('[OfflineQueue] Error removing from queue: $e');
      return false;
    }
  }

  /// Start retry timer
  void startRetryTimer() {
    _retryTimer?.cancel();
    _retryTimer = Timer.periodic(const Duration(seconds: 30), (_) async {
      await _processAllRetries();
    });
  }

  /// Stop retry timer
  void stopRetryTimer() {
    _retryTimer?.cancel();
    _retryTimer = null;
  }

  /// Dispose of resources
  Future<void> dispose() async {
    stopRetryTimer();
    _connectivitySubscription?.cancel();
    _onQueueItem.clear();
    _onQueueItemProcessed.clear();
    debugPrint('[OfflineQueue] Service disposed');
  }

  Future<void> _processAllRetries() async {
    if (_isProcessing) {
      debugPrint('[OfflineQueue] Already processing, skipping');
      return;
    }

    _isProcessing = true;
    try {
      final calls = await _supabase
          .from('offline_call_queue')
          .select()
          .lte('next_retry_at', DateTime.now().toIso8601String());

      if (calls.isEmpty) {
        debugPrint('[OfflineQueue] No calls to retry');
        _isProcessing = false;
        return;
      }

      debugPrint('[OfflineQueue] Processing ${calls.length} queued calls');

      for (final call in calls) {
        // Notify listeners about this queue item
        for (final callback in _onQueueItem) {
          try {
            callback(call['id'] as String, Map<String, dynamic>.from(call));
          } catch (e) {
            debugPrint('[OfflineQueue] Callback error: $e');
          }
        }

        await processRetry(call['id']);

        // Notify listeners about processed item
        for (final callback in _onQueueItemProcessed) {
          try {
            callback(call['id'] as String);
          } catch (e) {
            debugPrint('[OfflineQueue] Callback error: $e');
          }
        }
      }

      debugPrint('[OfflineQueue] Retry processing completed');
    } catch (e) {
      debugPrint('[OfflineQueue] Error processing retries: $e');
    } finally {
      _isProcessing = false;
    }
  }

  /// Exponential backoff: 10s, 20s, 40s, 80s...
  int _exponentialBackoff(int retryCount) {
    return 10 * (1 << (retryCount - 1)); // 10, 20, 40, 80...
  }
}
