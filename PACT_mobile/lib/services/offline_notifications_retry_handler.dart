import 'package:flutter/material.dart';

/// Handles retry logic with exponential backoff for failed sync operations
class OfflineNotificationRetryHandler {
  static const int MAX_RETRIES = 3;
  static const Duration INITIAL_DELAY = Duration(seconds: 5);

  final Map<String, RetryState> _retryStates = {};

  /// Get current retry count for a notification
  int getRetryCount(String notificationId) {
    return _retryStates[notificationId]?.retryCount ?? 0;
  }

  /// Check if notification should be retried
  bool shouldRetry(String notificationId) {
    final state = _retryStates[notificationId];
    if (state == null) return true;
    return state.retryCount < MAX_RETRIES &&
        DateTime.now().isAfter(state.nextRetryTime);
  }

  /// Calculate exponential backoff delay
  Duration getNextDelay(int retryCount) {
    final delayMs =
        INITIAL_DELAY.inMilliseconds * (1 << retryCount); // 2^retries
    return Duration(milliseconds: delayMs);
  }

  /// Register a retry attempt
  void recordRetryAttempt(String notificationId) {
    final state =
        _retryStates[notificationId] ??
        RetryState(notificationId: notificationId);

    state.retryCount++;
    state.lastRetryTime = DateTime.now();
    state.nextRetryTime = DateTime.now().add(getNextDelay(state.retryCount));

    _retryStates[notificationId] = state;

    debugPrint(
      '[RetryHandler] Retry #${state.retryCount} for $notificationId, next attempt in ${getNextDelay(state.retryCount).inSeconds}s',
    );
  }

  /// Clear retry state for notification
  void clearRetry(String notificationId) {
    _retryStates.remove(notificationId);
  }

  /// Get all notifications pending retry
  List<String> getPendingRetries() {
    return _retryStates.entries
        .where((e) => e.value.retryCount < MAX_RETRIES)
        .map((e) => e.key)
        .toList();
  }

  /// Reset all retry states
  void reset() {
    _retryStates.clear();
  }
}

/// Tracks retry state for a single notification
class RetryState {
  final String notificationId;
  int retryCount = 0;
  DateTime lastRetryTime = DateTime.now();
  DateTime nextRetryTime = DateTime.now();

  RetryState({required this.notificationId});
}

/// Retry metrics for monitoring
class RetryMetrics {
  int totalRetries = 0;
  int successfulRetries = 0;
  int failedRetries = 0;
  List<String> recentFailures = [];
  DateTime lastRetryTime = DateTime.now();

  int get successRate {
    if (totalRetries == 0) return 0;
    return ((successfulRetries / totalRetries) * 100).toInt();
  }

  void recordSuccess() {
    totalRetries++;
    successfulRetries++;
    lastRetryTime = DateTime.now();
  }

  void recordFailure(String notificationId) {
    totalRetries++;
    failedRetries++;
    recentFailures.add(notificationId);
    if (recentFailures.length > 10) {
      recentFailures.removeAt(0);
    }
    lastRetryTime = DateTime.now();
  }

  void reset() {
    totalRetries = 0;
    successfulRetries = 0;
    failedRetries = 0;
    recentFailures.clear();
  }
}
