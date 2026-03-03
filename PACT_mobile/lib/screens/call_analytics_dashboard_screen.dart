import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';
import '../services/call_history_service.dart';
import '../services/webrtc_service.dart';

class CallAnalyticsDashboardScreen extends StatefulWidget {
  const CallAnalyticsDashboardScreen({super.key});

  @override
  State<CallAnalyticsDashboardScreen> createState() =>
      _CallAnalyticsDashboardScreenState();
}

class _CallAnalyticsDashboardScreenState
    extends State<CallAnalyticsDashboardScreen> {
  final CallHistoryService _callHistoryService = CallHistoryService();
  final WebRTCService _webrtcService = WebRTCService();

  late Future<Map<String, dynamic>?> _statisticsThisWeek;
  late Future<Map<String, dynamic>?> _statisticsThisMonth;

  @override
  void initState() {
    super.initState();
    _loadStatistics();
  }

  void _loadStatistics() {
    final now = DateTime.now();
    final weekAgo = now.subtract(const Duration(days: 7));
    final monthAgo = now.subtract(const Duration(days: 30));

    setState(() {
      _statisticsThisWeek = _callHistoryService.getStatisticsForDateRange(
        userId: _webrtcService.userId ?? '',
        startDate: weekAgo,
        endDate: now,
      );
      _statisticsThisMonth = _callHistoryService.getStatisticsForDateRange(
        userId: _webrtcService.userId ?? '',
        startDate: monthAgo,
        endDate: now,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[50],
      appBar: AppBar(
        title: Text(
          'Call Analytics',
          style: GoogleFonts.poppins(
            fontSize: 20,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
        backgroundColor: AppColors.primaryBlue,
        elevation: 0,
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          _loadStatistics();
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // This Week Section
            Text(
              'This Week',
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 12),
            FutureBuilder<Map<String, dynamic>?>(
              future: _statisticsThisWeek,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }

                final stats = snapshot.data;
                if (stats == null) {
                  return Center(
                    child: Text(
                      'No data',
                      style: GoogleFonts.poppins(color: Colors.grey),
                    ),
                  );
                }

                return _buildStatsGrid(stats);
              },
            ),

            const SizedBox(height: 32),

            // This Month Section
            Text(
              'This Month',
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 12),
            FutureBuilder<Map<String, dynamic>?>(
              future: _statisticsThisMonth,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }

                final stats = snapshot.data;
                if (stats == null) {
                  return Center(
                    child: Text(
                      'No data',
                      style: GoogleFonts.poppins(color: Colors.grey),
                    ),
                  );
                }

                return _buildStatsGrid(stats);
              },
            ),

            const SizedBox(height: 32),

            // Tips section
            Card(
              elevation: 2,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Tips for Better Calls',
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 12),
                    _buildTip('📶 Use WiFi when possible for better quality'),
                    _buildTip(
                      '🔇 Enable Do Not Disturb to avoid interruptions',
                    ),
                    _buildTip('📱 Close other apps to improve connection'),
                    _buildTip('👥 Check your network status in call settings'),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatsGrid(Map<String, dynamic> stats) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      children: [
        _buildStatCard(
          'Total Calls',
          stats['total_calls'].toString(),
          Icons.call,
          AppColors.primaryBlue,
        ),
        _buildStatCard(
          'Duration',
          _formatDuration(stats['total_duration']),
          Icons.schedule,
          Colors.orange,
        ),
        _buildStatCard(
          'Avg Quality',
          '${(stats['average_quality'] as double).toStringAsFixed(1)}/5',
          Icons.star,
          Colors.green,
        ),
        _buildStatCard(
          'Days Active',
          stats['daily_entries'].toString(),
          Icons.calendar_today,
          Colors.purple,
        ),
      ],
    );
  }

  Widget _buildStatCard(
    String label,
    String value,
    IconData icon,
    Color color,
  ) {
    return Card(
      elevation: 2,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          gradient: LinearGradient(
            colors: [color.withOpacity(0.1), color.withOpacity(0.05)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Icon(icon, color: color, size: 32),
              const SizedBox(height: 12),
              Text(
                value,
                style: GoogleFonts.poppins(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: color,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                label,
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: Colors.grey[600],
                  fontWeight: FontWeight.w500,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTip(String tip) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Text(
        tip,
        style: GoogleFonts.poppins(fontSize: 13, color: Colors.grey[700]),
      ),
    );
  }

  String _formatDuration(int seconds) {
    final hours = seconds ~/ 3600;
    final minutes = (seconds % 3600) ~/ 60;

    if (hours > 0) {
      return '${hours}h ${minutes}m';
    } else if (minutes > 0) {
      return '${minutes}m';
    } else {
      return '${seconds}s';
    }
  }
}
