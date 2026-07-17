import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// P2P transfer and money request widget
class P2PTransferWidget extends StatelessWidget {
  final List<Map<String, dynamic>> recentTransfers;
  final List<Map<String, dynamic>> pendingRequests;
  final double sentThisMonth;
  final double receivedThisMonth;
  final bool isArabic;
  final VoidCallback? onSendMoney;
  final VoidCallback? onRequestMoney;
  final Function(Map<String, dynamic>)? onApproveRequest;
  final Function(Map<String, dynamic>)? onRejectRequest;

  const P2PTransferWidget({
    super.key,
    required this.recentTransfers,
    required this.pendingRequests,
    required this.sentThisMonth,
    required this.receivedThisMonth,
    this.isArabic = false,
    this.onSendMoney,
    this.onRequestMoney,
    this.onApproveRequest,
    this.onRejectRequest,
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
                  isArabic ? '📱 تحويل أموال' : '📱 Money Transfer',
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Row(
                  children: [
                    if (onSendMoney != null)
                      IconButton(
                        icon: const Icon(Icons.send),
                        onPressed: onSendMoney,
                        color: Colors.green,
                        iconSize: 20,
                      ),
                    if (onRequestMoney != null)
                      IconButton(
                        icon: const Icon(Icons.call_received),
                        onPressed: onRequestMoney,
                        color: Colors.blue,
                        iconSize: 20,
                      ),
                  ],
                ),
              ],
            ),
          ),
          Row(
            children: [
              Expanded(
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.green.shade50,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.green.shade200),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isArabic ? 'أرسل' : 'Sent',
                        style: GoogleFonts.poppins(
                          fontSize: 10,
                          color: AppColors.textLight,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${sentThisMonth.toStringAsFixed(0)} SDG',
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: Colors.green,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.blue.shade50,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.blue.shade200),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isArabic ? 'استقبل' : 'Received',
                        style: GoogleFonts.poppins(
                          fontSize: 10,
                          color: AppColors.textLight,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${receivedThisMonth.toStringAsFixed(0)} SDG',
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: Colors.blue,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          if (pendingRequests.isNotEmpty) ...[
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                isArabic ? 'طلبات قيد الانتظار' : 'Pending Requests',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: 8),
            ...pendingRequests.take(3).map((request) {
              final amount = (request['amount'] as num?)?.toDouble() ?? 0;
              final description =
                  (request['description'] as String?) ?? 'Money request';

              return Container(
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.orange.shade200),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            description,
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Requested: ${amount.toStringAsFixed(0)} SDG',
                            style: GoogleFonts.poppins(
                              fontSize: 9,
                              color: AppColors.textLight,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (onApproveRequest != null || onRejectRequest != null)
                      Row(
                        children: [
                          if (onApproveRequest != null)
                            IconButton(
                              onPressed: () => onApproveRequest!(request),
                              icon: const Icon(Icons.check_circle),
                              iconSize: 18,
                              color: Colors.green,
                              padding: EdgeInsets.zero,
                              constraints: const BoxConstraints(),
                            ),
                          if (onRejectRequest != null)
                            IconButton(
                              onPressed: () => onRejectRequest!(request),
                              icon: const Icon(Icons.cancel),
                              iconSize: 18,
                              color: Colors.red,
                              padding: EdgeInsets.zero,
                              constraints: const BoxConstraints(),
                            ),
                        ],
                      ),
                  ],
                ),
              );
            }),
          ],
          if (recentTransfers.isNotEmpty) ...[
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                isArabic ? 'التحويلات الأخيرة' : 'Recent Transfers',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: 8),
            ...recentTransfers.take(3).map((transfer) {
              final amount = (transfer['amount'] as num?)?.toDouble() ?? 0;
              final description =
                  (transfer['description'] as String?) ?? 'Transfer';

              return Container(
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey.shade200),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        description,
                        style: GoogleFonts.poppins(
                          fontSize: 10,
                          fontWeight: FontWeight.w500,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                    Text(
                      '${amount.abs().toStringAsFixed(0)} SDG',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: amount < 0 ? Colors.red : Colors.green,
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
