import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Subscription tracker widget
class SubscriptionWidget extends StatelessWidget {
  final List<Map<String, dynamic>> activeSubscriptions;
  final double totalMonthlyCost;
  final List<Map<String, dynamic>>? savingsOpportunities;
  final bool isArabic;
  final VoidCallback? onAddSubscription;
  final Function(Map<String, dynamic>)? onCancelSubscription;
  final Function(Map<String, dynamic>)? onPauseSubscription;

  const SubscriptionWidget({
    super.key,
    required this.activeSubscriptions,
    required this.totalMonthlyCost,
    this.savingsOpportunities,
    this.isArabic = false,
    this.onAddSubscription,
    this.onCancelSubscription,
    this.onPauseSubscription,
  });

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
                  isArabic ? '🔄 الاشتراكات' : '🔄 Subscriptions',
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (onAddSubscription != null)
                  IconButton(
                    icon: const Icon(Icons.add_circle_outline),
                    onPressed: onAddSubscription,
                    color: AppColors.primaryBlue,
                  ),
              ],
            ),
          ),
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.purple.shade50,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.purple.shade200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isArabic ? 'التكلفة الشهرية' : 'Monthly Cost',
                  style: GoogleFonts.poppins(
                    fontSize: 11,
                    color: AppColors.textLight,
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '${totalMonthlyCost.toStringAsFixed(0)} SDG',
                      style: GoogleFonts.poppins(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        color: Colors.purple,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.purple.shade100,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        '${activeSubscriptions.length} ${isArabic ? 'نشط' : 'active'}',
                        style: GoogleFonts.poppins(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: Colors.purple.shade700,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (savingsOpportunities != null && savingsOpportunities!.isNotEmpty)
            Container(
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.amber.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.amber.shade200),
              ),
              child: Row(
                children: [
                  Icon(Icons.lightbulb, color: Colors.amber.shade700, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      savingsOpportunities!.first['tip'] as String? ??
                          'Savings opportunity available',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: Colors.amber.shade900,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
          if (activeSubscriptions.isNotEmpty) ...[
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                isArabic ? 'الاشتراكات النشطة' : 'Active Subscriptions',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: 8),
            ...activeSubscriptions.take(4).map((subscription) {
              final serviceName =
                  (subscription['service_name'] as String?) ?? 'Subscription';
              final amount = (subscription['amount'] as num?)?.toDouble() ?? 0;
              final billingCycle =
                  (subscription['billing_cycle'] as String?) ?? 'monthly';
              final nextBillingDate =
                  (subscription['next_billing_date'] as String?) ?? '';

              final monthlyEquivalent = () {
                if (billingCycle == 'yearly') {
                  return amount / 12;
                } else if (billingCycle == 'quarterly') {
                  return amount / 3;
                }
                return amount;
              }();

              return Container(
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey.shade200),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            serviceName,
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.blue.shade100,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            billingCycle == 'yearly'
                                ? (isArabic ? 'سنوي' : 'Yearly')
                                : billingCycle == 'quarterly'
                                ? (isArabic ? 'ربع سنوي' : 'Quarterly')
                                : (isArabic ? 'شهري' : 'Monthly'),
                            style: GoogleFonts.poppins(
                              fontSize: 8,
                              fontWeight: FontWeight.w600,
                              color: Colors.blue.shade700,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${monthlyEquivalent.toStringAsFixed(0)} SDG/mo',
                              style: GoogleFonts.poppins(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            Text(
                              isArabic ? 'بعد التحويل' : '(converted)',
                              style: GoogleFonts.poppins(
                                fontSize: 8,
                                color: AppColors.textLight,
                              ),
                            ),
                          ],
                        ),
                        Row(
                          children: [
                            if (onPauseSubscription != null)
                              IconButton(
                                onPressed: () =>
                                    onPauseSubscription!(subscription),
                                icon: const Icon(Icons.pause_circle_outline),
                                iconSize: 18,
                                padding: EdgeInsets.zero,
                                constraints: const BoxConstraints(),
                                color: Colors.orange,
                              ),
                            if (onCancelSubscription != null)
                              IconButton(
                                onPressed: () =>
                                    onCancelSubscription!(subscription),
                                icon: const Icon(Icons.delete_outline),
                                iconSize: 18,
                                padding: EdgeInsets.zero,
                                constraints: const BoxConstraints(),
                                color: Colors.red,
                              ),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
              );
            }),
          ] else
            Padding(
              padding: const EdgeInsets.all(16),
              child: Center(
                child: Text(
                  isArabic ? 'لا توجد اشتراكات' : 'No subscriptions',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: AppColors.textLight,
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
