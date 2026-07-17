import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Bill splitting display widget
class BillSplittingWidget extends StatelessWidget {
  final List<Map<String, dynamic>> pendingBills;
  final double totalOwed;
  final bool isArabic;
  final VoidCallback? onCreateSplit;
  final Function(Map<String, dynamic>)? onPayBill;
  final Function(Map<String, dynamic>)? onViewRecipients;

  const BillSplittingWidget({
    super.key,
    required this.pendingBills,
    required this.totalOwed,
    this.isArabic = false,
    this.onCreateSplit,
    this.onPayBill,
    this.onViewRecipients,
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
                  isArabic ? '👥 تقسيم الفواتير' : '👥 Bill Splitting',
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (onCreateSplit != null)
                  IconButton(
                    icon: const Icon(Icons.add_circle_outline),
                    onPressed: onCreateSplit,
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
                  isArabic ? 'إجمالي المستحق' : 'Total Owed',
                  style: GoogleFonts.poppins(
                    fontSize: 11,
                    color: AppColors.textLight,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '${totalOwed.toStringAsFixed(0)} SDG',
                  style: GoogleFonts.poppins(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: Colors.purple,
                  ),
                ),
              ],
            ),
          ),
          if (pendingBills.isNotEmpty) ...[
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                isArabic ? 'الفواتير المعلقة' : 'Pending Bills',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: 8),
            ...pendingBills.take(4).map((bill) {
              final billName = (bill['bill_name'] as String?) ?? 'Bill';
              final myShare = (bill['my_share'] as num?)?.toDouble() ?? 0;
              final totalAmount =
                  (bill['total_amount'] as num?)?.toDouble() ?? 0;

              return Container(
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey.shade200),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                billName,
                                style: GoogleFonts.poppins(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                isArabic
                                    ? 'حصتك: ${myShare.toStringAsFixed(0)} SDG'
                                    : 'Your share: ${myShare.toStringAsFixed(0)} SDG',
                                style: GoogleFonts.poppins(
                                  fontSize: 9,
                                  color: AppColors.textLight,
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
                            color: Colors.purple.shade100,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            '${totalAmount.toStringAsFixed(0)} SDG',
                            style: GoogleFonts.poppins(
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              color: Colors.purple.shade700,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    if (onPayBill != null || onViewRecipients != null)
                      Row(
                        children: [
                          if (onPayBill != null)
                            Expanded(
                              child: ElevatedButton(
                                onPressed: () => onPayBill!(bill),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.green,
                                ),
                                child: Text(
                                  isArabic ? 'ادفع' : 'Pay',
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ),
                          if (onPayBill != null && onViewRecipients != null)
                            const SizedBox(width: 8),
                          if (onViewRecipients != null)
                            Expanded(
                              child: OutlinedButton(
                                onPressed: () => onViewRecipients!(bill),
                                child: Text(
                                  isArabic ? 'التفاصيل' : 'Details',
                                  style: const TextStyle(fontSize: 11),
                                ),
                              ),
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
                  isArabic ? 'لا توجد فواتير معلقة' : 'No pending bills',
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
