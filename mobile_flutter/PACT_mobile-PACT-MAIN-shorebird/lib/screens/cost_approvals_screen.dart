import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:file_picker/file_picker.dart';
import '../models/operational_cost_submission.dart';
import '../services/operational_cost_service.dart';
import '../theme/app_colors.dart';

class CostApprovalsScreen extends StatefulWidget {
  final String userRole;
  final String? hubId;
  final bool isArabic;

  const CostApprovalsScreen({
    super.key,
    required this.userRole,
    this.hubId,
    this.isArabic = false,
  });

  @override
  State<CostApprovalsScreen> createState() => _CostApprovalsScreenState();
}

class _CostApprovalsScreenState extends State<CostApprovalsScreen> {
  final _costService = OperationalCostService();
  String _activeTab = 'tier1';
  late CostSubmissionPermissions _permissions;
  List<OperationalCostSubmission> _allSubmissions = [];
  bool _isLoading = true;

  List<OperationalCostSubmission> get _tier1Pending => _allSubmissions
      .where((s) => _permissions.canApproveTier1(s))
      .toList();

  List<OperationalCostSubmission> get _tier2Pending => _allSubmissions
      .where((s) => _permissions.canApproveTier2(s))
      .toList();

  List<OperationalCostSubmission> get _tier3Pending => _allSubmissions
      .where((s) => _permissions.canApproveTier3(s))
      .toList();

  List<OperationalCostSubmission> get _processed => _allSubmissions
      .where((s) =>
          s.status == OperationalCostStatus.approved ||
          s.status == OperationalCostStatus.rejected ||
          s.status == OperationalCostStatus.paid)
      .toList();

  @override
  void initState() {
    super.initState();
    _permissions = CostSubmissionPermissions.fromRole(widget.userRole);
    _loadData();
  }

  @override
  void dispose() {
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final permissions = await _costService.getUserPermissions();
      final submissions = await _costService.getAllSubmissions(hubId: widget.hubId);
      setState(() {
        _permissions = permissions;
        _allSubmissions = submissions;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      _showError(widget.isArabic ? 'فشل في تحميل البيانات' : 'Failed to load data');
    }
  }

  void _showError(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: Colors.red),
    );
  }

  void _showSuccess(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: Colors.green),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = widget.isArabic;

    return Scaffold(
      appBar: AppBar(
        title: Text(isArabic ? 'موافقات التكاليف' : 'Cost Approvals'),
        elevation: 0,
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loadData),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert),
            onSelected: (v) {
              if (v == 'export') _exportCsv();
            },
            itemBuilder: (ctx) => [
              PopupMenuItem(
                value: 'export',
                child: Row(children: [
                  const Icon(Icons.file_download, size: 20),
                  const SizedBox(width: 8),
                  Text(isArabic ? 'تصدير CSV' : 'Export CSV'),
                ]),
              ),
            ],
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SafeArea(
              top: false,
              child: Column(
              children: [
                // ── Bilingual scrollable tab row ───────────────────────
                Container(
                  color: Colors.white,
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        _buildTabButton('tier1', 'Tier 1', 'المستوى 1',
                            Icons.looks_one_rounded, _tier1Pending.length, isArabic),
                        const SizedBox(width: 8),
                        _buildTabButton('tier2', 'Tier 2', 'المستوى 2',
                            Icons.looks_two_rounded, _tier2Pending.length, isArabic),
                        const SizedBox(width: 8),
                        _buildTabButton('tier3', 'Tier 3', 'المستوى 3',
                            Icons.looks_3_rounded, _tier3Pending.length, isArabic),
                        const SizedBox(width: 8),
                        _buildTabButton('processed', 'Processed', 'المعالجة',
                            Icons.check_circle_outline_rounded, 0, isArabic),
                      ],
                    ),
                  ),
                ),
                const Divider(height: 1),
                Expanded(
                  child: _activeTab == 'tier2'
                      ? _buildApprovalList(_tier2Pending, 2)
                      : _activeTab == 'tier3'
                          ? _buildApprovalList(_tier3Pending, 3)
                          : _activeTab == 'processed'
                              ? _buildProcessedList()
                              : _buildApprovalList(_tier1Pending, 1),
                ),
              ],
            )
            ),
    );
  }

  Widget _buildTabButton(String tab, String labelEn, String labelAr,
      IconData icon, int count, bool isArabic) {
    final isActive = _activeTab == tab;
    return GestureDetector(
      onTap: () => setState(() => _activeTab = tab),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: isActive ? AppColors.primaryBlue : const Color(0xFFF3F6FA),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon,
                size: 16,
                color: isActive ? Colors.white : AppColors.textLight),
            const SizedBox(width: 6),
            Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isArabic ? labelAr : labelEn,
                  style: GoogleFonts.poppins(
                    fontSize: isArabic ? 13 : 12,
                    fontWeight: FontWeight.w700,
                    color: isActive ? Colors.white : AppColors.textLight,
                  ),
                ),
                Text(
                  isArabic ? labelEn : labelAr,
                  style: GoogleFonts.poppins(
                    fontSize: isArabic ? 10 : 11,
                    fontWeight: isArabic ? FontWeight.w600 : FontWeight.w700,
                    color: isActive
                        ? Colors.white.withValues(alpha: 0.8)
                        : AppColors.textLight,
                  ),
                ),
              ],
            ),
            if (count > 0) ...[
              const SizedBox(width: 6),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: isActive
                      ? Colors.white.withValues(alpha: 0.3)
                      : AppColors.accentRed,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  count.toString(),
                  style: GoogleFonts.poppins(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildApprovalList(List<OperationalCostSubmission> items, int tier) {
    if (items.isEmpty) {
      return _buildEmptyState(
        icon: Icons.check_circle_outline,
        title: widget.isArabic ? 'لا توجد موافقات معلقة' : 'No Pending Approvals',
        subtitle: widget.isArabic
            ? 'جميع طلبات المستوى $tier تمت معالجتها'
            : 'All Tier $tier requests have been processed',
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: items.length,
        itemBuilder: (context, index) => _buildApprovalCard(items[index], tier),
      ),
    );
  }

  Widget _buildApprovalCard(OperationalCostSubmission submission, int tier) {
    final isArabic = widget.isArabic;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isArabic
                            ? submission.expenseCategory.labelAr
                            : submission.expenseCategory.labelEn,
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                      ),
                      if (submission.submitterName != null)
                        Text(
                          submission.submitterName!,
                          style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                        ),
                    ],
                  ),
                ),
                if (submission.hasThreeTiers)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.deepPurple.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      isArabic ? '3 مستويات' : '3-Tier',
                      style: const TextStyle(fontSize: 10, color: Colors.deepPurple, fontWeight: FontWeight.w600),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '${submission.amount.toStringAsFixed(2)} ${submission.currency}',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Theme.of(context).primaryColor,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              submission.description,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: Colors.grey[700]),
            ),
            if (submission.projectName != null || submission.hubName != null) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  if (submission.projectName != null) ...[
                    Icon(Icons.folder, size: 14, color: Colors.grey[500]),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(
                        submission.projectName!,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                      ),
                    ),
                  ],
                  if (submission.hubName != null) ...[
                    const SizedBox(width: 12),
                    Icon(Icons.location_city, size: 14, color: Colors.grey[500]),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(
                        submission.hubName!,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                      ),
                    ),
                  ],
                ],
              ),
            ],
            const SizedBox(height: 12),
            _buildTierProgress(submission),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () => _handleApproval(submission, tier, true),
                    icon: const Icon(Icons.check, size: 18),
                    label: Text(isArabic ? 'موافقة' : 'Approve'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green,
                      foregroundColor: Colors.white,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _handleApproval(submission, tier, false),
                    icon: const Icon(Icons.close, size: 18),
                    label: Text(isArabic ? 'رفض' : 'Reject'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red,
                      side: const BorderSide(color: Colors.red),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTierProgress(OperationalCostSubmission s) {
    return Row(
      children: [
        _buildTierDot(s.tier1Status, widget.isArabic ? 'م1' : 'T1'),
        _buildArrow(s.tier1Status == 'approved'),
        _buildTierDot(s.tier2Status, widget.isArabic ? 'م2' : 'T2'),
        if (s.hasThreeTiers) ...[
          _buildArrow(s.tier2Status == 'approved'),
          _buildTierDot(s.tier3Status, widget.isArabic ? 'م3' : 'T3'),
        ],
      ],
    );
  }

  Widget _buildTierDot(String? status, String label) {
    Color color;
    IconData icon;
    switch (status) {
      case 'approved':
        color = Colors.green;
        icon = Icons.check_circle;
        break;
      case 'rejected':
        color = Colors.red;
        icon = Icons.cancel;
        break;
      default:
        color = Colors.grey;
        icon = Icons.hourglass_empty;
    }
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 3),
        Text(label, style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
      ],
    );
  }

  Widget _buildArrow(bool active) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Icon(Icons.arrow_forward, size: 14, color: active ? Colors.green : Colors.grey[400]),
    );
  }

  Widget _buildProcessedList() {
    if (_processed.isEmpty) {
      return _buildEmptyState(
        icon: Icons.history,
        title: widget.isArabic ? 'لا يوجد سجل' : 'No History',
        subtitle: widget.isArabic ? 'ستظهر هنا الطلبات المعالجة' : 'Processed requests will appear here',
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _processed.length,
        itemBuilder: (context, index) {
          final s = _processed[index];
          final isArabic = widget.isArabic;
          Color statusColor;
          String statusLabel;

          switch (s.status) {
            case OperationalCostStatus.approved:
              statusColor = Colors.green;
              statusLabel = isArabic ? 'موافق عليه' : 'Approved';
              break;
            case OperationalCostStatus.rejected:
              statusColor = Colors.red;
              statusLabel = isArabic ? 'مرفوض' : 'Rejected';
              break;
            case OperationalCostStatus.paid:
              statusColor = Colors.purple;
              statusLabel = isArabic ? 'مدفوع' : 'Paid';
              break;
            default:
              statusColor = Colors.grey;
              statusLabel = s.status.labelEn;
          }

          final canRecordPayment = s.isFullyApproved && s.status != OperationalCostStatus.paid && (_permissions.isAdmin || _permissions.isSuperAdmin);

          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: statusColor.withValues(alpha: 0.1),
                child: Icon(
                  s.status == OperationalCostStatus.rejected ? Icons.cancel : Icons.check_circle,
                  color: statusColor,
                  size: 20,
                ),
              ),
              title: Text(
                isArabic ? s.expenseCategory.labelAr : s.expenseCategory.labelEn,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: Text(
                '${s.amount.toStringAsFixed(2)} ${s.currency} - ${s.submitterName ?? ""}',
                style: TextStyle(fontSize: 12, color: Colors.grey[600]),
              ),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (canRecordPayment)
                    IconButton(
                      icon: const Icon(Icons.payments, color: Colors.purple, size: 20),
                      tooltip: isArabic ? 'تسجيل الدفع' : 'Record Payment',
                      onPressed: () => _showRecordPaymentDialog(s),
                    ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      statusLabel,
                      style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // ─── Mark as Paid — full receipt-upload dialog (mirrors web CostSubmission.tsx) ──
  Future<void> _showRecordPaymentDialog(OperationalCostSubmission submission) async {
    final isArabic = widget.isArabic;
    final notesCtrl = TextEditingController();
    Uint8List? proofBytes;
    String? proofFileName;
    String? proofExtension;
    bool uploading = false;

    final confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDs) {
          final isImage = proofExtension != null &&
              ['jpg', 'jpeg', 'png', 'webp', 'gif'].contains(proofExtension!.toLowerCase());
          final isPdf   = proofExtension?.toLowerCase() == 'pdf';
          final hasProof = proofBytes != null;

          Future<void> pickFile() async {
            final result = await FilePicker.platform.pickFiles(
              type: FileType.custom,
              allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
              withData: true,
            );
            if (result != null && result.files.single.bytes != null) {
              setDs(() {
                proofBytes    = result.files.single.bytes;
                proofFileName = result.files.single.name;
                proofExtension = result.files.single.extension ?? 'jpg';
              });
            }
          }

          return Dialog(
            insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            child: SingleChildScrollView(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // ── Header ──────────────────────────────────────────────
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: Colors.purple.shade50,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(Icons.payments_rounded, color: Colors.purple.shade700, size: 20),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                isArabic ? 'تسجيل الدفع / Record Payment' : 'Record Payment / تسجيل الدفع',
                                style: GoogleFonts.poppins(fontSize: 15, fontWeight: FontWeight.w700),
                              ),
                              Text(
                                isArabic ? 'يجب إرفاق إيصال الدفع' : 'Payment receipt is mandatory',
                                style: GoogleFonts.poppins(fontSize: 11, color: Colors.red.shade600),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // ── Submission summary ───────────────────────────────────
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.purple.shade50,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Colors.purple.shade200),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            isArabic
                                ? submission.expenseCategory.labelAr
                                : submission.expenseCategory.labelEn,
                            style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 13),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${submission.amount.toStringAsFixed(2)} ${submission.currency}',
                            style: GoogleFonts.poppins(
                              fontSize: 20, fontWeight: FontWeight.w800, color: Colors.purple.shade700),
                          ),
                          if (submission.description != null && submission.description!.isNotEmpty) ...[
                            const SizedBox(height: 4),
                            Text(submission.description!,
                              maxLines: 2, overflow: TextOverflow.ellipsis,
                              style: GoogleFonts.poppins(fontSize: 11, color: Colors.grey.shade600)),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // ── Receipt upload ───────────────────────────────────────
                    Text(
                      isArabic ? 'إيصال الدفع *' : 'Payment Receipt *',
                      style: GoogleFonts.poppins(fontSize: 12, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 8),

                    // Preview
                    if (hasProof) ...[
                      if (isImage)
                        ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: Image.memory(proofBytes!, height: 160, width: double.infinity, fit: BoxFit.cover),
                        )
                      else if (isPdf)
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.red.shade50,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: Colors.red.shade200),
                          ),
                          child: Row(
                            children: [
                              Icon(Icons.picture_as_pdf, color: Colors.red.shade700, size: 28),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(proofFileName ?? 'receipt.pdf',
                                  style: GoogleFonts.poppins(fontSize: 12, fontWeight: FontWeight.w600),
                                  overflow: TextOverflow.ellipsis),
                              ),
                            ],
                          ),
                        ),
                      const SizedBox(height: 8),
                    ],

                    // Upload button
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: pickFile,
                        icon: Icon(hasProof ? Icons.swap_horiz_rounded : Icons.attach_file_rounded, size: 18),
                        label: Text(
                          hasProof
                              ? (isArabic ? 'تغيير الملف' : 'Change File')
                              : (isArabic ? 'إرفاق الإيصال (صورة أو PDF)' : 'Attach Receipt (image or PDF)'),
                          style: GoogleFonts.poppins(fontSize: 12, fontWeight: FontWeight.w600),
                        ),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.purple.shade700,
                          side: BorderSide(
                            color: hasProof ? Colors.green.shade400 : Colors.purple.shade300,
                            width: hasProof ? 2 : 1,
                          ),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),

                    if (!hasProof) ...[
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Icon(Icons.info_outline, size: 12, color: Colors.amber.shade700),
                          const SizedBox(width: 4),
                          Text(
                            isArabic
                                ? 'الإيصال مطلوب قبل تأكيد الدفع'
                                : 'Receipt is required before confirming payment',
                            style: GoogleFonts.poppins(fontSize: 10, color: Colors.amber.shade700),
                          ),
                        ],
                      ),
                    ],

                    const SizedBox(height: 14),

                    // ── Notes ────────────────────────────────────────────────
                    Text(
                      isArabic ? 'ملاحظات (اختياري)' : 'Notes (optional)',
                      style: GoogleFonts.poppins(fontSize: 12, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 6),
                    TextField(
                      controller: notesCtrl,
                      maxLines: 2,
                      style: GoogleFonts.poppins(fontSize: 13),
                      decoration: InputDecoration(
                        hintText: isArabic ? 'أضف أي ملاحظات...' : 'Add any notes...',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: const BorderSide(color: Colors.purple, width: 2),
                        ),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        isDense: true,
                      ),
                    ),

                    const SizedBox(height: 20),

                    // ── Actions ──────────────────────────────────────────────
                    Row(
                      children: [
                        TextButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          child: Text(isArabic ? 'إلغاء' : 'Cancel',
                            style: GoogleFonts.poppins(color: Colors.grey.shade600, fontWeight: FontWeight.w600)),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: (!hasProof || uploading) ? null : () => Navigator.pop(ctx, true),
                            icon: uploading
                                ? const SizedBox(width: 16, height: 16,
                                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : const Icon(Icons.check_circle_outline, size: 18),
                            label: Text(
                              uploading
                                  ? (isArabic ? 'جارٍ الرفع...' : 'Uploading...')
                                  : (isArabic ? 'تأكيد الدفع' : 'Confirm Payment'),
                              style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 13),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.purple,
                              foregroundColor: Colors.white,
                              disabledBackgroundColor: Colors.purple.withValues(alpha: 0.4),
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );

    if (confirmed != true || proofBytes == null) return;

    // ── Upload + save ────────────────────────────────────────────────────────
    try {
      await _costService.markAsPaidWithProof(
        submissionId:   submission.id,
        proofBytes:     proofBytes!,
        proofExtension: proofExtension ?? 'jpg',
        proofNotes:     notesCtrl.text.trim().isNotEmpty ? notesCtrl.text.trim() : null,
      );
      await _costService.notifyPaymentRecorded(submission: submission);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(isArabic
              ? 'تم تسجيل الدفع وحفظ الإيصال ✓'
              : 'Payment recorded with receipt ✓'),
          backgroundColor: Colors.green,
        ));
        _loadSubmissions();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      notesCtrl.dispose();
    }
  }

  Future<void> _handleApproval(OperationalCostSubmission submission, int tier, bool isApproval) async {
    final isArabic = widget.isArabic;
    final notesController = TextEditingController();
    bool useSignature = false;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(
            isApproval
                ? (isArabic ? 'تأكيد الموافقة - المستوى $tier' : 'Confirm Approval - Tier $tier')
                : (isArabic ? 'تأكيد الرفض - المستوى $tier' : 'Confirm Rejection - Tier $tier'),
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${isArabic ? submission.expenseCategory.labelAr : submission.expenseCategory.labelEn} - ${submission.amount.toStringAsFixed(2)} ${submission.currency}',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: notesController,
                  decoration: InputDecoration(
                    labelText: isArabic ? 'ملاحظات' : 'Notes',
                    hintText: isArabic ? 'أضف ملاحظاتك...' : 'Add your notes...',
                    border: const OutlineInputBorder(),
                  ),
                  maxLines: 3,
                ),
                if (isApproval && (_permissions.isAdmin || _permissions.isSuperAdmin)) ...[
                  const SizedBox(height: 12),
                  CheckboxListTile(
                    value: useSignature,
                    onChanged: (v) => setDialogState(() => useSignature = v ?? false),
                    title: Text(isArabic ? 'إضافة توقيع رقمي' : 'Add Digital Signature', style: const TextStyle(fontSize: 14)),
                    controlAffinity: ListTileControlAffinity.leading,
                    contentPadding: EdgeInsets.zero,
                  ),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text(isArabic ? 'إلغاء' : 'Cancel'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              style: ElevatedButton.styleFrom(
                backgroundColor: isApproval ? Colors.green : Colors.red,
                foregroundColor: Colors.white,
              ),
              child: Text(isApproval ? (isArabic ? 'موافقة' : 'Approve') : (isArabic ? 'رفض' : 'Reject')),
            ),
          ],
        ),
      ),
    );

    if (confirmed != true) return;

    String notes = notesController.text.trim();
    if (useSignature && isApproval) {
      final sig = await _showSignatureOtp();
      if (sig == null) return;
      notes = notes.isNotEmpty ? '$notes\n$sig' : sig;
    }

    bool success = false;
    switch (tier) {
      case 1:
        success = await _costService.tier1Review(submissionId: submission.id, approved: isApproval, notes: notes.isNotEmpty ? notes : null);
        break;
      case 2:
        success = await _costService.tier2Review(submissionId: submission.id, approved: isApproval, notes: notes.isNotEmpty ? notes : null);
        break;
      case 3:
        success = await _costService.tier3Review(submissionId: submission.id, approved: isApproval, notes: notes.isNotEmpty ? notes : null);
        break;
    }

    if (success) {
      await _costService.notifyApprovalAction(submission: submission, action: isApproval ? 'approved' : 'rejected', tier: tier);
      _showSuccess(isArabic
          ? (isApproval ? 'تمت الموافقة بنجاح' : 'تم الرفض بنجاح')
          : (isApproval ? 'Approved successfully' : 'Rejected successfully'));
      _loadData();
    } else {
      _showError(isArabic ? 'فشل في تنفيذ الإجراء' : 'Failed to process action');
    }
  }

  Future<String?> _showSignatureOtp() async {
    final isArabic = widget.isArabic;
    final otpController = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(isArabic ? 'تأكيد التوقيع الرقمي' : 'Digital Signature Confirmation'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.security, size: 48, color: Theme.of(context).primaryColor),
            const SizedBox(height: 16),
            Text(isArabic ? 'أدخل رمز OTP لتأكيد التوقيع' : 'Enter OTP code to confirm signature', textAlign: TextAlign.center),
            const SizedBox(height: 16),
            TextField(
              controller: otpController,
              decoration: InputDecoration(
                labelText: isArabic ? 'رمز OTP' : 'OTP Code',
                border: const OutlineInputBorder(),
                prefixIcon: const Icon(Icons.lock),
              ),
              keyboardType: TextInputType.number,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 20, letterSpacing: 8),
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, null), child: Text(isArabic ? 'إلغاء' : 'Cancel')),
          ElevatedButton(
            onPressed: () {
              if (otpController.text.length >= 4) {
                final hash = otpController.text.hashCode.toRadixString(16).toUpperCase();
                Navigator.pop(context, '[Signed: OTP | Hash: $hash | ${DateTime.now().toIso8601String()}]');
              }
            },
            child: Text(isArabic ? 'تأكيد' : 'Confirm'),
          ),
        ],
      ),
    );
  }

  void _exportCsv() {
    final csv = _costService.exportToCsv(_allSubmissions, isArabic: widget.isArabic);
    Clipboard.setData(ClipboardData(text: csv));
    _showSuccess(widget.isArabic ? 'تم نسخ CSV إلى الحافظة' : 'CSV copied to clipboard');
  }

  Widget _buildEmptyState({required IconData icon, required String title, required String subtitle}) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 64, color: Colors.green[300]),
            const SizedBox(height: 16),
            Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text(subtitle, textAlign: TextAlign.center, style: TextStyle(color: Colors.grey[600])),
          ],
        ),
      ),
    );
  }
}
