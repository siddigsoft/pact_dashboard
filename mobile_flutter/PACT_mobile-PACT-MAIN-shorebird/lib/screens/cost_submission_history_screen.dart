import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import '../models/operational_cost_submission.dart';
import '../services/operational_cost_service.dart';
import 'cost_submission_details_screen.dart';

class CostSubmissionHistoryScreen extends StatefulWidget {
  final bool isArabic;
  final String? hubId;
  final String? userRole;

  const CostSubmissionHistoryScreen({
    super.key,
    this.isArabic = false,
    this.hubId,
    this.userRole,
  });

  @override
  State<CostSubmissionHistoryScreen> createState() => _CostSubmissionHistoryScreenState();
}

class _CostSubmissionHistoryScreenState extends State<CostSubmissionHistoryScreen> {
  final _costService = OperationalCostService();
  List<OperationalCostSubmission> _submissions = [];
  bool _isLoading = true;
  String _statusFilter = 'all';
  late CostSubmissionPermissions _permissions;

  @override
  void initState() {
    super.initState();
    _permissions = CostSubmissionPermissions.fromRole(widget.userRole);
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final permissions = await _costService.getUserPermissions();
      List<OperationalCostSubmission> submissions;
      if (permissions.canViewTeam) {
        submissions = await _costService.getAllSubmissions(hubId: widget.hubId);
      } else {
        submissions = await _costService.getUserSubmissions();
      }
      setState(() {
        _permissions = permissions;
        _submissions = submissions;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  List<OperationalCostSubmission> get _filteredSubmissions {
    if (_statusFilter == 'all') return _submissions;
    return _submissions.where((s) => s.derivedStatus == _statusFilter).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _buildFilterChips(),
        if (_permissions.canViewTeam)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '${_filteredSubmissions.length} ${widget.isArabic ? "طلب" : "submissions"}',
                  style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                ),
                TextButton.icon(
                  onPressed: _exportCsv,
                  icon: const Icon(Icons.file_download, size: 16),
                  label: Text(widget.isArabic ? 'تصدير' : 'Export', style: const TextStyle(fontSize: 12)),
                ),
              ],
            ),
          ),
        Expanded(
          child: _isLoading
              ? const Center(child: CircularProgressIndicator())
              : _filteredSubmissions.isEmpty
                  ? _buildEmptyState()
                  : RefreshIndicator(
                      onRefresh: _loadData,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _filteredSubmissions.length,
                        itemBuilder: (context, index) => _buildSubmissionCard(_filteredSubmissions[index]),
                      ),
                    ),
        ),
      ],
    );
  }

  Widget _buildFilterChips() {
    final isArabic = widget.isArabic;
    final filters = [
      {'key': 'all', 'en': 'All', 'ar': 'الكل'},
      {'key': 'pending', 'en': 'Pending', 'ar': 'قيد الانتظار'},
      {'key': 'under_review', 'en': 'Under Review', 'ar': 'قيد المراجعة'},
      {'key': 'approved', 'en': 'Approved', 'ar': 'موافق عليه'},
      {'key': 'rejected', 'en': 'Rejected', 'ar': 'مرفوض'},
      {'key': 'paid', 'en': 'Paid', 'ar': 'مدفوع'},
      {'key': 'reconciled', 'en': 'Reconciled', 'ar': 'تمت التسوية'},
      {'key': 'cancelled', 'en': 'Cancelled', 'ar': 'ملغى'},
    ];

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: filters.map((f) {
            final isSelected = _statusFilter == f['key'];
            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: FilterChip(
                label: Text(isArabic ? f['ar']! : f['en']!),
                selected: isSelected,
                onSelected: (sel) => setState(() => _statusFilter = sel ? f['key']! : 'all'),
                selectedColor: Theme.of(context).primaryColor.withValues(alpha: 0.2),
                checkmarkColor: Theme.of(context).primaryColor,
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _buildSubmissionCard(OperationalCostSubmission s) {
    final isArabic = widget.isArabic;
    final dateFormat = DateFormat('MMM dd, yyyy');
    final statusDisplay = OperationalCostSubmission.getStatusDisplay(s.derivedStatus, isArabic);
    final statusColor = statusDisplay['color'] as Color;
    final statusLabel = statusDisplay['label'] as String;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: () async {
          final result = await Navigator.push(
            context,
            MaterialPageRoute(builder: (ctx) => CostSubmissionDetailsScreen(submissionId: s.id, isArabic: isArabic)),
          );
          if (result == true) _loadData();
        },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          isArabic ? s.expenseCategory.labelAr : s.expenseCategory.labelEn,
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                        ),
                        if (s.submitterName != null) ...[
                          const SizedBox(height: 2),
                          Text(s.submitterName!, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                        ],
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: statusColor.withValues(alpha: 0.4)),
                    ),
                    child: Text(statusLabel, style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.w600)),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '${s.amount.toStringAsFixed(2)} ${s.currency}',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Theme.of(context).primaryColor),
                  ),
                  Text(dateFormat.format(s.createdAt), style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                ],
              ),
              if (s.description.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(s.description, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: Colors.grey[700], fontSize: 13)),
              ],
              const SizedBox(height: 8),
              Row(
                children: [
                  if (s.hasThreeTiers)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      margin: const EdgeInsets.only(right: 8),
                      decoration: BoxDecoration(
                        color: Colors.deepPurple.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        isArabic ? '3 مستويات' : '3-Tier',
                        style: const TextStyle(fontSize: 10, color: Colors.deepPurple, fontWeight: FontWeight.w600),
                      ),
                    ),
                  if (s.supportingDocuments.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(color: Colors.blue.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(4)),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.attach_file, size: 12, color: Colors.blue[700]),
                          const SizedBox(width: 2),
                          Text('${s.supportingDocuments.length}', style: TextStyle(fontSize: 10, color: Colors.blue[700], fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                  const Spacer(),
                  Icon(Icons.chevron_right, color: Colors.grey[400]),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.receipt_long, size: 64, color: Colors.grey[300]),
          const SizedBox(height: 16),
          Text(
            widget.isArabic ? 'لا توجد طلبات' : 'No Submissions',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.grey[600]),
          ),
          const SizedBox(height: 8),
          Text(
            widget.isArabic ? 'ستظهر هنا طلباتك السابقة' : 'Your past submissions will appear here',
            style: TextStyle(color: Colors.grey[500]),
          ),
        ],
      ),
    );
  }

  void _exportCsv() {
    final csv = _costService.exportToCsv(_filteredSubmissions, isArabic: widget.isArabic);
    Clipboard.setData(ClipboardData(text: csv));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(widget.isArabic ? 'تم نسخ CSV إلى الحافظة' : 'CSV copied to clipboard'),
        backgroundColor: Colors.green,
      ),
    );
  }
}
