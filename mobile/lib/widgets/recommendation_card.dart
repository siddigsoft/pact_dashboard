import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Display smart financial recommendations
class RecommendationCard extends StatelessWidget {
  final List<Map<String, dynamic>> recommendations;
  final bool isArabic;
  final Function(String)? onDismiss;

  const RecommendationCard({
    super.key,
    required this.recommendations,
    this.isArabic = false,
    this.onDismiss,
  });

  Color _getPriorityColor(String priority) {
    switch (priority.toLowerCase()) {
      case 'high':
        return Colors.red;
      case 'medium':
        return Colors.orange;
      case 'low':
        return Colors.blue;
      default:
        return Colors.grey;
    }
  }

  IconData _getTypeIcon(String type) {
    switch (type.toLowerCase()) {
      case 'savings':
        return Icons.savings;
      case 'spending':
        return Icons.trending_down;
      case 'growth':
        return Icons.trending_up;
      case 'activity':
        return Icons.flash_on;
      default:
        return Icons.lightbulb_outline;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (recommendations.isEmpty) {
      return Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.green.shade50,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.green.shade200),
        ),
        child: Row(
          children: [
            Icon(Icons.check_circle_outline, color: Colors.green.shade700),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                isArabic
                    ? 'لا توجد توصيات جديدة'
                    : 'All caught up! No recommendations needed.',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
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
          child: Text(
            isArabic ? '💡 التوصيات الذكية' : '💡 Smart Recommendations',
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const SizedBox(height: 12),
        ...recommendations.asMap().entries.map((entry) {
          final recommendation = entry.value;
          final index = entry.key;
          final priority = (recommendation['priority'] as String?) ?? 'low';
          final type = (recommendation['type'] as String?) ?? 'activity';
          final title =
              (recommendation['title'] as String?) ?? 'Recommendation';
          final description = (recommendation['description'] as String?) ?? '';

          return Dismissible(
            key: Key('rec_$index'),
            onDismissed: (_) {
              if (onDismiss != null) {
                onDismiss!(title);
              }
            },
            direction: DismissDirection.endToStart,
            background: Container(
              alignment: Alignment.centerRight,
              padding: const EdgeInsets.only(right: 16),
              margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.red,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.delete_outline, color: Colors.white),
            ),
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border(
                  left: BorderSide(
                    color: _getPriorityColor(priority),
                    width: 4,
                  ),
                ),
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
                        child: Row(
                          children: [
                            Icon(
                              _getTypeIcon(type),
                              size: 18,
                              color: _getPriorityColor(priority),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                title,
                                style: GoogleFonts.poppins(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: _getPriorityColor(priority).withOpacity(0.1),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          priority.toUpperCase(),
                          style: GoogleFonts.poppins(
                            fontSize: 9,
                            fontWeight: FontWeight.w600,
                            color: _getPriorityColor(priority),
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (description.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      description,
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: AppColors.textLight,
                        height: 1.4,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
          );
        }),
      ],
    );
  }
}
