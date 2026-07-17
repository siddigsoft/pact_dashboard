import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Security alerts and fraud detection display
class SecurityAlertsWidget extends StatelessWidget {
  final List<Map<String, dynamic>> alerts;
  final bool isArabic;
  final VoidCallback? onViewAll;
  final Function(String)? onReviewAlert;

  const SecurityAlertsWidget({
    super.key,
    required this.alerts,
    this.isArabic = false,
    this.onViewAll,
    this.onReviewAlert,
  });

  Color _getRiskColor(String riskLevel) {
    switch (riskLevel.toLowerCase()) {
      case 'high':
        return Colors.red;
      case 'medium':
        return Colors.orange;
      case 'low':
        return Colors.amber;
      case 'none':
        return Colors.green;
      default:
        return Colors.grey;
    }
  }

  IconData _getRiskIcon(String riskLevel) {
    switch (riskLevel.toLowerCase()) {
      case 'high':
        return Icons.warning;
      case 'medium':
        return Icons.error_outline;
      case 'low':
        return Icons.info_outline;
      case 'none':
        return Icons.check_circle_outline;
      default:
        return Icons.shield_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
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
                  isArabic ? '🛡️ تنبيهات الأمان' : '🛡️ Security Alerts',
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: alerts.isEmpty
                        ? Colors.green.shade50
                        : Colors.red.shade50,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    alerts.isEmpty ? '✓ Safe' : '${alerts.length} alerts',
                    style: GoogleFonts.poppins(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: alerts.isEmpty ? Colors.green : Colors.red,
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (alerts.isEmpty)
            Container(
              padding: const EdgeInsets.all(16),
              child: Center(
                child: Column(
                  children: [
                    Icon(
                      Icons.shield_outlined,
                      size: 40,
                      color: Colors.green.shade400,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      isArabic
                          ? 'لا توجد تنبيهات أمان'
                          : 'Your account is secure',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            )
          else
            ...alerts.take(5).map((alert) {
              final riskLevel = (alert['risk_level'] as String?) ?? 'low';
              final description =
                  (alert['description'] as String?) ?? 'Security alert';
              final alertType = (alert['alert_type'] as String?) ?? 'unknown';
              final alertId = (alert['id'] as String?) ?? '';

              return Container(
                margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _getRiskColor(riskLevel).withOpacity(0.05),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: _getRiskColor(riskLevel).withOpacity(0.2),
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      _getRiskIcon(riskLevel),
                      color: _getRiskColor(riskLevel),
                      size: 20,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            description,
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: _getRiskColor(riskLevel).withOpacity(0.2),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              riskLevel.toUpperCase(),
                              style: GoogleFonts.poppins(
                                fontSize: 9,
                                fontWeight: FontWeight.w600,
                                color: _getRiskColor(riskLevel),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (onReviewAlert != null &&
                        riskLevel.toLowerCase() == 'high')
                      TextButton(
                        onPressed: () => onReviewAlert!(alertId),
                        child: Text(
                          isArabic ? 'راجع' : 'Review',
                          style: GoogleFonts.poppins(
                            fontSize: 10,
                            color: _getRiskColor(riskLevel),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                  ],
                ),
              );
            }),
          if (alerts.isEmpty)
            const SizedBox()
          else
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: TextButton(
                onPressed: onViewAll,
                child: Text(
                  isArabic ? 'عرض كل التنبيهات' : 'View All Alerts',
                  style: GoogleFonts.poppins(
                    color: AppColors.primaryBlue,
                    fontWeight: FontWeight.w600,
                    fontSize: 11,
                  ),
                ),
              ),
            ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
