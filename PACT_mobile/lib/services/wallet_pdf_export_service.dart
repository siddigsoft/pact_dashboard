import 'package:intl/intl.dart';

/// Service for exporting wallet statements as PDF
class WalletPdfExportService {
  static const String _dateFormat = 'yyyy-MM-dd HH:mm:ss';

  /// Generate CSV statement with audit trail
  static String generateStatementCSV({
    required String userId,
    required String userName,
    required List<Map<String, dynamic>> transactions,
    required List<Map<String, dynamic>> withdrawals,
    required List<Map<String, dynamic>> auditLogs,
    required double totalEarnings,
    required double totalWithdrawn,
    required double netBalance,
    String? period,
  }) {
    final buffer = StringBuffer();
    final formatter = DateFormat(_dateFormat);
    final now = DateTime.now();

    // Header
    buffer.writeln('WALLET STATEMENT');
    buffer.writeln('Generated: ${formatter.format(now)}');
    buffer.writeln('User: $userName (ID: $userId)');
    if (period != null) buffer.writeln('Period: $period');
    buffer.writeln('');

    // Summary
    buffer.writeln('=== SUMMARY ===');
    buffer.writeln('Total Earnings,${totalEarnings.toStringAsFixed(2)} SDG');
    buffer.writeln('Total Withdrawn,${totalWithdrawn.toStringAsFixed(2)} SDG');
    buffer.writeln('Net Balance,${netBalance.toStringAsFixed(2)} SDG');
    buffer.writeln('');

    // Transactions
    if (transactions.isNotEmpty) {
      buffer.writeln('=== TRANSACTIONS ===');
      buffer.writeln('Date,Type,Amount,Description,Status');
      for (final tx in transactions) {
        final date = _formatDate(tx['created_at']);
        final type = tx['type'] ?? 'Unknown';
        final amount = _formatAmount(tx['amount'] ?? 0);
        final desc = (tx['description'] ?? '').replaceAll(',', ';');
        final status = tx['status'] ?? 'completed';
        buffer.writeln('$date,$type,$amount,$desc,$status');
      }
      buffer.writeln('');
    }

    // Withdrawals
    if (withdrawals.isNotEmpty) {
      buffer.writeln('=== WITHDRAWAL REQUESTS ===');
      buffer.writeln('Date,Amount,Payment Method,Reason,Status');
      for (final wd in withdrawals) {
        final date = _formatDate(wd['created_at']);
        final amount = _formatAmount(wd['amount'] ?? 0);
        final method = wd['payment_method'] ?? 'N/A';
        final reason = (wd['request_reason'] ?? '').replaceAll(',', ';');
        final status = wd['status'] ?? 'pending';
        buffer.writeln('$date,$amount,$method,$reason,$status');
      }
      buffer.writeln('');
    }

    // Audit Trail
    if (auditLogs.isNotEmpty) {
      buffer.writeln('=== AUDIT TRAIL ===');
      buffer.writeln('Timestamp,Action,Description,Status');
      for (final log in auditLogs) {
        final timestamp = _formatDate(log['timestamp']);
        final action = log['action_type'] ?? 'Unknown';
        final desc = (log['description'] ?? '').replaceAll(',', ';');
        final status = log['status'] ?? 'success';
        buffer.writeln('$timestamp,$action,$desc,$status');
      }
    }

    buffer.writeln('');
    buffer.writeln('=== END OF STATEMENT ===');
    buffer.writeln(
      'This statement was generated on ${formatter.format(now)} and is valid for compliance purposes.',
    );

    return buffer.toString();
  }

  /// Generate HTML statement (for web viewing)
  static String generateStatementHTML({
    required String userId,
    required String userName,
    required List<Map<String, dynamic>> transactions,
    required List<Map<String, dynamic>> withdrawals,
    required List<Map<String, dynamic>> auditLogs,
    required double totalEarnings,
    required double totalWithdrawn,
    required double netBalance,
    String? period,
  }) {
    final formatter = DateFormat(_dateFormat);
    final now = DateTime.now();

    return '''
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Wallet Statement - $userName</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: Arial, sans-serif; 
      color: #333;
      line-height: 1.6;
      padding: 20px;
      background: #f5f5f5;
    }
    .container { 
      max-width: 900px; 
      margin: 0 auto; 
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      border-bottom: 3px solid #1e3a8a;
      padding-bottom: 20px;
      margin-bottom: 20px;
    }
    .header h1 { color: #1e3a8a; margin-bottom: 10px; }
    .header p { color: #666; font-size: 14px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-bottom: 30px;
    }
    .summary-card {
      background: #f9fafb;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #1e3a8a;
    }
    .summary-card h3 { color: #666; font-size: 13px; margin-bottom: 10px; }
    .summary-card .amount { font-size: 24px; font-weight: bold; color: #1e3a8a; }
    .section {
      margin-bottom: 30px;
    }
    .section h2 {
      color: #1e3a8a;
      font-size: 18px;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e5e7eb;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th {
      background: #f3f4f6;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      border-bottom: 2px solid #d1d5db;
      color: #1f2937;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    tr:hover { background: #f9fafb; }
    .success { color: #16a34a; font-weight: 600; }
    .pending { color: #ea580c; font-weight: 600; }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
      font-size: 12px;
      color: #666;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Wallet Statement</h1>
      <p><strong>User:</strong> $userName (ID: $userId)</p>
      <p><strong>Generated:</strong> ${formatter.format(now)}</p>
      ${period != null ? '<p><strong>Period:</strong> $period</p>' : ''}
    </div>

    <div class="summary">
      <div class="summary-card">
        <h3>Total Earnings</h3>
        <div class="amount">${_formatAmount(totalEarnings)} SDG</div>
      </div>
      <div class="summary-card">
        <h3>Total Withdrawn</h3>
        <div class="amount">${_formatAmount(totalWithdrawn)} SDG</div>
      </div>
      <div class="summary-card">
        <h3>Net Balance</h3>
        <div class="amount">${_formatAmount(netBalance)} SDG</div>
      </div>
    </div>

    ${_buildTransactionsTable(transactions)}

    ${_buildWithdrawalsTable(withdrawals)}

    ${_buildAuditTrailTable(auditLogs)}

    <div class="footer">
      <p>This statement was generated on ${formatter.format(now)} and is valid for compliance and audit purposes.</p>
      <p>For security, this document contains your complete transaction history and audit trail.</p>
    </div>
  </div>
</body>
</html>
''';
  }

  static String _buildTransactionsTable(
    List<Map<String, dynamic>> transactions,
  ) {
    if (transactions.isEmpty) return '';

    final rows = transactions
        .map((tx) {
          final date = _formatDate(tx['created_at']);
          final type = tx['type'] ?? 'Unknown';
          final amount = _formatAmount(tx['amount'] ?? 0);
          final desc = tx['description'] ?? '';
          final status = tx['status'] ?? 'completed';
          final statusClass = status == 'completed' ? 'success' : 'pending';

          return '''
      <tr>
        <td>$date</td>
        <td>$type</td>
        <td>$amount SDG</td>
        <td>$desc</td>
        <td><span class="$statusClass">$status</span></td>
      </tr>
      ''';
        })
        .join('');

    return '''
    <div class="section">
      <h2>Transactions</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Amount</th>
            <th>Description</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          $rows
        </tbody>
      </table>
    </div>
    ''';
  }

  static String _buildWithdrawalsTable(List<Map<String, dynamic>> withdrawals) {
    if (withdrawals.isEmpty) return '';

    final rows = withdrawals
        .map((wd) {
          final date = _formatDate(wd['created_at']);
          final amount = _formatAmount(wd['amount'] ?? 0);
          final method = wd['payment_method'] ?? 'N/A';
          final reason = wd['request_reason'] ?? '';
          final status = wd['status'] ?? 'pending';
          final statusClass = status == 'approved' ? 'success' : 'pending';

          return '''
      <tr>
        <td>$date</td>
        <td>$amount SDG</td>
        <td>$method</td>
        <td>$reason</td>
        <td><span class="$statusClass">$status</span></td>
      </tr>
      ''';
        })
        .join('');

    return '''
    <div class="section">
      <h2>Withdrawal Requests</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Amount</th>
            <th>Payment Method</th>
            <th>Reason</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          $rows
        </tbody>
      </table>
    </div>
    ''';
  }

  static String _buildAuditTrailTable(List<Map<String, dynamic>> auditLogs) {
    if (auditLogs.isEmpty) return '';

    final rows = auditLogs
        .take(20)
        .map((log) {
          final timestamp = _formatDate(log['timestamp']);
          final action = log['action_type'] ?? 'Unknown';
          final desc = log['description'] ?? '';
          final status = log['status'] ?? 'success';
          final statusClass = status == 'success' ? 'success' : 'pending';

          return '''
      <tr>
        <td>$timestamp</td>
        <td>$action</td>
        <td>$desc</td>
        <td><span class="$statusClass">$status</span></td>
      </tr>
      ''';
        })
        .join('');

    return '''
    <div class="section">
      <h2>Audit Trail (Recent 20 Actions)</h2>
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Action</th>
            <th>Description</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          $rows
        </tbody>
      </table>
    </div>
    ''';
  }

  static String _formatDate(dynamic date) {
    try {
      final parsed = DateTime.parse(date.toString());
      return DateFormat(_dateFormat).format(parsed);
    } catch (_) {
      return date.toString();
    }
  }

  static String _formatAmount(dynamic amount) {
    try {
      final value = double.parse(amount.toString());
      return NumberFormat.currency(symbol: '', decimalDigits: 2).format(value);
    } catch (_) {
      return amount.toString();
    }
  }
}
