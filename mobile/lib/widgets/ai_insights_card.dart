import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// AI-powered insights and advice display
class AIInsightsCard extends StatelessWidget {
  final List<Map<String, dynamic>> advice;
  final Map<String, dynamic> healthScore;
  final bool isArabic;
  final VoidCallback? onViewMore;

  const AIInsightsCard({
    super.key,
    required this.advice,
    required this.healthScore,
    this.isArabic = false,
    this.onViewMore,
  });

  Color _getPriorityColor(String priority) {
    switch (priority.toLowerCase()) {
      case 'high':
        return Colors.red;
      case 'medium':
        return Colors.orange;
      case 'low':
        return Colors.green;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withOpacity(0.1),
            blurRadius: 8,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header with health score
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  AppColors.primaryBlue.withOpacity(0.1),
                  AppColors.primaryBlue.withOpacity(0.05),
                ],
              ),
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(12),
                topRight: Radius.circular(12),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isArabic ? '🤖 رؤى ذكية' : '🤖 AI Financial Insights',
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      isArabic
                          ? 'نصائح شخصية مخصصة'
                          : 'Personalized recommendations',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        color: AppColors.textLight,
                      ),
                    ),
                  ],
                ),
                // Health Score Badge
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _getPriorityColor(
                      (healthScore['grade'] as String?) ?? 'C',
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: _getPriorityColor(
                          healthScore['grade'] as String?,
                        ).withOpacity(0.3),
                        blurRadius: 8,
                      ),
                    ],
                  ),
                  child: Text(
                    (healthScore['grade'] as String?) ?? 'C',
                    style: GoogleFonts.poppins(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
          ),
          // Advice items
          if (advice.isNotEmpty)
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                children: advice.take(3).map((item) {
                  final priority = (item['priority'] as String?) ?? 'low';
                  final title = (item['title'] as String?) ?? 'Tip';
                  final description = (item['description'] as String?) ?? '';

                  return Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: _getPriorityColor(priority).withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: _getPriorityColor(priority).withOpacity(0.3),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: _getPriorityColor(priority),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          description,
                          style: GoogleFonts.poppins(
                            fontSize: 10,
                            color: AppColors.textLight,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),
          if (onViewMore != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: TextButton(
                onPressed: onViewMore,
                child: Text(
                  isArabic ? 'عرض المزيد' : 'View All Insights',
                  style: GoogleFonts.poppins(
                    color: AppColors.primaryBlue,
                    fontWeight: FontWeight.w600,
                    fontSize: 11,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
