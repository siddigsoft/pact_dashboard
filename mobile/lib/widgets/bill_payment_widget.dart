import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Bill payment tracker widget
class BillPaymentWidget extends StatelessWidget {
  final List<Map<String, dynamic>> upcomingBills;
  final double totalMonthlyBills;
  final bool isArabic;
  final VoidCallback? onAddBill;
  final Function(Map<String, dynamic>)? onPayBill;
  final Function(Map<String, dynamic>)? onToggleAutoPay;

  const BillPaymentWidget({
    super.key,
    required this.upcomingBills,
    required this.totalMonthlyBills,
    this.isArabic = false,
    this.onAddBill,
    this.onPayBill,
    this.onToggleAutoPay,
  });

  @override
  Widget build(BuildContext context) {
    final dueThisMonth = upcomingBills.where((bill) {
      final dueDate = bill['next_due_date'] as String?;
      if (dueDate == null) return false;
      final date = DateTime.parse(dueDate);
      final now = DateTime.now();
      return date.month == now.month && date.year == now.year;
    }).toList();

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
                  isArabic ? '💳 الفواتير والدفع' : '💳 Bills & Payments',
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (onAddBill != null)
                  IconButton(
                    icon: const Icon(Icons.add_circle_outline),
                    onPressed: onAddBill,
                    color: AppColors.primaryBlue,
                  ),
              ],
            ),
          ),
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.orange.shade50,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.orange.shade200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isArabic ? 'إجمالي الفواتير الشهرية' : 'Monthly Bill Total',
                  style: GoogleFonts.poppins(
                    fontSize: 11,
                    color: AppColors.textLight,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '${totalMonthlyBills.toStringAsFixed(0)} SDG',
                  style: GoogleFonts.poppins(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: Colors.orange,
                  ),
                ),
              ],
            ),
          ),
          if (dueThisMonth.isNotEmpty) ...[
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                isArabic ? 'مستحق هذا الشهر' : 'Due This Month',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: 8),
            ...dueThisMonth.take(5).map((bill) {
              final billName = (bill['bill_name'] as String?) ?? 'Bill';
              final amount = (bill['amount'] as num?)?.toDouble() ?? 0;
              final dueDate = (bill['next_due_date'] as String?) ?? '';
              final autoPay = (bill['auto_pay'] as bool?) ?? false;

              DateTime? parsedDate;
              try {
                parsedDate = DateTime.parse(dueDate);
              } catch (e) {
                parsedDate = null;
              }

              final daysUntilDue = parsedDate != null
                  ? parsedDate.difference(DateTime.now()).inDays
                  : 0;

              return Container(
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: daysUntilDue <= 3
                        ? Colors.red.shade200
                        : Colors.grey.shade200,
                  ),
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
                                    ? 'يستحق في $daysUntilDue أيام'
                                    : 'Due in $daysUntilDue days',
                                style: GoogleFonts.poppins(
                                  fontSize: 9,
                                  color: daysUntilDue <= 3
                                      ? Colors.red
                                      : AppColors.textLight,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Text(
                          '${amount.toStringAsFixed(0)} SDG',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: onPayBill != null
                                ? () => onPayBill!(bill)
                                : null,
                            icon: const Icon(
                              Icons.check_circle_outline,
                              size: 14,
                            ),
                            label: Text(
                              isArabic ? 'دفع' : 'Pay',
                              style: const TextStyle(fontSize: 11),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.green,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 6),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        GestureDetector(
                          onTap: onToggleAutoPay != null
                              ? () => onToggleAutoPay!(bill)
                              : null,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: autoPay
                                  ? Colors.blue.shade100
                                  : Colors.grey.shade100,
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(
                                color: autoPay
                                    ? Colors.blue.shade300
                                    : Colors.grey.shade300,
                              ),
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  autoPay
                                      ? Icons.check_circle
                                      : Icons.radio_button_unchecked,
                                  size: 14,
                                  color: autoPay ? Colors.blue : Colors.grey,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  isArabic ? 'تلقائي' : 'Auto',
                                  style: GoogleFonts.poppins(
                                    fontSize: 9,
                                    color: autoPay ? Colors.blue : Colors.grey,
                                  ),
                                ),
                              ],
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
                  isArabic ? 'لا توجد فواتير مستحقة' : 'No bills due',
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
