import 'dart:async';
import 'package:supabase_flutter/supabase_flutter.dart';

class OfflineCallQueueService {
  static final OfflineCallQueueService _instance =
      OfflineCallQueueService._internal();
  factory OfflineCallQueueService() => _instance;
  OfflineCallQueueService._internal();

  final SupabaseClient _supabase = Supabase.instance.client;
  Timer? _retryTimer;

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
      print('[OfflineQueue] Error queueing call: $e');
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
      print('[OfflineQueue] Error fetching queue: $e');
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
      print('[OfflineQueue] Error processing retry: $e');
    }
  }

  /// Remove call from queue
  Future<bool> removeFromQueue(String queueId) async {
    try {
      await _supabase.from('offline_call_queue').delete().eq('id', queueId);
      return true;
    } catch (e) {
      print('[OfflineQueue] Error removing from queue: $e');
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

  Future<void> _processAllRetries() async {
    try {
      final calls = await _supabase
          .from('offline_call_queue')
          .select()
          .lte('next_retry_at', DateTime.now().toIso8601String());

      for (final call in calls) {
        await processRetry(call['id']);
      }
    } catch (e) {
      print('[OfflineQueue] Error processing retries: $e');
    }
  }

  /// Exponential backoff: 10s, 20s, 40s, 80s...
  int _exponentialBackoff(int retryCount) {
    return 10 * (1 << (retryCount - 1)); // 10, 20, 40, 80...
  }
}
