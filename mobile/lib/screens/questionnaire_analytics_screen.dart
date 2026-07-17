// lib/screens/questionnaire_analytics_screen.dart
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class QuestionnaireAnalyticsScreen extends StatefulWidget {
  const QuestionnaireAnalyticsScreen({super.key});

  @override
  State<QuestionnaireAnalyticsScreen> createState() =>
      _QuestionnaireAnalyticsScreenState();
}

class _QuestionnaireAnalyticsScreenState
    extends State<QuestionnaireAnalyticsScreen> {
  final _supabase = Supabase.instance.client;
  bool _loading = true;
  Map<String, int> _byType = {};
  Map<String, int> _byHub = {};
  int _total = 0;
  List<Map<String, dynamic>> _recent = [];
  String _timeRange = '30'; // days

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    if (!mounted) return;
    setState(() => _loading = true);
    try {
      final since = DateTime.now()
          .subtract(Duration(days: int.parse(_timeRange)))
          .toUtc()
          .toIso8601String();
      final data = await _supabase
          .from('site_visits')
          .select(
            'activity_type, pdm_questionnaires, hub_name, created_at, site_name',
          )
          .gte('created_at', since)
          .eq('status', 'completed')
          .order('created_at', ascending: false)
          .limit(200);

      final byType = <String, int>{};
      final byHub = <String, int>{};
      int total = 0;

      for (final row in data) {
        final type = (row['activity_type'] as String? ?? 'Unknown')
            .toUpperCase();
        final pdm = (row['pdm_questionnaires'] as num?)?.toInt() ?? 0;
        final hub = row['hub_name'] as String? ?? 'Unknown';
        final count = type == 'PDM' ? pdm : 1;
        byType[type] = (byType[type] ?? 0) + count;
        byHub[hub] = (byHub[hub] ?? 0) + count;
        total += count;
      }

      // Sort hub map by count desc
      final sortedHub = Map.fromEntries(
        byHub.entries.toList()..sort((a, b) => b.value.compareTo(a.value)),
      );

      if (mounted) {
        setState(() {
          _byType = byType;
          _byHub = sortedHub;
          _total = total;
          _recent = List<Map<String, dynamic>>.from(data.take(30));
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F2041),
        foregroundColor: Colors.white,
        title: Text(
          'Questionnaire Analytics',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 16),
        ),
        actions: [
          DropdownButton<String>(
            value: _timeRange,
            dropdownColor: const Color(0xFF1D3461),
            style: GoogleFonts.poppins(color: Colors.white, fontSize: 12),
            underline: const SizedBox(),
            icon: const Icon(Icons.arrow_drop_down, color: Colors.white),
            items: const [
              DropdownMenuItem(value: '7', child: Text('7 days')),
              DropdownMenuItem(value: '30', child: Text('30 days')),
              DropdownMenuItem(value: '90', child: Text('90 days')),
            ],
            onChanged: (v) {
              setState(() => _timeRange = v!);
              _loadData();
            },
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadData,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Summary
                  _statCard(
                    'Total Questionnaires',
                    _total.toString(),
                    Icons.assignment_turned_in,
                    const Color(0xFF0F2041),
                  ),
                  const SizedBox(height: 16),
                  // By Type
                  _sectionTitle('By Activity Type'),
                  const SizedBox(height: 8),
                  ..._byType.entries.map(
                    (e) => _barRow(e.key, e.value, _total, _typeColor(e.key)),
                  ),
                  const SizedBox(height: 16),
                  // By Hub
                  if (_byHub.isNotEmpty) ...[
                    _sectionTitle('By Hub (Top 10)'),
                    const SizedBox(height: 8),
                    ..._byHub.entries
                        .take(10)
                        .map(
                          (e) => _barRow(
                            e.key,
                            e.value,
                            _total,
                            const Color(0xFF3B82F6),
                          ),
                        ),
                    const SizedBox(height: 16),
                  ],
                  // Recent visits
                  _sectionTitle('Recent Submissions'),
                  const SizedBox(height: 8),
                  ..._recent.map((row) => _recentRow(row)),
                  const SizedBox(height: 24),
                ],
              ),
            ),
    );
  }

  Color _typeColor(String type) {
    switch (type) {
      case 'AM':
        return const Color(0xFF3B82F6);
      case 'DM':
        return const Color(0xFF7C3AED);
      case 'PDM':
        return const Color(0xFF16A34A);
      default:
        return const Color(0xFF6B7280);
    }
  }

  Widget _statCard(String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [color, color.withValues(alpha: 0.8)]),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 14),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: 28,
                ),
              ),
              Text(
                label,
                style: GoogleFonts.poppins(
                  color: Colors.white.withValues(alpha: 0.85),
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String title) {
    return Text(
      title,
      style: GoogleFonts.poppins(
        fontWeight: FontWeight.w700,
        fontSize: 14,
        color: const Color(0xFF0F2041),
      ),
    );
  }

  Widget _barRow(String label, int value, int total, Color color) {
    final pct = total > 0 ? (value / total) : 0.0;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                label,
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(
                '$value (${(pct * 100).toStringAsFixed(1)}%)',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: color,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: pct,
              minHeight: 8,
              backgroundColor: color.withValues(alpha: 0.12),
              valueColor: AlwaysStoppedAnimation(color),
            ),
          ),
        ],
      ),
    );
  }

  Widget _recentRow(Map<String, dynamic> row) {
    final type = (row['activity_type'] as String? ?? '?').toUpperCase();
    final site = row['site_name'] as String? ?? 'Unknown Site';
    final hub = row['hub_name'] as String? ?? '';
    final pdm = (row['pdm_questionnaires'] as num?)?.toInt();
    final date = row['created_at'] != null
        ? (row['created_at'] as String).substring(0, 10)
        : '';
    final color = _typeColor(type);
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border(left: BorderSide(color: color, width: 3)),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Center(
              child: Text(
                type,
                style: GoogleFonts.poppins(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: color,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  site,
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  hub,
                  style: GoogleFonts.poppins(
                    fontSize: 11,
                    color: Colors.grey[500],
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (type == 'PDM' && pdm != null)
                Text(
                  '$pdm Q',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: color,
                  ),
                ),
              Text(
                date,
                style: GoogleFonts.poppins(
                  fontSize: 10,
                  color: Colors.grey[500],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
