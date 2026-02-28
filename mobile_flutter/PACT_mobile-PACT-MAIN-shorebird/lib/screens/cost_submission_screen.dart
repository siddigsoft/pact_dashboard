import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../models/cost_submission.dart';
import '../services/cost_submission_service.dart';
import '../theme/app_colors.dart';

// ─── Category icon + color map ────────────────────────────────────────────────
const _kCategoryMeta = {
  'permits':         {'icon': Icons.badge_outlined,          'color': 0xFF6366F1},
  'incentives':      {'icon': Icons.card_giftcard_outlined,  'color': 0xFF8B5CF6},
  'communications':  {'icon': Icons.wifi_rounded,            'color': 0xFF06B6D4},
  'training':        {'icon': Icons.school_outlined,         'color': 0xFF0EA5E9},
  'transport':       {'icon': Icons.directions_car_outlined, 'color': 0xFFF59E0B},
  'general_transport': {'icon': Icons.directions_car_outlined,'color': 0xFFF59E0B},
  'equipment':       {'icon': Icons.inventory_2_outlined,    'color': 0xFF10B981},
  'printing':        {'icon': Icons.print_outlined,          'color': 0xFF14B8A6},
  'meetings':        {'icon': Icons.groups_outlined,         'color': 0xFFF97316},
  'office_admin':    {'icon': Icons.business_center_outlined,'color': 0xFF64748B},
  'other':           {'icon': Icons.more_horiz_rounded,      'color': 0xFF94A3B8},
};

// ─── Status styling ────────────────────────────────────────────────────────────
Map<String, dynamic> _statusStyle(CostSubmissionStatus status) {
  switch (status) {
    case CostSubmissionStatus.pending:
      return {'color': 0xFFF59E0B, 'bg': 0xFFFFFBEB, 'icon': Icons.hourglass_empty_rounded, 'bar': 0xFFFCD34D};
    case CostSubmissionStatus.underReview:
      return {'color': 0xFF3B82F6, 'bg': 0xFFEFF6FF, 'icon': Icons.visibility_outlined, 'bar': 0xFF93C5FD};
    case CostSubmissionStatus.approved:
      return {'color': 0xFF10B981, 'bg': 0xFFF0FDF4, 'icon': Icons.check_circle_outline, 'bar': 0xFF6EE7B7};
    case CostSubmissionStatus.disbursed:
      return {'color': 0xFF0EA5E9, 'bg': 0xFFE0F2FE, 'icon': Icons.account_balance_wallet_outlined, 'bar': 0xFF7DD3FC};
    case CostSubmissionStatus.rejected:
      return {'color': 0xFFEF4444, 'bg': 0xFFFEF2F2, 'icon': Icons.cancel_outlined, 'bar': 0xFFFCA5A5};
    case CostSubmissionStatus.paid:
      return {'color': 0xFF8B5CF6, 'bg': 0xFFF5F3FF, 'icon': Icons.payments_outlined, 'bar': 0xFFC4B5FD};
    case CostSubmissionStatus.reconciled:
      return {'color': 0xFF059669, 'bg': 0xFFECFDF5, 'icon': Icons.sync_alt_rounded, 'bar': 0xFF6EE7B7};
    case CostSubmissionStatus.closed:
      return {'color': 0xFF6B7280, 'bg': 0xFFF9FAFB, 'icon': Icons.lock_outline, 'bar': 0xFFD1D5DB};
    case CostSubmissionStatus.cancelled:
      return {'color': 0xFF9CA3AF, 'bg': 0xFFF9FAFB, 'icon': Icons.block_rounded, 'bar': 0xFFE5E7EB};
    default:
      return {'color': 0xFF9CA3AF, 'bg': 0xFFF9FAFB, 'icon': Icons.help_outline, 'bar': 0xFFE5E7EB};
  }
}

// ─── Main screen ──────────────────────────────────────────────────────────────
class CostSubmissionScreen extends StatefulWidget {
  final CostSubmissionService? costService;
  final String? userRole;
  final String? hubId;
  final String? projectId;
  final bool isArabic;

  const CostSubmissionScreen({
    Key? key,
    this.costService,
    this.userRole,
    this.hubId,
    this.projectId,
    this.isArabic = false,
  }) : super(key: key);

  @override
  State<CostSubmissionScreen> createState() => _CostSubmissionScreenState();
}

class _CostSubmissionScreenState extends State<CostSubmissionScreen>
    with SingleTickerProviderStateMixin {
  late CostSubmissionService _costService;
  late TabController _tabController;

  List<OperationalCostSubmission> _submissions = [];
  CostSubmissionStats _stats = CostSubmissionStats.empty();
  bool _isLoading = true;

  // History tab status filter
  String _historyFilter = 'all';

  bool get _isArabic => widget.isArabic;
  String get _userRole => widget.userRole ?? 'user';

  bool get _canSubmit {
    final r = _userRole.toLowerCase();
    return r.contains('fom') || r.contains('coordinator') ||
        r.contains('country') || r.contains('admin');
  }

  // Outstanding = approved or disbursed (not yet paid/closed)
  List<OperationalCostSubmission> get _outstanding => _submissions
      .where((s) =>
          s.status == CostSubmissionStatus.approved ||
          s.status == CostSubmissionStatus.disbursed)
      .toList();

  // Reconciliation = disbursed (need receipt reconciliation)
  List<OperationalCostSubmission> get _needReconciliation => _submissions
      .where((s) => s.status == CostSubmissionStatus.disbursed)
      .toList();

  // History filtered
  List<OperationalCostSubmission> get _filteredHistory {
    if (_historyFilter == 'all') return _submissions;
    return _submissions.where((s) => s.status.value == _historyFilter).toList();
  }

  @override
  void initState() {
    super.initState();
    _costService = widget.costService ?? CostSubmissionService();
    _tabController = TabController(length: 4, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      final subs = await _costService.getUserSubmissions();
      final stats = CostSubmissionStats.fromSubmissions(subs);
      if (mounted) {
        setState(() {
          _submissions = subs;
          _stats = stats;
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
      _showSnack(_isArabic ? 'فشل تحميل البيانات' : 'Failed to load data', isError: true);
    }
  }

  void _showSnack(String msg, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg, style: GoogleFonts.poppins(fontSize: 13)),
      backgroundColor: isError ? Colors.red.shade600 : Colors.green.shade600,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      margin: const EdgeInsets.all(12),
    ));
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      body: _isLoading
          ? _buildLoader()
          : NestedScrollView(
              headerSliverBuilder: (ctx, inner) => [_buildSliverHeader()],
              body: Column(
                children: [
                  _buildTabBar(),
                  Expanded(
                    child: TabBarView(
                      controller: _tabController,
                      children: [
                        _buildSubmitTab(),
                        _buildOutstandingTab(),
                        _buildReconciliationTab(),
                        _buildHistoryTab(),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildLoader() {
    return const Scaffold(
      backgroundColor: Color(0xFFF1F5F9),
      body: Center(child: CircularProgressIndicator()),
    );
  }

  // ── Sliver App Bar / Header ────────────────────────────────────────────────

  Widget _buildSliverHeader() {
    return SliverAppBar(
      expandedHeight: 165,
      floating: false,
      pinned: true,
      elevation: 0,
      backgroundColor: AppColors.primaryBlue,
      flexibleSpace: FlexibleSpaceBar(
        collapseMode: CollapseMode.pin,
        background: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xFF1E40AF), Color(0xFF1D4ED8), Color(0xFF2563EB)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 48, 16, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.receipt_long, color: Colors.white70, size: 18),
                      const SizedBox(width: 6),
                      Text(
                        _isArabic ? 'تقديم التكاليف التشغيلية' : 'Operational Cost Submission',
                        style: GoogleFonts.poppins(
                          color: Colors.white70,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _isArabic ? 'إدارة وتتبع التكاليف' : 'Manage & Track Costs',
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 12),
                  // Quick stats row
                  Row(
                    children: [
                      _QuickStat(
                        label: _isArabic ? 'الكل' : 'Total',
                        value: _stats.total.toString(),
                        icon: Icons.receipt_long,
                      ),
                      const SizedBox(width: 8),
                      _QuickStat(
                        label: _isArabic ? 'معلق' : 'Pending',
                        value: _stats.pending.toString(),
                        icon: Icons.hourglass_empty,
                        highlight: _stats.pending > 0,
                      ),
                      const SizedBox(width: 8),
                      _QuickStat(
                        label: _isArabic ? 'معتمد' : 'Approved',
                        value: _stats.approved.toString(),
                        icon: Icons.check_circle_outline,
                      ),
                      const SizedBox(width: 8),
                      _QuickStat(
                        label: _isArabic ? 'مدفوع' : 'Paid',
                        value: _stats.paid.toString(),
                        icon: Icons.payments_outlined,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      leading: BackButton(color: Colors.white),
      actions: [
        IconButton(
          icon: const Icon(Icons.refresh_rounded, color: Colors.white),
          onPressed: _loadData,
          tooltip: _isArabic ? 'تحديث' : 'Refresh',
        ),
      ],
    );
  }

  // ── Tab Bar ────────────────────────────────────────────────────────────────

  Widget _buildTabBar() {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            _TabChip(
              controller: _tabController,
              index: 0,
              icon: Icons.add_circle_outline_rounded,
              labelEn: 'Submit',
              labelAr: 'تقديم',
              isArabic: _isArabic,
            ),
            const SizedBox(width: 8),
            _TabChip(
              controller: _tabController,
              index: 1,
              icon: Icons.account_balance_wallet_rounded,
              labelEn: 'Outstanding',
              labelAr: 'المستحقات',
              badge: _outstanding.length,
              badgeColor: Colors.orange,
              isArabic: _isArabic,
            ),
            const SizedBox(width: 8),
            _TabChip(
              controller: _tabController,
              index: 2,
              icon: Icons.sync_rounded,
              labelEn: 'Reconcile',
              labelAr: 'التسوية',
              badge: _needReconciliation.length,
              badgeColor: Colors.blue,
              isArabic: _isArabic,
            ),
            const SizedBox(width: 8),
            _TabChip(
              controller: _tabController,
              index: 3,
              icon: Icons.history_rounded,
              labelEn: 'History',
              labelAr: 'السجل',
              badge: _stats.total,
              badgeColor: Colors.grey,
              isArabic: _isArabic,
            ),
          ],
        ),
      ),
    );
  }

  // ── Submit Tab ─────────────────────────────────────────────────────────────

  Widget _buildSubmitTab() {
    if (!_canSubmit) {
      return _buildEmptyState(
        icon: Icons.lock_outline,
        titleEn: 'Access Restricted',
        titleAr: 'الوصول مقيد',
        subtitleEn: 'You do not have permission to submit operational costs.',
        subtitleAr: 'ليس لديك صلاحية لتقديم التكاليف التشغيلية.',
      );
    }
    return RefreshIndicator(
      onRefresh: _loadData,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Info banner
            Container(
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: const Color(0xFFEFF6FF),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFF93C5FD)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, color: Color(0xFF3B82F6), size: 18),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _isArabic
                          ? 'سيتم مراجعة طلبك من قِبل المشرف ثم الإدارة المالية قبل الصرف.'
                          : 'Your request will go through a two-tier review before payment.',
                      style: GoogleFonts.poppins(fontSize: 12, color: const Color(0xFF1D4ED8)),
                    ),
                  ),
                ],
              ),
            ),
            OperationalCostForm(
              isArabic: _isArabic,
              hubId: widget.hubId,
              projectId: widget.projectId,
              userRole: _userRole,
              onSubmit: _handleSubmit,
            ),
          ],
        ),
      ),
    );
  }

  // ── Outstanding Tab ────────────────────────────────────────────────────────

  Widget _buildOutstandingTab() {
    if (_outstanding.isEmpty) {
      return _buildEmptyState(
        icon: Icons.account_balance_wallet_outlined,
        titleEn: 'No Outstanding Advances',
        titleAr: 'لا توجد مستحقات',
        subtitleEn: 'Approved amounts awaiting payment will appear here.',
        subtitleAr: 'ستظهر هنا المبالغ المعتمدة المنتظرة للصرف.',
      );
    }

    // Total outstanding amount
    final totalCents =
        _outstanding.fold<int>(0, (sum, s) => sum + s.amountCents);
    final totalFormatted =
        '${NumberFormat.currency(symbol: '', decimalDigits: 0).format(totalCents / 100)} SDG';

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Summary banner
          Container(
            padding: const EdgeInsets.all(14),
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF0EA5E9), Color(0xFF38BDF8)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              children: [
                const Icon(Icons.account_balance_wallet, color: Colors.white, size: 28),
                const SizedBox(width: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _isArabic ? 'إجمالي المستحقات' : 'Total Outstanding',
                      style: GoogleFonts.poppins(
                          color: Colors.white70, fontSize: 12),
                    ),
                    Text(
                      totalFormatted,
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          ..._outstanding.map((s) => _buildSubmissionCard(s)),
        ],
      ),
    );
  }

  // ── Reconciliation Tab ─────────────────────────────────────────────────────

  Widget _buildReconciliationTab() {
    if (_needReconciliation.isEmpty) {
      return _buildEmptyState(
        icon: Icons.sync_rounded,
        titleEn: 'All Clear',
        titleAr: 'لا شيء يحتاج تسوية',
        subtitleEn: 'No disbursed advances awaiting reconciliation.',
        subtitleAr: 'لا توجد سلف صُرفت وتحتاج إلى تسوية.',
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF7ED),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFFB923C)),
            ),
            child: Row(
              children: [
                const Icon(Icons.warning_amber_rounded, color: Color(0xFFF97316), size: 18),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    _isArabic
                        ? '${_needReconciliation.length} سلفة تحتاج إلى تسوية بإيصالات أصلية'
                        : '${_needReconciliation.length} advance${_needReconciliation.length != 1 ? 's' : ''} need reconciliation with original receipts.',
                    style: GoogleFonts.poppins(
                        fontSize: 12, color: const Color(0xFFC2410C)),
                  ),
                ),
              ],
            ),
          ),
          ..._needReconciliation
              .map((s) => _buildSubmissionCard(s, showReconcileButton: true)),
        ],
      ),
    );
  }

  // ── History Tab ────────────────────────────────────────────────────────────

  Widget _buildHistoryTab() {
    final filterOptions = [
      {'value': 'all', 'labelEn': 'All', 'labelAr': 'الكل', 'color': 0xFF64748B},
      {'value': 'pending', 'labelEn': 'Pending', 'labelAr': 'معلق', 'color': 0xFFF59E0B},
      {'value': 'under_review', 'labelEn': 'Review', 'labelAr': 'مراجعة', 'color': 0xFF3B82F6},
      {'value': 'approved', 'labelEn': 'Approved', 'labelAr': 'معتمد', 'color': 0xFF10B981},
      {'value': 'rejected', 'labelEn': 'Rejected', 'labelAr': 'مرفوض', 'color': 0xFFEF4444},
      {'value': 'paid', 'labelEn': 'Paid', 'labelAr': 'مدفوع', 'color': 0xFF8B5CF6},
    ];

    if (_submissions.isEmpty) {
      return _buildEmptyState(
        icon: Icons.history_rounded,
        titleEn: 'No Submissions Yet',
        titleAr: 'لا توجد طلبات بعد',
        subtitleEn: 'Your submitted cost requests will appear here.',
        subtitleAr: 'ستظهر هنا طلبات التكاليف التي قدمتها.',
        actionLabel: _isArabic ? 'قدم طلباً' : 'Submit a Request',
        onAction: () => _tabController.animateTo(0),
      );
    }

    final filtered = _filteredHistory;

    return RefreshIndicator(
      onRefresh: _loadData,
      child: Column(
        children: [
          // Status filter chips
          Container(
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: filterOptions.map((f) {
                  final val = f['value'] as String;
                  final isActive = _historyFilter == val;
                  final color = Color(f['color'] as int);
                  return Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: GestureDetector(
                      onTap: () => setState(() => _historyFilter = val),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 6),
                        decoration: BoxDecoration(
                          color: isActive ? color : color.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                              color: isActive
                                  ? color
                                  : color.withValues(alpha: 0.3)),
                        ),
                        child: Text(
                          _isArabic
                              ? (f['labelAr'] as String)
                              : (f['labelEn'] as String),
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: isActive ? Colors.white : color,
                          ),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
          if (filtered.isEmpty)
            Expanded(
              child: _buildEmptyState(
                icon: Icons.search_off_rounded,
                titleEn: 'No Results',
                titleAr: 'لا توجد نتائج',
                subtitleEn: 'No submissions match this status filter.',
                subtitleAr: 'لا توجد طلبات تطابق هذا الفلتر.',
              ),
            )
          else
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: filtered.length,
                itemBuilder: (ctx, i) => _buildSubmissionCard(filtered[i]),
              ),
            ),
        ],
      ),
    );
  }

  // ── Submission Card ────────────────────────────────────────────────────────

  Widget _buildSubmissionCard(
    OperationalCostSubmission sub, {
    bool showReconcileButton = false,
  }) {
    final style = _statusStyle(sub.status);
    final color = Color(style['color'] as int);
    final bg = Color(style['bg'] as int);
    final bar = Color(style['bar'] as int);
    final catKey = sub.expenseCategory.value;
    final catMeta = _kCategoryMeta[catKey] ?? _kCategoryMeta['other']!;
    final catColor = Color(catMeta['color'] as int);
    final catIcon = catMeta['icon'] as IconData;

    final amountFmt = NumberFormat.currency(symbol: '', decimalDigits: 2)
        .format(sub.amountCents / 100.0);

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Left accent bar
              Container(width: 5, color: bar),

              // Card content
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Header: category icon + title + status badge
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: catColor.withValues(alpha: 0.12),
                              shape: BoxShape.circle,
                            ),
                            child: Icon(catIcon, color: catColor, size: 18),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _isArabic
                                      ? sub.expenseCategory.labelAr
                                      : sub.expenseCategory.labelEn,
                                  style: GoogleFonts.poppins(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 14,
                                    color: const Color(0xFF0F172A),
                                  ),
                                ),
                                if (sub.vendor != null && sub.vendor!.isNotEmpty)
                                  Text(
                                    sub.vendor!,
                                    style: GoogleFonts.poppins(
                                        fontSize: 11,
                                        color: const Color(0xFF64748B)),
                                  ),
                              ],
                            ),
                          ),
                          // Status badge
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: bg,
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(
                                  color: color.withValues(alpha: 0.4)),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(style['icon'] as IconData,
                                    size: 12, color: color),
                                const SizedBox(width: 4),
                                Text(
                                  _isArabic
                                      ? sub.status.labelAr
                                      : sub.status.labelEn,
                                  style: GoogleFonts.poppins(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: color,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 10),

                      // Amount + date row
                      Row(
                        children: [
                          Text(
                            '$amountFmt ${sub.currency}',
                            style: GoogleFonts.poppins(
                              fontSize: 20,
                              fontWeight: FontWeight.w800,
                              color: catColor,
                            ),
                          ),
                          const Spacer(),
                          Icon(Icons.calendar_today_outlined,
                              size: 13, color: Colors.grey.shade400),
                          const SizedBox(width: 4),
                          Text(
                            sub.expenseDate.isNotEmpty
                                ? DateFormat('dd MMM yyyy')
                                    .format(DateTime.parse(sub.expenseDate))
                                : '-',
                            style: GoogleFonts.poppins(
                                fontSize: 12,
                                color: Colors.grey.shade500),
                          ),
                        ],
                      ),

                      // Description
                      if (sub.description.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          sub.description,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.poppins(
                              fontSize: 12,
                              color: Colors.grey.shade600),
                        ),
                      ],

                      const SizedBox(height: 12),

                      // Approval stepper
                      _buildApprovalStepper(sub),

                      // Payment receipt proof (when admin has uploaded receipt)
                      if (sub.paymentProofUrl != null &&
                          sub.paymentProofUrl!.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        _buildPaymentProofCard(sub),
                      ],

                      // Fund receipt confirmation badge (for paid submissions)
                      if (sub.status == CostSubmissionStatus.paid ||
                          sub.paidAt != null) ...[
                        const SizedBox(height: 10),
                        _buildReceiptConfirmationBadge(sub),
                        if (!sub.fundReceiptConfirmed) ...[
                          const SizedBox(height: 8),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              onPressed: () => _confirmReceipt(sub),
                              icon: const Icon(Icons.check_circle_outline, size: 16),
                              label: Text(
                                _isArabic ? 'تأكيد استلام الدفعة' : 'Confirm Receipt',
                                style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                              ),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF10B981),
                                foregroundColor: Colors.white,
                                elevation: 0,
                                padding: const EdgeInsets.symmetric(vertical: 10),
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(10)),
                              ),
                            ),
                          ),
                        ],
                      ],

                      // Reconcile button
                      if (showReconcileButton) ...[
                        const SizedBox(height: 10),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            onPressed: () => _showReconciliationDialog(sub),
                            icon: const Icon(Icons.sync_alt_rounded, size: 16),
                            label: Text(
                              _isArabic ? 'تسوية' : 'Reconcile',
                              style: GoogleFonts.poppins(
                                  fontWeight: FontWeight.w600),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF0EA5E9),
                              foregroundColor: Colors.white,
                              elevation: 0,
                              padding:
                                  const EdgeInsets.symmetric(vertical: 10),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10)),
                            ),
                          ),
                        ),
                      ],

                      // Reference number
                      if (sub.referenceNumber != null &&
                          sub.referenceNumber!.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Icon(Icons.tag, size: 12, color: Colors.grey.shade400),
                            const SizedBox(width: 4),
                            Text(
                              sub.referenceNumber!,
                              style: GoogleFonts.poppins(
                                  fontSize: 11,
                                  color: Colors.grey.shade400,
                                  fontFamily: 'monospace'),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Approval Stepper ───────────────────────────────────────────────────────

  Widget _buildApprovalStepper(OperationalCostSubmission sub) {
    final t1 = _parseTier(sub.tier1Status);
    final t2 = _parseTier(sub.tier2Status);

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        children: [
          // Tier 1
          Expanded(child: _buildTierStep(1, t1, _isArabic ? 'المرحلة 1' : 'Tier 1')),
          // Connector
          _buildStepConnector(t1),
          // Tier 2
          Expanded(child: _buildTierStep(2, t2, _isArabic ? 'المرحلة 2' : 'Tier 2')),
          // Connector
          _buildStepConnector(t2),
          // Payment
          Expanded(child: _buildPaymentStep(sub)),
        ],
      ),
    );
  }

  Widget _buildStepConnector(TierApprovalStatus tier) {
    final done = tier == TierApprovalStatus.approved;
    return Container(
      height: 2,
      width: 16,
      color: done ? const Color(0xFF10B981) : const Color(0xFFE2E8F0),
    );
  }

  Widget _buildTierStep(int num, TierApprovalStatus status, String label) {
    Color color;
    IconData icon;
    switch (status) {
      case TierApprovalStatus.approved:
        color = const Color(0xFF10B981);
        icon = Icons.check_circle_rounded;
        break;
      case TierApprovalStatus.rejected:
        color = const Color(0xFFEF4444);
        icon = Icons.cancel_rounded;
        break;
      case TierApprovalStatus.changesRequested:
        color = const Color(0xFFF59E0B);
        icon = Icons.edit_note_rounded;
        break;
      default:
        color = const Color(0xFFCBD5E1);
        icon = Icons.radio_button_unchecked_rounded;
    }
    return Column(
      children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(height: 2),
        Text(
          label,
          textAlign: TextAlign.center,
          style: GoogleFonts.poppins(
              fontSize: 9, fontWeight: FontWeight.w600, color: color),
        ),
      ],
    );
  }

  Widget _buildPaymentStep(OperationalCostSubmission sub) {
    final paid = sub.status == CostSubmissionStatus.paid ||
        sub.status == CostSubmissionStatus.closed ||
        sub.status == CostSubmissionStatus.reconciled;
    final color =
        paid ? const Color(0xFF8B5CF6) : const Color(0xFFCBD5E1);
    return Column(
      children: [
        Icon(Icons.payments_outlined, color: color, size: 20),
        const SizedBox(height: 2),
        Text(
          _isArabic ? 'الدفع' : 'Payment',
          textAlign: TextAlign.center,
          style: GoogleFonts.poppins(
              fontSize: 9, fontWeight: FontWeight.w600, color: color),
        ),
      ],
    );
  }

  TierApprovalStatus _parseTier(dynamic val) {
    if (val == null) return TierApprovalStatus.pending;
    if (val is TierApprovalStatus) return val;
    final s = val.toString().toLowerCase();
    return TierApprovalStatus.values.firstWhere(
      (t) => t.toString().split('.').last.toLowerCase() == s,
      orElse: () => TierApprovalStatus.pending,
    );
  }

  // ── Payment Proof Card ────────────────────────────────────────────────────

  Widget _buildPaymentProofCard(OperationalCostSubmission sub) {
    final url = sub.paymentProofUrl!;
    final isPdf = url.toLowerCase().contains('.pdf');
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFF0FDF4),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFF6EE7B7)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.receipt_long_rounded, size: 14, color: Color(0xFF059669)),
              const SizedBox(width: 6),
              Text(
                _isArabic ? 'إيصال الدفع' : 'Payment Receipt',
                style: GoogleFonts.poppins(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: const Color(0xFF059669)),
              ),
              const Spacer(),
              GestureDetector(
                onTap: () async {
                  final uri = Uri.parse(url);
                  if (await canLaunchUrl(uri)) {
                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                  }
                },
                child: Text(
                  _isArabic ? 'فتح' : 'Open',
                  style: GoogleFonts.poppins(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF2563EB),
                      decoration: TextDecoration.underline),
                ),
              ),
            ],
          ),
          if (!isPdf) ...[
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: CachedNetworkImage(
                imageUrl: url,
                height: 100,
                width: double.infinity,
                fit: BoxFit.cover,
                placeholder: (ctx, u) => Container(
                  height: 100,
                  color: const Color(0xFFE2E8F0),
                  child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
                ),
                errorWidget: (ctx, u, e) => Container(
                  height: 100,
                  color: const Color(0xFFE2E8F0),
                  child: const Center(
                      child: Icon(Icons.broken_image_outlined, color: Color(0xFF94A3B8))),
                ),
              ),
            ),
          ] else ...[
            const SizedBox(height: 6),
            Row(children: [
              const Icon(Icons.picture_as_pdf_rounded, size: 16, color: Color(0xFFEF4444)),
              const SizedBox(width: 6),
              Text(
                _isArabic ? 'ملف PDF — اضغط فتح للعرض' : 'PDF file — tap Open to view',
                style: GoogleFonts.poppins(fontSize: 11, color: const Color(0xFF64748B)),
              ),
            ]),
          ],
        ],
      ),
    );
  }

  Future<void> _confirmReceipt(OperationalCostSubmission sub) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(_isArabic ? 'تأكيد الاستلام' : 'Confirm Receipt',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w700)),
        content: Text(
          _isArabic
              ? 'هل تؤكد أنك استلمت الدفعة بنجاح؟'
              : 'Do you confirm that you have received the payment?',
          style: GoogleFonts.poppins(fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(_isArabic ? 'إلغاء' : 'Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF10B981)),
            child: Text(_isArabic ? 'تأكيد' : 'Confirm',
                style: const TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await Supabase.instance.client
          .from('operational_cost_submissions')
          .update({
            'fund_receipt_confirmed': true,
            'fund_receipt_confirmed_at': DateTime.now().toIso8601String(),
          })
          .eq('id', sub.id);
      _showSnack(_isArabic ? 'تم تأكيد الاستلام بنجاح' : 'Receipt confirmed successfully');
      _loadData();
    } catch (e) {
      _showSnack(_isArabic ? 'فشل التأكيد' : 'Confirmation failed', isError: true);
    }
  }

  // ── Receipt Confirmation Badge ─────────────────────────────────────────────

  Widget _buildReceiptConfirmationBadge(OperationalCostSubmission sub) {
    if (sub.fundReceiptConfirmed) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.green.shade50,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Colors.green.shade200),
        ),
        child: Row(
          children: [
            Icon(Icons.verified_rounded, color: Colors.green.shade700, size: 16),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _isArabic ? 'تم تأكيد استلام الدفعة ✓' : 'Receipt confirmed ✓',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: Colors.green.shade700,
                    ),
                  ),
                  if (sub.fundReceiptConfirmedAt != null)
                    Text(
                      DateFormat('dd MMM yyyy, HH:mm').format(
                        DateTime.parse(sub.fundReceiptConfirmedAt!).toLocal(),
                      ),
                      style: GoogleFonts.poppins(
                          fontSize: 10, color: Colors.green.shade600),
                    ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.amber.shade50,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.amber.shade300),
      ),
      child: Row(
        children: [
          Icon(Icons.hourglass_top_rounded,
              color: Colors.amber.shade700, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              _isArabic
                  ? 'بانتظار تأكيد الاستلام من المستلم'
                  : 'Awaiting receipt confirmation from recipient',
              style: GoogleFonts.poppins(
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
                color: Colors.amber.shade800,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Empty State ────────────────────────────────────────────────────────────

  Widget _buildEmptyState({
    required IconData icon,
    required String titleEn,
    required String titleAr,
    required String subtitleEn,
    required String subtitleAr,
    String? actionLabel,
    VoidCallback? onAction,
  }) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: const Color(0xFFF1F5F9),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 40, color: const Color(0xFF94A3B8)),
            ),
            const SizedBox(height: 16),
            Text(
              _isArabic ? titleAr : titleEn,
              style: GoogleFonts.poppins(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: const Color(0xFF0F172A)),
            ),
            const SizedBox(height: 6),
            Text(
              _isArabic ? subtitleAr : subtitleEn,
              textAlign: TextAlign.center,
              style: GoogleFonts.poppins(
                  fontSize: 13, color: const Color(0xFF64748B)),
            ),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: onAction,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primaryBlue,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                      horizontal: 24, vertical: 12),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                ),
                child: Text(actionLabel,
                    style: GoogleFonts.poppins(fontWeight: FontWeight.w600)),
              ),
            ],
          ],
        ),
      ),
    );
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  Future<void> _handleSubmit(Map<String, dynamic> formData) async {
    try {
      final docs =
          formData['supportingDocuments'] as List<SupportingDocument>? ?? [];
      await _costService.submitOperationalCost(
        expenseCategory:
            formData['expenseCategory'] as OperationalExpenseCategory,
        amountCents: formData['amountCents'] as int,
        description: formData['description'] as String,
        expenseDate: formData['expenseDate'] as String,
        hubId: formData['hubId'] as String?,
        projectId: formData['projectId'] as String?,
        vendor: formData['vendor'] as String?,
        referenceNumber: formData['referenceNumber'] as String?,
        currency: formData['currency'] as String? ?? 'SDG',
        supportingDocuments: docs,
        submitterRole: _userRole,
      );
      _showSnack(
          _isArabic ? 'تم تقديم المصروف بنجاح ✓' : 'Expense submitted ✓');
      await _loadData();
      _tabController.animateTo(3);
    } catch (_) {
      _showSnack(
          _isArabic ? 'فشل في تقديم المصروف' : 'Failed to submit expense',
          isError: true);
    }
  }

  void _showReconciliationDialog(OperationalCostSubmission sub) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            const Icon(Icons.sync_alt_rounded, color: Color(0xFF0EA5E9)),
            const SizedBox(width: 8),
            Text(
              _isArabic ? 'تسوية' : 'Reconciliation',
              style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
            ),
          ],
        ),
        content: Text(
          _isArabic
              ? 'سيتم إضافة نموذج التسوية قريباً. يرجى تقديم الإيصالات الأصلية للمحاسب.'
              : 'Reconciliation form coming soon. Please submit original receipts to the finance officer.',
          style: GoogleFonts.poppins(fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(_isArabic ? 'إغلاق' : 'Close',
                style: GoogleFonts.poppins(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}

// ─── Quick stat widget (used in header) ───────────────────────────────────────

class _QuickStat extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final bool highlight;

  const _QuickStat({
    required this.label,
    required this.value,
    required this.icon,
    this.highlight = false,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        decoration: BoxDecoration(
          color: highlight
              ? Colors.orange.shade400.withValues(alpha: 0.25)
              : Colors.white.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
              color: highlight
                  ? Colors.orange.shade300.withValues(alpha: 0.5)
                  : Colors.white.withValues(alpha: 0.2)),
        ),
        child: Column(
          children: [
            Icon(icon, size: 14, color: Colors.white70),
            const SizedBox(height: 2),
            Text(
              value,
              style: GoogleFonts.poppins(
                color: Colors.white,
                fontSize: 15,
                fontWeight: FontWeight.w800,
              ),
            ),
            Text(
              label,
              style: GoogleFonts.poppins(
                  color: Colors.white60, fontSize: 9, fontWeight: FontWeight.w500),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Tab chip (animated, with optional badge count) ──────────────────────────

class _TabChip extends StatefulWidget {
  final TabController controller;
  final int index;
  final IconData icon;
  final String labelEn;
  final String labelAr;
  final int badge;
  final Color badgeColor;
  final bool isArabic;

  const _TabChip({
    required this.controller,
    required this.index,
    required this.icon,
    required this.labelEn,
    required this.labelAr,
    this.badge = 0,
    this.badgeColor = Colors.grey,
    required this.isArabic,
  });

  @override
  State<_TabChip> createState() => _TabChipState();
}

class _TabChipState extends State<_TabChip> {
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onTabChange);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onTabChange);
    super.dispose();
  }

  void _onTabChange() => setState(() {});

  @override
  Widget build(BuildContext context) {
    final isActive = widget.controller.index == widget.index;
    return GestureDetector(
      onTap: () => widget.controller.animateTo(widget.index),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            padding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: isActive ? AppColors.primaryBlue : const Color(0xFFF1F5F9),
              borderRadius: BorderRadius.circular(22),
              border: Border.all(
                  color: isActive
                      ? AppColors.primaryBlue
                      : const Color(0xFFE2E8F0)),
              boxShadow: isActive
                  ? [
                      BoxShadow(
                        color: AppColors.primaryBlue.withValues(alpha: 0.3),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      )
                    ]
                  : [],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  widget.icon,
                  size: 15,
                  color: isActive ? Colors.white : const Color(0xFF64748B),
                ),
                const SizedBox(width: 6),
                Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.isArabic ? widget.labelAr : widget.labelEn,
                      style: GoogleFonts.poppins(
                        fontSize: widget.isArabic ? 12 : 11,
                        fontWeight: FontWeight.w700,
                        color: isActive ? Colors.white : const Color(0xFF475569),
                      ),
                    ),
                    Text(
                      widget.isArabic ? widget.labelEn : widget.labelAr,
                      style: GoogleFonts.poppins(
                        fontSize: 9,
                        fontWeight: FontWeight.w500,
                        color: isActive
                            ? Colors.white60
                            : const Color(0xFF94A3B8),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          // Badge
          if (widget.badge > 0)
            Positioned(
              top: -4,
              right: -4,
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 5, vertical: 1),
                decoration: BoxDecoration(
                  color: widget.badgeColor,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.white, width: 1.5),
                ),
                child: Text(
                  widget.badge > 99 ? '99+' : widget.badge.toString(),
                  style: GoogleFonts.poppins(
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                      color: Colors.white),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ─── Operational Cost Form ────────────────────────────────────────────────────

class OperationalCostForm extends StatefulWidget {
  final bool isArabic;
  final String? hubId;
  final String? projectId;
  final String userRole;
  final Function(Map<String, dynamic>) onSubmit;

  const OperationalCostForm({
    Key? key,
    required this.isArabic,
    this.hubId,
    this.projectId,
    required this.userRole,
    required this.onSubmit,
  }) : super(key: key);

  @override
  State<OperationalCostForm> createState() => _OperationalCostFormState();
}

class _OperationalCostFormState extends State<OperationalCostForm> {
  final _formKey = GlobalKey<FormState>();
  OperationalExpenseCategory? _selectedCategory;
  final _amountController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _vendorController = TextEditingController();
  final _referenceController = TextEditingController();
  DateTime _expenseDate = DateTime.now();
  String _currency = 'SDG';
  List<SupportingDocument> _documents = [];
  bool _isSubmitting = false;

  @override
  void dispose() {
    _amountController.dispose();
    _descriptionController.dispose();
    _vendorController.dispose();
    _referenceController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ar = widget.isArabic;

    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Category Grid ────────────────────────────────────────────────
          Text(
            ar ? 'فئة المصروف' : 'Expense Category',
            style: GoogleFonts.poppins(
                fontWeight: FontWeight.w700, fontSize: 13),
          ),
          const SizedBox(height: 8),
          _buildCategoryGrid(ar),
          if (_selectedCategory == null && _formKey.currentState != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                ar ? 'يرجى اختيار فئة' : 'Please select a category',
                style:
                    const TextStyle(fontSize: 11, color: Color(0xFFEF4444)),
              ),
            ),
          const SizedBox(height: 16),

          // ── Amount + Currency row ────────────────────────────────────────
          Row(
            children: [
              Expanded(
                flex: 3,
                child: TextFormField(
                  controller: _amountController,
                  decoration: _inputDec(
                    label: ar ? 'المبلغ' : 'Amount',
                    icon: Icons.attach_money_rounded,
                  ),
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(
                        RegExp(r'^\d+\.?\d{0,2}')),
                  ],
                  validator: (v) {
                    if (v == null || v.isEmpty)
                      return ar ? 'مطلوب' : 'Required';
                    if ((double.tryParse(v) ?? 0) <= 0)
                      return ar ? 'مبلغ صحيح' : 'Valid amount';
                    return null;
                  },
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                flex: 2,
                child: DropdownButtonFormField<String>(
                  value: _currency,
                  decoration:
                      _inputDec(label: ar ? 'العملة' : 'Currency', icon: null),
                  items: const [
                    DropdownMenuItem(value: 'SDG', child: Text('SDG')),
                    DropdownMenuItem(value: 'USD', child: Text('USD')),
                    DropdownMenuItem(value: 'EUR', child: Text('EUR')),
                  ],
                  onChanged: (v) {
                    if (v != null) setState(() => _currency = v);
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // ── Description ──────────────────────────────────────────────────
          TextFormField(
            controller: _descriptionController,
            decoration: _inputDec(
              label: ar ? 'وصف المصروف' : 'Description',
              icon: Icons.notes_rounded,
            ),
            maxLines: 3,
            validator: (v) =>
                (v == null || v.isEmpty) ? (ar ? 'مطلوب' : 'Required') : null,
          ),
          const SizedBox(height: 14),

          // ── Date picker ──────────────────────────────────────────────────
          InkWell(
            onTap: _selectDate,
            borderRadius: BorderRadius.circular(10),
            child: InputDecorator(
              decoration: _inputDec(
                label: ar ? 'تاريخ المصروف' : 'Expense Date',
                icon: Icons.calendar_today_outlined,
              ),
              child: Text(
                DateFormat(ar ? 'dd/MM/yyyy' : 'MMM dd, yyyy')
                    .format(_expenseDate),
                style: GoogleFonts.poppins(
                    fontSize: 14, color: const Color(0xFF0F172A)),
              ),
            ),
          ),
          const SizedBox(height: 14),

          // ── Vendor ───────────────────────────────────────────────────────
          TextFormField(
            controller: _vendorController,
            decoration: _inputDec(
              label: ar ? 'المورد (اختياري)' : 'Vendor / Supplier (Optional)',
              icon: Icons.store_outlined,
            ),
          ),
          const SizedBox(height: 14),

          // ── Reference ────────────────────────────────────────────────────
          TextFormField(
            controller: _referenceController,
            decoration: _inputDec(
              label: ar ? 'رقم المرجع (اختياري)' : 'Reference # (Optional)',
              icon: Icons.tag_rounded,
            ),
          ),
          const SizedBox(height: 14),

          // ── Documents ────────────────────────────────────────────────────
          _buildDocumentSection(ar),
          const SizedBox(height: 24),

          // ── Submit button ────────────────────────────────────────────────
          SizedBox(
            height: 50,
            child: ElevatedButton.icon(
              onPressed: _isSubmitting ? null : _submit,
              icon: _isSubmitting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.send_rounded, size: 18),
              label: Text(
                _isSubmitting
                    ? (ar ? 'جاري التقديم...' : 'Submitting...')
                    : (ar ? 'تقديم الطلب' : 'Submit Request'),
                style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w700, fontSize: 14),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryBlue,
                foregroundColor: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Category grid ──────────────────────────────────────────────────────────

  Widget _buildCategoryGrid(bool ar) {
    final cats = OperationalExpenseCategory.values;
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: cats.map((cat) {
        final isSelected = _selectedCategory == cat;
        final meta = _kCategoryMeta[cat.value] ?? _kCategoryMeta['other']!;
        final color = Color(meta['color'] as int);
        final icon = meta['icon'] as IconData;

        return GestureDetector(
          onTap: () => setState(() => _selectedCategory = cat),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: isSelected ? color : color.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                  color: isSelected
                      ? color
                      : color.withValues(alpha: 0.25),
                  width: isSelected ? 2 : 1),
              boxShadow: isSelected
                  ? [
                      BoxShadow(
                          color: color.withValues(alpha: 0.3),
                          blurRadius: 6,
                          offset: const Offset(0, 2))
                    ]
                  : [],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon,
                    size: 15,
                    color: isSelected ? Colors.white : color),
                const SizedBox(width: 6),
                Text(
                  ar ? cat.labelAr : cat.labelEn,
                  style: GoogleFonts.poppins(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: isSelected ? Colors.white : color,
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }

  // ── Documents section ──────────────────────────────────────────────────────

  Widget _buildDocumentSection(bool ar) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.attach_file_rounded,
                  size: 16, color: Color(0xFF475569)),
              const SizedBox(width: 6),
              Text(
                ar ? 'المستندات الداعمة' : 'Supporting Documents',
                style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                    color: const Color(0xFF0F172A)),
              ),
              const Spacer(),
              if (_documents.isNotEmpty)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.primaryBlue.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '${_documents.length}',
                    style: GoogleFonts.poppins(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppColors.primaryBlue),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          if (_documents.isEmpty)
            InkWell(
              onTap: _pickDocument,
              borderRadius: BorderRadius.circular(10),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 20),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                      color: const Color(0xFFCBD5E1),
                      style: BorderStyle.solid),
                ),
                child: Column(
                  children: [
                    const Icon(Icons.cloud_upload_outlined,
                        size: 36, color: Color(0xFF94A3B8)),
                    const SizedBox(height: 6),
                    Text(
                      ar ? 'اضغط لرفع مستند' : 'Tap to upload',
                      style: GoogleFonts.poppins(
                          color: const Color(0xFF64748B),
                          fontWeight: FontWeight.w600),
                    ),
                    Text(
                      ar ? 'إيصالات، فواتير، صور' : 'Receipts, invoices, photos',
                      style: GoogleFonts.poppins(
                          fontSize: 11, color: const Color(0xFF94A3B8)),
                    ),
                  ],
                ),
              ),
            )
          else ...[
            ..._documents.map((doc) => Container(
                  margin: const EdgeInsets.only(bottom: 6),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.insert_drive_file_outlined,
                          size: 16, color: Color(0xFF3B82F6)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          doc.filename,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.poppins(fontSize: 12),
                        ),
                      ),
                      IconButton(
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        icon: const Icon(Icons.close_rounded,
                            size: 16, color: Color(0xFFEF4444)),
                        onPressed: () =>
                            setState(() => _documents.remove(doc)),
                      ),
                    ],
                  ),
                )),
            TextButton.icon(
              onPressed: _pickDocument,
              icon: const Icon(Icons.add, size: 14),
              label: Text(ar ? 'إضافة مستند آخر' : 'Add another document',
                  style: GoogleFonts.poppins(fontSize: 12)),
            ),
          ],
        ],
      ),
    );
  }

  // ── Input decoration helper ────────────────────────────────────────────────

  InputDecoration _inputDec({required String label, IconData? icon}) {
    return InputDecoration(
      labelText: label,
      labelStyle: GoogleFonts.poppins(fontSize: 13),
      prefixIcon: icon != null ? Icon(icon, size: 18) : null,
      filled: true,
      fillColor: Colors.white,
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide:
            BorderSide(color: AppColors.primaryBlue, width: 1.5),
      ),
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  Future<void> _selectDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _expenseDate,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _expenseDate = picked);
  }

  Future<void> _pickDocument() async {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(
        widget.isArabic
            ? 'سيتم إضافة رفع المستندات قريباً'
            : 'Document upload coming soon',
        style: GoogleFonts.poppins(fontSize: 13),
      ),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      margin: const EdgeInsets.all(12),
    ));
  }

  Future<void> _submit() async {
    if (_selectedCategory == null) {
      setState(() {});
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
            widget.isArabic ? 'يرجى اختيار فئة المصروف' : 'Please select a category'),
        backgroundColor: Colors.red.shade600,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        margin: const EdgeInsets.all(12),
      ));
      return;
    }
    if (!_formKey.currentState!.validate()) return;
    if (_documents.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(widget.isArabic
            ? 'يرجى رفع مستند داعم واحد على الأقل'
            : 'Please upload at least one supporting document'),
        backgroundColor: Colors.red.shade600,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        margin: const EdgeInsets.all(12),
      ));
      return;
    }

    setState(() => _isSubmitting = true);
    try {
      final amount = double.parse(_amountController.text);
      await widget.onSubmit({
        'expenseCategory': _selectedCategory,
        'amountCents': (amount * 100).round(),
        'currency': _currency,
        'description': _descriptionController.text.trim(),
        'expenseDate': DateFormat('yyyy-MM-dd').format(_expenseDate),
        'vendor': _vendorController.text.trim().isNotEmpty
            ? _vendorController.text.trim()
            : null,
        'referenceNumber': _referenceController.text.trim().isNotEmpty
            ? _referenceController.text.trim()
            : null,
        'hubId': widget.hubId,
        'projectId': widget.projectId,
        'supportingDocuments': _documents,
      });
      // Reset form
      _formKey.currentState!.reset();
      _amountController.clear();
      _descriptionController.clear();
      _vendorController.clear();
      _referenceController.clear();
      setState(() {
        _selectedCategory = null;
        _expenseDate = DateTime.now();
        _documents = [];
      });
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }
}
