import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme/app_colors.dart';

/// Service for calculating call statistics
class CallStatisticsService {
  /// Data class for call statistics
  static Future<CallStatistics> calculateStatistics(
    List<CallRecord> callRecords,
  ) async {
    if (callRecords.isEmpty) {
      return CallStatistics.empty();
    }

    int totalCalls = callRecords.length;
    int incomingCalls = callRecords.where((c) => c.type == 'incoming').length;
    int outgoingCalls = callRecords.where((c) => c.type == 'outgoing').length;
    int missedCalls = callRecords.where((c) => c.type == 'missed').length;

    int totalDuration = callRecords
        .where((c) => c.type != 'missed')
        .fold(0, (sum, call) => sum + (call.duration ?? 0));

    double averageDuration = totalCalls > 0
        ? totalDuration /
              callRecords.where((c) => c.type != 'missed').length.toDouble()
        : 0;

    // Find most contacted person
    Map<String, int> contactCounts = {};
    for (var call in callRecords) {
      final contact = call.contactName ?? call.contactId;
      contactCounts[contact] = (contactCounts[contact] ?? 0) + 1;
    }

    String mostContactedPerson = '';
    int maxCalls = 0;
    contactCounts.forEach((contact, count) {
      if (count > maxCalls) {
        maxCalls = count;
        mostContactedPerson = contact;
      }
    });

    // Calculate call trend (last 7 days vs previous 7 days)
    final now = DateTime.now();
    final sevenDaysAgo = now.subtract(const Duration(days: 7));
    final fourteenDaysAgo = now.subtract(const Duration(days: 14));

    int recentCalls = callRecords
        .where((c) => c.timestamp.isAfter(sevenDaysAgo))
        .length;
    int previousCalls = callRecords
        .where(
          (c) =>
              c.timestamp.isAfter(fourteenDaysAgo) &&
              c.timestamp.isBefore(sevenDaysAgo),
        )
        .length;

    return CallStatistics(
      totalCalls: totalCalls,
      incomingCalls: incomingCalls,
      outgoingCalls: outgoingCalls,
      missedCalls: missedCalls,
      totalDuration: totalDuration,
      averageDuration: averageDuration,
      mostContactedPerson: mostContactedPerson,
      mostContactedCount: maxCalls,
      recentCalls: recentCalls,
      previousCalls: previousCalls,
    );
  }
}

/// Call statistics data
class CallStatistics {
  final int totalCalls;
  final int incomingCalls;
  final int outgoingCalls;
  final int missedCalls;
  final int totalDuration; // in seconds
  final double averageDuration; // in seconds
  final String mostContactedPerson;
  final int mostContactedCount;
  final int recentCalls; // last 7 days
  final int previousCalls; // 7-14 days ago

  CallStatistics({
    required this.totalCalls,
    required this.incomingCalls,
    required this.outgoingCalls,
    required this.missedCalls,
    required this.totalDuration,
    required this.averageDuration,
    required this.mostContactedPerson,
    required this.mostContactedCount,
    required this.recentCalls,
    required this.previousCalls,
  });

  factory CallStatistics.empty() {
    return CallStatistics(
      totalCalls: 0,
      incomingCalls: 0,
      outgoingCalls: 0,
      missedCalls: 0,
      totalDuration: 0,
      averageDuration: 0,
      mostContactedPerson: '',
      mostContactedCount: 0,
      recentCalls: 0,
      previousCalls: 0,
    );
  }

  String formatDuration(int seconds) {
    if (seconds < 60) return '${seconds}s';
    if (seconds < 3600) {
      final minutes = seconds ~/ 60;
      return '${minutes}m';
    }
    final hours = seconds ~/ 3600;
    final minutes = (seconds % 3600) ~/ 60;
    return '${hours}h ${minutes}m';
  }

  double getTrend() {
    if (previousCalls == 0) return 0;
    return ((recentCalls - previousCalls) / previousCalls) * 100;
  }
}

/// Call record data
class CallRecord {
  final String contactId;
  final String? contactName;
  final String type; // 'incoming', 'outgoing', 'missed'
  final DateTime timestamp;
  final int? duration; // in seconds

  CallRecord({
    required this.contactId,
    this.contactName,
    required this.type,
    required this.timestamp,
    this.duration,
  });
}

/// Widget displaying call statistics dashboard
class CallStatisticsWidget extends StatefulWidget {
  final List<CallRecord> callRecords;

  const CallStatisticsWidget({required this.callRecords});

  @override
  State<CallStatisticsWidget> createState() => _CallStatisticsWidgetState();
}

class _CallStatisticsWidgetState extends State<CallStatisticsWidget> {
  late Future<CallStatistics> _statisticsFuture;

  @override
  void initState() {
    super.initState();
    _statisticsFuture = CallStatisticsService.calculateStatistics(
      widget.callRecords,
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<CallStatistics>(
      future: _statisticsFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        if (!snapshot.hasData || snapshot.data!.totalCalls == 0) {
          return Center(
            child: Text(
              'No call statistics available',
              style: TextStyle(color: Colors.grey[600]),
            ),
          );
        }

        final stats = snapshot.data!;

        return SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Summary cards
              Row(
                children: [
                  Expanded(
                    child: _buildStatCard(
                      'Total Calls',
                      '${stats.totalCalls}',
                      Icons.phone_in_talk,
                      AppColors.primaryBlue,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildStatCard(
                      'Total Duration',
                      stats.formatDuration(stats.totalDuration),
                      Icons.schedule,
                      Colors.green,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Call breakdown
              Row(
                children: [
                  Expanded(
                    child: _buildStatCard(
                      'Incoming',
                      '${stats.incomingCalls}',
                      Icons.call_received,
                      Colors.green,
                      subtitle: stats.incomingCalls > 0
                          ? 'Avg: ${stats.formatDuration((stats.totalDuration * stats.incomingCalls ~/ stats.totalCalls))}'
                          : '',
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildStatCard(
                      'Outgoing',
                      '${stats.outgoingCalls}',
                      Icons.call_made,
                      AppColors.primaryBlue,
                      subtitle: stats.outgoingCalls > 0
                          ? 'Avg: ${stats.formatDuration(stats.averageDuration.toInt())}'
                          : '',
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildStatCard(
                      'Missed',
                      '${stats.missedCalls}',
                      Icons.call_missed,
                      Colors.red,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // Most contacted
              if (stats.mostContactedPerson.isNotEmpty)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.primaryBlue.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: AppColors.primaryBlue.withOpacity(0.3),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Most Contacted',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey[600],
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        stats.mostContactedPerson,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${stats.mostContactedCount} calls',
                        style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 20),

              // Trend
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.amber.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.amber.withOpacity(0.3)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Call Trend (Last 7 Days)',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey[600],
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Text(
                          '${stats.recentCalls} calls',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: stats.getTrend() >= 0
                                ? Colors.green.withOpacity(0.2)
                                : Colors.red.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            '${stats.getTrend() >= 0 ? '+' : ''}${stats.getTrend().toStringAsFixed(0)}%',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.bold,
                              color: stats.getTrend() >= 0
                                  ? Colors.green
                                  : Colors.red,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildStatCard(
    String label,
    String value,
    IconData icon,
    Color color, {
    String subtitle = '',
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 8),
          Text(
            value,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
            textAlign: TextAlign.center,
          ),
          if (subtitle.isNotEmpty) ...{
            const SizedBox(height: 2),
            Text(
              subtitle,
              style: TextStyle(fontSize: 9, color: Colors.grey[500]),
              textAlign: TextAlign.center,
            ),
          },
        ],
      ),
    );
  }
}
