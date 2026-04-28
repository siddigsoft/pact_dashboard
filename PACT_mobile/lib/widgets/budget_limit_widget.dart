import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Budget limit display and management widget
class BudgetLimitWidget extends StatelessWidget {
  final String category;
  final double limit;
  final double spent;
  final String period;
  final bool isArabic;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  const BudgetLimitWidget({
    super.key,
    required this.category,
    required this.limit,
    required this.spent,
    required this.period,
    this.isArabic = false,
    this.onEdit,
    this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final percentage = ((spent / limit) * 100).clamp(0, 100);
    final isNearLimit = percentage >= 80;
    final isExceeded = percentage > 100;
    final remaining = (limit - spent).clamp(0, double.infinity);

    Color getProgressColor() {
      if (isExceeded) return Colors.red;
      if (isNearLimit) return Colors.orange;
      return Colors.green;
    }

    String getPeriodLabel() {
      switch (period) {
        case 'weekly':
          return isArabic ? 'أسبوعي' : 'Weekly';
        case 'monthly':
          return isArabic ? 'شهري' : 'Monthly';
        case 'yearly':
          return isArabic ? 'سنوي' : 'Yearly';
        default:
          return period;
      }
    }

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        category,
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        getPeriodLabel(),
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          color: AppColors.textLight,
                        ),
                      ),
                    ],
                  ),
                ),
                if (onEdit != null || onDelete != null)
                  PopupMenuButton<String>(
                    onSelected: (value) {
                      if (value == 'edit') {
                        onEdit?.call();
                      } else if (value == 'delete') {
                        onDelete?.call();
                      }
                    },
                    itemBuilder: (BuildContext context) => [
                      if (onEdit != null)
                        PopupMenuItem(
                          value: 'edit',
                          child: Row(
                            children: [
                              const Icon(Icons.edit, size: 16),
                              const SizedBox(width: 8),
                              Text(isArabic ? 'تعديل' : 'Edit'),
                            ],
                          ),
                        ),
                      if (onDelete != null)
                        PopupMenuItem(
                          value: 'delete',
                          child: Row(
                            children: [
                              const Icon(
                                Icons.delete,
                                size: 16,
                                color: Colors.red,
                              ),
                              const SizedBox(width: 8),
                              Text(isArabic ? 'حذف' : 'Delete'),
                            ],
                          ),
                        ),
                    ],
                  ),
              ],
            ),

            const SizedBox(height: 16),

            // Progress bar
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '${spent.toStringAsFixed(0)} / ${limit.toStringAsFixed(0)} SDG',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    Text(
                      '${percentage.toStringAsFixed(0)}%',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: getProgressColor(),
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: LinearProgressIndicator(
                    value: (percentage / 100).clamp(0, 1),
                    minHeight: 8,
                    backgroundColor: Colors.grey.shade200,
                    valueColor: AlwaysStoppedAnimation<Color>(
                      getProgressColor(),
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 12),

            // Status message
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: getProgressColor().withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(
                    isExceeded
                        ? Icons.error_outline
                        : isNearLimit
                        ? Icons.warning_amber
                        : Icons.check_circle_outline,
                    size: 16,
                    color: getProgressColor(),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      isExceeded
                          ? (isArabic ? 'تجاوزت الميزانية' : 'Budget exceeded')
                          : isNearLimit
                          ? (isArabic
                                ? 'الميزانية قريبة من الحد'
                                : 'Budget limit approaching')
                          : (isArabic ? 'ضمن الميزانية' : 'Within budget'),
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        color: getProgressColor(),
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  if (!isExceeded)
                    Text(
                      '${remaining.toStringAsFixed(0)} SDG ${isArabic ? 'متبقي' : 'remaining'}',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: AppColors.textLight,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
