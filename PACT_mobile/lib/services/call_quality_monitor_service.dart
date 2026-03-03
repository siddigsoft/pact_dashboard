import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

class CallQualityMonitor {
  final RTCPeerConnection peerConnection;
  final Function(CallQualityReport) onQualityUpdate;
  final Function(String) onWarning;

  Timer? _statsTimer;
  CallQualityReport? _lastReport;
  DateTime? _lastWarningTime;

  CallQualityMonitor({
    required this.peerConnection,
    required this.onQualityUpdate,
    required this.onWarning,
  });

  /// Start monitoring call quality
  void startMonitoring() {
    _statsTimer = Timer.periodic(const Duration(seconds: 2), (_) async {
      await _collectStats();
    });
  }

  /// Stop monitoring
  void stopMonitoring() {
    _statsTimer?.cancel();
    _statsTimer = null;
  }

  /// Collect WebRTC statistics
  Future<void> _collectStats() async {
    try {
      final stats = await peerConnection.getStats();

      int latency = 0;
      int jitter = 0;
      double packetLoss = 0;
      int bytesReceived = 0;
      int packetsLost = 0;
      int packetsReceived = 0;

      for (final report in stats) {
        if (report.type == 'inbound-rtp') {
          for (final entry in report.values.entries) {
            final key = entry.key;
            final value = entry.value;

            if (key == 'currentRoundTripTime') {
              if (value is num) {
                latency = (value * 1000).toInt();
              } else if (value is String) {
                latency = (double.tryParse(value) ?? 0 * 1000).toInt();
              }
            }
            if (key == 'jitter') {
              if (value is num) {
                jitter = (value * 1000).toInt();
              } else if (value is String) {
                jitter = (double.tryParse(value) ?? 0 * 1000).toInt();
              }
            }
            if (key == 'packetsLost') {
              packetsLost = int.tryParse(value.toString()) ?? 0;
            }
            if (key == 'packetsReceived') {
              packetsReceived = int.tryParse(value.toString()) ?? 0;
            }
            if (key == 'bytesReceived') {
              bytesReceived = int.tryParse(value.toString()) ?? 0;
            }
          }

          // Calculate packet loss percentage
          final totalPackets = packetsLost + packetsReceived;
          if (totalPackets > 0) {
            packetLoss = (packetsLost / totalPackets) * 100;
          }
        }
      }

      final report = CallQualityReport(
        latencyMs: latency,
        jitterMs: jitter,
        packetLoss: packetLoss,
        bytesReceived: bytesReceived,
        packetsLost: packetsLost,
        timestamp: DateTime.now(),
      );

      onQualityUpdate(report);
      _lastReport = report;

      // Check for warnings
      _checkQualityWarnings(report);
    } catch (e) {
      debugPrint('[CallQuality] Error collecting stats: $e');
    }
  }

  /// Check for quality warnings (only alert once per 10 seconds)
  void _checkQualityWarnings(CallQualityReport report) {
    final now = DateTime.now();
    final lastTime = _lastWarningTime;

    // Avoid spamming warnings - max one per 10 seconds
    if (lastTime != null && now.difference(lastTime).inSeconds < 10) {
      return;
    }

    String? warning;

    // High latency warning (> 150ms)
    if (report.latencyMs > 150) {
      warning = '⚠️ High latency: ${report.latencyMs}ms';
    }
    // Packet loss warning (> 2%)
    else if (report.packetLoss > 2) {
      warning = '⚠️ Packet loss: ${report.packetLoss.toStringAsFixed(1)}%';
    }
    // Network degradation warning
    else if (report.latencyMs > 200 && report.packetLoss > 1) {
      warning = '🌐 Network degrading - video quality may suffer';
    }

    if (warning != null) {
      _lastWarningTime = now;
      onWarning(warning);
    }
  }

  /// Get quality level (1-5)
  int getQualityLevel() {
    if (_lastReport == null) return 0;

    if (_lastReport!.latencyMs < 50) return 5;
    if (_lastReport!.latencyMs < 100) return 4;
    if (_lastReport!.latencyMs < 150) return 3;
    if (_lastReport!.latencyMs < 300) return 2;
    return 1;
  }
}

class CallQualityReport {
  final int latencyMs;
  final int jitterMs;
  final double packetLoss;
  final int bytesReceived;
  final int packetsLost;
  final DateTime timestamp;

  CallQualityReport({
    required this.latencyMs,
    required this.jitterMs,
    required this.packetLoss,
    required this.bytesReceived,
    required this.packetsLost,
    required this.timestamp,
  });

  @override
  String toString() {
    return 'Quality: ${latencyMs}ms latency, ${packetLoss.toStringAsFixed(2)}% loss';
  }
}
