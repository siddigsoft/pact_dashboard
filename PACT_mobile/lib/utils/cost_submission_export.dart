/// Export cost submissions to Excel and PDF (aligned with web).
library;

import 'dart:io';
import 'package:excel/excel.dart' as excel_lib;
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:share_plus/share_plus.dart';
import '../models/cost_submission.dart';

String _colLetter(int i) {
  if (i < 26) return String.fromCharCode(65 + i);
  return 'A${String.fromCharCode(65 + i - 26)}';
}

/// Export operational cost submissions to Excel and share.
Future<void> exportCostSubmissionsToExcel(
  List<OperationalCostSubmission> submissions,
) async {
  if (submissions.isEmpty) throw Exception('No submissions to export');
  final dateFormat = DateFormat('yyyy-MM-dd');
  final excel = excel_lib.Excel.createExcel();
  final sheet = excel['Sheet1'];
  final headers = [
    'ID',
    'Category',
    'Amount',
    'Currency',
    'Description',
    'Expense Date',
    'Vendor',
    'Reference',
    'Status',
    'Derived Status',
    'Submitted At',
    'Tier1',
    'Tier2',
    'Tier3',
  ];
  for (var i = 0; i < headers.length; i++) {
    sheet.cell(excel_lib.CellIndex.indexByString('${_colLetter(i)}1')).value =
        excel_lib.TextCellValue(headers[i]);
  }
  for (var rowIdx = 0; rowIdx < submissions.length; rowIdx++) {
    final s = submissions[rowIdx];
    final row = rowIdx + 2;
    sheet.cell(excel_lib.CellIndex.indexByString('A$row')).value =
        excel_lib.TextCellValue(s.id);
    sheet.cell(excel_lib.CellIndex.indexByString('B$row')).value =
        excel_lib.TextCellValue(s.expenseCategory.labelEn);
    sheet.cell(excel_lib.CellIndex.indexByString('C$row')).value =
        excel_lib.DoubleCellValue(s.amountInCurrency);
    sheet.cell(excel_lib.CellIndex.indexByString('D$row')).value =
        excel_lib.TextCellValue(s.currency);
    sheet.cell(excel_lib.CellIndex.indexByString('E$row')).value =
        excel_lib.TextCellValue(s.description ?? '');
    sheet
        .cell(excel_lib.CellIndex.indexByString('F$row'))
        .value = excel_lib.TextCellValue(
      dateFormat.format(DateTime.parse(s.expenseDate)),
    );
    sheet.cell(excel_lib.CellIndex.indexByString('G$row')).value =
        excel_lib.TextCellValue(s.vendor ?? '');
    sheet.cell(excel_lib.CellIndex.indexByString('H$row')).value =
        excel_lib.TextCellValue(s.referenceNumber ?? '');
    sheet.cell(excel_lib.CellIndex.indexByString('I$row')).value =
        excel_lib.TextCellValue(s.status.value);
    sheet.cell(excel_lib.CellIndex.indexByString('J$row')).value =
        excel_lib.TextCellValue(s.derivedStatus);
    sheet.cell(excel_lib.CellIndex.indexByString('K$row')).value =
        excel_lib.TextCellValue(s.submittedAt ?? '');
    sheet.cell(excel_lib.CellIndex.indexByString('L$row')).value =
        excel_lib.TextCellValue(s.tier1StatusString);
    sheet.cell(excel_lib.CellIndex.indexByString('M$row')).value =
        excel_lib.TextCellValue(s.tier2StatusString);
    sheet.cell(excel_lib.CellIndex.indexByString('N$row')).value =
        excel_lib.TextCellValue(s.tier3Status ?? '');
  }
  final dir = await getApplicationDocumentsDirectory();
  final filename =
      'cost_submissions_${DateFormat('yyyy-MM-dd').format(DateTime.now())}.xlsx';
  final file = File('${dir.path}/$filename');
  await file.writeAsBytes(excel.encode()!);
  await Share.shareXFiles([XFile(file.path)], subject: filename);
}

/// Export operational cost submissions to PDF and share.
Future<void> exportCostSubmissionsToPDF(
  List<OperationalCostSubmission> submissions,
) async {
  if (submissions.isEmpty) throw Exception('No submissions to export');
  final pdf = pw.Document();
  final dateFormat = DateFormat('MMM dd, yyyy');
  final totalAmount = submissions.fold<double>(
    0,
    (s, o) => s + o.amountInCurrency,
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
                'Cost Submissions Report',
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
                  'Total Submissions',
                  style: const pw.TextStyle(fontSize: 9),
                ),
                pw.Text(
                  '${submissions.length}',
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
                pw.Text('Total Amount', style: const pw.TextStyle(fontSize: 9)),
                pw.Text(
                  totalAmount.toStringAsFixed(2),
                  style: pw.TextStyle(
                    fontSize: 12,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
              ],
            ),
          ],
        ),
        pw.SizedBox(height: 16),
        pw.Table(
          border: pw.TableBorder.all(width: 0.5),
          columnWidths: {
            0: const pw.FlexColumnWidth(1.5),
            1: const pw.FlexColumnWidth(2),
            2: const pw.FlexColumnWidth(1.2),
            3: const pw.FlexColumnWidth(1.2),
            4: const pw.FlexColumnWidth(1),
          },
          children: [
            pw.TableRow(
              decoration: const pw.BoxDecoration(color: PdfColors.grey300),
              children: [
                _cell('Category'),
                _cell('Description'),
                _cell('Amount'),
                _cell('Date'),
                _cell('Status'),
              ],
            ),
            ...submissions.map(
              (s) => pw.TableRow(
                children: [
                  _cell(s.expenseCategory.labelEn),
                  _cell(
                    (s.description ?? '').length > 40
                        ? '${(s.description ?? '').substring(0, 40)}...'
                        : (s.description ?? ''),
                  ),
                  _cell(
                    '${s.amountInCurrency.toStringAsFixed(2)} ${s.currency}',
                  ),
                  _cell(dateFormat.format(DateTime.parse(s.expenseDate))),
                  _cell(s.derivedStatus),
                ],
              ),
            ),
          ],
        ),
      ],
    ),
  );

  final dir = await getApplicationDocumentsDirectory();
  final filename =
      'cost_submissions_${DateFormat('yyyy-MM-dd').format(DateTime.now())}.pdf';
  final file = File('${dir.path}/$filename');
  await file.writeAsBytes(await pdf.save());
  await Share.shareXFiles([XFile(file.path)], subject: filename);
}

pw.Widget _cell(String text) {
  return pw.Padding(
    padding: const pw.EdgeInsets.all(4),
    child: pw.Text(text, style: const pw.TextStyle(fontSize: 8)),
  );
}
