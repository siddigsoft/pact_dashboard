import 'dart:async';
import 'package:flutter/material.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';

/// Centralized crash analytics service
class CrashAnalyticsService {
  static final CrashAnalyticsService _instance =
      CrashAnalyticsService._internal();
  factory CrashAnalyticsService() => _instance;
  CrashAnalyticsService._internal();

  late FirebaseCrashlytics _crashlytics;
  final List<ErrorHandler> _errorHandlers = [];
  bool _isInitialized = false;

  /// Initialize crash analytics
  Future<void> initialize({
    bool enableDevLogging = true,
    VoidCallback? onInitComplete,
  }) async {
    try {
      _crashlytics = FirebaseCrashlytics.instance;

      // Capture Flutter errors
      FlutterError.onError = (errorDetails) {
        _crashlytics.recordFlutterError(errorDetails);
        debugPrint('[Crashlytics] Flutter error: ${errorDetails.exception}');
      };

      // Capture async errors
      PlatformDispatcher.instance.onError = (error, stack) {
        _crashlytics.recordError(error, stack);
        debugPrint('[Crashlytics] Platform error: $error');
        return true;
      };

      _isInitialized = true;
      debugPrint('[Crashlytics] Initialized');
      onInitComplete?.call();
    } catch (e) {
      debugPrint('[Crashlytics] Initialization error: $e');
    }
  }

  /// Record error
  Future<void> recordError({
    required dynamic error,
    required StackTrace stackTrace,
    String? reason,
    Map<String, dynamic>? information,
  }) async {
    if (!_isInitialized) return;

    try {
      await _crashlytics.recordError(
        error,
        stackTrace,
        reason: reason,
        information: information,
        printDetails: true,
      );
      debugPrint('[Crashlytics] Error recorded: $reason');
      _notifyErrorHandlers(error, stackTrace, reason);
    } catch (e) {
      debugPrint('[Crashlytics] Failed to record error: $e');
    }
  }

  /// Set user identifier
  Future<void> setUserId(String userId) async {
    if (!_isInitialized) return;

    try {
      await _crashlytics.setUserIdentifier(userId);
      debugPrint('[Crashlytics] User ID set: $userId');
    } catch (e) {
      debugPrint('[Crashlytics] Failed to set user ID: $e');
    }
  }

  /// Set custom key-value
  Future<void> setCustomKey({
    required String key,
    required dynamic value,
  }) async {
    if (!_isInitialized) return;

    try {
      await _crashlytics.setCustomKey(key, value);
    } catch (e) {
      debugPrint('[Crashlytics] Failed to set custom key: $e');
    }
  }

  /// Log message
  Future<void> log(String message) async {
    if (!_isInitialized) return;

    try {
      _crashlytics.log(message);
    } catch (e) {
      debugPrint('[Crashlytics] Failed to log message: $e');
    }
  }

  /// Get crash information
  Future<bool> checkForUncaughtException() async {
    if (!_isInitialized) return false;

    try {
      final didCrashOnPreviousExecution = await _crashlytics
          .didCrashOnPreviousExecution();
      if (didCrashOnPreviousExecution) {
        debugPrint('[Crashlytics] Previous crash detected');
      }
      return didCrashOnPreviousExecution;
    } catch (e) {
      debugPrint('[Crashlytics] Error checking for crashes: $e');
      return false;
    }
  }

  /// Verify crash reporting is working
  Future<bool> verifyCrashReporting() async {
    if (!_isInitialized) {
      debugPrint('[Crashlytics] Not initialized - cannot verify');
      return false;
    }

    try {
      // Test record
      await _crashlytics.recordError(
        Exception('[TEST] Crash reporting verification'),
        StackTrace.current,
        reason: 'Automated verification test',
        printDetails: false,
      );
      debugPrint('[Crashlytics] Verification test sent');
      return true;
    } catch (e) {
      debugPrint('[Crashlytics] Verification failed: $e');
      return false;
    }
  }

  /// Register error handler
  void registerErrorHandler(ErrorHandler handler) {
    _errorHandlers.add(handler);
  }

  /// Notify error handlers
  void _notifyErrorHandlers(
    dynamic error,
    StackTrace stackTrace,
    String? reason,
  ) {
    for (var handler in _errorHandlers) {
      try {
        handler(
          ErrorReport(
            error: error,
            stackTrace: stackTrace,
            reason: reason,
            timestamp: DateTime.now(),
          ),
        );
      } catch (e) {
        debugPrint('[ErrorHandler] Notification failed: $e');
      }
    }
  }

  /// Get initialization status
  bool get isInitialized => _isInitialized;
}

/// Error report model
class ErrorReport {
  final dynamic error;
  final StackTrace stackTrace;
  final String? reason;
  final DateTime timestamp;

  ErrorReport({
    required this.error,
    required this.stackTrace,
    this.reason,
    required this.timestamp,
  });

  String get errorString => error.toString();
  String get stackTraceString => stackTrace.toString();

  Map<String, dynamic> toJson() => {
    'error': errorString,
    'reason': reason,
    'timestamp': timestamp.toIso8601String(),
    'stackTrace': stackTraceString,
  };
}

/// Error handler callback
typedef ErrorHandler = void Function(ErrorReport errorReport);

/// Global error handling wrapper
class ErrorHandlingWrapper {
  /// Wrap widget with error boundary
  static Widget withErrorBoundary({
    required Widget child,
    VoidCallback? onError,
    bool showErrorUI = true,
  }) {
    return _ErrorBoundary(
      onError: onError,
      showErrorUI: showErrorUI,
      child: child,
    );
  }

  /// Wrap async operation with error handling
  static Future<T?> executeAsync<T>({
    required Future<T> Function() operation,
    required String operationName,
    VoidCallback? onError,
    bool shouldRethrow = false,
  }) async {
    try {
      return await operation();
    } catch (e, st) {
      debugPrint('[ErrorHandling] Error in $operationName: $e');
      await CrashAnalyticsService().recordError(
        error: e,
        stackTrace: st,
        reason: operationName,
      );
      onError?.call();
      if (shouldRethrow) rethrow;
      return null;
    }
  }

  /// Wrap sync operation with error handling
  static Future<T?> executeSync<T>({
    required T Function() operation,
    required String operationName,
    VoidCallback? onError,
    bool shouldRethrow = false,
  }) async {
    try {
      return operation();
    } catch (e, st) {
      debugPrint('[ErrorHandling] Error in $operationName: $e');
      await CrashAnalyticsService().recordError(
        error: e,
        stackTrace: st,
        reason: operationName,
      );
      onError?.call();
      if (shouldRethrow) rethrow;
      return null;
    }
  }
}

/// Error boundary widget
class _ErrorBoundary extends StatefulWidget {
  final Widget child;
  final VoidCallback? onError;
  final bool showErrorUI;

  const _ErrorBoundary({
    required this.child,
    this.onError,
    this.showErrorUI = true,
  });

  @override
  State<_ErrorBoundary> createState() => _ErrorBoundaryState();
}

class _ErrorBoundaryState extends State<_ErrorBoundary> {
  FlutterErrorDetails? _error;

  @override
  void initState() {
    super.initState();
    _setupErrorHandler();
  }

  void _setupErrorHandler() {
    final originalOnError = FlutterError.onError;
    FlutterError.onError = (FlutterErrorDetails details) {
      setState(() {
        _error = details;
      });
      widget.onError?.call();
      originalOnError?.call(details);
    };
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null && widget.showErrorUI) {
      return _ErrorDisplay(
        error: _error!,
        onRestart: () {
          setState(() {
            _error = null;
          });
        },
      );
    }

    return widget.child;
  }
}

/// Error display widget
class _ErrorDisplay extends StatelessWidget {
  final FlutterErrorDetails error;
  final VoidCallback onRestart;

  const _ErrorDisplay({required this.error, required this.onRestart});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.error_outline, size: 64, color: Colors.red),
              SizedBox(height: 24),
              Text(
                'Oops! Something went wrong',
                style: Theme.of(context).textTheme.headlineSmall,
                textAlign: TextAlign.center,
              ),
              SizedBox(height: 16),
              Expanded(
                child: SingleChildScrollView(
                  child: Text(
                    error.exceptionAsString(),
                    style: Theme.of(context).textTheme.bodySmall,
                    textAlign: TextAlign.start,
                  ),
                ),
              ),
              SizedBox(height: 24),
              ElevatedButton(onPressed: onRestart, child: Text('Try Again')),
            ],
          ),
        ),
      ),
    );
  }
}

/// Error recovery service
class ErrorRecoveryService {
  static final ErrorRecoveryService _instance =
      ErrorRecoveryService._internal();
  factory ErrorRecoveryService() => _instance;
  ErrorRecoveryService._internal();

  final Map<String, RecoveryStrategy> _strategies = {};

  /// Register recovery strategy for error type
  void registerStrategy({
    required String errorType,
    required RecoveryStrategy strategy,
  }) {
    _strategies[errorType] = strategy;
  }

  /// Execute recovery
  Future<bool> recover({required String errorType, dynamic error}) async {
    final strategy = _strategies[errorType];
    if (strategy != null) {
      try {
        return await strategy(error);
      } catch (e) {
        debugPrint('[ErrorRecovery] Recovery failed: $e');
        return false;
      }
    }
    return false;
  }
}

/// Recovery strategy callback
typedef RecoveryStrategy = Future<bool> Function(dynamic error);
