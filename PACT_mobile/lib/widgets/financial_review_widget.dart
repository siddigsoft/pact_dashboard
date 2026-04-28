import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Financial review and health score widget
class FinancialReviewWidget extends StatelessWidget {
  final Map<String, dynamic> monthlyReport;
  final int healthScore;
  final bool isArabic;
  final VoidCallback? onViewDetailedReport;
  final VoidCallback? onViewTrends;

  const FinancialReviewWidget({
    super.key,
    required this.monthlyReport,
    required this.healthScore,
    this.isArabic = false,
    this.onViewDetailedReport,
    this.onViewTrends,
  });

  Color _getHealthScoreColor(int score) {
    if (score >= 80) return Colors.green;
    if (score >= 60) return Colors.blue;
    if (score >= 40) return Colors.orange;
    return Colors.red;
  }

  String _getHealthScoreLabel(int score) {
    if (score >= 80) return isArabic ? 'ممتاز' : 'Excellent';
    if (score >= 60) return isArabic ? 'جيد' : 'Good';
    if (score >= 40) return isArabic ? 'عادل' : 'Fair';
    return isArabic ? 'ضعيف' : 'Poor';
  }

  @override
  Widget build(BuildContext context) {
    final income = (monthlyReport['total_income'] as num?)?.toDouble() ?? 0;
    final expenses = (monthlyReport['total_expenses'] as num?)?.toDouble() ?? 0;
    final net = (monthlyReport['net_income'] as num?)?.toDouble() ?? 0;
    final savingsRate =
        (monthlyReport['savings_rate'] as num?)?.toDouble() ?? 0;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withOpacity(0.1),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  isArabic ? '📊 الفحص المالي' : '📊 Financial Review',
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (onViewDetailedReport != null)
                  TextButton(
                    onPressed: onViewDetailedReport,
                    child: Text(
                      isArabic ? 'التفاصيل' : 'Details',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: AppColors.primaryBlue,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: _getHealthScoreColor(healthScore).withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: _getHealthScoreColor(healthScore).withOpacity(0.3),
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 70,
                  height: 70,
                  decoration: BoxDecoration(
                    color: _getHealthScoreColor(healthScore),
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: Text(
                      '$healthScore',
                      style: GoogleFonts.poppins(
                        fontSize: 24,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isArabic
                            ? 'درجة الصحة المالية'
                            : 'Financial Health Score',
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          color: AppColors.textLight,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _getHealthScoreLabel(healthScore),
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: _getHealthScoreColor(healthScore),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              isArabic ? 'ملخص هذا الشهر' : 'This Month Summary',
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      isArabic ? 'الدخل' : 'Income',
                      style: GoogleFonts.poppins(fontSize: 11),
                    ),
                    Text(
                      '${income.toStringAsFixed(0)} SDG',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: Colors.green,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      isArabic ? 'المصروفات' : 'Expenses',
                      style: GoogleFonts.poppins(fontSize: 11),
                    ),
                    Text(
                      '${expenses.toStringAsFixed(0)} SDG',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: Colors.red,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Container(height: 1, color: Colors.grey.shade300),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      isArabic ? 'الصافي' : 'Net',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      '${net.toStringAsFixed(0)} SDG',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: net >= 0 ? Colors.green : Colors.red,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.blue.shade50,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.blue.shade200),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isArabic ? 'معدل التوفير' : 'Savings Rate',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: AppColors.textLight,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${savingsRate.toStringAsFixed(1)}%',
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: Colors.blue,
                      ),
                    ),
                  ],
                ),
                if (onViewTrends != null)
                  ElevatedButton.icon(
                    onPressed: onViewTrends,
                    icon: const Icon(Icons.trending_up, size: 14),
                    label: Text(
                      isArabic ? 'الاتجاهات' : 'Trends',
                      style: const TextStyle(fontSize: 10),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.blue,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
