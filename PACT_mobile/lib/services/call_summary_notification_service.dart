import 'package:supabase_flutter/supabase_flutter.dart';
import 'bilingual_notification_service.dart';

class CallSummaryNotificationService {
  static final CallSummaryNotificationService _instance =
      CallSummaryNotificationService._internal();
  factory CallSummaryNotificationService() => _instance;
  CallSummaryNotificationService._internal();

  final SupabaseClient _supabase = Supabase.instance.client;

  /// Show call summary notification with call details
  Future<void> showCallSummary({
    required String callerId,
    required String callerName,
    required String callerAvatar,
    required String callType, // 'incoming', 'outgoing'
    required int durationSeconds,
    required int? qualityRating,
    required bool wasSuccessful,
  }) async {
    try {
      final duration = _formatDuration(durationSeconds);
      final qualityText = qualityRating != null
          ? _getQualityText(qualityRating)
          : 'Unknown';

      final title = 'Call with $callerName';
      final body = wasSuccessful
          ? 'Duration: $duration • Quality: $qualityText'
          : 'Call failed - tap to retry';

      await BilingualNotificationService.showNotification(
        title: title,
        body: body,
        payload: {
          'type': 'call_summary',
          'caller_id': callerId,
          'caller_name': callerName,
          'call_type': callType,
          'duration': durationSeconds.toString(),
          'quality_rating': qualityRating?.toString() ?? '',
        },
      );
    } catch (e) {
      print('[CallSummary] Error showing notification: $e');
    }
  }

  /// Save call summary to database
  Future<void> saveCallSummary({
    required String userId,
    required String? callerId,
    required String? callerName,
    required String? callerAvatar,
    required String callType,
    required String status,
    required DateTime startedAt,
    required DateTime? endedAt,
    required int latencyMs,
    required int jitterMs,
    required double packetLoss,
    required int bitrate,
    int? qualityRating,
    String? reasonForEnd,
  }) async {
    try {
      final durationSeconds = endedAt?.difference(startedAt).inSeconds ?? 0;

      await _supabase.from('call_history').insert({
        'user_id': userId,
        'caller_id': callerId,
        'caller_name': callerName,
        'caller_avatar': callerAvatar,
        'call_type': callType,
        'status': status,
        'started_at': startedAt.toIso8601String(),
        'ended_at': endedAt?.toIso8601String(),
        'duration_seconds': durationSeconds,
        'latency_ms': latencyMs,
        'jitter_ms': jitterMs,
        'packet_loss': packetLoss,
        'bitrate': bitrate,
        'quality_rating': qualityRating,
        'reason_for_end': reasonForEnd,
      });

      // Update or create daily analytics
      await _updateDailyAnalytics(
        userId: userId,
        date: DateTime.now(),
        callType: callType,
        status: status,
        durationSeconds: durationSeconds,
        qualityRating: qualityRating,
        latencyMs: latencyMs,
      );
    } catch (e) {
      print('[CallSummary] Error saving call summary: $e');
    }
  }

  Future<void> _updateDailyAnalytics({
    required String userId,
    required DateTime date,
    required String callType,
    required String status,
    required int durationSeconds,
    required int? qualityRating,
    required int latencyMs,
  }) async {
    try {
      final today = DateTime(date.year, date.month, date.day);

      // Try to fetch existing record
      final existing = await _supabase
          .from('call_analytics')
          .select()
          .eq('user_id', userId)
          .eq('date', today.toIso8601String().split('T')[0])
          .then((data) => data.isNotEmpty ? data[0] : null);

      if (existing != null) {
        // Update existing
        final totalCalls = (existing['total_calls'] ?? 0) + 1;
        final incomingCalls =
            (existing['incoming_calls'] ?? 0) +
            (callType == 'incoming' ? 1 : 0);
        final outgoingCalls =
            (existing['outgoing_calls'] ?? 0) +
            (callType == 'outgoing' ? 1 : 0);
        final missedCalls =
            (existing['missed_calls'] ?? 0) + (status == 'missed' ? 1 : 0);
        final completedCalls =
            (existing['completed_calls'] ?? 0) +
            (status == 'completed' ? 1 : 0);
        final failedCalls =
            (existing['failed_calls'] ?? 0) + (status == 'failed' ? 1 : 0);
        final totalDuration =
            (existing['total_duration_seconds'] ?? 0) + durationSeconds;
        final avgDuration = totalCalls > 0 ? totalDuration ~/ totalCalls : 0;
        final networkIssues =
            (existing['network_issues_count'] ?? 0) + (latencyMs > 150 ? 1 : 0);

        final totalQuality =
            (existing['average_quality_rating'] ?? 0) * (totalCalls - 1) +
            (qualityRating ?? 3);
        final avgQuality = totalQuality / totalCalls;
        final acceptanceRate = completedCalls > 0
            ? (completedCalls / totalCalls) * 100
            : 0.0;

        await _supabase
            .from('call_analytics')
            .update({
              'total_calls': totalCalls,
              'incoming_calls': incomingCalls,
              'outgoing_calls': outgoingCalls,
              'missed_calls': missedCalls,
              'completed_calls': completedCalls,
              'failed_calls': failedCalls,
              'total_duration_seconds': totalDuration,
              'average_duration_seconds': avgDuration,
              'average_quality_rating': avgQuality,
              'acceptance_rate': acceptanceRate,
              'network_issues_count': networkIssues,
            })
            .eq('user_id', userId)
            .eq('date', today.toIso8601String().split('T')[0]);
      } else {
        // Create new
        await _supabase.from('call_analytics').insert({
          'user_id': userId,
          'date': today.toIso8601String().split('T')[0],
          'total_calls': 1,
          'incoming_calls': callType == 'incoming' ? 1 : 0,
          'outgoing_calls': callType == 'outgoing' ? 1 : 0,
          'missed_calls': status == 'missed' ? 1 : 0,
          'completed_calls': status == 'completed' ? 1 : 0,
          'failed_calls': status == 'failed' ? 1 : 0,
          'total_duration_seconds': durationSeconds,
          'average_duration_seconds': durationSeconds,
          'average_quality_rating': (qualityRating ?? 3).toDouble(),
          'acceptance_rate': status == 'completed' ? 100.0 : 0.0,
          'network_issues_count': latencyMs > 150 ? 1 : 0,
        });
      }
    } catch (e) {
      print('[CallSummary] Error updating analytics: $e');
    }
  }

  String _formatDuration(int seconds) {
    final hours = seconds ~/ 3600;
    final minutes = (seconds % 3600) ~/ 60;
    final secs = seconds % 60;

    if (hours > 0) {
      return '${hours}h ${minutes}m';
    } else if (minutes > 0) {
      return '${minutes}m ${secs}s';
    } else {
      return '${secs}s';
    }
  }

  String _getQualityText(int rating) {
    switch (rating) {
      case 5:
        return 'Excellent';
      case 4:
        return 'Good';
      case 3:
        return 'Fair';
      case 2:
        return 'Poor';
      case 1:
        return 'Very Poor';
      default:
        return 'Unknown';
    }
  }
}
