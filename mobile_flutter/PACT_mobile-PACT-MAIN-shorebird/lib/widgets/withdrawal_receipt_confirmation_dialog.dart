import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'dart:math';
import 'package:crypto/crypto.dart';
import '../theme/app_colors.dart';

/// Signature-based fund receipt confirmation for withdrawal requests.
/// Mirrors [AdvanceReceiptConfirmationDialog] but writes to the
/// withdrawal_requests table columns:
///   fund_receipt_confirmed, fund_receipt_confirmed_at,
///   fund_receipt_signature_url, fund_receipt_notes
class WithdrawalReceiptConfirmationDialog extends StatefulWidget {
  final String requestId;
  final double amount;
  final String currency;
  final String? requestReason;
  final bool isArabic;
  final VoidCallback onConfirmed;

  const WithdrawalReceiptConfirmationDialog({
    super.key,
    required this.requestId,
    required this.amount,
    this.currency = 'SDG',
    this.requestReason,
    this.isArabic = false,
    required this.onConfirmed,
  });

  @override
  State<WithdrawalReceiptConfirmationDialog> createState() =>
      _WithdrawalReceiptConfirmationDialogState();
}

class _WithdrawalReceiptConfirmationDialogState
    extends State<WithdrawalReceiptConfirmationDialog> {
  String _method = 'uuid';
  bool _isSubmitting = false;
  final List<Offset?> _points = [];
  String? _errorMessage;

  String _generateSecureId() {
    final random = Random.secure();
    final values = List<int>.generate(16, (_) => random.nextInt(256));
    return values.map((v) => v.toRadixString(16).padLeft(2, '0')).join();
  }

  String _generateHash(String input) {
    final bytes = utf8.encode(input);
    return sha256.convert(bytes).toString();
  }

  Future<void> _confirmReceipt() async {
    if (_method == 'handwriting' &&
        _points.where((p) => p != null).length < 10) {
      setState(() {
        _errorMessage = widget.isArabic
            ? 'يرجى رسم توقيعك'
            : 'Please draw your signature';
      });
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) throw Exception('Not authenticated');

      final profile = await Supabase.instance.client
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();

      final userName =
          profile?['full_name'] as String? ?? user.email ?? 'Unknown';

      // Verify the request is valid for confirmation
      final request = await Supabase.instance.client
          .from('withdrawal_requests')
          .select('user_id, status, fund_receipt_confirmed')
          .eq('id', widget.requestId)
          .single();

      if (request['user_id'] != user.id) {
        throw Exception(widget.isArabic
            ? 'يمكن فقط لصاحب الطلب تأكيد الاستلام'
            : 'Only the requester can confirm receipt');
      }

      if (request['status'] != 'approved') {
        throw Exception(widget.isArabic
            ? 'يمكن تأكيد الاستلام فقط للطلبات الموافق عليها'
            : 'Can only confirm receipt for approved withdrawals');
      }

      if (request['fund_receipt_confirmed'] == true) {
        throw Exception(widget.isArabic
            ? 'تم تأكيد الاستلام مسبقاً'
            : 'Fund receipt has already been confirmed');
      }

      final signatureId = _generateSecureId();
      final now = DateTime.now().toIso8601String();
      String signatureData;

      if (_method == 'handwriting') {
        signatureData = _points
            .map((p) => p != null ? '${p.dx},${p.dy}' : 'null')
            .join(';');
      } else {
        signatureData = signatureId;
      }

      final signatureHash =
          _generateHash('$signatureId:${user.id}:${widget.requestId}:$now');

      // Store full signature record as JSON in fund_receipt_signature_url
      final signatureRecord = jsonEncode({
        'signatureId': signatureId,
        'signatureHash': signatureHash,
        'signatureMethod': _method,
        'signatureData': signatureData,
        'signedAt': now,
        'confirmedBy': user.id,
        'confirmedByName': userName,
      });

      await Supabase.instance.client.from('withdrawal_requests').update({
        'fund_receipt_confirmed': true,
        'fund_receipt_confirmed_at': now,
        'fund_receipt_signature_url': signatureRecord,
        'updated_at': now,
      }).eq('id', widget.requestId);

      if (mounted) {
        Navigator.of(context).pop();
        widget.onConfirmed();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.isArabic
                  ? 'تم تأكيد استلام الأموال بنجاح'
                  : 'Fund receipt confirmed successfully',
            ),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
          _errorMessage = e.toString().replaceFirst('Exception: ', '');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = widget.isArabic;
    final amountLabel =
        '${widget.currency} ${widget.amount.toStringAsFixed(0)}';

    return Directionality(
      textDirection: isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
      child: Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Header
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.green.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(Icons.account_balance_wallet,
                          color: Colors.green, size: 28),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            isArabic ? 'تأكيد الاستلام' : 'Confirm Receipt',
                            style: GoogleFonts.poppins(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            isArabic
                                ? 'تأكيد استلام مبلغ السحب'
                                : 'Confirm withdrawal funds received',
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              color: Colors.grey[600],
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                // Details card
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.blue.withOpacity(0.05),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.blue.withOpacity(0.2)),
                  ),
                  child: Column(
                    children: [
                      _buildDetailRow(
                        isArabic ? 'المبلغ' : 'Amount',
                        amountLabel,
                        Icons.account_balance_wallet,
                      ),
                      if (widget.requestReason != null) ...[
                        const SizedBox(height: 8),
                        _buildDetailRow(
                          isArabic ? 'السبب' : 'Reason',
                          widget.requestReason!,
                          Icons.description,
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // Signature method selector
                Text(
                  isArabic ? 'طريقة التوقيع' : 'Signature Method',
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: _buildMethodOption(
                        'uuid',
                        isArabic ? 'معرف رقمي' : 'Digital ID',
                        Icons.fingerprint,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _buildMethodOption(
                        'handwriting',
                        isArabic ? 'توقيع يدوي' : 'Handwriting',
                        Icons.draw,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Signature input
                if (_method == 'handwriting') ...[
                  Container(
                    height: 150,
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey[300]!),
                      borderRadius: BorderRadius.circular(12),
                      color: Colors.white,
                    ),
                    child: GestureDetector(
                      onPanUpdate: (details) {
                        setState(() {
                          final box =
                              context.findRenderObject() as RenderBox;
                          final localPos =
                              box.globalToLocal(details.globalPosition);
                          _points.add(localPos);
                        });
                      },
                      onPanEnd: (_) {
                        _points.add(null);
                      },
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: CustomPaint(
                          painter: _SignaturePainter(points: _points),
                          size: Size.infinite,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Align(
                    alignment: isArabic
                        ? Alignment.centerLeft
                        : Alignment.centerRight,
                    child: TextButton.icon(
                      onPressed: () => setState(() => _points.clear()),
                      icon: const Icon(Icons.refresh, size: 16),
                      label: Text(isArabic ? 'مسح' : 'Clear'),
                    ),
                  ),
                ] else ...[
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.grey[100],
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.security, color: Colors.green[600], size: 24),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            isArabic
                                ? 'سيتم إنشاء معرف رقمي فريد آمن تلقائياً'
                                : 'A secure unique digital ID will be generated automatically',
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              color: Colors.grey[700],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],

                // Error message
                if (_errorMessage != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.red.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.error_outline,
                            color: Colors.red, size: 20),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _errorMessage!,
                            style:
                                GoogleFonts.poppins(color: Colors.red, fontSize: 12),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 20),

                // Acknowledgement notice
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.amber.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                    border:
                        Border.all(color: Colors.amber.withOpacity(0.3)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.info_outline,
                          color: Colors.amber, size: 20),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          isArabic
                              ? 'بتأكيد الاستلام، أنت تقر بأنك استلمت كامل مبلغ السحب.'
                              : 'By confirming receipt, you acknowledge that you have received the full withdrawal amount.',
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: Colors.amber[800],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // Action buttons
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _isSubmitting
                            ? null
                            : () => Navigator.of(context).pop(),
                        child: Text(isArabic ? 'إلغاء' : 'Cancel'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: _isSubmitting ? null : _confirmReceipt,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green,
                          foregroundColor: Colors.white,
                          padding:
                              const EdgeInsets.symmetric(vertical: 12),
                        ),
                        icon: _isSubmitting
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.check_circle, size: 18),
                        label: Text(
                          isArabic ? 'تأكيد' : 'Confirm',
                          style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w600),
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
    );
  }

  Widget _buildDetailRow(String label, String value, IconData icon) {
    return Row(
      children: [
        Icon(icon, size: 16, color: Colors.blue[600]),
        const SizedBox(width: 8),
        Text(
          '$label: ',
          style: GoogleFonts.poppins(
            fontSize: 13,
            color: Colors.grey[600],
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: GoogleFonts.poppins(
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }

  Widget _buildMethodOption(String method, String label, IconData icon) {
    final isSelected = _method == method;
    return GestureDetector(
      onTap: () => setState(() => _method = method),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        decoration: BoxDecoration(
          border: Border.all(
            color: isSelected ? AppColors.primaryBlue : Colors.grey[300]!,
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(12),
          color:
              isSelected ? AppColors.primaryBlue.withOpacity(0.05) : null,
        ),
        child: Column(
          children: [
            Icon(icon,
                color:
                    isSelected ? AppColors.primaryBlue : Colors.grey[500],
                size: 28),
            const SizedBox(height: 4),
            Text(
              label,
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight:
                    isSelected ? FontWeight.w600 : FontWeight.normal,
                color: isSelected
                    ? AppColors.primaryBlue
                    : Colors.grey[600],
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _SignaturePainter extends CustomPainter {
  final List<Offset?> points;

  _SignaturePainter({required this.points});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.black
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 3.0;

    for (int i = 0; i < points.length - 1; i++) {
      if (points[i] != null && points[i + 1] != null) {
        canvas.drawLine(points[i]!, points[i + 1]!, paint);
      }
    }
  }

  @override
  bool shouldRepaint(_SignaturePainter oldDelegate) => true;
}
