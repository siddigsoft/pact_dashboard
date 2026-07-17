import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Empty state display with icon, title, and action
class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;
  final Color? iconColor;
  final bool isArabic;

  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    this.actionLabel,
    this.onAction,
    this.iconColor,
    this.isArabic = false,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: (iconColor ?? AppColors.primaryBlue).withValues(
                    alpha: 0.1,
                  ),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Icon(
                  icon,
                  size: 56,
                  color: iconColor ?? AppColors.primaryBlue,
                ),
              ),
              const SizedBox(height: 24),
              Text(
                title,
                textAlign: TextAlign.center,
                style: GoogleFonts.poppins(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: Colors.grey.shade800,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                subtitle,
                textAlign: TextAlign.center,
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  color: Colors.grey.shade600,
                  height: 1.5,
                ),
              ),
              if (actionLabel != null && onAction != null) ...[
                const SizedBox(height: 28),
                ElevatedButton.icon(
                  onPressed: onAction,
                  icon: const Icon(Icons.add_rounded),
                  label: Text(
                    actionLabel!,
                    style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryBlue,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 24,
                      vertical: 12,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// No transactions empty state
class NoTransactionsEmptyState extends StatelessWidget {
  final bool isArabic;

  const NoTransactionsEmptyState({super.key, this.isArabic = false});

  @override
  Widget build(BuildContext context) {
    return EmptyState(
      icon: Icons.swap_horiz_rounded,
      title: isArabic ? 'لا توجد معاملات' : 'No Transactions Yet',
      subtitle: isArabic
          ? 'ابدأ بإضافة نشاطات ميدانية لرؤية معاملاتك هنا'
          : 'Start your field activities to see transactions here',
      iconColor: Colors.teal,
      isArabic: isArabic,
    );
  }
}

/// No withdrawals empty state
class NoWithdrawalsEmptyState extends StatelessWidget {
  final bool isArabic;
  final VoidCallback? onRequestWithdrawal;

  const NoWithdrawalsEmptyState({
    super.key,
    this.isArabic = false,
    this.onRequestWithdrawal,
  });

  @override
  Widget build(BuildContext context) {
    return EmptyState(
      icon: Icons.arrow_downward_rounded,
      title: isArabic ? 'لا توجد طلبات سحب' : 'No Withdrawals Yet',
      subtitle: isArabic
          ? 'اطلب سحب أموالك من الرصيد المتاح'
          : 'Request a withdrawal when you need funds',
      actionLabel: isArabic ? 'اطلب سحب أموال' : 'Request Withdrawal',
      onAction: onRequestWithdrawal,
      iconColor: Colors.blue,
      isArabic: isArabic,
    );
  }
}

/// No advances empty state
class NoAdvancesEmptyState extends StatelessWidget {
  final bool isArabic;

  const NoAdvancesEmptyState({super.key, this.isArabic = false});

  @override
  Widget build(BuildContext context) {
    return EmptyState(
      icon: Icons.card_giftcard_rounded,
      title: isArabic ? 'لا توجد ترحيلات' : 'No Advances Yet',
      subtitle: isArabic
          ? 'ستظهر الدفعات المقدمة والمواصلاتة هنا عند توفرها'
          : 'Your approved advances will appear here',
      iconColor: Colors.amber,
      isArabic: isArabic,
    );
  }
}

/// No audit logs empty state
class NoAuditLogsEmptyState extends StatelessWidget {
  final bool isArabic;

  const NoAuditLogsEmptyState({super.key, this.isArabic = false});

  @override
  Widget build(BuildContext context) {
    return EmptyState(
      icon: Icons.history_rounded,
      title: isArabic ? 'لا توجد سجلات' : 'No Activity History',
      subtitle: isArabic
          ? 'سيتم تسجيل جميع إجراءاتك المحفظة هنا مع الطوابع الزمنية'
          : 'Your wallet actions and timestamps will appear here',
      iconColor: Colors.indigo,
      isArabic: isArabic,
    );
  }
}

/// No search results empty state
class NoSearchResultsEmptyState extends StatelessWidget {
  final String searchQuery;
  final bool isArabic;

  const NoSearchResultsEmptyState({
    super.key,
    required this.searchQuery,
    this.isArabic = false,
  });

  @override
  Widget build(BuildContext context) {
    return EmptyState(
      icon: Icons.search_off_rounded,
      title: isArabic ? 'لم يتم العثور على نتائج' : 'No Results Found',
      subtitle: isArabic
          ? 'لا توجد معاملات تطابق "$searchQuery"'
          : 'No transactions matching "$searchQuery"',
      iconColor: Colors.orange,
      isArabic: isArabic,
    );
  }
}

/// Offline mode indicator
class OfflineModeOverlay extends StatelessWidget {
  final DateTime? lastSyncTime;
  final bool isArabic;

  const OfflineModeOverlay({
    super.key,
    this.lastSyncTime,
    this.isArabic = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.orange.shade600,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.cloud_off_rounded, color: Colors.white, size: 16),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              isArabic ? 'وضع غير متصل' : 'Offline Mode',
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ),
          if (lastSyncTime != null) ...[
            const SizedBox(width: 4),
            Flexible(
              child: Text(
                '• ${isArabic ? 'آخر تحديث' : 'Last sync'}: ${lastSyncTime!.toString().substring(0, 19)}',
                style: GoogleFonts.poppins(fontSize: 11, color: Colors.white70),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
