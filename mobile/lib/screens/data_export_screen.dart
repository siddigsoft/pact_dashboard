import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/reusable_app_bar.dart';

class DataExportScreen extends StatefulWidget {
  const DataExportScreen({super.key});
  @override
  State<DataExportScreen> createState() => _DataExportScreenState();
}

class _DataExportScreenState extends State<DataExportScreen> {
  final _supabase = Supabase.instance.client;
  bool _isExporting = false;
  String? _exportMessage;
  String _selectedFormat = 'csv';
  final Map<String, bool> _selectedDatasets = {
    'site_visits': false,
    'mmps': false,
    'cost_submissions': false,
    'wallet_transactions': false,
    'incident_reports': false,
    'equipment': false,
    'users': false,
  };
  String _dateFrom = '';
  String _dateTo = '';

  final Map<String, String> _datasetLabels = {
    'site_visits': 'Site Visits',
    'mmps': 'Monthly Monitoring Plans',
    'cost_submissions': 'Cost Submissions',
    'wallet_transactions': 'Wallet Transactions',
    'incident_reports': 'Incident Reports',
    'equipment': 'Equipment Records',
    'users': 'Staff Directory',
  };

  final Map<String, IconData> _datasetIcons = {
    'site_visits': Icons.map,
    'mmps': Icons.assignment,
    'cost_submissions': Icons.receipt,
    'wallet_transactions': Icons.account_balance_wallet,
    'incident_reports': Icons.warning,
    'equipment': Icons.construction,
    'users': Icons.people,
  };

  Future<void> _exportData() async {
    final selected = _selectedDatasets.entries
        .where((e) => e.value)
        .map((e) => e.key)
        .toList();
    if (selected.isEmpty) {
      setState(
        () => _exportMessage = 'Please select at least one dataset to export.',
      );
      return;
    }
    setState(() {
      _isExporting = true;
      _exportMessage = null;
    });
    try {
      int totalRecords = 0;
      for (final dataset in selected) {
        final table = _tableNameFor(dataset);
        final data = await _supabase.from(table).select('id').limit(1000);
        totalRecords += (data as List).length;
      }
      if (!mounted) return;
      setState(() {
        _isExporting = false;
        _exportMessage =
            '✅ Export prepared: $totalRecords records from ${selected.length} dataset(s).\n\nNote: Full export with file download is available on the web platform. This preview confirms data availability.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isExporting = false;
        _exportMessage = 'Export error: $e';
      });
    }
  }

  String _tableNameFor(String dataset) {
    switch (dataset) {
      case 'site_visits':
        return 'site_visits';
      case 'mmps':
        return 'monthly_monitoring_plans';
      case 'cost_submissions':
        return 'operational_cost_submissions';
      case 'wallet_transactions':
        return 'wallet_transactions';
      case 'incident_reports':
        return 'incident_reports';
      case 'equipment':
        return 'equipment';
      case 'users':
        return 'user_profiles';
      default:
        return dataset;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: 'Data Export',
              showBackButton: true,
            ),
            Expanded(
              child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Select Datasets',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 12),
                    ..._selectedDatasets.keys.map(
                      (key) => CheckboxListTile(
                        value: _selectedDatasets[key],
                        onChanged: (v) =>
                            setState(() => _selectedDatasets[key] = v!),
                        title: Text(_datasetLabels[key] ?? key),
                        secondary: Icon(
                          _datasetIcons[key] ?? Icons.table_chart,
                          color: AppColors.primaryDark,
                        ),
                        contentPadding: EdgeInsets.zero,
                        controlAffinity: ListTileControlAffinity.trailing,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
            Card(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Date Range (optional)',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            decoration: InputDecoration(
                              labelText: 'From',
                              hintText: 'YYYY-MM-DD',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                            onChanged: (v) => _dateFrom = v,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: TextField(
                            decoration: InputDecoration(
                              labelText: 'To',
                              hintText: 'YYYY-MM-DD',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                            onChanged: (v) => _dateTo = v,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
            Card(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Format',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        for (final fmt in [
                          ('csv', 'CSV'),
                          ('xlsx', 'Excel'),
                          ('pdf', 'PDF'),
                        ])
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.only(right: 6),
                              child: ChoiceChip(
                                label: Text(fmt.$2),
                                selected: _selectedFormat == fmt.$1,
                                onSelected: (_) =>
                                    setState(() => _selectedFormat = fmt.$1),
                                selectedColor: AppColors.primaryDark
                                    .withOpacity(0.2),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 18),
            ElevatedButton.icon(
              onPressed: _isExporting ? null : _exportData,
              icon: _isExporting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.download),
              label: Text(_isExporting ? 'Preparing Export...' : 'Export Data'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryDark,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
            ),
            if (_exportMessage != null) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: _exportMessage!.startsWith('✅')
                      ? Colors.green.shade50
                      : Colors.red.shade50,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: _exportMessage!.startsWith('✅')
                        ? Colors.green.shade200
                        : Colors.red.shade200,
                  ),
                ),
                child: Text(
                  _exportMessage!,
                  style: TextStyle(
                    color: _exportMessage!.startsWith('✅')
                        ? Colors.green.shade800
                        : Colors.red.shade800,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
            ),
          ],
        ),
      ),
    );
  }
}
