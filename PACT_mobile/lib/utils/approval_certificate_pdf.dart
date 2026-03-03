/// Approval certificate PDF for cost submission (aligned with web).
library;

import 'dart:io';
import 'dart:typed_data';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:share_plus/share_plus.dart';
import '../models/cost_submission.dart';

/// Generates a one-page approval certificate PDF for an operational cost submission
/// and returns the PDF bytes.
Future<Uint8List> generateApprovalCertificatePdf({
  required OperationalCostSubmission submission,
  required String approverName,
  required int approvedTier,
  String? approvedAt,
}) async {
  final pdf = pw.Document();
  final dateFormat = DateFormat('MMM dd, yyyy');
  final now = approvedAt != null
      ? DateTime.tryParse(approvedAt)
      : DateTime.now();
  final dateStr = dateFormat.format(now);

  pdf.addPage(
    pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(32),
      build: (pw.Context context) => pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Center(
            child: pw.Text(
              'Approval Certificate',
              style: pw.TextStyle(fontSize: 22, fontWeight: pw.FontWeight.bold),
            ),
          ),
          pw.SizedBox(height: 8),
          pw.Center(
            child: pw.Text(
              'Cost Submission Approval',
              style: pw.TextStyle(fontSize: 14, color: PdfColors.grey700),
            ),
          ),
          pw.SizedBox(height: 24),
          pw.Container(
            padding: const pw.EdgeInsets.all(16),
            decoration: pw.BoxDecoration(
              border: pw.Border.all(color: PdfColors.grey400),
              borderRadius: pw.BorderRadius.circular(8),
            ),
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(
                  'Submission ID',
                  style: pw.TextStyle(fontSize: 9, color: PdfColors.grey700),
                ),
                pw.Text(submission.id, style: const pw.TextStyle(fontSize: 11)),
                pw.SizedBox(height: 12),
                pw.Text(
                  'Category',
                  style: pw.TextStyle(fontSize: 9, color: PdfColors.grey700),
                ),
                pw.Text(
                  submission.expenseCategory.labelEn,
                  style: const pw.TextStyle(fontSize: 11),
                ),
                pw.SizedBox(height: 12),
                pw.Text(
                  'Amount',
                  style: pw.TextStyle(fontSize: 9, color: PdfColors.grey700),
                ),
                pw.Text(
                  '${submission.amountInCurrency.toStringAsFixed(2)} ${submission.currency}',
                  style: pw.TextStyle(
                    fontSize: 14,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
                pw.SizedBox(height: 12),
                pw.Text(
                  'Expense Date',
                  style: pw.TextStyle(fontSize: 9, color: PdfColors.grey700),
                ),
                pw.Text(
                  dateFormat.format(DateTime.parse(submission.expenseDate)),
                  style: const pw.TextStyle(fontSize: 11),
                ),
                if (submission.description.isNotEmpty) ...[
                  pw.SizedBox(height: 12),
                  pw.Text(
                    'Description',
                    style: pw.TextStyle(fontSize: 9, color: PdfColors.grey700),
                  ),
                  pw.Text(
                    submission.description.length > 200
                        ? '${submission.description.substring(0, 200)}...'
                        : submission.description,
                    style: const pw.TextStyle(fontSize: 10),
                    maxLines: 4,
                  ),
                ],
              ],
            ),
          ),
          pw.Spacer(),
          pw.Divider(),
          pw.SizedBox(height: 12),
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Text(
                    'Approved by',
                    style: pw.TextStyle(fontSize: 9, color: PdfColors.grey700),
                  ),
                  pw.Text(
                    approverName,
                    style: pw.TextStyle(
                      fontSize: 12,
                      fontWeight: pw.FontWeight.bold,
                    ),
                  ),
                  pw.SizedBox(height: 4),
                  pw.Text(
                    'Tier $approvedTier Approval',
                    style: pw.TextStyle(fontSize: 10, color: PdfColors.grey700),
                  ),
                ],
              ),
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.end,
                children: [
                  pw.Text(
                    'Date',
                    style: pw.TextStyle(fontSize: 9, color: PdfColors.grey700),
                  ),
                  pw.Text(dateStr, style: const pw.TextStyle(fontSize: 12)),
                ],
              ),
            ],
          ),
        ],
      ),
    ),
  );

  return pdf.save();
}

/// Generates the certificate PDF and shares it via the platform share sheet.
Future<void> shareApprovalCertificate({
  required OperationalCostSubmission submission,
  required String approverName,
  required int approvedTier,
  String? approvedAt,
}) async {
  final bytes = await generateApprovalCertificatePdf(
    submission: submission,
    approverName: approverName,
    approvedTier: approvedTier,
    approvedAt: approvedAt,
  );
  final dir = await getApplicationDocumentsDirectory();
  final filename =
      'approval_certificate_${submission.id}_${DateFormat('yyyy-MM-dd').format(DateTime.now())}.pdf';
  final file = File('${dir.path}/$filename');
  await file.writeAsBytes(bytes);
  await Share.shareXFiles([XFile(file.path)], subject: 'Approval Certificate');
}
