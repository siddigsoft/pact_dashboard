import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';
import '../services/financial_goals_service.dart';

/// Financial goals display and management widget
class FinancialGoalsCard extends StatelessWidget {
  final List<Map<String, dynamic>> goals;
  final bool isArabic;
  final VoidCallback? onAddGoal;
  final Function(String)? onCompleteGoal;

  const FinancialGoalsCard({
    super.key,
    required this.goals,
    this.isArabic = false,
    this.onAddGoal,
    this.onCompleteGoal,
  });

  @override
  Widget build(BuildContext context) {
    if (goals.isEmpty) {
      return Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.blue.shade50,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.blue.shade200),
        ),
        child: Row(
          children: [
            Icon(Icons.flag_outlined, color: Colors.blue.shade700),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    isArabic ? 'لا توجد أهداف بعد' : 'No financial goals yet',
                    style: GoogleFonts.poppins(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    isArabic
                        ? 'ابدأ بتعيين أهدافك المالية'
                        : 'Start setting your financial goals',
                    style: GoogleFonts.poppins(
                      fontSize: 11,
                      color: AppColors.textLight,
                    ),
                  ),
                ],
              ),
            ),
            if (onAddGoal != null)
              TextButton(
                onPressed: onAddGoal,
                child: Text(isArabic ? 'أضف' : 'Add'),
              ),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                isArabic ? '🎯 الأهداف المالية' : '🎯 Financial Goals',
                style: GoogleFonts.poppins(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              if (onAddGoal != null)
                IconButton(
                  icon: const Icon(Icons.add_circle_outline),
                  onPressed: onAddGoal,
                  color: AppColors.primaryBlue,
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        ...goals.map((goal) {
          final insights = FinancialGoalsService.getGoalInsights(goal);
          final progress = (insights['progress'] as num).toDouble();
          final daysRemaining = (insights['daysRemaining'] as num).toInt();
          final amountRemaining = (insights['amountRemaining'] as num)
              .toDouble();
          final status = FinancialGoalsService.getGoalStatus(goal, isArabic);

          return Container(
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            padding: const EdgeInsets.all(12),
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
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        (goal['name'] as String?) ?? 'Goal',
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.blue.shade100,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        status,
                        style: GoogleFonts.poppins(
                          fontSize: 10,
                          color: Colors.blue.shade700,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: (progress / 100).clamp(0, 1),
                    minHeight: 6,
                    backgroundColor: Colors.grey.shade200,
                    valueColor: AlwaysStoppedAnimation<Color>(
                      progress >= 100 ? Colors.green : Colors.blue,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '${progress.toStringAsFixed(0)}%',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      '${amountRemaining.toStringAsFixed(0)} SDG ${isArabic ? 'متبقي' : 'remaining'}',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: AppColors.textLight,
                      ),
                    ),
                    Text(
                      '$daysRemaining ${isArabic ? 'يوم' : 'days left'}',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: daysRemaining < 30
                            ? Colors.orange
                            : AppColors.textLight,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}
