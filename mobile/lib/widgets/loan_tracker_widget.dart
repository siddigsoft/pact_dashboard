import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Loan tracker and repayment widget
class LoanTrackerWidget extends StatelessWidget {
  final List<Map<String, dynamic>> activeLoans;
  final double totalAmountOwed;
  final bool isArabic;
  final VoidCallback? onAddLoan;
  final Function(Map<String, dynamic>)? onRecordPayment;
  final Function(Map<String, dynamic>)? onViewDetails;

  const LoanTrackerWidget({
    super.key,
    required this.activeLoans,
    required this.totalAmountOwed,
    this.isArabic = false,
    this.onAddLoan,
    this.onRecordPayment,
    this.onViewDetails,
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
                  isArabic ? '📋 القروض' : '📋 Loans',
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (onAddLoan != null)
                  IconButton(
                    icon: const Icon(Icons.add_circle_outline),
                    onPressed: onAddLoan,
                    color: AppColors.primaryBlue,
                  ),
              ],
            ),
          ),
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.red.shade50,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.red.shade200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isArabic ? 'إجمالي المبلغ المستحق' : 'Total Amount Owed',
                  style: GoogleFonts.poppins(
                    fontSize: 11,
                    color: AppColors.textLight,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '${totalAmountOwed.toStringAsFixed(0)} SDG',
                  style: GoogleFonts.poppins(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: Colors.red.shade700,
                  ),
                ),
              ],
            ),
          ),
          if (activeLoans.isNotEmpty) ...[
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                isArabic ? 'القروض النشطة' : 'Active Loans',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: 8),
            ...activeLoans.take(5).map((loan) {
              final loanName = (loan['loan_name'] as String?) ?? 'Loan';
              final principalAmount =
                  (loan['principal_amount'] as num?)?.toDouble() ?? 0;
              final amountPaid = (loan['amount_paid'] as num?)?.toDouble() ?? 0;
              final remaining = principalAmount - amountPaid;
              final progressPercent = principalAmount > 0
                  ? (amountPaid / principalAmount * 100).clamp(0, 100)
                  : 0;
              final monthlyPayment =
                  (loan['monthly_payment'] as num?)?.toDouble() ?? 0;

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
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                loanName,
                                style: GoogleFonts.poppins(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '${monthlyPayment.toStringAsFixed(0)} SDG/mo',
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
                            color: Colors.blue.shade100,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            '${progressPercent.toStringAsFixed(0)}%',
                            style: GoogleFonts.poppins(
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              color: Colors.blue.shade700,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              isArabic ? 'المتبقي' : 'Remaining',
                              style: GoogleFonts.poppins(
                                fontSize: 9,
                                color: AppColors.textLight,
                              ),
                            ),
                            Text(
                              '${remaining.toStringAsFixed(0)} SDG',
                              style: GoogleFonts.poppins(
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: progressPercent > 0
                                ? progressPercent / 100
                                : 0,
                            minHeight: 6,
                            backgroundColor: Colors.grey.shade200,
                            valueColor: AlwaysStoppedAnimation(
                              progressPercent > 50
                                  ? Colors.green
                                  : Colors.orange,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const SizedBox(),
                        Row(
                          children: [
                            if (onRecordPayment != null)
                              ElevatedButton.icon(
                                onPressed: () => onRecordPayment!(loan),
                                icon: const Icon(Icons.check, size: 14),
                                label: Text(
                                  isArabic ? 'دفع' : 'Pay',
                                  style: const TextStyle(fontSize: 10),
                                ),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.green,
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 6,
                                  ),
                                ),
                              ),
                            const SizedBox(width: 6),
                            if (onViewDetails != null)
                              OutlinedButton.icon(
                                onPressed: () => onViewDetails!(loan),
                                icon: const Icon(Icons.info_outline, size: 14),
                                label: Text(
                                  isArabic ? 'تفاصيل' : 'Details',
                                  style: const TextStyle(fontSize: 10),
                                ),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: AppColors.primaryBlue,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 6,
                                  ),
                                ),
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
                  isArabic ? 'لا توجد قروض نشطة' : 'No active loans',
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
