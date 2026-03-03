import 'dart:async';
import '../services/webrtc_service.dart';

class CallRetryService {
  static final CallRetryService _instance = CallRetryService._internal();
  factory CallRetryService() => _instance;
  CallRetryService._internal();

  final WebRTCService _webrtcService = WebRTCService();

  /// Retry a failed call with exponential backoff
  Future<bool> retryCall({
    required String targetUserId,
    required String targetUserName,
    required int retryCount,
    int maxRetries = 3,
    bool isAudioOnly = false,
  }) async {
    try {
      // Check if max retries exceeded
      if (retryCount >= maxRetries) {
        return false;
      }

      // Calculate backoff delay (1s, 2s, 4s)
      final delaySeconds = _calculateBackoff(retryCount);
      await Future.delayed(Duration(seconds: delaySeconds));

      // Attempt call
      final success = await _webrtcService.initiateCall(
        targetUserId: targetUserId,
        targetUserName: targetUserName,
        isAudioOnly: isAudioOnly,
      );

      return success;
    } catch (e) {
      print('[CallRetry] Error retrying call: $e');
      return false;
    }
  }

  /// Get retry information
  Map<String, dynamic> getRetryInfo(int retryCount, int maxRetries) {
    final delaySeconds = _calculateBackoff(retryCount);
    final nextRetryIn = DateTime.now().add(Duration(seconds: delaySeconds));

    return {
      'retry_count': retryCount,
      'max_retries': maxRetries,
      'next_retry_seconds': delaySeconds,
      'next_retry_at': nextRetryIn,
      'can_retry': retryCount < maxRetries,
    };
  }

  /// Calculate exponential backoff: 1s, 2s, 4s, 8s...
  int _calculateBackoff(int retryCount) {
    return 1 << retryCount; // 2^retryCount
  }

  /// Format retry message
  String getRetryMessage(int retryCount, int maxRetries) {
    if (retryCount >= maxRetries) {
      return 'Max retries reached. Try again later.';
    }

    final nextDelay = _calculateBackoff(retryCount);
    return 'Retry in $nextDelay second${nextDelay > 1 ? 's' : ''}... (Attempt ${retryCount + 1}/$maxRetries)';
  }
}
