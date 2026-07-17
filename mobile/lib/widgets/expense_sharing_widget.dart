import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Expense sharing display and management
class ExpenseSharingWidget extends StatelessWidget {
  final List<Map<String, dynamic>> pendingShares;
  final bool isArabic;
  final Function(String)? onSettleShare;
  final VoidCallback? onCreateShare;

  const ExpenseSharingWidget({
    super.key,
    required this.pendingShares,
    this.isArabic = false,
    this.onSettleShare,
    this.onCreateShare,
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
                  isArabic ? '👥 النفقات المشتركة' : '👥 Shared Expenses',
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (onCreateShare != null)
                  IconButton(
                    icon: const Icon(Icons.add_circle_outline),
                    onPressed: onCreateShare,
                    color: AppColors.primaryBlue,
                  ),
              ],
            ),
          ),
          if (pendingShares.isEmpty)
            Container(
              padding: const EdgeInsets.all(16),
              child: Center(
                child: Text(
                  isArabic
                      ? 'لا توجد نفقات مشتركة معلقة'
                      : 'No pending shared expenses',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: AppColors.textLight,
                  ),
                ),
              ),
            )
          else
            ...pendingShares.map((share) {
              final amount = (share['amount'] as num?)?.toDouble() ?? 0;
              final expenseName =
                  (share['shared_expenses']?['title'] as String?) ??
                  'Shared Expense';
              final shareId = (share['id'] as String?) ?? '';

              return Container(
                margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.amber.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.amber.shade200),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            expenseName,
                            style: GoogleFonts.poppins(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.amber.shade200,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            '${amount.toStringAsFixed(0)} SDG',
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: Colors.amber.shade900,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        if (onSettleShare != null)
                          ElevatedButton.icon(
                            onPressed: () => onSettleShare!(shareId),
                            icon: const Icon(Icons.check, size: 16),
                            label: Text(
                              isArabic ? 'دفع' : 'Settle',
                              style: const TextStyle(fontSize: 11),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.green,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 6,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              );
            }),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}
