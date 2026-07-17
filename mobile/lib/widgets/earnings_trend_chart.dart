import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Simple earnings chart showing trend data
class EarningsTrendChart extends StatefulWidget {
  final List<Map<String, dynamic>> transactions;
  final bool isArabic;
  final String periodType; // '7days', '30days', '90days'

  const EarningsTrendChart({
    super.key,
    required this.transactions,
    this.isArabic = false,
    this.periodType = '30days',
  });

  @override
  State<EarningsTrendChart> createState() => _EarningsTrendChartState();
}

class _EarningsTrendChartState extends State<EarningsTrendChart> {
  late String _selectedPeriod;

  @override
  void initState() {
    super.initState();
    _selectedPeriod = widget.periodType;
  }

  Map<String, double> _calculateDailyEarnings() {
    final now = DateTime.now();
    final days = _selectedPeriod == '7days'
        ? 7
        : _selectedPeriod == '30days'
        ? 30
        : 90;

    final dailyEarnings = <String, double>{};

    // Initialize all days with 0
    for (int i = 0; i < days; i++) {
      final date = now.subtract(Duration(days: days - i - 1));
      final key =
          '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
      dailyEarnings[key] = 0;
    }

    // Sum earnings by day
    for (final tx in widget.transactions) {
      if (tx['type'] == 'earning') {
        try {
          final date = DateTime.parse(tx['created_at'].toString());
          final key =
              '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
          if (dailyEarnings.containsKey(key)) {
            final amount = (tx['amount'] ?? 0) as num;
            dailyEarnings[key] = (dailyEarnings[key] ?? 0) + amount.toDouble();
          }
        } catch (_) {}
      }
    }

    return dailyEarnings;
  }

  @override
  Widget build(BuildContext context) {
    final dailyEarnings = _calculateDailyEarnings();
    final maxEarning = dailyEarnings.values.isEmpty
        ? 0.0
        : dailyEarnings.values.reduce((a, b) => a > b ? a : b);
    final totalEarning = dailyEarnings.values.fold<double>(0, (a, b) => a + b);
    final avgEarning = dailyEarnings.isEmpty
        ? 0.0
        : totalEarning / dailyEarnings.length;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade200),
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.isArabic ? 'اتجاه الأرباح' : 'Earnings Trend',
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    widget.isArabic
                        ? 'آخر ${_getPeriodLabel()}'
                        : 'Last ${_getPeriodLabel()}',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.green.shade50,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  Icons.trending_up_rounded,
                  color: Colors.green.shade700,
                  size: 20,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Period selector
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                '7days',
                '30days',
                '90days',
              ].map((period) => _buildPeriodButton(period)).toList(),
            ),
          ),
          const SizedBox(height: 20),

          // Chart (simple bar chart)
          _buildSimpleChart(dailyEarnings, maxEarning),
          const SizedBox(height: 20),

          // Statistics
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildStatCard(
                widget.isArabic ? 'الإجمالي' : 'Total',
                totalEarning,
              ),
              _buildStatCard(
                widget.isArabic ? 'المتوسط' : 'Average',
                avgEarning,
              ),
              _buildStatCard(
                widget.isArabic ? 'الأعلى' : 'Highest',
                maxEarning,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPeriodButton(String period) {
    final isSelected = _selectedPeriod == period;
    final label =
        ({
          '7days': '7 Days',
          '30days': '30 Days',
          '90days': '90 Days',
        }[period] ??
        period);

    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(
          label,
          style: GoogleFonts.poppins(
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
            fontSize: 12,
          ),
        ),
        selected: isSelected,
        onSelected: (_) => setState(() => _selectedPeriod = period),
        backgroundColor: Colors.grey.shade200,
        selectedColor: AppColors.primaryBlue.withValues(alpha: 0.2),
        side: BorderSide(
          color: isSelected ? AppColors.primaryBlue : Colors.transparent,
        ),
      ),
    );
  }

  Widget _buildSimpleChart(
    Map<String, double> dailyEarnings,
    double maxEarning,
  ) {
    if (dailyEarnings.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 40),
          child: Text(
            widget.isArabic ? 'لا توجد بيانات' : 'No data available',
            style: GoogleFonts.poppins(color: Colors.grey.shade500),
          ),
        ),
      );
    }

    return SizedBox(
      height: 150,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: dailyEarnings.entries.map((entry) {
          final value = entry.value;
          final percentage = maxEarning > 0 ? (value / maxEarning) : 0.0;
          final height = 100 * percentage;

          return Column(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Container(
                width: 20,
                height: height.clamp(0, 100).toDouble(),
                decoration: BoxDecoration(
                  color: AppColors.primaryBlue,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(4),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                _formatDateLabel(entry.key),
                style: GoogleFonts.poppins(
                  fontSize: 9,
                  color: Colors.grey.shade600,
                ),
              ),
            ],
          );
        }).toList(),
      ),
    );
  }

  Widget _buildStatCard(String label, double value) {
    return Column(
      children: [
        Text(
          '${value.toStringAsFixed(0)} SDG',
          style: GoogleFonts.poppins(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: AppColors.primaryBlue,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: GoogleFonts.poppins(fontSize: 11, color: Colors.grey.shade600),
        ),
      ],
    );
  }

  String _getPeriodLabel() {
    return {
          '7days': '7 days',
          '30days': '30 days',
          '90days': '90 days',
        }[_selectedPeriod] ??
        _selectedPeriod;
  }

  String _formatDateLabel(String dateStr) {
    try {
      final parts = dateStr.split('-');
      if (parts.length == 3) {
        return '${parts[2]}/${parts[1]}';
      }
    } catch (_) {}
    return dateStr;
  }
}

/// Earnings summary card
class EarningsSummaryCard extends StatelessWidget {
  final double totalEarnings;
  final double totalWithdrawn;
  final double netBalance;
  final bool isArabic;

  const EarningsSummaryCard({
    super.key,
    required this.totalEarnings,
    required this.totalWithdrawn,
    required this.netBalance,
    this.isArabic = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Colors.green.shade400, Colors.green.shade600],
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.green.withValues(alpha: 0.2),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                isArabic ? 'ملخص الأرباح' : 'Earnings Summary',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              Icon(Icons.arrow_upward_rounded, color: Colors.white, size: 20),
            ],
          ),
          const SizedBox(height: 16),
          _buildEarningsRow(
            isArabic ? 'إجمالي الأرباح' : 'Total Earnings',
            totalEarnings,
          ),
          const SizedBox(height: 12),
          _buildEarningsRow(
            isArabic ? 'المسحوب' : 'Withdrawn',
            totalWithdrawn,
            color: Colors.white70,
          ),
          const SizedBox(height: 16),
          Container(height: 1, color: Colors.white.withValues(alpha: 0.3)),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                isArabic ? 'الرصيد المتاح' : 'Available',
                style: GoogleFonts.poppins(fontSize: 13, color: Colors.white),
              ),
              Text(
                '${netBalance.toStringAsFixed(2)} SDG',
                style: GoogleFonts.poppins(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildEarningsRow(
    String label,
    double amount, {
    Color color = Colors.white,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: GoogleFonts.poppins(fontSize: 12, color: color)),
        Text(
          '${amount.toStringAsFixed(2)} SDG',
          style: GoogleFonts.poppins(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: color,
          ),
        ),
      ],
    );
  }
}
