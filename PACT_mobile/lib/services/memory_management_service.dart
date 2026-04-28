import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

/// Memory and performance monitoring service
class MemoryManagementService {
  static final MemoryManagementService _instance =
      MemoryManagementService._internal();
  factory MemoryManagementService() => _instance;
  MemoryManagementService._internal();

  static const platform = MethodChannel('com.pact.mobile/memory');
  Timer? _monitoringTimer;
  MemoryMetrics? _lastMetrics;
  final List<MemoryMetric> _metricsHistory = [];
  final int maxHistorySize = 100;
  final List<MemoryWarningCallback> _warningCallbacks = [];

  /// Start monitoring memory
  void startMonitoring({Duration interval = const Duration(seconds: 5)}) {
    _monitoringTimer?.cancel();
    _monitoringTimer = Timer.periodic(interval, (_) async {
      await _checkMemory();
    });
    debugPrint('[MemoryManagement] Monitoring started');
  }

  /// Stop monitoring memory
  void stopMonitoring() {
    _monitoringTimer?.cancel();
    _monitoringTimer = null;
    debugPrint('[MemoryManagement] Monitoring stopped');
  }

  /// Check current memory usage
  Future<MemoryMetrics?> getMemoryMetrics() async {
    try {
      if (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS) {
        final Map<dynamic, dynamic> result = await platform.invokeMethod(
          'getMemoryInfo',
        );

        final metrics = MemoryMetrics(
          nativeHeap: (result['nativeHeap'] as num?)?.toInt() ?? 0,
          dartHeap: (result['dartHeap'] as num?)?.toInt() ?? 0,
          totalMemory: (result['totalMemory'] as num?)?.toInt() ?? 0,
          timestamp: DateTime.now(),
        );

        _lastMetrics = metrics;
        _recordMetric(metrics);
        _checkWarnings(metrics);

        return metrics;
      }
    } catch (e) {
      debugPrint('[MemoryManagement] Error getting metrics: $e');
    }
    return null;
  }

  /// Check memory and gather warnings
  Future<void> _checkMemory() async {
    final metrics = await getMemoryMetrics();
    if (metrics != null) {
      debugPrint(
        '[MemoryManagement] Memory - Native: ${_formatBytes(metrics.nativeHeap)}, '
        'Dart: ${_formatBytes(metrics.dartHeap)}',
      );
    }
  }

  /// Check for memory warnings
  void _checkWarnings(MemoryMetrics metrics) {
    final totalPercent = (metrics.totalMemory / 1000000000) * 100;

    if (totalPercent > 90) {
      _notifyWarning(MemoryWarning.critical);
    } else if (totalPercent > 75) {
      _notifyWarning(MemoryWarning.high);
    } else if (totalPercent > 50) {
      _notifyWarning(MemoryWarning.moderate);
    }
  }

  /// Record metric for history
  void _recordMetric(MemoryMetrics metrics) {
    _metricsHistory.add(
      MemoryMetric(
        nativeHeap: metrics.nativeHeap,
        dartHeap: metrics.dartHeap,
        timestamp: metrics.timestamp,
      ),
    );

    // Keep history size manageable
    if (_metricsHistory.length > maxHistorySize) {
      _metricsHistory.removeAt(0);
    }
  }

  /// Clear memory by suggesting garbage collection
  Future<void> clearMemory() async {
    try {
      await platform.invokeMethod('clearMemory');
      debugPrint('[MemoryManagement] Memory clear triggered');
    } catch (e) {
      debugPrint('[MemoryManagement] Error clearing memory: $e');
    }
  }

  /// Get memory statistics
  MemoryStats? getMemoryStats() {
    if (_metricsHistory.isEmpty) return null;

    double avgNative = 0;
    double avgDart = 0;
    int maxNative = 0;
    int maxDart = 0;
    int minNative = 0xFFFFFFFF;
    int minDart = 0xFFFFFFFF;

    for (var metric in _metricsHistory) {
      avgNative += metric.nativeHeap;
      avgDart += metric.dartHeap;
      maxNative = metric.nativeHeap > maxNative ? metric.nativeHeap : maxNative;
      maxDart = metric.dartHeap > maxDart ? metric.dartHeap : maxDart;
      minNative = metric.nativeHeap < minNative ? metric.nativeHeap : minNative;
      minDart = metric.dartHeap < minDart ? metric.dartHeap : minDart;
    }

    return MemoryStats(
      averageNativeHeap: (avgNative / _metricsHistory.length).toInt(),
      averageDartHeap: (avgDart / _metricsHistory.length).toInt(),
      maxNativeHeap: maxNative,
      maxDartHeap: maxDart,
      minNativeHeap: minNative,
      minDartHeap: minDart,
      peakTime: _lastMetrics?.timestamp ?? DateTime.now(),
    );
  }

  /// Register warning callback
  void onMemoryWarning(MemoryWarningCallback callback) {
    _warningCallbacks.add(callback);
  }

  /// Notify warning callbacks
  void _notifyWarning(MemoryWarning warning) {
    for (var callback in _warningCallbacks) {
      callback(warning);
    }
  }

  /// Format bytes to readable string
  String _formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(2)} KB';
    if (bytes < 1024 * 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(2)} MB';
    }
    return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
  }

  /// Get current memory usage as percentage
  Future<double> getMemoryUsagePercent() async {
    final metrics = await getMemoryMetrics();
    if (metrics != null) {
      return (metrics.totalMemory / 1000000000) * 100;
    }
    return 0.0;
  }

  /// Dispose
  void dispose() {
    stopMonitoring();
  }
}

/// Memory metrics model
class MemoryMetrics {
  final int nativeHeap;
  final int dartHeap;
  final int totalMemory;
  final DateTime timestamp;

  MemoryMetrics({
    required this.nativeHeap,
    required this.dartHeap,
    required this.totalMemory,
    required this.timestamp,
  });

  int get usedMemory => nativeHeap + dartHeap;

  double get usagePercent => (usedMemory / totalMemory) * 100;
}

/// Memory metric for history
class MemoryMetric {
  final int nativeHeap;
  final int dartHeap;
  final DateTime timestamp;

  MemoryMetric({
    required this.nativeHeap,
    required this.dartHeap,
    required this.timestamp,
  });
}

/// Memory statistics
class MemoryStats {
  final int averageNativeHeap;
  final int averageDartHeap;
  final int maxNativeHeap;
  final int maxDartHeap;
  final int minNativeHeap;
  final int minDartHeap;
  final DateTime peakTime;

  MemoryStats({
    required this.averageNativeHeap,
    required this.averageDartHeap,
    required this.maxNativeHeap,
    required this.maxDartHeap,
    required this.minNativeHeap,
    required this.minDartHeap,
    required this.peakTime,
  });
}

/// Memory warning levels
enum MemoryWarning {
  moderate, // 50-75%
  high, // 75-90%
  critical, // 90%+
}

/// Memory warning callback
typedef MemoryWarningCallback = void Function(MemoryWarning warning);

/// Performance optimization service
class PerformanceOptimizationService {
  static final PerformanceOptimizationService _instance =
      PerformanceOptimizationService._internal();
  factory PerformanceOptimizationService() => _instance;
  PerformanceOptimizationService._internal();

  final Map<String, Stopwatch> _timers = {};

  /// Start timing an operation
  void startTiming(String operationName) {
    _timers[operationName] = Stopwatch()..start();
  }

  /// End timing and log
  int? endTiming(String operationName, {bool logResult = true}) {
    final stopwatch = _timers.remove(operationName);
    if (stopwatch != null) {
      final duration = stopwatch.elapsedMilliseconds;
      if (logResult) {
        debugPrint('[Performance] $operationName took ${duration}ms');
      }
      return duration;
    }
    return null;
  }

  /// Measure operation
  Future<int> measureAsync<T>(
    String operationName,
    Future<T> Function() operation, {
    bool logResult = true,
  }) async {
    startTiming(operationName);
    try {
      await operation();
    } finally {
      return endTiming(operationName, logResult: logResult) ?? 0;
    }
  }

  /// Get all timers
  Map<String, int> getAllTimings() {
    return {
      for (var entry in _timers.entries)
        entry.key: entry.value.elapsedMilliseconds,
    };
  }

  /// Clear all timers
  void clearAllTimers() {
    _timers.clear();
  }
}

/// Performance frame counter
class FrameRateMonitor {
  static final FrameRateMonitor _instance = FrameRateMonitor._internal();
  factory FrameRateMonitor() => _instance;
  FrameRateMonitor._internal();

  int _frameCount = 0;
  DateTime? _lastCheck;
  double _currentFps = 60.0;

  /// Start frame counting
  void startCounting() {
    _frameCount = 0;
    _lastCheck = DateTime.now();

    WidgetsBinding.instance.addFrameCallback((timeStamp) async {
      _frameCount++;
      final now = DateTime.now();
      final elapsed = now.difference(_lastCheck!).inMilliseconds;

      if (elapsed >= 1000) {
        _currentFps = (_frameCount / elapsed) * 1000;
        debugPrint(
          '[FrameRate] Current FPS: ${_currentFps.toStringAsFixed(1)}',
        );
        _frameCount = 0;
        _lastCheck = now;
        WidgetsBinding.instance.addFrameCallback((timeStamp) {});
      }
    });
  }

  /// Get current FPS
  double getCurrentFps() => _currentFps;
}
