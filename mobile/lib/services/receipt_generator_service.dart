import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:intl/intl.dart';

/// Receipt and invoice generation service
class ReceiptGeneratorService {
  /// Generate transaction receipt as PDF
  static pw.Document generateTransactionReceipt({
    required String transactionId,
    required String transactionType,
    required double amount,
    required String siteName,
    required DateTime transactionDate,
    required String userName,
    required String userId,
    String? description,
    Map<String, dynamic>? metadata,
    bool isArabic = false,
  }) {
    final doc = pw.Document();
    final dateFormat = DateFormat('yyyy-MM-dd HH:mm');
    final currencyFormat = NumberFormat.currency(name: 'SDG', decimalDigits: 2);

    doc.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        build: (pw.Context context) {
          return pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              // Header
              pw.Container(
                alignment: pw.Alignment.center,
                padding: const pw.EdgeInsets.all(16),
                child: pw.Column(
                  children: [
                    pw.Text(
                      isArabic ? 'إيصال معاملة' : 'Transaction Receipt',
                      style: pw.TextStyle(
                        fontSize: 24,
                        fontWeight: pw.FontWeight.bold,
                      ),
                    ),
                    pw.SizedBox(height: 4),
                    pw.Text(
                      isArabic ? 'PACT المحمول' : 'PACT Mobile',
                      style: const pw.TextStyle(fontSize: 12),
                    ),
                  ],
                ),
              ),

              // Divider
              pw.Divider(thickness: 1),

              pw.SizedBox(height: 12),

              // Transaction details
              pw.Column(
                children: [
                  _buildReceiptField(
                    label: isArabic ? 'نوع المعاملة' : 'Transaction Type',
                    value: _getTransactionTypeLabel(transactionType, isArabic),
                    isArabic: isArabic,
                  ),
                  pw.SizedBox(height: 8),
                  _buildReceiptField(
                    label: isArabic ? 'رقم المعاملة' : 'Transaction ID',
                    value: transactionId,
                    isArabic: isArabic,
                  ),
                  pw.SizedBox(height: 8),
                  _buildReceiptField(
                    label: isArabic ? 'المبلغ' : 'Amount',
                    value: '${currencyFormat.format(amount)} SDG',
                    isArabic: isArabic,
                    isHighlight: true,
                  ),
                  pw.SizedBox(height: 8),
                  _buildReceiptField(
                    label: isArabic ? 'الموقع' : 'Site',
                    value: siteName,
                    isArabic: isArabic,
                  ),
                  pw.SizedBox(height: 8),
                  _buildReceiptField(
                    label: isArabic ? 'التاريخ والوقت' : 'Date & Time',
                    value: dateFormat.format(transactionDate),
                    isArabic: isArabic,
                  ),
                ],
              ),

              pw.SizedBox(height: 16),

              // User details
              pw.Column(
                children: [
                  pw.Text(
                    isArabic ? 'تفاصيل المستخدم' : 'User Details',
                    style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
                  ),
                  pw.SizedBox(height: 8),
                  _buildReceiptField(
                    label: isArabic ? 'الاسم' : 'Name',
                    value: userName,
                    isArabic: isArabic,
                  ),
                  pw.SizedBox(height: 8),
                  _buildReceiptField(
                    label: isArabic ? 'معرف المستخدم' : 'User ID',
                    value: userId,
                    isArabic: isArabic,
                  ),
                ],
              ),

              pw.SizedBox(height: 16),

              // Description if available
              if (description != null && description.isNotEmpty) ...[
                pw.Text(
                  isArabic ? 'الوصف' : 'Description',
                  style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
                ),
                pw.SizedBox(height: 4),
                pw.Text(description),
                pw.SizedBox(height: 16),
              ],

              // Footer
              pw.Spacer(),
              pw.Divider(thickness: 1),
              pw.SizedBox(height: 8),
              pw.Center(
                child: pw.Column(
                  children: [
                    pw.Text(
                      isArabic
                          ? 'شكراً لاستخدام PACT'
                          : 'Thank you for using PACT',
                      style: const pw.TextStyle(fontSize: 10),
                    ),
                    pw.SizedBox(height: 4),
                    pw.Text(
                      DateTime.now().toString().split('.')[0],
                      style: const pw.TextStyle(fontSize: 8),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );

    return doc;
  }

  /// Generate withdrawal receipt
  static pw.Document generateWithdrawalReceipt({
    required String withdrawalId,
    required double amount,
    required String paymentMethod,
    required DateTime withdrawalDate,
    required String userName,
    required String userId,
    String? reason,
    bool isArabic = false,
  }) {
    return generateTransactionReceipt(
      transactionId: withdrawalId,
      transactionType: 'withdrawal',
      amount: amount,
      siteName: paymentMethod,
      transactionDate: withdrawalDate,
      userName: userName,
      userId: userId,
      description: reason,
      isArabic: isArabic,
    );
  }

  /// Generate advance receipt
  static pw.Document generateAdvanceReceipt({
    required String advanceId,
    required double amount,
    required DateTime advanceDate,
    required String userName,
    required String userId,
    String? purpose,
    bool isArabic = false,
  }) {
    return generateTransactionReceipt(
      transactionId: advanceId,
      transactionType: 'advance',
      amount: amount,
      siteName: 'Transport Advance',
      transactionDate: advanceDate,
      userName: userName,
      userId: userId,
      description: purpose,
      isArabic: isArabic,
    );
  }

  /// Generate cost reimbursement receipt
  static pw.Document generateCostReceiptReceipt({
    required String costId,
    required double amount,
    required String category,
    required DateTime costDate,
    required String userName,
    required String userId,
    String? description,
    bool isArabic = false,
  }) {
    return generateTransactionReceipt(
      transactionId: costId,
      transactionType: 'cost_reimbursement',
      amount: amount,
      siteName: category,
      transactionDate: costDate,
      userName: userName,
      userId: userId,
      description: description,
      isArabic: isArabic,
    );
  }

  /// Get transaction type label
  static String _getTransactionTypeLabel(String type, bool isArabic) {
    final labels = {
      'earning': isArabic ? 'أرباح' : 'Earnings',
      'withdrawal': isArabic ? 'سحب' : 'Withdrawal',
      'advance': isArabic ? 'سلفة مواصلات' : 'Transport Advance',
      'cost_reimbursement': isArabic ? 'تعويض التكاليف' : 'Cost Reimbursement',
      'bonus': isArabic ? 'مكافأة' : 'Bonus',
      'penalty': isArabic ? 'غرامة' : 'Penalty',
      'site_visit_fee': isArabic ? 'رسوم الزيارة' : 'Site Visit Fee',
    };

    return labels[type] ?? (isArabic ? 'معاملة أخرى' : 'Other');
  }

  /// Build receipt field row
  static pw.Widget _buildReceiptField({
    required String label,
    required String value,
    bool isArabic = false,
    bool isHighlight = false,
  }) {
    return pw.Row(
      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
      children: [
        pw.Text(
          label,
          style: isHighlight
              ? pw.TextStyle(
                  fontWeight: pw.FontWeight.bold,
                  fontSize: isHighlight ? 12 : 10,
                )
              : const pw.TextStyle(fontSize: 10),
        ),
        pw.Text(
          value,
          style: isHighlight
              ? pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 12)
              : const pw.TextStyle(fontSize: 10),
        ),
      ],
    );
  }
}
