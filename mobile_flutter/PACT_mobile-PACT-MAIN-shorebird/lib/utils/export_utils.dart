/// Export utilities for CSV and PDF generation matching the React TSX implementation
library;

import 'dart:io';
import 'package:csv/csv.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';
import 'package:path_provider/path_provider.dart';
import '../models/wallet_models.dart';
import '../config/wallet_constants.dart';
import 'currency_utils.dart';
import 'package:intl/intl.dart';

/// Export transactions to CSV file
Future<void> exportTransactionsToCSV(
  List<WalletTransaction> transactions,
  Wallet wallet,
) async {
  try {
    // Prepare headers
    final headers = [
      'ID',
      'Type',
      'Description',
      'Amount',
      'Currency',
      'Balance After',
      'Date',
      'Site Visit ID',
    ];

    // Prepare rows
    final rows = transactions
        .map(
          (t) => [
            t.id,
            t.typeLabel,
            t.description ?? '-',
            t.amount.toStringAsFixed(2),
            t.currency,
            t.balanceAfter?.toStringAsFixed(2) ?? '-',
            DateFormat('MMM dd, yyyy HH:mm').format(t.createdAt),
            t.siteVisitId ?? '-',
          ],
        )
        .toList();

    // Create CSV
    String csv = const ListToCsvConverter().convert([headers, ...rows]);

    // Save and share
    await _saveAndShareFile(
      'wallet_transactions_${DateTime.now().millisecondsSinceEpoch}.csv',
      csv,
    );
  } catch (e) {
    print('Error exporting transactions to CSV: $e');
    rethrow;
  }
}

/// Export transactions to PDF file
Future<void> exportTransactionsToPDF(
  List<WalletTransaction> transactions,
  Wallet wallet,
  String currency,
) async {
  try {
    final pdf = pw.Document();

    // Calculate totals
    double totalIncome = 0;
    double totalExpense = 0;

    for (var t in transactions) {
      if (t.isCredit) {
        totalIncome += t.amount;
      } else {
        totalExpense += t.amount.abs();
      }
    }

    pdf.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(32),
        build: (pw.Context context) => [
          // Header
          pw.Header(
            level: 0,
            child: pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Text(
                  'Transaction Report',
                  style: pw.TextStyle(
                    fontSize: 24,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
                pw.Text(
                  DateFormat('MMM dd, yyyy').format(DateTime.now()),
                  style: const pw.TextStyle(fontSize: 12),
                ),
              ],
            ),
          ),
          pw.SizedBox(height: 20),

          // Summary
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceEvenly,
            children: [
              _buildSummaryBox(
                'Total Income',
                formatCurrency(totalIncome, currency),
              ),
              _buildSummaryBox(
                'Total Expenses',
                formatCurrency(totalExpense, currency),
              ),
              _buildSummaryBox(
                'Current Balance',
                formatCurrency(wallet.currentBalance, currency),
              ),
            ],
          ),
          pw.SizedBox(height: 20),

          // Table
          pw.TableHelper.fromTextArray(
            headers: ['Date', 'Type', 'Description', 'Amount', 'Balance'],
            data: transactions
                .map(
                  (t) => [
                    DateFormat('MMM dd, yyyy').format(t.createdAt),
                    t.typeLabel,
                    t.description ?? '-',
                    formatCurrency(t.amount, t.currency),
                    t.balanceAfter != null
                        ? formatCurrency(t.balanceAfter!, t.currency)
                        : '-',
                  ],
                )
                .toList(),
            cellStyle: const pw.TextStyle(fontSize: 10),
            headerStyle: pw.TextStyle(
              fontSize: 10,
              fontWeight: pw.FontWeight.bold,
            ),
            rowDecoration: pw.BoxDecoration(
              border: pw.Border(
                bottom: pw.BorderSide(color: PdfColors.grey300),
              ),
            ),
          ),
        ],
      ),
    );

    // Save and share
    await _savePdfAndShare(
      'wallet_transactions_${DateTime.now().millisecondsSinceEpoch}.pdf',
      pdf,
    );
  } catch (e) {
    print('Error exporting transactions to PDF: $e');
    rethrow;
  }
}

/// Export withdrawals to CSV file
Future<void> exportWithdrawalsToCSV(
  List<WithdrawalRequest> withdrawals,
  String? statusFilter,
) async {
  try {
    // Prepare headers
    final headers = [
      'ID',
      'Status',
      'Amount',
      'Currency',
      'Payment Method',
      'Reason',
      'Requested Date',
      'Processed Date',
    ];

    // Prepare rows
    final rows = withdrawals
        .map(
          (w) => [
            w.id,
            w.statusLabel,
            w.amount.toStringAsFixed(2),
            w.currency,
            w.paymentMethod ?? '-',
            w.requestReason ?? '-',
            DateFormat('MMM dd, yyyy HH:mm').format(w.createdAt),
            w.processedAt != null
                ? DateFormat('MMM dd, yyyy HH:mm').format(w.processedAt!)
                : '-',
          ],
        )
        .toList();

    // Create CSV
    String csv = const ListToCsvConverter().convert([headers, ...rows]);

    // Save and share
    await _saveAndShareFile(
      'wallet_withdrawals_${DateTime.now().millisecondsSinceEpoch}.csv',
      csv,
    );
  } catch (e) {
    print('Error exporting withdrawals to CSV: $e');
    rethrow;
  }
}

/// Export withdrawals to PDF file
Future<void> exportWithdrawalsToPDF(
  List<WithdrawalRequest> withdrawals,
  String? statusFilter,
) async {
  try {
    final pdf = pw.Document();

    // Calculate totals by status
    double approvedTotal = 0;
    double pendingTotal = 0;
    double rejectedTotal = 0;

    for (var w in withdrawals) {
      if (w.status == WITHDRAWAL_STATUS_APPROVED) {
        approvedTotal += w.amount;
      } else if (w.status == WITHDRAWAL_STATUS_PENDING) {
        pendingTotal += w.amount;
      } else if (w.status == WITHDRAWAL_STATUS_REJECTED) {
        rejectedTotal += w.amount;
      }
    }

    pdf.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(32),
        build: (pw.Context context) => [
          // Header
          pw.Header(
            level: 0,
            child: pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Text(
                  'Withdrawal Request Report',
                  style: pw.TextStyle(
                    fontSize: 24,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
                pw.Text(
                  DateFormat('MMM dd, yyyy').format(DateTime.now()),
                  style: const pw.TextStyle(fontSize: 12),
                ),
              ],
            ),
          ),
          pw.SizedBox(height: 20),

          // Summary
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceEvenly,
            children: [
              _buildSummaryBox(
                'Approved',
                formatCurrency(approvedTotal, DEFAULT_CURRENCY),
              ),
              _buildSummaryBox(
                'Pending',
                formatCurrency(pendingTotal, DEFAULT_CURRENCY),
              ),
              _buildSummaryBox(
                'Rejected',
                formatCurrency(rejectedTotal, DEFAULT_CURRENCY),
              ),
            ],
          ),
          pw.SizedBox(height: 20),

          // Table
          pw.TableHelper.fromTextArray(
            headers: ['Date', 'Status', 'Amount', 'Method', 'Reason'],
            data: withdrawals
                .map(
                  (w) => [
                    DateFormat('MMM dd, yyyy').format(w.createdAt),
                    w.statusLabel,
                    formatCurrency(w.amount, w.currency),
                    w.paymentMethod ?? '-',
                    w.requestReason ?? '-',
                  ],
                )
                .toList(),
            cellStyle: const pw.TextStyle(fontSize: 10),
            headerStyle: pw.TextStyle(
              fontSize: 10,
              fontWeight: pw.FontWeight.bold,
            ),
            rowDecoration: pw.BoxDecoration(
              border: pw.Border(
                bottom: pw.BorderSide(color: PdfColors.grey300),
              ),
            ),
          ),
        ],
      ),
    );

    // Save and share
    await _savePdfAndShare(
      'wallet_withdrawals_${DateTime.now().millisecondsSinceEpoch}.pdf',
      pdf,
    );
  } catch (e) {
    print('Error exporting withdrawals to PDF: $e');
    rethrow;
  }
}

/// Helper to build summary box in PDF
pw.Widget _buildSummaryBox(String label, String value) {
  return pw.Column(
    children: [
      pw.Text(label, style: const pw.TextStyle(fontSize: 10)),
      pw.SizedBox(height: 4),
      pw.Text(
        value,
        style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold),
      ),
    ],
  );
}

/// Save CSV file and share
Future<void> _saveAndShareFile(String filename, String content) async {
  try {
    final directory = await getApplicationDocumentsDirectory();
    final file = File('${directory.path}/$filename');
    await file.writeAsString(content);

    // Share file
    await Share.shareXFiles([XFile(file.path)], subject: filename);
  } catch (e) {
    print('Error saving and sharing file: $e');
    rethrow;
  }
}

/// Save PDF file and share
Future<void> _savePdfAndShare(String filename, pw.Document pdf) async {
  try {
    final directory = await getApplicationDocumentsDirectory();
    final file = File('${directory.path}/$filename');
    await file.writeAsBytes(await pdf.save());

    // Share file
    await Share.shareXFiles([XFile(file.path)], subject: filename);
  } catch (e) {
    print('Error saving and sharing PDF: $e');
    rethrow;
  }
}

/// Print PDF directly
Future<void> printPdf(pw.Document pdf) async {
  try {
    await Printing.layoutPdf(
      onLayout: (PdfPageFormat format) async => pdf.save(),
    );
  } catch (e) {
    print('Error printing PDF: $e');
    rethrow;
  }
}
