import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Performance metrics tracker
class PerformanceMetrics {
  final String operationName;
  final DateTime startTime;
  late DateTime endTime;
  late Duration duration;
  final Map<String, dynamic> metadata;

  PerformanceMetrics({
    required this.operationName,
    required this.startTime,
    required this.metadata,
  });

  void end() {
    endTime = DateTime.now();
    duration = endTime.difference(startTime);
  }

  Map<String, dynamic> toJson() {
    return {
      'operation': operationName,
      'start_time': startTime.toIso8601String(),
      'end_time': endTime.toIso8601String(),
      'duration_ms': duration.inMilliseconds,
      'metadata': metadata,
    };
  }
}

/// Service for monitoring app performance
class PerformanceMonitoringService {
  static final PerformanceMonitoringService _instance =
      PerformanceMonitoringService._internal();

  factory PerformanceMonitoringService() {
    return _instance;
  }

  PerformanceMonitoringService._internal();

  final List<PerformanceMetrics> _metrics = [];
  final Map<String, DateTime> _activeOperations = {};
  static const int maxMetricsStored = 500;
  static const String _metricsKey = 'performance_metrics';

  /// Start tracking an operation
  void startOperation(String operationName, {Map<String, dynamic>? metadata}) {
    _activeOperations[operationName] = DateTime.now();
    debugPrint('[Performance] Started: $operationName');
  }

  /// End tracking an operation
  PerformanceMetrics? endOperation(String operationName) {
    final startTime = _activeOperations.remove(operationName);
    if (startTime == null) {
      debugPrint('[Performance] Warning: No start time for $operationName');
      return null;
    }

    final metric = PerformanceMetrics(
      operationName: operationName,
      startTime: startTime,
      metadata: {},
    );
    metric.end();

    _metrics.add(metric);
    if (_metrics.length > maxMetricsStored) {
      _metrics.removeAt(0);
    }

    debugPrint(
      '[Performance] Ended: $operationName (${metric.duration.inMilliseconds}ms)',
    );

    return metric;
  }

  /// Record a single metric
  void recordMetric(
    String name, {
    required int durationMs,
    Map<String, dynamic>? metadata,
  }) {
    final startTime = DateTime.now().subtract(Duration(milliseconds: durationMs));
    final metric = PerformanceMetrics(
      operationName: name,
      startTime: startTime,
      metadata: metadata ?? {},
    );
    metric.endTime = DateTime.now();
    metric.duration = Duration(milliseconds: durationMs);

    _metrics.add(metric);
    if (_metrics.length > maxMetricsStored) {
      _metrics.removeAt(0);
    }
  }

  /// Get average duration for an operation
  double getAverageDuration(String operationName) {
    final matching = _metrics
        .where((m) => m.operationName == operationName)
        .toList();

    if (matching.isEmpty) return 0;

    final total = matching.fold<int>(
      0,
      (sum, m) => sum + m.duration.inMilliseconds,
    );

    return total / matching.length;
  }

  /// Get slowest operations
  List<PerformanceMetrics> getSlowestOperations({int limit = 10}) {
    final sorted = List<PerformanceMetrics>.from(_metrics);
    sorted.sort((a, b) => b.duration.compareTo(a.duration));
    return sorted.take(limit).toList();
  }

  /// Get all metrics
  List<PerformanceMetrics> getAllMetrics() {
    return List<PerformanceMetrics>.from(_metrics);
  }

  /// Get metrics summary
  Map<String, dynamic> getMetricsSummary() {
    if (_metrics.isEmpty) {
      return {
        'total_metrics': 0,
        'operations': {},
      };
    }

    final operationMap = <String, List<PerformanceMetrics>>{};
    for (final metric in _metrics) {
      if (!operationMap.containsKey(metric.operationName)) {
        operationMap[metric.operationName] = [];
      }
      operationMap[metric.operationName]?.add(metric);
    }

    final operations = <String, dynamic>{};
    for (final entry in operationMap.entries) {
      final metrics = entry.value;
      final durations =
          metrics.map((m) => m.duration.inMilliseconds).toList();
      durations.sort();

      operations[entry.key] = {
        'count': metrics.length,
        'average_ms':
            (durations.reduce((a, b) => a + b) / durations.length).toStringAsFixed(2),
        'min_ms': durations.first,
        'max_ms': durations.last,
        'median_ms': durations[durations.length ~/ 2],
      };
    }

    return {
      'total_metrics': _metrics.length,
      'operations': operations,
      'slowest_operations': getSlowestOperations().map((m) {
        return {
          'name': m.operationName,
          'duration_ms': m.duration.inMilliseconds,
        };
      }).toList(),
    };
  }

  /// Save metrics to persistent storage
  Future<void> saveMetrics() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final metricsJson = _metrics.map((m) => m.toJson()).toList();

      await prefs.setString(_metricsKey, jsonEncode(metricsJson));
      debugPrint('[Performance] Saved ${_metrics.length} metrics');
    } catch (e) {
      debugPrint('[Performance] Error saving metrics: $e');
    }
  }

  /// Load metrics from persistent storage
  Future<void> loadMetrics() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final metricsJson = prefs.getString(_metricsKey);

      if (metricsJson != null) {
        final decoded = jsonDecode(metricsJson) as List;
        _metrics.clear();

        for (final item in decoded) {
          final map = item as Map<String, dynamic>;
          final metric = PerformanceMetrics(
            operationName: map['operation'] ?? '',
            startTime: DateTime.parse(map['start_time'] ?? ''),
            metadata: map['metadata'] ?? {},
          );
          metric.endTime = DateTime.parse(map['end_time'] ?? '');
          metric.duration = Duration(milliseconds: map['duration_ms'] ?? 0);

          _metrics.add(metric);
        }

        debugPrint('[Performance] Loaded ${_metrics.length} metrics');
      }
    } catch (e) {
      debugPrint('[Performance] Error loading metrics: $e');
    }
  }

  /// Clear all metrics
  void clearMetrics() {
    _metrics.clear();
    _activeOperations.clear();
    debugPrint('[Performance] Metrics cleared');
  }

  /// Export metrics as JSON
  String exportMetricsJson() {
    return jsonEncode(getMetricsSummary());
  }

  /// Get memory efficiency report
  Map<String, dynamic> getMemoryReport() {
    return {
      'active_operations': _activeOperations.length,
      'stored_metrics': _metrics.length,
      'max_metrics': maxMetricsStored,
      'memory_efficient': _metrics.length < maxMetricsStored * 0.8,
    };
  }
}

// JSON import for serialization
import 'dart:convert';
