/// Filter and export utilities for Down-Payment Approval (aligned with web).
library;

import 'dart:io';
import 'package:csv/csv.dart';
import 'package:excel/excel.dart' as excel_lib;
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:share_plus/share_plus.dart';
import '../models/down_payment_request.dart';

// ============================================================================
// Filter
// ============================================================================

class DownPaymentFilter {
  final String? searchTerm;
  final String? hubId;
  final DateTime? dateFrom;
  final DateTime? dateTo;
  final double? amountMin;
  final double? amountMax;

  const DownPaymentFilter({
    this.searchTerm,
    this.hubId,
    this.dateFrom,
    this.dateTo,
    this.amountMin,
    this.amountMax,
  });

  DownPaymentFilter copyWith({
    String? searchTerm,
    String? hubId,
    DateTime? dateFrom,
    DateTime? dateTo,
    double? amountMin,
    double? amountMax,
  }) {
    return DownPaymentFilter(
      searchTerm: searchTerm ?? this.searchTerm,
      hubId: hubId ?? this.hubId,
      dateFrom: dateFrom ?? this.dateFrom,
      dateTo: dateTo ?? this.dateTo,
      amountMin: amountMin ?? this.amountMin,
      amountMax: amountMax ?? this.amountMax,
    );
  }

  bool get isEmpty =>
      (searchTerm == null || searchTerm!.trim().isEmpty) &&
      hubId == null &&
      dateFrom == null &&
      dateTo == null &&
      amountMin == null &&
      amountMax == null;
}

List<DownPaymentRequest> filterDownPayments(
  List<DownPaymentRequest> requests,
  DownPaymentFilter filter,
) {
  if (filter.isEmpty) return List<DownPaymentRequest>.from(requests);
  return requests.where((req) {
    if (filter.searchTerm != null && filter.searchTerm!.trim().isNotEmpty) {
      final term = filter.searchTerm!.trim().toLowerCase();
      final searchable = [
        req.siteName,
        req.hubName,
        req.justification,
      ].whereType<String>().join(' ').toLowerCase();
      if (!searchable.contains(term)) return false;
    }
    if (filter.hubId != null && filter.hubId!.isNotEmpty) {
      final match =
          req.hubId == filter.hubId ||
          (req.hubName?.toLowerCase() == filter.hubId!.toLowerCase());
      if (!match) return false;
    }
    if (filter.dateFrom != null) {
      if (req.requestedAt.isBefore(filter.dateFrom!)) return false;
    }
    if (filter.dateTo != null) {
      final end = DateTime(
        filter.dateTo!.year,
        filter.dateTo!.month,
        filter.dateTo!.day,
        23,
        59,
        59,
      );
      if (req.requestedAt.isAfter(end)) return false;
    }
    if (filter.amountMin != null && req.requestedAmount < filter.amountMin!) {
      return false;
    }
    if (filter.amountMax != null && req.requestedAmount > filter.amountMax!) {
      return false;
    }
    return true;
  }).toList();
}

// ============================================================================
// Tab lists (match web: pending / processing / completed by role)
// ============================================================================

/// Supervisor: pending = pending_supervisor. Admin: pending = pending_admin.
List<DownPaymentRequest> pendingRequestsForRole(
  List<DownPaymentRequest> filtered,
  bool isAdminTier,
) {
  if (isAdminTier) {
    return filtered.where((r) => r.status == 'pending_admin').toList();
  }
  return filtered.where((r) => r.status == 'pending_supervisor').toList();
}

/// Supervisor: processing = pending_admin. Admin: processing = approved | partially_paid.
List<DownPaymentRequest> processingRequestsForRole(
  List<DownPaymentRequest> filtered,
  bool isAdminTier,
) {
  if (isAdminTier) {
    return filtered
        .where((r) => r.status == 'approved' || r.status == 'partially_paid')
        .toList();
  }
  return filtered.where((r) => r.status == 'pending_admin').toList();
}

List<DownPaymentRequest> completedRequestsForRole(
  List<DownPaymentRequest> filtered,
) {
  return filtered
      .where(
        (r) =>
            r.status == 'fully_paid' ||
            r.status == 'rejected' ||
            r.status == 'cancelled',
      )
      .toList();
}

// ============================================================================
// Export
// ============================================================================

String _statusLabel(String status) {
  const labels = {
    'pending_supervisor': 'Pending Supervisor',
    'pending_admin': 'Pending Admin',
    'approved': 'Approved',
    'rejected': 'Rejected',
    'partially_paid': 'Partially Paid',
    'fully_paid': 'Fully Paid',
    'cancelled': 'Cancelled',
  };
  return labels[status] ?? status;
}

Future<void> exportDownPaymentsToCSV(List<DownPaymentRequest> requests) async {
  if (requests.isEmpty) throw Exception('No requests to export');
  final dateFormat = DateFormat('yyyy-MM-dd HH:mm');
  final headers = [
    'Request ID',
    'Site Name',
    'Hub',
    'Requested At',
    'Requested Amount (SDG)',
    'Paid (SDG)',
    'Remaining (SDG)',
    'Status',
    'Justification',
  ];
  final rows = requests
      .map(
        (r) => [
          r.id,
          r.siteName,
          r.hubName ?? 'N/A',
          dateFormat.format(r.requestedAt),
          r.requestedAmount.toStringAsFixed(0),
          r.totalPaidAmount.toStringAsFixed(0),
          (r.remainingAmount ?? 0).toStringAsFixed(0),
          _statusLabel(r.status),
          r.justification.replaceAll(',', ';'),
        ],
      )
      .toList();
  final csv = const ListToCsvConverter().convert([headers, ...rows]);
  final dir = await getApplicationDocumentsDirectory();
  final filename =
      'down_payments_${DateFormat('yyyy-MM-dd').format(DateTime.now())}.csv';
  final file = File('${dir.path}/$filename');
  await file.writeAsString(csv);
  await Share.shareXFiles([XFile(file.path)], subject: filename);
}

Future<void> exportDownPaymentsToExcel(
  List<DownPaymentRequest> requests,
) async {
  if (requests.isEmpty) throw Exception('No requests to export');
  final dateFormat = DateFormat('yyyy-MM-dd HH:mm');
  final excel = excel_lib.Excel.createExcel();
  final sheet = excel['Sheet1'];
  final headers = [
    'Request ID',
    'Site Name',
    'Hub',
    'Requested At',
    'Requested Amount (SDG)',
    'Paid (SDG)',
    'Remaining (SDG)',
    'Status',
    'Justification',
  ];
  for (var i = 0; i < headers.length; i++) {
    sheet.cell(excel_lib.CellIndex.indexByString('${_colLetter(i)}1')).value =
        excel_lib.TextCellValue(headers[i]);
  }
  for (var rowIdx = 0; rowIdx < requests.length; rowIdx++) {
    final r = requests[rowIdx];
    final row = rowIdx + 2;
    sheet.cell(excel_lib.CellIndex.indexByString('A$row')).value =
        excel_lib.TextCellValue(r.id);
    sheet.cell(excel_lib.CellIndex.indexByString('B$row')).value =
        excel_lib.TextCellValue(r.siteName);
    sheet.cell(excel_lib.CellIndex.indexByString('C$row')).value =
        excel_lib.TextCellValue(r.hubName ?? 'N/A');
    sheet.cell(excel_lib.CellIndex.indexByString('D$row')).value =
        excel_lib.TextCellValue(dateFormat.format(r.requestedAt));
    sheet.cell(excel_lib.CellIndex.indexByString('E$row')).value =
        excel_lib.DoubleCellValue(r.requestedAmount);
    sheet.cell(excel_lib.CellIndex.indexByString('F$row')).value =
        excel_lib.DoubleCellValue(r.totalPaidAmount);
    sheet.cell(excel_lib.CellIndex.indexByString('G$row')).value =
        excel_lib.DoubleCellValue(r.remainingAmount ?? 0);
    sheet.cell(excel_lib.CellIndex.indexByString('H$row')).value =
        excel_lib.TextCellValue(_statusLabel(r.status));
    sheet.cell(excel_lib.CellIndex.indexByString('I$row')).value =
        excel_lib.TextCellValue(r.justification);
  }
  final dir = await getApplicationDocumentsDirectory();
  final filename =
      'down_payments_${DateFormat('yyyy-MM-dd').format(DateTime.now())}.xlsx';
  final file = File('${dir.path}/$filename');
  await file.writeAsBytes(excel.encode()!);
  await Share.shareXFiles([XFile(file.path)], subject: filename);
}

String _colLetter(int i) {
  if (i < 26) return String.fromCharCode(65 + i);
  return 'A${String.fromCharCode(65 + i - 26)}'; // A..Z then AA, AB, ...
}

Future<void> exportDownPaymentsToPDF(List<DownPaymentRequest> requests) async {
  if (requests.isEmpty) throw Exception('No requests to export');
  final pdf = pw.Document();
  final dateFormat = DateFormat('MMM dd, yyyy');
  final totalRequested = requests.fold<double>(
    0,
    (s, r) => s + r.requestedAmount,
  );
  final totalPaid = requests.fold<double>(0, (s, r) => s + r.totalPaidAmount);
  final totalRemaining = requests.fold<double>(
    0,
    (s, r) => s + (r.remainingAmount ?? 0),
  );

  pdf.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4.landscape,
      margin: const pw.EdgeInsets.all(24),
      build: (pw.Context context) => [
        pw.Header(
          level: 0,
          child: pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              pw.Text(
                'Down-Payment Requests Report',
                style: pw.TextStyle(
                  fontSize: 18,
                  fontWeight: pw.FontWeight.bold,
                ),
              ),
              pw.Text(
                dateFormat.format(DateTime.now()),
                style: const pw.TextStyle(fontSize: 10),
              ),
            ],
          ),
        ),
        pw.SizedBox(height: 8),
        pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceEvenly,
          children: [
            pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(
                  'Total Requests',
                  style: const pw.TextStyle(fontSize: 9),
                ),
                pw.Text(
                  '${requests.length}',
                  style: pw.TextStyle(
                    fontSize: 12,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
              ],
            ),
            pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(
                  'Total Requested (SDG)',
                  style: const pw.TextStyle(fontSize: 9),
                ),
                pw.Text(
                  totalRequested.toStringAsFixed(0),
                  style: pw.TextStyle(
                    fontSize: 12,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
              ],
            ),
            pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(
                  'Total Paid (SDG)',
                  style: const pw.TextStyle(fontSize: 9),
                ),
                pw.Text(
                  totalPaid.toStringAsFixed(0),
                  style: pw.TextStyle(
                    fontSize: 12,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
              ],
            ),
            pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(
                  'Remaining (SDG)',
                  style: const pw.TextStyle(fontSize: 9),
                ),
                pw.Text(
                  totalRemaining.toStringAsFixed(0),
                  style: pw.TextStyle(
                    fontSize: 12,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
              ],
            ),
          ],
        ),
        pw.SizedBox(height: 12),
        pw.TableHelper.fromTextArray(
          headers: ['Site', 'Hub', 'Date', 'Requested', 'Paid', 'Status'],
          data: requests
              .map(
                (r) => [
                  r.siteName.length > 25
                      ? '${r.siteName.substring(0, 25)}...'
                      : r.siteName,
                  r.hubName ?? '-',
                  dateFormat.format(r.requestedAt),
                  r.requestedAmount.toStringAsFixed(0),
                  r.totalPaidAmount.toStringAsFixed(0),
                  _statusLabel(r.status),
                ],
              )
              .toList(),
          cellStyle: const pw.TextStyle(fontSize: 8),
          headerStyle: pw.TextStyle(
            fontSize: 8,
            fontWeight: pw.FontWeight.bold,
          ),
          rowDecoration: const pw.BoxDecoration(
            border: pw.Border(bottom: pw.BorderSide(color: PdfColors.grey300)),
          ),
        ),
      ],
    ),
  );

  final dir = await getApplicationDocumentsDirectory();
  final filename =
      'down_payments_${DateFormat('yyyy-MM-dd').format(DateTime.now())}.pdf';
  final file = File('${dir.path}/$filename');
  await file.writeAsBytes(await pdf.save());
  await Share.shareXFiles([XFile(file.path)], subject: filename);
}
