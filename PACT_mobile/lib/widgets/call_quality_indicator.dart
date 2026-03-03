import 'package:flutter/material.dart';
import '../models/call_state.dart';

class CallQualityIndicator extends StatelessWidget {
  final CallState callState;
  final bool showDetails;

  const CallQualityIndicator({
    super.key,
    required this.callState,
    this.showDetails = false,
  });

  Color _getQualityColor(int latency) {
    if (latency < 50) return Colors.green; // Excellent
    if (latency < 100) return Colors.lightGreen; // Good
    if (latency < 150) return Colors.yellow; // Fair
    if (latency < 300) return Colors.orange; // Poor
    return Colors.red; // Very Poor
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
                  style: TextStyle(fontSize: 10, color: color),
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
