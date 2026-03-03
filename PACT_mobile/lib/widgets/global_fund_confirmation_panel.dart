// lib/widgets/global_fund_confirmation_panel.dart

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../providers/fund_confirmation_provider.dart';
import 'package:intl/intl.dart';

class GlobalFundConfirmationPanel extends ConsumerWidget {
  const GlobalFundConfirmationPanel({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final confirmationState = ref.watch(fundConfirmationCheckProvider);

    // Handle error state
    if (confirmationState.error != null) {
      debugPrint(
        'GlobalFundConfirmationPanel Error: ${confirmationState.error}',
      );
      return const SizedBox.shrink();
    }

    // Don't show if loading or no pending items
    if (confirmationState.isLoading || !confirmationState.hasAnyPending) {
      return const SizedBox.shrink();
    }

    // Show the first pending item (cost receipt > advance > withdrawal)
    if (confirmationState.pendingCostReceipts.isNotEmpty) {
      final cost = confirmationState.pendingCostReceipts.first;
      return _buildConfirmationOverlay(
        context,
        ref,
        type: 'cost',
        item: cost,
        title: 'Cost Payment Receipt Confirmation',
        titleAr: 'تأكيد استلام دفعة التكاليف',
        description:
            'Please confirm receipt of the ${cost['expense_category'] ?? "cost"} payment',
        descriptionAr:
            'يرجى تأكيد استلام دفعة ${cost['expense_category'] ?? "التكاليف"}',
      );
    }

    if (confirmationState.pendingAdvanceReceipts.isNotEmpty) {
      final advance = confirmationState.pendingAdvanceReceipts.first;
      final amount = (advance['amount_cents'] as num? ?? 0) / 100.0;
      return _buildConfirmationOverlay(
        context,
        ref,
        type: 'advance',
        item: advance,
        title: 'Advance Payment Confirmation',
        titleAr: 'تأكيد استلام المبلغ المقدم',
        description:
            'Please confirm receipt of your advance payment of ${NumberFormat.currency(symbol: '', decimalDigits: 2).format(amount)} SDG',
        descriptionAr:
            'يرجى تأكيد استلام المبلغ المقدم بمبلغ ${NumberFormat.currency(symbol: '', decimalDigits: 2).format(amount)} SDG',
      );
    }

    if (confirmationState.pendingWithdrawalConfirmations.isNotEmpty) {
      final withdrawal = confirmationState.pendingWithdrawalConfirmations.first;
      final amount = (withdrawal['amount_cents'] as num? ?? 0) / 100.0;
      return _buildConfirmationOverlay(
        context,
        ref,
        type: 'withdrawal',
        item: withdrawal,
        title: 'Withdrawal Confirmation',
        titleAr: 'تأكيد الانسحاب',
        description:
            'Please confirm receipt of your withdrawal of ${NumberFormat.currency(symbol: '', decimalDigits: 2).format(amount)} SDG',
        descriptionAr:
            'يرجى تأكيد استلام انسحابك بمبلغ ${NumberFormat.currency(symbol: '', decimalDigits: 2).format(amount)} SDG',
      );
    }

    return const SizedBox.shrink();
  }

  Widget _buildConfirmationOverlay(
    BuildContext context,
    WidgetRef ref, {
    required String type,
    required Map<String, dynamic> item,
    required String title,
    required String titleAr,
    required String description,
    required String descriptionAr,
  }) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';

    return Stack(
      children: [
        // Semi-transparent background
        Positioned.fill(
          child: GestureDetector(
            onTap: () {
              // Prevent closing by tapping outside
            },
            child: Container(color: Colors.black.withValues(alpha: 0.5)),
          ),
        ),
        // Confirmation card centered
        Center(
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Card(
                elevation: 8,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Colors.teal.shade400, Colors.teal.shade600],
                    ),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Header with icon
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.2),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Icon(
                              Icons.verified_user,
                              color: Colors.white,
                              size: 28,
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  isArabic ? titleAr : title,
                                  style: GoogleFonts.poppins(
                                    fontSize: 20,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.white,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  isArabic ? descriptionAr : description,
                                  style: GoogleFonts.poppins(
                                    fontSize: 13,
                                    color: Colors.white.withValues(alpha: 0.9),
                                  ),
                                  maxLines: 3,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),
                      // Details box
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.95),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _buildDetailRow(
                              isArabic,
                              'Amount',
                              'المبلغ',
                              _getAmount(item),
                            ),
                            const SizedBox(height: 12),
                            _buildDetailRow(
                              isArabic,
                              'Date',
                              'التاريخ',
                              _formatDate(item['created_at'] ?? ''),
                            ),
                            if (type == 'cost' &&
                                item['expense_category'] != null) ...[
                              const SizedBox(height: 12),
                              _buildDetailRow(
                                isArabic,
                                'Category',
                                'الفئة',
                                item['expense_category'] ?? 'N/A',
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: 24),
                      // Info message
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.orange.withValues(alpha: 0.1),
                          border: Border.all(
                            color: Colors.orange.withValues(alpha: 0.3),
                          ),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              Icons.info_outline,
                              color: Colors.orange.shade600,
                              size: 20,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                isArabic
                                    ? 'هذا الإجراء مطلوب للمتابعة. يرجى تأكيد الاستلام.'
                                    : 'This action is required to proceed. Please confirm receipt.',
                                style: GoogleFonts.poppins(
                                  fontSize: 12,
                                  color: Colors.orange.shade700,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 24),
                      // Action buttons
                      Row(
                        children: [
                          Expanded(
                            child: ElevatedButton(
                              onPressed: () {
                                // Navigate to wallet to confirm
                                Navigator.of(context).pushNamedAndRemoveUntil(
                                  '/main',
                                  (route) => false,
                                  arguments: {
                                    'tab': type == 'cost'
                                        ? 4 // Cost Submission tab
                                        : type == 'advance'
                                        ? 3 // Advances tab
                                        : 2, // Payments tab
                                    '${type}_to_confirm': item['id'],
                                  },
                                );
                              },
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.white,
                                foregroundColor: Colors.teal.shade600,
                                padding: const EdgeInsets.symmetric(
                                  vertical: 14,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(8),
                                ),
                              ),
                              child: Text(
                                isArabic ? 'أكد الآن' : 'Confirm Now',
                                style: GoogleFonts.poppins(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 14,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: ElevatedButton(
                              onPressed: () {
                                // Dismiss for now (will appear again on next refresh)
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text(
                                      isArabic
                                          ? 'سيظهر التذكير لاحقاً'
                                          : 'You will be reminded later',
                                    ),
                                    duration: const Duration(seconds: 2),
                                  ),
                                );
                              },
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.transparent,
                                side: const BorderSide(
                                  color: Colors.white,
                                  width: 2,
                                ),
                                padding: const EdgeInsets.symmetric(
                                  vertical: 14,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(8),
                                ),
                              ),
                              child: Text(
                                isArabic ? 'تذكيري لاحقاً' : 'Remind Me',
                                style: GoogleFonts.poppins(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 14,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildDetailRow(
    bool isArabic,
    String label,
    String labelAr,
    String value,
  ) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          isArabic ? labelAr : label,
          style: GoogleFonts.poppins(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: Colors.grey[600],
          ),
        ),
        Text(
          value,
          style: GoogleFonts.poppins(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: Colors.grey[800],
          ),
        ),
      ],
    );
  }

  String _getAmount(Map<String, dynamic> item) {
    final amount =
        (item['amount_cents'] as num? ?? item['amount'] as num? ?? 0);
    final amountValue = amount is int ? amount / 100.0 : amount;
    return NumberFormat.currency(
      symbol: '',
      decimalDigits: 2,
    ).format(amountValue);
  }

  String _formatDate(String dateString) {
    try {
      final date = DateTime.parse(dateString);
      return DateFormat('MMM dd, yyyy').format(date);
    } catch (e) {
      return 'N/A';
    }
  }
}
