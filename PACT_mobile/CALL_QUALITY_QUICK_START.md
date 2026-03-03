# 🚀 Quick Implementation Starter - Call Quality Metrics

This file provides ready-to-implement code for the highest-impact feature: **Real-time Call Quality Display**

---

## 📋 What We're Adding

1. **Call Quality Widget** - Visual indicator (1-5 bars)
2. **Stats Collection** - Latency, jitter, packet loss monitoring
3. **Real-time Updates** - Display in enhanced call screen
4. **Warning Threshold** - Alert user of poor connection

---

## 🎯 Files to Create

### 1. `lib/widgets/call_quality_indicator.dart` (NEW)

```dart
import 'package:flutter/material.dart';
import '../models/call_state.dart';
import '../theme/app_colors.dart';

class CallQualityIndicator extends StatelessWidget {
  final CallState callState;
  final bool showDetails;

  const CallQualityIndicator({
    super.key,
    required this.callState,
    this.showDetails = false,
  });

  Color _getQualityColor(int latency) {
    if (latency < 50) return Colors.green;        // Excellent
    if (latency < 100) return Colors.lightGreen;  // Good
    if (latency < 150) return Colors.yellow;      // Fair
    if (latency < 300) return Colors.orange;      // Poor
    return Colors.red;                             // Very Poor
  }

  int _getQualityBars(int latency) {
    if (latency < 50) return 5;
    if (latency < 100) return 4;
    if (latency < 150) return 3;
    if (latency < 300) return 2;
    return 1;
  }

  String _getQualityLabel(int latency) {
    if (latency < 50) return 'Excellent';
    if (latency < 100) return 'Good';
    if (latency < 150) return 'Fair';
    if (latency < 300) return 'Poor';
    return 'Very Poor';
  }

  @override
  Widget build(BuildContext context) {
    final latency = callState.latencyMs ?? 0;
    final bars = _getQualityBars(latency);
    final color = _getQualityColor(latency);
    final label = _getQualityLabel(latency);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color, width: 1.5),
      ),
      child: showDetails
          ? Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: List.generate(5, (index) {
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      child: Container(
                        width: 4,
                        height: 16,
                        decoration: BoxDecoration(
                          color: index < bars ? color : Colors.grey[300],
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    );
                  }),
                ),
                const SizedBox(height: 4),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    color: color,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${latency}ms',
                  style: TextStyle(
                    fontSize: 10,
                    color: color,
                  ),
                ),
              ],
            )
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                ...List.generate(5, (index) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    child: Container(
                      width: 3,
                      height: 12,
                      decoration: BoxDecoration(
                        color: index < bars ? color : Colors.grey[300],
                        borderRadius: BorderRadius.circular(1),
                      ),
                    ),
                  );
                }),
                const SizedBox(width: 8),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: color,
                  ),
                ),
              ],
            ),
    );
  }
}
```

---

### 2. `lib/services/call_quality_monitor_service.dart` (NEW)

```dart
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

class CallQualityMonitor {
  final RTCPeerConnection peerConnection;
  final Function(CallQualityReport) onQualityUpdate;
  final Function(String) onWarning;

  Timer? _statsTimer;
  CallQualityReport? _lastReport;

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

      for (final report in stats) {
        if (report.type == 'inbound-rtp') {
          // Extract latency (round trip time)
          for (final key in report.values.keys) {
            if (key == 'currentRoundTripTime') {
              final value = report.values[key];
              if (value is String) {
                latency = (double.tryParse(value) ?? 0 * 1000).toInt();
              }
            }
            if (key == 'jitter') {
              final value = report.values[key];
              if (value is String) {
                jitter = (double.tryParse(value) ?? 0 * 1000).toInt();
              }
            }
            if (key == 'packetsLost') {
              packetsLost = int.tryParse(report.values[key].toString()) ?? 0;
            }
            if (key == 'bytesReceived') {
              bytesReceived = int.tryParse(report.values[key].toString()) ?? 0;
            }
          }

          // Calculate packet loss percentage
          final packetsReceived = int.tryParse(
              report.values['packetsReceived']?.toString() ?? '0') ?? 0;
          if (packetsReceived > 0) {
            packetLoss = (packetsLost / (packetsLost + packetsReceived)) * 100;
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

  /// Check for quality warnings
  void _checkQualityWarnings(CallQualityReport report) {
    // High latency warning (> 150ms)
    if (report.latencyMs > 150) {
      onWarning('⚠️ High latency: ${report.latencyMs}ms');
    }

    // Packet loss warning (> 2%)
    if (report.packetLoss > 2) {
      onWarning(
          '⚠️ High packet loss: ${report.packetLoss.toStringAsFixed(1)}%');
    }

    // Network degradation warning
    if (report.latencyMs > 200 && report.packetLoss > 1) {
      onWarning('🌐 Network degrading - video quality may suffer');
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
```

---

## 🔧 Integration Steps

### Step 1: Update `enhanced_call_screen.dart`

Add to `_EnhancedCallScreenState`:

```dart
import '../services/call_quality_monitor_service.dart';

class _EnhancedCallScreenState extends State<EnhancedCallScreen> {
  // ... existing code ...
  
  CallQualityMonitor? _qualityMonitor;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initRenderers();
    _subscribeToStreams();
    _startQualityMonitoring(); // Add this
  }

  void _startQualityMonitoring() {
    // After peer connection is created
    if (_webrtcService._peerConnection != null) {
      _qualityMonitor = CallQualityMonitor(
        peerConnection: _webrtcService._peerConnection!,
        onQualityUpdate: (report) {
          setState(() {
            _callState = _callState.copyWith(
              latencyMs: report.latencyMs,
              jitterMs: report.jitterMs,
              packetLoss: report.packetLoss,
            );
          });
        },
        onWarning: (warning) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(warning),
              duration: const Duration(seconds: 3),
            ),
          );
        },
      );
      _qualityMonitor?.startMonitoring();
    }
  }

  @override
  void dispose() {
    _qualityMonitor?.stopMonitoring(); // Add this
    // ... existing dispose code ...
  }

  // Add to build() method, in the controls section
  Widget _buildQualityIndicator() {
    return CallQualityIndicator(
      callState: _callState,
      showDetails: _showCallDetails,
    );
  }
}
```

### Step 2: Add to Call Details Panel

In `_buildCallDetailsPanel()`:

```dart
Widget _buildCallDetailsPanel() {
  final now = DateTime.now();
  return Material(
    color: Colors.black.withOpacity(0.7),
    borderRadius: BorderRadius.circular(12),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // ... existing code ...
          
          // Add quality section
          _buildDetailRow(
            'Connection Quality',
            _callState.latencyMs != null
                ? '${_callState.latencyMs}ms latency'
                : 'N/A',
          ),
          if (_callState.packetLoss != null)
            _buildDetailRow(
              'Packet Loss',
              '${_callState.packetLoss?.toStringAsFixed(2)}%',
            ),
        ],
      ),
    ),
  );
}
```

### Step 3: Display Quality in Top Bar

```dart
// In _buildTopControls()
if (_callState.status == CallStatus.connected)
  Positioned(
    top: 20,
    right: 80,
    child: _buildQualityIndicator(),
  ),
```

---

## ✅ Testing Checklist

- [ ] Start a video call
- [ ] See quality indicator in call screen
- [ ] Simulate poor network (use browser dev tools)
- [ ] See warning toast when latency > 150ms
- [ ] Tap info button to see detailed quality metrics
- [ ] Verify latency updates every 2 seconds
- [ ] Test call ends and monitor stops

---

## 📊 Expected Output

During a good call:
```
Quality: Excellent (5 bars)
Latency: 45ms
Packet Loss: 0.0%
```

During poor connection:
```
⚠️ High latency: 180ms
Quality: Poor (2 bars)
Packet Loss: 2.5%
```

---

## 🎯 What's Next?

Once this is working, implement:
1. **Missed Call Callback** (easy - 1 hour)
2. **Network Warning Banner** (medium - 1.5 hours)
3. **Call History** (hard - 4 hours)

---

## 💡 Pro Tips

- **Avoid over-sampling**: 2-second intervals prevents performance issues
- **Cache last report**: Don't update UI if no change
- **Graceful degradation**: Show "N/A" if stats unavailable
- **User education**: Show what latency numbers mean

---

Would you like me to implement this quality indicator feature right now?
