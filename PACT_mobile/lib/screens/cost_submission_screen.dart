import 'dart:io';
import 'dart:convert' show utf8;
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:csv/csv.dart';
import 'package:file_picker/file_picker.dart';
import '../utils/file_downloader.dart';
import 'package:flutter/services.dart'
    show Clipboard, ClipboardData, rootBundle;
import '../models/cost_submission.dart' as ops;
import '../models/operational_cost_submission.dart';
import 'package:uuid/uuid.dart';
import '../providers/auth_provider.dart';
import '../widgets/custom_drawer_menu.dart';
import '../widgets/reusable_app_bar.dart';

// ─────────────────────────────────────────────────────────────
// Local helpers
// ─────────────────────────────────────────────────────────────

class _Project {
  final String id;
  final String name;
  const _Project({required this.id, required this.name});
}

// ─────────────────────────────────────────────────────────────
// Line item model  (mirrors createEmptyItem() in React)
// ─────────────────────────────────────────────────────────────

class _LineItem {
  final String id;
  ExpenseCategory category = ExpenseCategory.other;
  String expenseDate;
  final TextEditingController titleCtrl;
  final TextEditingController quantityCtrl;
  final TextEditingController unitCostCtrl;
  final TextEditingController descriptionCtrl;
  final TextEditingController justificationCtrl;
  final TextEditingController vendorCtrl;
  final TextEditingController referenceCtrl;

  _LineItem({required this.id, String? expenseDate})
    : titleCtrl = TextEditingController(),
      quantityCtrl = TextEditingController(text: '1'),
      unitCostCtrl = TextEditingController(),
      descriptionCtrl = TextEditingController(),
      justificationCtrl = TextEditingController(),
      vendorCtrl = TextEditingController(),
      referenceCtrl = TextEditingController(),
      expenseDate =
          expenseDate ?? DateTime.now().toIso8601String().split('T')[0];

  void dispose() {
    titleCtrl.dispose();
    quantityCtrl.dispose();
    unitCostCtrl.dispose();
    descriptionCtrl.dispose();
    justificationCtrl.dispose();
    vendorCtrl.dispose();
    referenceCtrl.dispose();
  }

  double get quantity => double.tryParse(quantityCtrl.text.trim()) ?? 1;
  double get unitCost => double.tryParse(unitCostCtrl.text.trim()) ?? 0;
  double get totalSdg => quantity * unitCost;
  int get amountCents => (totalSdg * 100).round();
}

// Category icon metadata  (mirrors EXPENSE_CATEGORIES in React)
IconData _catIcon(ExpenseCategory cat) {
  switch (cat) {
    case ExpenseCategory.permits:
      return Icons.badge;
    case ExpenseCategory.incentives:
      return Icons.card_giftcard;
    case ExpenseCategory.communications:
      return Icons.wifi;
    case ExpenseCategory.training:
      return Icons.school;
    case ExpenseCategory.transport:
      return Icons.directions_car;
    case ExpenseCategory.equipment:
      return Icons.inventory_2;
    case ExpenseCategory.printing:
      return Icons.print;
    case ExpenseCategory.meetings:
      return Icons.coffee;
    case ExpenseCategory.officeAdmin:
      return Icons.business_center;
    case ExpenseCategory.other:
      return Icons.more_horiz;
  }
}

Color _catColor(ExpenseCategory cat) {
  switch (cat) {
    case ExpenseCategory.permits:
      return Colors.purple;
    case ExpenseCategory.incentives:
      return Colors.pink;
    case ExpenseCategory.communications:
      return Colors.blue;
    case ExpenseCategory.training:
      return Colors.green;
    case ExpenseCategory.transport:
      return Colors.orange;
    case ExpenseCategory.equipment:
      return Colors.cyan;
    case ExpenseCategory.printing:
      return Colors.blueGrey;
    case ExpenseCategory.meetings:
      return Colors.amber;
    case ExpenseCategory.officeAdmin:
      return Colors.indigo;
    case ExpenseCategory.other:
      return Colors.grey;
  }
}

// ─────────────────────────────────────────────────────────────
// Providers
// ─────────────────────────────────────────────────────────────

final _userProjectsProvider = FutureProvider.autoDispose<List<_Project>>((
  ref,
) async {
  final userId = ref.watch(currentUserIdProvider);
  if (userId == null || userId.isEmpty) return [];
  try {
    final supabase = ref.watch(supabaseClientProvider);
    final response = await supabase
        .from('projects')
        .select('id, name')
        .order('name');
    return (response as List)
        .map(
          (p) => _Project(
            id: p['id'].toString(),
            name: p['name']?.toString() ?? '',
          ),
        )
        .toList();
  } catch (_) {
    return [];
  }
});

final _outstandingAdvancesProvider =
    FutureProvider.autoDispose<List<OperationalCostSubmission>>((ref) async {
      final userId = ref.watch(currentUserIdProvider);
      if (userId == null || userId.isEmpty) return [];
      try {
        final supabase = ref.watch(supabaseClientProvider);
        final response = await supabase
            .from('operational_cost_submissions')
            .select()
            .eq('user_id', userId)
            .eq('funding_type', 'advance')
            .eq('status', 'paid')
            .eq('is_reconciled', false)
            .order('created_at', ascending: false);
        return (response as List)
            .map(
              (j) =>
                  OperationalCostSubmission.fromJson(j as Map<String, dynamic>),
            )
            .toList();
      } catch (_) {
        return [];
      }
    });

final _submissionHistoryProvider =
    FutureProvider.autoDispose<List<OperationalCostSubmission>>((ref) async {
      final userId = ref.watch(currentUserIdProvider);
      if (userId == null || userId.isEmpty) return [];
      try {
        final supabase = ref.watch(supabaseClientProvider);
        final response = await supabase
            .from('operational_cost_submissions')
            .select()
            .eq('user_id', userId)
            .order('created_at', ascending: false)
            .limit(50);
        return (response as List)
            .map(
              (j) =>
                  OperationalCostSubmission.fromJson(j as Map<String, dynamic>),
            )
            .toList();
      } catch (_) {
        return [];
      }
    });

// ─────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────

class CostSubmissionScreen extends ConsumerStatefulWidget {
  final String? userRole;
  final bool isArabic;

  const CostSubmissionScreen({super.key, this.userRole, this.isArabic = false});

  @override
  ConsumerState<CostSubmissionScreen> createState() =>
      _CostSubmissionScreenState();
}

class _CostSubmissionScreenState extends ConsumerState<CostSubmissionScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = widget.isArabic;

    return Scaffold(
      key: _scaffoldKey,
      drawer: CustomDrawerMenu(
        currentUser: Supabase.instance.client.auth.currentUser,
        onClose: () => _scaffoldKey.currentState?.closeDrawer(),
      ),
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: isArabic ? 'طلبات التكاليف' : 'Cost Requests',
              scaffoldKey: _scaffoldKey,
            ),
            Container(
              color: Colors.grey.shade100,
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: TabBar(
                  controller: _tabController,
                  isScrollable: true,
                  tabs: [
                    Tab(text: isArabic ? '📝 تقديم الطلب' : '📝 Submit'),
                    Tab(text: isArabic ? '⏳ المستحقات' : '⏳ Outstanding'),
                    Tab(text: isArabic ? '🔄 التسوية' : '🔄 Reconcile'),
                    Tab(text: isArabic ? '📋 السجل' : '📋 History'),
                  ],
                ),
              ),
            ),
            Expanded(
              child: TabBarView(
                controller: _tabController,
                children: [
                  _CostRequestForm(isArabic: isArabic),
                  _OutstandingTab(isArabic: isArabic),
                  _ReconciliationTab(isArabic: isArabic),
                  _HistoryTab(isArabic: isArabic),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Tab 1 — New Cost Request  (mirrors CostRequestForm.tsx)
// ─────────────────────────────────────────────────────────────

class _CostRequestForm extends ConsumerStatefulWidget {
  final bool isArabic;
  const _CostRequestForm({this.isArabic = false});

  @override
  ConsumerState<_CostRequestForm> createState() => _CostRequestFormState();
}

class _CostRequestFormState extends ConsumerState<_CostRequestForm> {
  final _formKey = GlobalKey<FormState>();

  FundingType _requestType = FundingType.advance;
  String? _selectedProjectId;
  DateTime _requestDate = DateTime.now();
  final _titleCtrl = TextEditingController();
  String _currency = 'SDG';
  final _justificationCtrl = TextEditingController();
  List<_LineItem> _lineItems = [];
  List<ops.SupportingDocument> _justificationDocs = [];
  List<ops.SupportingDocument> _reconciliationDocs = [];
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _lineItems = [_LineItem(id: const Uuid().v4())];
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _justificationCtrl.dispose();
    for (final item in _lineItems) {
      item.dispose();
    }
    super.dispose();
  }

  List<ops.SupportingDocument> get _activeDocs =>
      _requestType == FundingType.advance
      ? _justificationDocs
      : _reconciliationDocs;

  void _setActiveDocs(List<ops.SupportingDocument> docs) => setState(() {
    if (_requestType == FundingType.advance) {
      _justificationDocs = docs;
    } else {
      _reconciliationDocs = docs;
    }
  });

  /// Create and download/share a real Excel (.xlsx) template when the user taps "Download Template".
  Future<void> _downloadTemplate() async {
    final isArabic = widget.isArabic;

    final headers = [
      'Category',
      'Title',
      'Quantity',
      'Unit Cost',
      'Currency',
      'Description',
      'Justification',
      'Vendor (Optional)',
      'Reference # (Optional)',
      'Other Category Detail (if Other)',
    ];

    final rows = [
      [
        'Training',
        'Workshop materials for data collectors',
        '5',
        '2500',
        'SDG',
        'Purchase of notebooks, pens, and reference guides for field training workshop',
        'Required for upcoming Q2 training session with new field staff',
        'Al-Nour Supplies',
        'INV-2025-001',
        '',
      ],
      [
        'Transportation',
        'Vehicle rental for site visits',
        '3',
        '15000',
        'SDG',
        'Rental of 4x4 vehicles for remote site access during monitoring visits',
        'Sites are inaccessible by public transport, vehicles needed for 3-day field trip',
        'Sudan Car Rental',
        'SCR-4521',
        '',
      ],
      [
        'Other',
        'Office generator fuel',
        '10',
        '500',
        'SDG',
        'Diesel fuel for backup generator during power outages',
        'Essential for maintaining operations during frequent power cuts',
        'Local Fuel Station',
        'FUEL-2025-045',
        'Generator Maintenance this is the template that shouls be downloaded as an excel when someone taps download template',
      ],
    ];

    // Prefer the bundled asset CSV template (assets/images/cost_submission_template.csv).
    try {
      // Load the asset as a string directly to ensure proper UTF-8 encoding
      final csvString = await rootBundle.loadString(
        'assets/images/cost_submission_template.csv',
      );
      // Add UTF-8 BOM so Excel recognises the file as UTF-8 text
      const bom = '\uFEFF';
      final csvWithBom = bom + csvString;
      final bytes = utf8.encode(csvWithBom);
      const fileName = 'cost_submission_template.csv';
      await downloadFileBytes(
        bytes,
        fileName,
        mimeType: 'text/csv;charset=utf-8',
      );
      return;
    } catch (e) {
      // If asset isn't available for any reason, fall back to generating CSV on the fly.
      final csv = const ListToCsvConverter().convert([headers, ...rows]);
      const fileName = 'cost_submission_template.csv';
      try {
        await downloadFileBytes(
          utf8.encode('\uFEFF$csv'),
          fileName,
          mimeType: 'text/csv;charset=utf-8',
        );
        return;
      } catch (_) {
        if (kIsWeb) {
          await Clipboard.setData(ClipboardData(text: csv));
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  isArabic
                      ? 'تم نسخ قالب CSV إلى الحافظة — الصقه في Excel واحفظه كـ .csv'
                      : 'CSV template copied to clipboard. Paste into Excel and save as .csv',
                ),
              ),
            );
          }
          return;
        }
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                isArabic ? 'فشل تنزيل القالب' : 'Failed to download template',
              ),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }
  }

  Future<void> _uploadCsv() async {
    final isArabic = widget.isArabic;

    try {
      // Pick CSV file
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['csv'],
        allowMultiple: false,
      );

      if (result == null || result.files.isEmpty) return;

      final file = result.files.first;
      String csvContent;

      if (kIsWeb) {
        // For web, file.bytes contains the data
        if (file.bytes == null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                isArabic ? 'فشل قراءة الملف' : 'Failed to read file',
              ),
              backgroundColor: Colors.red,
            ),
          );
          return;
        }
        csvContent = utf8.decode(file.bytes!);
      } else {
        // For mobile/desktop, read from file path
        final fileObj = File(file.path!);
        csvContent = await fileObj.readAsString();
      }

      // Parse CSV
      final csvData = const CsvToListConverter().convert(csvContent);

      if (csvData.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(isArabic ? 'الملف فارغ' : 'File is empty'),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }

      // Skip header row
      final dataRows = csvData.skip(1).toList();

      // Process each row
      final newItems = <_LineItem>[];
      for (final row in dataRows) {
        if (row.isEmpty) continue;

        final categoryStr = row.isNotEmpty
            ? row[0]?.toString().toLowerCase().trim() ?? ''
            : '';
        final title = row.length > 1 ? row[1]?.toString() ?? '' : '';
        final quantityStr = row.length > 2 ? row[2]?.toString() ?? '1' : '1';
        final unitCostStr = row.length > 3 ? row[3]?.toString() ?? '0' : '0';
        final description = row.length > 5 ? row[5]?.toString() ?? '' : '';
        final justification = row.length > 6 ? row[6]?.toString() ?? '' : '';
        final vendor = row.length > 7 ? row[7]?.toString() ?? '' : '';
        final reference = row.length > 8 ? row[8]?.toString() ?? '' : '';

        // Map CSV string to ExpenseCategory enum
        ExpenseCategory mappedCategory;
        switch (categoryStr) {
          case 'training':
            mappedCategory = ExpenseCategory.training;
            break;
          case 'transportation':
          case 'transport':
          case 'general_transport':
            mappedCategory = ExpenseCategory.transport;
            break;
          case 'permits':
            mappedCategory = ExpenseCategory.permits;
            break;
          case 'incentives':
            mappedCategory = ExpenseCategory.incentives;
            break;
          case 'communications':
            mappedCategory = ExpenseCategory.communications;
            break;
          case 'equipment':
            mappedCategory = ExpenseCategory.equipment;
            break;
          case 'printing':
            mappedCategory = ExpenseCategory.printing;
            break;
          case 'meetings':
            mappedCategory = ExpenseCategory.meetings;
            break;
          case 'office':
          case 'office_admin':
          case 'officeadmin':
            mappedCategory = ExpenseCategory.officeAdmin;
            break;
          default:
            mappedCategory = ExpenseCategory.other;
        }

        // Create item with correct constructor, then populate controllers
        final item = _LineItem(id: const Uuid().v4());
        item.category = mappedCategory;
        item.titleCtrl.text = title;
        item.quantityCtrl.text = quantityStr;
        item.unitCostCtrl.text = unitCostStr;
        item.descriptionCtrl.text = description;
        item.justificationCtrl.text = justification;
        item.vendorCtrl.text = vendor;
        item.referenceCtrl.text = reference;

        newItems.add(item);
      }

      setState(() {
        _lineItems
          ..clear()
          ..addAll(newItems);
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              isArabic
                  ? 'تم استيراد ${dataRows.length} عنصر من CSV'
                  : 'Imported ${dataRows.length} items from CSV',
            ),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            isArabic
                ? 'فشل في استيراد CSV: ${e.toString()}'
                : 'Failed to import CSV: ${e.toString()}',
          ),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_requestType == FundingType.reimbursement &&
        _reconciliationDocs.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.isArabic
                ? 'يرجى تحميل إيصال واحد على الأقل'
                : 'Please upload at least one receipt for reimbursement',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }
    final userId = ref.read(currentUserIdProvider);
    if (userId == null) return;
    setState(() => _isSubmitting = true);
    try {
      final supabase = ref.read(supabaseClientProvider);

      // Fetch user's hub_id from profiles table
      final profileResponse = await supabase
          .from('profiles')
          .select('hub_id')
          .eq('id', userId)
          .maybeSingle();

      final rawHubId = profileResponse?['hub_id']?.toString();
      String? userHubId = rawHubId;

      // Guard against stale profile hub references that no longer exist.
      // Avoid failing submission with FK violation; allow nullable hub_id.
      if (rawHubId != null && rawHubId.isNotEmpty) {
        try {
          final hubExists = await supabase
              .from('hubs')
              .select('id')
              .eq('id', rawHubId)
              .maybeSingle();
          if (hubExists == null) {
            userHubId = null;
            debugPrint(
              '[CostSubmission] Profile hub_id "$rawHubId" not found in hubs table; submitting with null hub_id.',
            );
          }
        } catch (_) {
          // If hub lookup fails unexpectedly, keep original value and let server validate.
          userHubId = rawHubId;
        }
      }

      final allDocs = [..._justificationDocs, ..._reconciliationDocs];
      for (final item in _lineItems) {
        final desc = item.titleCtrl.text.trim().isNotEmpty
            ? item.titleCtrl.text.trim()
            : _titleCtrl.text.trim();
        await supabase.from('operational_cost_submissions').insert({
          'submitted_by': userId,
          'hub_id': userHubId,
          'project_id': _selectedProjectId,
          'expense_category': item.category.dbValue,
          'submitter_role': 'enumerator', // Default role for field staff
          'amount_cents': item.amountCents,
          'currency': _currency,
          'description': desc,
          'vendor': item.vendorCtrl.text.trim().isNotEmpty
              ? item.vendorCtrl.text.trim()
              : null,
          'reference_number': item.referenceCtrl.text.trim().isNotEmpty
              ? item.referenceCtrl.text.trim()
              : null,
          'expense_date': item.expenseDate,
          'status': 'pending',
          'supporting_documents': allDocs.map((d) => d.toJson()).toList(),
        });
      }
      if (mounted) {
        final count = _lineItems.length;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.isArabic
                  ? (count == 1
                        ? 'تم تقديم الطلب بنجاح'
                        : 'تم تقديم $count بنداً بنجاح')
                  : (count == 1
                        ? 'Request submitted successfully'
                        : '$count line items submitted successfully'),
            ),
            backgroundColor: Colors.green,
          ),
        );
        _resetForm();
        ref.invalidate(_submissionHistoryProvider);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.isArabic ? 'فشل التقديم: $e' : 'Submission failed: $e',
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  void _resetForm() {
    _formKey.currentState?.reset();
    for (final item in _lineItems) {
      item.dispose();
    }
    setState(() {
      _requestType = FundingType.advance;
      _selectedProjectId = null;
      _requestDate = DateTime.now();
      _currency = 'SDG';
      _lineItems = [_LineItem(id: const Uuid().v4())];
      _justificationDocs = [];
      _reconciliationDocs = [];
    });
    _titleCtrl.clear();
    _justificationCtrl.clear();
  }

  @override
  Widget build(BuildContext context) {
    final projectsAsync = ref.watch(_userProjectsProvider);
    final isArabic = widget.isArabic;
    final allDocs = [..._justificationDocs, ..._reconciliationDocs];
    final canSubmit =
        _selectedProjectId != null &&
        _titleCtrl.text.trim().length >= 3 &&
        _lineItems.isNotEmpty &&
        _lineItems.every((item) => item.totalSdg > 0);

    return Scaffold(
      backgroundColor: Colors.grey[50],
      body: Form(
        key: _formKey,
        onChanged: () => setState(() {}),
        child: CustomScrollView(
          slivers: [
            // ── Summary Cards Section ──
            SliverToBoxAdapter(
              child: Consumer(
                builder: (context, ref, _) {
                  final outstandingAsync = ref.watch(
                    _outstandingAdvancesProvider,
                  );
                  final historyAsync = ref.watch(_submissionHistoryProvider);

                  return outstandingAsync.when(
                    loading: () => _buildSummaryCardsSkeleton(isArabic),
                    error: (_, __) => const SizedBox.shrink(),
                    data: (outstanding) {
                      return historyAsync.when(
                        loading: () => _buildSummaryCardsSkeleton(isArabic),
                        error: (_, __) => const SizedBox.shrink(),
                        data: (history) {
                          final totalSubmitted = history.fold<double>(0, (
                            sum,
                            h,
                          ) {
                            return sum + ((h.amountCents ?? 0) / 100.0);
                          });
                          final totalOutstanding = outstanding.fold<double>(0, (
                            sum,
                            a,
                          ) {
                            return sum + ((a.amountCents ?? 0) / 100.0);
                          });
                          final pending = history
                              .where((h) => h.status == 'pending')
                              .length;

                          return Container(
                            color: Colors.teal.shade50,
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 12),
                                  child: Text(
                                    isArabic
                                        ? '📊 ملخص الحسابات'
                                        : '📊 Account Summary',
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleSmall
                                        ?.copyWith(
                                          fontWeight: FontWeight.w700,
                                          color: Colors.teal.shade800,
                                        ),
                                  ),
                                ),
                                SingleChildScrollView(
                                  scrollDirection: Axis.horizontal,
                                  child: Row(
                                    children: [
                                      _buildSummaryCard(
                                        context,
                                        isArabic
                                            ? '⏳ المستحقات'
                                            : '⏳ Outstanding',
                                        '${totalOutstanding.toStringAsFixed(0)} SDG',
                                        Colors.orange,
                                      ),
                                      const SizedBox(width: 12),
                                      _buildSummaryCard(
                                        context,
                                        isArabic
                                            ? '📤 قيد المراجعة'
                                            : '📤 Pending',
                                        '$pending',
                                        Colors.blue,
                                      ),
                                      const SizedBox(width: 12),
                                      _buildSummaryCard(
                                        context,
                                        isArabic ? '✅ المجموع' : '✅ Total',
                                        '${totalSubmitted.toStringAsFixed(0)} SDG',
                                        Colors.green,
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      );
                    },
                  );
                },
              ),
            ),
            // ── Main Form Content ──
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  // ── Request type tabs ──
                  _RequestTypeTabs(
                    selected: _requestType,
                    isArabic: isArabic,
                    onChanged: (t) => setState(() => _requestType = t),
                  ),
                  const SizedBox(height: 16),

                  // ── Project + Date row ──
                  LayoutBuilder(
                    builder: (ctx, box) {
                      final wide = box.maxWidth >= 500;
                      final projectField = _buildProjectField(
                        projectsAsync,
                        isArabic,
                      );
                      final dateField = GestureDetector(
                        onTap: () async {
                          final picked = await showDatePicker(
                            context: context,
                            initialDate: _requestDate,
                            firstDate: DateTime(2020),
                            lastDate: DateTime.now().add(
                              const Duration(days: 365),
                            ),
                          );
                          if (picked != null) {
                            setState(() => _requestDate = picked);
                          }
                        },
                        child: InputDecorator(
                          decoration: InputDecoration(
                            labelText: isArabic
                                ? '📅 تاريخ الطلب *'
                                : '📅 Request Date *',
                            border: const OutlineInputBorder(),
                            suffixIcon: const Icon(
                              Icons.calendar_today,
                              size: 18,
                            ),
                          ),
                          child: Text(
                            '${_requestDate.month.toString().padLeft(2, '0')}/${_requestDate.day.toString().padLeft(2, '0')}/${_requestDate.year}',
                            style: const TextStyle(fontSize: 14),
                          ),
                        ),
                      );
                      return wide
                          ? Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(flex: 3, child: projectField),
                                const SizedBox(width: 12),
                                Expanded(flex: 2, child: dateField),
                              ],
                            )
                          : Column(
                              children: [
                                projectField,
                                const SizedBox(height: 12),
                                dateField,
                              ],
                            );
                    },
                  ),
                  const SizedBox(height: 16),

                  // ── Request Title ──
                  TextFormField(
                    controller: _titleCtrl,
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      labelText: isArabic
                          ? '📝 عنوان الطلب *'
                          : '📝 Request Title *',
                      hintText: isArabic
                          ? 'مثال: عمليات ميدانية - مارس - مركز الخرطوم'
                          : 'e.g. March Field Operations - Khartoum Hub',
                      helperText: isArabic
                          ? 'عنوان مختصر يصف طلب الدفع'
                          : 'A brief title describing this payment request',
                      border: const OutlineInputBorder(),
                      prefixIcon: const Icon(Icons.title),
                    ),
                    validator: (v) => (v == null || v.trim().length < 3)
                        ? (isArabic
                              ? 'مطلوب (3 أحرف على الأقل)'
                              : 'Min 3 characters')
                        : null,
                  ),
                  const SizedBox(height: 20),

                  // ── Expense Items section ──
                  _buildLineItemsSection(isArabic),
                  const SizedBox(height: 20),

                  // ── Attachments section ──
                  _buildAttachmentsSection(isArabic, allDocs),
                ]),
              ),
            ),
          ],
        ),
      ),
      // ── Sticky submit bar ──
      bottomNavigationBar: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: Colors.grey[200]!)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.08),
              blurRadius: 10,
              offset: const Offset(0, -2),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!canSubmit)
              Container(
                padding: const EdgeInsets.all(10),
                margin: const EdgeInsets.only(bottom: 10),
                decoration: BoxDecoration(
                  color: Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: Colors.orange.shade200),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.info_outline,
                      size: 16,
                      color: Colors.orange.shade700,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        isArabic
                            ? 'أكمل الحقول المطلوبة للإرسال'
                            : 'Fill in required fields to submit',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.orange.shade800,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            Row(
              children: [
                Expanded(
                  child: Text(
                    canSubmit
                        ? (isArabic
                              ? '✅ اضغط إرسال لتقديم الطلب'
                              : '✅ Ready to submit')
                        : (isArabic
                              ? '⏳ تحضير الطلب...'
                              : '⏳ Preparing request...'),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: canSubmit ? Colors.green[700] : Colors.grey[600],
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                FilledButton.icon(
                  onPressed: (_isSubmitting || !canSubmit) ? null : _submit,
                  icon: _isSubmitting
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.send, size: 16),
                  label: Text(
                    _isSubmitting
                        ? (isArabic ? 'جار الإرسال...' : 'Submitting...')
                        : (isArabic ? 'إرسال الآن' : 'Submit Now'),
                  ),
                  style: FilledButton.styleFrom(
                    backgroundColor: canSubmit
                        ? Colors.teal.shade600
                        : Colors.grey[400],
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 12,
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

  Widget _buildSummaryCard(
    BuildContext context,
    String label,
    String value,
    Color color,
  ) {
    return Container(
      width: 120,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.3)),
        boxShadow: [
          BoxShadow(color: color.withValues(alpha: 0.1), blurRadius: 4),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryCardsSkeleton(bool isArabic) {
    return Container(
      color: Colors.teal.shade50,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            isArabic ? '📊 ملخص الحسابات' : '📊 Account Summary',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w700,
              color: Colors.teal.shade800,
            ),
          ),
          const SizedBox(height: 12),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _buildSkeletonCard(),
                const SizedBox(width: 12),
                _buildSkeletonCard(),
                const SizedBox(width: 12),
                _buildSkeletonCard(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSkeletonCard() {
    return Container(
      width: 120,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.grey[200]!),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 12,
            width: 70,
            decoration: BoxDecoration(
              color: Colors.grey[200],
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          const SizedBox(height: 8),
          Container(
            height: 20,
            width: 80,
            decoration: BoxDecoration(
              color: Colors.grey[300],
              borderRadius: BorderRadius.circular(4),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAttachmentsSection(
    bool isArabic,
    List<ops.SupportingDocument> allDocs,
  ) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: Colors.grey[200]!),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Row(
              children: [
                const Icon(Icons.attach_file, size: 18),
                const SizedBox(width: 8),
                Text(
                  isArabic ? 'المرفقات' : 'Attachments',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                  ),
                ),
                const Spacer(),
                Text(
                  isArabic
                      ? '${allDocs.length} ملف${allDocs.isEmpty ? " — ارفع بقدر الحاجة" : ""}'
                      : '${allDocs.length} file${allDocs.length == 1 ? "" : "s"} attached',
                  style: TextStyle(fontSize: 11, color: Colors.grey[500]),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _DocumentUpload(
                  documents: _activeDocs,
                  isArabic: isArabic,
                  onChanged: _setActiveDocs,
                ),
                const SizedBox(height: 6),
                Text(
                  isArabic
                      ? 'ارفع إيصال التحويل البنكي. سيطلب النظام منك إدخال تفاصيل التحويل للتحقق.'
                      : 'Upload your bank transfer receipt. The system will prompt you to enter the transfer details for validation.',
                  style: TextStyle(fontSize: 11, color: Colors.blue[700]),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProjectField(AsyncValue<List<_Project>> async, bool isArabic) {
    return async.when(
      loading: () => InputDecorator(
        decoration: InputDecoration(
          labelText: isArabic ? 'المشروع *' : 'Project *',
          border: const OutlineInputBorder(),
        ),
        child: const LinearProgressIndicator(),
      ),
      error: (e, _) => DropdownButtonFormField<String>(
        decoration: InputDecoration(
          labelText: isArabic ? 'المشروع *' : 'Project *',
          border: const OutlineInputBorder(),
          prefixIcon: const Icon(Icons.business),
        ),
        items: const [],
        onChanged: null,
        hint: Text(
          isArabic ? 'تعذر تحميل المشاريع' : 'Could not load projects',
        ),
      ),
      data: (projects) => DropdownButtonFormField<String>(
        initialValue: _selectedProjectId,
        decoration: InputDecoration(
          labelText: isArabic ? 'المشروع *' : 'Project *',
          border: const OutlineInputBorder(),
          prefixIcon: const Icon(Icons.business),
        ),
        hint: Text(isArabic ? 'اختر مشروعاً' : 'Select a project'),
        items: projects
            .map((p) => DropdownMenuItem(value: p.id, child: Text(p.name)))
            .toList(),
        onChanged: (v) => setState(() => _selectedProjectId = v),
        validator: (v) => v == null ? (isArabic ? 'مطلوب' : 'Required') : null,
      ),
    );
  }

  Widget _buildLineItemsSection(bool isArabic) {
    final totalSdg = _lineItems.fold(0.0, (sum, item) => sum + item.totalSdg);
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: Colors.grey[200]!),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Section header
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 12, 8),
            child: Row(
              children: [
                Text(
                  isArabic ? 'بنود المصروفات' : 'Expense Items',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                  ),
                ),
                const Spacer(),
                OutlinedButton.icon(
                  onPressed: () => setState(
                    () => _lineItems.add(_LineItem(id: const Uuid().v4())),
                  ),
                  icon: const Icon(Icons.add, size: 14),
                  label: Text(
                    isArabic ? 'إضافة بند' : 'Add Item',
                    style: const TextStyle(fontSize: 12),
                  ),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // Item cards
          ...List.generate(
            _lineItems.length,
            (i) => _LineItemCard(
              key: ValueKey(_lineItems[i].id),
              index: i,
              item: _lineItems[i],
              isArabic: isArabic,
              currency: _currency,
              onCurrencyChanged: (v) => setState(() => _currency = v),
              canRemove: _lineItems.length > 1,
              onRemove: () => setState(() {
                _lineItems[i].dispose();
                _lineItems.removeAt(i);
              }),
              onChanged: () => setState(() {}),
            ),
          ),

          // Footer: total + add more button + CSV
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Add another item (dashed border button)
                DashedBorderButton(
                  onTap: () => setState(
                    () => _lineItems.add(_LineItem(id: const Uuid().v4())),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.add, size: 16, color: Colors.grey),
                      const SizedBox(width: 6),
                      Text(
                        isArabic
                            ? '+ إضافة بند مصروف آخر'
                            : '+ Add Another Expense Item',
                        style: TextStyle(color: Colors.grey[700], fontSize: 13),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(child: Divider(color: Colors.grey[300])),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Text(
                        'or',
                        style: TextStyle(fontSize: 11, color: Colors.grey[500]),
                      ),
                    ),
                    Expanded(child: Divider(color: Colors.grey[300])),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _uploadCsv,
                        icon: const Icon(Icons.upload_file, size: 15),
                        label: Text(
                          isArabic ? 'رفع Excel / CSV' : 'Upload Excel / CSV',
                          style: const TextStyle(fontSize: 12),
                        ),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    TextButton.icon(
                      onPressed: _downloadTemplate,
                      icon: const Icon(
                        Icons.download,
                        size: 14,
                        color: Colors.grey,
                      ),
                      label: Text(
                        isArabic ? 'تحميل القالب' : 'Download Template',
                        style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                      ),
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 10,
                        ),
                      ),
                    ),
                  ],
                ),
                // Running total
                if (totalSdg > 0) ...[
                  const Divider(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Text(
                        isArabic ? 'الإجمالي: ' : 'Total: ',
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                      ),
                      Text(
                        '${totalSdg.toStringAsFixed(2)} $_currency',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                          color: Colors.blue,
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Request type tabs
// ─────────────────────────────────────────────────────────────

class _RequestTypeTabs extends StatelessWidget {
  final FundingType selected;
  final bool isArabic;
  final ValueChanged<FundingType> onChanged;
  const _RequestTypeTabs({
    required this.selected,
    required this.onChanged,
    this.isArabic = false,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          isArabic ? '🏷️ نوع الطلب' : '🏷️ Request Type',
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w700,
            color: Colors.grey[800],
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _TypeTab(
                icon: Icons.attach_money,
                emoji: '💰',
                label: isArabic ? 'دفعة مقدمة' : 'Advance Payment',
                description: isArabic
                    ? 'اطلب أموالاً قبل الإنفاق'
                    : 'Request funds before spending',
                selected: selected == FundingType.advance,
                color: Colors.blue,
                onTap: () => onChanged(FundingType.advance),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _TypeTab(
                icon: Icons.receipt,
                emoji: '🧾',
                label: isArabic ? 'استرداد' : 'Reimbursement',
                description: isArabic
                    ? 'استرجع أموالك بعد الإنفاق'
                    : 'Get refunded after spending',
                selected: selected == FundingType.reimbursement,
                color: Colors.green,
                onTap: () => onChanged(FundingType.reimbursement),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (selected == FundingType.advance)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.blue.shade50,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.blue.shade200),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, size: 18, color: Colors.blue.shade700),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    isArabic
                        ? 'اطلب الأموال قبل الإنفاق. بعد استلام المال، يجب رفع الإيصالات لتسوية الرصيد.'
                        : 'Request funds before spending. After receiving funds, upload receipts to reconcile balance.',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.blue.shade900,
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
          )
        else
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.green.shade50,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.green.shade200),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.check_circle_outline,
                  size: 18,
                  color: Colors.green.shade700,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    isArabic
                        ? 'دفعت من مالك الخاص؟ ارفع الإيصالات الآن للحصول على الاسترداد بعد الموافقة.'
                        : 'Already paid from your own funds? Upload receipts now to get refunded after approval.',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.green.shade900,
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _TypeTab extends StatelessWidget {
  final IconData icon;
  final String emoji;
  final String label;
  final String description;
  final bool selected;
  final Color color;
  final VoidCallback onTap;

  const _TypeTab({
    required this.icon,
    required this.emoji,
    required this.label,
    required this.description,
    required this.selected,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: selected ? color.withValues(alpha: 0.1) : Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: selected ? color : Colors.grey[300]!,
            width: selected ? 2 : 1,
          ),
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: color.withValues(alpha: 0.15),
                    blurRadius: 6,
                    offset: const Offset(0, 2),
                  ),
                ]
              : null,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top row: emoji + icon with checkmark
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(emoji, style: const TextStyle(fontSize: 20)),
                if (selected)
                  Container(
                    padding: const EdgeInsets.all(2),
                    decoration: BoxDecoration(
                      color: color,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.check,
                      size: 14,
                      color: Colors.white,
                    ),
                  )
                else
                  Container(
                    width: 18,
                    height: 18,
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey[300]!),
                      shape: BoxShape.circle,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            // Label
            Text(
              label,
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 13,
                color: selected ? color : Colors.grey[800],
              ),
            ),
            const SizedBox(height: 4),
            // Description
            Text(
              description,
              style: TextStyle(
                fontSize: 11,
                color: Colors.grey[600],
                height: 1.3,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Dashed border button helper
// ─────────────────────────────────────────────────────────────

class DashedBorderButton extends StatelessWidget {
  final VoidCallback onTap;
  final Widget child;
  const DashedBorderButton({
    super.key,
    required this.onTap,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: Colors.grey[400]!, width: 1),
        ),
        child: child,
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Line item card  (mirrors createEmptyItem + EXPENSE_CATEGORIES)
// ─────────────────────────────────────────────────────────────

class _LineItemCard extends StatefulWidget {
  final int index;
  final _LineItem item;
  final bool isArabic;
  final String currency;
  final ValueChanged<String> onCurrencyChanged;
  final bool canRemove;
  final VoidCallback onRemove;
  final VoidCallback onChanged;

  const _LineItemCard({
    super.key,
    required this.index,
    required this.item,
    required this.onRemove,
    required this.onChanged,
    required this.onCurrencyChanged,
    this.isArabic = false,
    this.canRemove = true,
    this.currency = 'SDG',
  });

  @override
  State<_LineItemCard> createState() => _LineItemCardState();
}

class _LineItemCardState extends State<_LineItemCard> {
  bool _collapsed = false;

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final isArabic = widget.isArabic;
    final total = item.totalSdg;

    return Container(
      margin: const EdgeInsets.only(top: 1),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(
          top: BorderSide(color: Colors.grey[200]!),
          bottom: BorderSide(color: Colors.grey[200]!),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Item header bar: number + title + duplicate + collapse
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(color: Colors.grey[50]),
            child: Row(
              children: [
                Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    color: Colors.grey[700],
                    borderRadius: BorderRadius.circular(4),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    '${widget.index + 1}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    item.titleCtrl.text.isEmpty
                        ? (isArabic
                              ? 'البند ${widget.index + 1}'
                              : 'Item ${widget.index + 1}')
                        : item.titleCtrl.text,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (widget.canRemove)
                  IconButton(
                    icon: const Icon(
                      Icons.delete_outline,
                      size: 18,
                      color: Colors.red,
                    ),
                    onPressed: widget.onRemove,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(
                      minWidth: 28,
                      minHeight: 28,
                    ),
                    tooltip: isArabic ? 'حذف البند' : 'Remove',
                  ),
                IconButton(
                  icon: Icon(
                    _collapsed
                        ? Icons.keyboard_arrow_down
                        : Icons.keyboard_arrow_up,
                    size: 18,
                  ),
                  onPressed: () => setState(() => _collapsed = !_collapsed),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(
                    minWidth: 28,
                    minHeight: 28,
                  ),
                ),
              ],
            ),
          ),

          if (!_collapsed)
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Expense Category label + chip picker
                  Text(
                    isArabic ? 'فئة المصروف *' : 'Expense Category *',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Colors.grey[800],
                    ),
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: ExpenseCategory.values.map((cat) {
                      final selected = item.category == cat;
                      final cc = _catColor(cat);
                      return GestureDetector(
                        onTap: () {
                          setState(() => item.category = cat);
                          widget.onChanged();
                        },
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 150),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 7,
                          ),
                          decoration: BoxDecoration(
                            color: selected ? cc : Colors.white,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: selected ? cc : Colors.grey[300]!,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                _catIcon(cat),
                                size: 13,
                                color: selected
                                    ? Colors.white
                                    : Colors.grey[600],
                              ),
                              const SizedBox(width: 5),
                              Text(
                                cat.getLabel(isArabic),
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: selected
                                      ? FontWeight.w600
                                      : FontWeight.normal,
                                  color: selected
                                      ? Colors.white
                                      : Colors.grey[700],
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 14),

                  // Item title (per-item "Request Title")
                  TextFormField(
                    controller: item.titleCtrl,
                    onChanged: (_) {
                      widget.onChanged();
                      setState(() {});
                    },
                    decoration: InputDecoration(
                      labelText: isArabic ? 'عنوان البند *' : 'Request Title *',
                      hintText: isArabic
                          ? 'مثال: مواد تدريبية للورشة'
                          : 'e.g., Training materials for workshop',
                      border: const OutlineInputBorder(),
                      isDense: true,
                    ),
                    validator: (v) => (v == null || v.trim().length < 3)
                        ? (isArabic ? 'مطلوب' : 'Required')
                        : null,
                  ),
                  const SizedBox(height: 10),

                  // Qty + Unit Cost + Currency + Total
                  LayoutBuilder(
                    builder: (ctx, box) {
                      final wide = box.maxWidth >= 480;
                      final qtyField = TextFormField(
                        controller: item.quantityCtrl,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        onChanged: (_) {
                          widget.onChanged();
                          setState(() {});
                        },
                        decoration: InputDecoration(
                          labelText: isArabic ? 'الكمية *' : 'Quantity *',
                          border: const OutlineInputBorder(),
                          isDense: true,
                        ),
                        validator: (v) {
                          final n = double.tryParse(v?.trim() ?? '');
                          if (n == null || n <= 0) {
                            return isArabic ? 'مطلوب' : 'Req.';
                          }
                          return null;
                        },
                      );
                      final unitCostField = TextFormField(
                        controller: item.unitCostCtrl,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        onChanged: (_) {
                          widget.onChanged();
                          setState(() {});
                        },
                        decoration: InputDecoration(
                          labelText: isArabic
                              ? 'تكلفة الوحدة *'
                              : 'Unit Cost *',
                          prefixIcon: const Padding(
                            padding: EdgeInsets.only(left: 8, right: 4),
                            child: Icon(Icons.attach_money, size: 16),
                          ),
                          prefixIconConstraints: const BoxConstraints(
                            minWidth: 0,
                            minHeight: 0,
                          ),
                          border: const OutlineInputBorder(),
                          isDense: true,
                        ),
                        validator: (v) {
                          final n = double.tryParse(v?.trim() ?? '');
                          if (n == null || n < 0) {
                            return isArabic ? 'مطلوب' : 'Req.';
                          }
                          return null;
                        },
                      );
                      final currencyField = DropdownButtonFormField<String>(
                        initialValue: widget.currency,
                        decoration: InputDecoration(
                          labelText: isArabic ? 'العملة' : 'Currency',
                          border: const OutlineInputBorder(),
                          isDense: true,
                        ),
                        items: const [
                          DropdownMenuItem(value: 'SDG', child: Text('SDG')),
                          DropdownMenuItem(value: 'USD', child: Text('USD')),
                          DropdownMenuItem(value: 'EUR', child: Text('EUR')),
                        ],
                        onChanged: (v) => widget.onCurrencyChanged(v ?? 'SDG'),
                      );
                      final totalField = InputDecorator(
                        decoration: InputDecoration(
                          labelText: isArabic ? 'الإجمالي' : 'Total',
                          border: const OutlineInputBorder(),
                          isDense: true,
                          filled: true,
                          fillColor: Colors.grey[50],
                        ),
                        child: Text(
                          '${widget.currency} ${total.toStringAsFixed(0)}',
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                          ),
                        ),
                      );
                      if (wide) {
                        return Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(child: qtyField),
                            const SizedBox(width: 8),
                            Expanded(flex: 2, child: unitCostField),
                            const SizedBox(width: 8),
                            Expanded(flex: 2, child: currencyField),
                            const SizedBox(width: 8),
                            Expanded(flex: 2, child: totalField),
                          ],
                        );
                      }
                      return Column(
                        children: [
                          Row(
                            children: [
                              Expanded(child: qtyField),
                              const SizedBox(width: 8),
                              Expanded(flex: 2, child: unitCostField),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(child: currencyField),
                              const SizedBox(width: 8),
                              Expanded(child: totalField),
                            ],
                          ),
                        ],
                      );
                    },
                  ),
                  const SizedBox(height: 10),

                  // Description
                  TextFormField(
                    controller: item.descriptionCtrl,
                    maxLines: 2,
                    decoration: InputDecoration(
                      labelText: isArabic ? 'الوصف *' : 'Description *',
                      hintText: isArabic
                          ? 'ما الغرض من هذه النفقة؟ قدّم التفاصيل...'
                          : 'What is this expense for? Provide details...',
                      border: const OutlineInputBorder(),
                      isDense: true,
                      alignLabelWithHint: true,
                    ),
                    validator: (v) => (v == null || v.trim().length < 3)
                        ? (isArabic ? 'مطلوب' : 'Required')
                        : null,
                  ),
                  const SizedBox(height: 10),

                  // Justification
                  TextFormField(
                    controller: item.justificationCtrl,
                    maxLines: 2,
                    decoration: InputDecoration(
                      labelText: isArabic ? 'المبرر *' : 'Justification *',
                      hintText: isArabic
                          ? 'لماذا هذه النفقة ضرورية للعمليات الميدانية؟'
                          : 'Why is this expense necessary for field operations?',
                      border: const OutlineInputBorder(),
                      isDense: true,
                      alignLabelWithHint: true,
                    ),
                    validator: (v) => (v == null || v.trim().length < 5)
                        ? (isArabic ? 'مطلوب' : 'Required')
                        : null,
                  ),
                  const SizedBox(height: 10),

                  // Vendor + Reference (always visible like web)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: TextField(
                          controller: item.vendorCtrl,
                          decoration: InputDecoration(
                            labelText: isArabic
                                ? 'المورد/المزود (اختياري)'
                                : 'Vendor/Supplier (Optional)',
                            hintText: isArabic ? 'اسم المورد' : 'Vendor name',
                            prefixIcon: const Icon(Icons.business, size: 16),
                            border: const OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextField(
                          controller: item.referenceCtrl,
                          decoration: InputDecoration(
                            labelText: isArabic
                                ? 'رقم المرجع (اختياري)'
                                : 'Reference # (Optional)',
                            hintText: isArabic
                                ? 'رقم الفاتورة/الإيصال'
                                : 'Invoice/Receipt number',
                            prefixIcon: const Icon(Icons.tag, size: 16),
                            border: const OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Tab 2 — Reconciliation  (mirrors CostReconciliationForm.tsx)
// ─────────────────────────────────────────────────────────────

class _ReconciliationTab extends ConsumerWidget {
  final bool isArabic;
  const _ReconciliationTab({this.isArabic = false});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_outstandingAdvancesProvider);
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Text('Error: $e', style: const TextStyle(color: Colors.red)),
      ),
      data: (advances) {
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // "How Reconciliation Works" bilingual instruction card
            Container(
              decoration: BoxDecoration(
                color: Colors.blue[50],
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.blue[200]!),
              ),
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.info_outline,
                        color: Colors.blue[700],
                        size: 18,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        isArabic
                            ? 'كيف تعمل التسوية'
                            : 'How Reconciliation Works',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Colors.blue[800],
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  ..._reconcileSteps(isArabic).asMap().entries.map(
                    (e) => Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 20,
                            height: 20,
                            decoration: BoxDecoration(
                              color: Colors.blue[600],
                              shape: BoxShape.circle,
                            ),
                            alignment: Alignment.center,
                            child: Text(
                              '${e.key + 1}',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              e.value,
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.blue[900],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            // Export + view buttons row
            Row(
              children: [
                OutlinedButton.icon(
                  onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(isArabic ? 'قريباً' : 'Export coming soon'),
                    ),
                  ),
                  icon: const Icon(Icons.download, size: 16),
                  label: Text(isArabic ? 'تصدير' : 'Export'),
                ),
                const SizedBox(width: 8),
                if (advances.isEmpty)
                  OutlinedButton.icon(
                    onPressed: () {},
                    icon: const Icon(Icons.account_balance_wallet, size: 16),
                    label: Text(
                      isArabic ? 'عرض المستحقات' : 'View Outstanding Advances',
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            if (advances.isEmpty)
              _EmptyState(
                icon: Icons.sync,
                title: isArabic
                    ? 'لا توجد سلف مستحقة'
                    : 'No Outstanding Advances',
                subtitle: isArabic
                    ? 'لا توجد سلف مدفوعة تحتاج إلى تسوية.'
                    : 'You have no paid advances awaiting reconciliation.',
              )
            else
              ...advances.map(
                (adv) => _ReconcileCard(
                  submission: adv,
                  isArabic: isArabic,
                  onDone: () => ref.invalidate(_outstandingAdvancesProvider),
                ),
              ),
          ],
        );
      },
    );
  }

  List<String> _reconcileSteps(bool isArabic) => isArabic
      ? [
          'أكمل نشاطك الميداني وجمّع جميع الإيصالات والمستندات.',
          'أدخل المبالغ الفعلية المصروفة لكل بند من بنود الطلب.',
          'ارفع صور الإيصالات والفواتير كمرفقات.',
          'قدّم تقرير التسوية للمراجعة والاعتماد.',
          'سيراجع الفريق المالي تسويتك وقد يطلب توضيحات.',
          'بعد الاعتماد تُعدّل أي فروقات وتُغلق الدورة.',
        ]
      : [
          'Complete your field activity and collect all receipts and documents.',
          'Enter the actual amounts spent for each line item in the request.',
          'Upload photos of receipts and invoices as attachments.',
          'Submit the reconciliation report for review and approval.',
          'The finance team will review your reconciliation and may request clarifications.',
          'After approval, any discrepancies are adjusted and the cycle is closed.',
        ];
}

class _ReconcileCard extends StatefulWidget {
  final OperationalCostSubmission submission;
  final bool isArabic;
  final VoidCallback onDone;
  const _ReconcileCard({
    required this.submission,
    required this.onDone,
    this.isArabic = false,
  });

  @override
  State<_ReconcileCard> createState() => _ReconcileCardState();
}

class _ReconcileCardState extends State<_ReconcileCard> {
  bool _expanded = false;
  final _actualCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  List<ops.SupportingDocument> _docs = [];
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _actualCtrl.text = widget.submission.amount.toStringAsFixed(2);
  }

  @override
  void dispose() {
    _actualCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  double get _disbursed => widget.submission.amount;
  double get _actual => double.tryParse(_actualCtrl.text) ?? 0;
  double get _balance => _disbursed - _actual;

  Future<void> _reconcile() async {
    if (_docs.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.isArabic
                ? 'يرجى رفع إيصال واحد على الأقل'
                : 'Please upload at least one receipt',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }
    setState(() => _isSubmitting = true);
    try {
      await Supabase.instance.client
          .from('operational_cost_submissions')
          .update({
            'is_reconciled': true,
            'reconciled_amount_cents': (_actual * 100).round(),
            'reconciliation_notes': _notesCtrl.text.trim().isEmpty
                ? null
                : _notesCtrl.text.trim(),
            'reconciled_at': DateTime.now().toIso8601String(),
            'supporting_documents': _docs.map((d) => d.toJson()).toList(),
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', widget.submission.id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.isArabic
                  ? 'تمت التسوية بنجاح'
                  : 'Reconciliation submitted successfully',
            ),
            backgroundColor: Colors.green,
          ),
        );
        widget.onDone();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = widget.isArabic;
    final sub = widget.submission;
    final currency = sub.currency;
    final balance = _balance;

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Column(
        children: [
          ListTile(
            leading: const Icon(Icons.file_open, color: Colors.amber),
            title: Text(
              sub.description,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            subtitle: Text(
              '${isArabic ? "صُرفت" : "Disbursed"}: ${_disbursed.toStringAsFixed(2)} $currency',
            ),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.amber[50],
                    border: Border.all(color: Colors.amber[200]!),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    isArabic ? 'بانتظار التسوية' : 'Awaiting Reconciliation',
                    style: TextStyle(fontSize: 11, color: Colors.amber[700]),
                  ),
                ),
                IconButton(
                  icon: Icon(_expanded ? Icons.expand_less : Icons.expand_more),
                  onPressed: () => setState(() => _expanded = !_expanded),
                ),
              ],
            ),
          ),
          if (_expanded) ...[
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Balance summary
                  LayoutBuilder(
                    builder: (ctx, box) {
                      final w = box.maxWidth >= 400;
                      final cards = [
                        _BalanceChip(
                          label: isArabic ? 'المصروف' : 'Disbursed',
                          value: '${_disbursed.toStringAsFixed(2)} $currency',
                          color: Colors.blue,
                        ),
                        _BalanceChip(
                          label: isArabic ? 'الفعلي' : 'Actual Spent',
                          value: '${_actual.toStringAsFixed(2)} $currency',
                          color: balance == 0 ? Colors.green : Colors.blue,
                        ),
                        _BalanceChip(
                          label: isArabic ? 'الرصيد' : 'Balance',
                          value:
                              '${balance.abs().toStringAsFixed(2)} $currency'
                              '${balance > 0
                                  ? (isArabic ? " (للإرجاع)" : " (to return)")
                                  : balance < 0
                                  ? (isArabic ? " (ناقص)" : " (overspent)")
                                  : ""}',
                          color: balance == 0
                              ? Colors.green
                              : balance > 0
                              ? Colors.blue
                              : Colors.amber,
                        ),
                      ];
                      if (w) {
                        return Row(
                          children: cards
                              .map(
                                (c) => Expanded(
                                  child: Padding(
                                    padding: const EdgeInsets.only(right: 8),
                                    child: c,
                                  ),
                                ),
                              )
                              .toList(),
                        );
                      }
                      return Column(
                        children: cards
                            .map(
                              (c) => Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: c,
                              ),
                            )
                            .toList(),
                      );
                    },
                  ),
                  const SizedBox(height: 12),
                  LinearProgressIndicator(
                    value:
                        (_disbursed > 0
                                ? (_actual / _disbursed).clamp(0, 1)
                                : 0)
                            .toDouble(),
                    minHeight: 8,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _actualCtrl,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: InputDecoration(
                      labelText: isArabic
                          ? 'المبلغ الفعلي المنفق *'
                          : 'Actual Amount Spent *',
                      border: const OutlineInputBorder(),
                      prefixIcon: const Icon(Icons.attach_money),
                      helperText: isArabic
                          ? 'أدخل المجموع من الإيصالات'
                          : 'Enter the total from receipts',
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _notesCtrl,
                    maxLines: 2,
                    decoration: InputDecoration(
                      labelText: isArabic
                          ? 'ملاحظات التسوية'
                          : 'Reconciliation Notes',
                      hintText: isArabic
                          ? 'اشرح أي فرق...'
                          : 'Explain any variance...',
                      border: const OutlineInputBorder(),
                      alignLabelWithHint: true,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      const Icon(Icons.upload_file, size: 16),
                      const SizedBox(width: 6),
                      Text(
                        isArabic
                            ? 'الإيصالات والفواتير *'
                            : 'Receipts & Invoices *',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  _DocumentUpload(
                    documents: _docs,
                    isArabic: isArabic,
                    onChanged: (docs) => setState(() => _docs = docs),
                  ),
                  const SizedBox(height: 12),
                  if (balance < 0)
                    _InfoBanner(
                      color: Colors.amber,
                      icon: Icons.warning_amber,
                      message: isArabic
                          ? 'أنفقت أكثر من المبلغ المصروف. قد تحصل على دفعة إضافية.'
                          : 'You spent more than disbursed. You may receive an additional payment.',
                    ),
                  if (balance > 0)
                    _InfoBanner(
                      color: Colors.blue,
                      icon: Icons.arrow_downward,
                      message: isArabic
                          ? 'يوجد ${balance.toStringAsFixed(2)} $currency متبقية يجب إرجاعها.'
                          : 'You have ${balance.toStringAsFixed(2)} $currency remaining to return.',
                    ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      OutlinedButton(
                        onPressed: _isSubmitting
                            ? null
                            : () => setState(() => _expanded = false),
                        child: Text(isArabic ? 'إلغاء' : 'Cancel'),
                      ),
                      const SizedBox(width: 12),
                      FilledButton.icon(
                        onPressed: (_isSubmitting || _docs.isEmpty)
                            ? null
                            : _reconcile,
                        icon: _isSubmitting
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.task_alt),
                        label: Text(
                          _isSubmitting
                              ? (isArabic ? 'جار الإرسال...' : 'Submitting...')
                              : (isArabic
                                    ? 'تقديم التسوية'
                                    : 'Submit Reconciliation'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Tab 3 — Outstanding advances
// ─────────────────────────────────────────────────────────────

class _OutstandingTab extends ConsumerWidget {
  final bool isArabic;
  const _OutstandingTab({this.isArabic = false});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_outstandingAdvancesProvider);
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Text('Error: $e', style: const TextStyle(color: Colors.red)),
      ),
      data: (items) {
        if (items.isEmpty) {
          return _EmptyState(
            icon: Icons.account_balance_wallet_outlined,
            title: isArabic ? 'لا توجد مستحقات' : 'No Outstanding Advances',
            subtitle: isArabic
                ? 'ستظهر هنا السلف المعتمدة والمصروفة'
                : 'Approved and disbursed advances will appear here',
          );
        }
        // ── Summary (mirrors OutstandingAdvancesSummary in React) ──
        final totalDisbursed = items.fold(0.0, (s, r) => s + r.amount);
        final totalReconciled = items.fold(
          0.0,
          (s, r) => s + (r.reconciledAmount ?? 0.0),
        );
        final totalBalance = totalDisbursed - totalReconciled;
        final now = DateTime.now();
        final overdueCount = items
            .where((r) => now.difference(r.updatedAt).inDays > 30)
            .length;
        final currency = items.first.currency;

        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(_outstandingAdvancesProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Overdue warning banner
              if (overdueCount > 0)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _InfoBanner(
                    color: Colors.red,
                    icon: Icons.warning_amber,
                    message: isArabic
                        ? 'لديك $overdueCount سلفة متأخرة (أكثر من 30 يوماً). يرجى التسوية في أقرب وقت.'
                        : '$overdueCount advance${overdueCount > 1 ? "s are" : " is"} overdue (>30 days). Please reconcile promptly.',
                  ),
                ),
              // Stats row
              LayoutBuilder(
                builder: (ctx, box) {
                  final wide = box.maxWidth >= 400;
                  final chips = [
                    _BalanceChip(
                      label: isArabic ? 'إجمالي المصروف' : 'Total Disbursed',
                      value: '${totalDisbursed.toStringAsFixed(2)} $currency',
                      color: Colors.blue,
                    ),
                    _BalanceChip(
                      label: isArabic ? 'الرصيد المفتوح' : 'Open Balance',
                      value: '${totalBalance.toStringAsFixed(2)} $currency',
                      color: totalBalance > 0 ? Colors.orange : Colors.green,
                    ),
                    _BalanceChip(
                      label: isArabic ? 'متأخر' : 'Overdue',
                      value: overdueCount.toString(),
                      color: overdueCount > 0 ? Colors.red : Colors.grey,
                    ),
                  ];
                  return wide
                      ? Row(
                          children: chips
                              .map(
                                (c) => Expanded(
                                  child: Padding(
                                    padding: const EdgeInsets.only(right: 8),
                                    child: c,
                                  ),
                                ),
                              )
                              .toList(),
                        )
                      : Column(
                          children: chips
                              .map(
                                (c) => Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: c,
                                ),
                              )
                              .toList(),
                        );
                },
              ),
              const SizedBox(height: 16),
              // Individual items
              ...items.map((sub) {
                final daysSince = now.difference(sub.updatedAt).inDays;
                final isOverdue = daysSince > 30;
                return Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                    side: isOverdue
                        ? const BorderSide(color: Colors.red, width: 1.5)
                        : BorderSide.none,
                  ),
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: isOverdue
                          ? Colors.red[50]
                          : Colors.blue[50],
                      child: Icon(
                        Icons.account_balance_wallet,
                        color: isOverdue ? Colors.red : Colors.blue,
                      ),
                    ),
                    title: Row(
                      children: [
                        Expanded(
                          child: Text(
                            sub.description,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (isOverdue)
                          Container(
                            margin: const EdgeInsets.only(left: 4),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.red,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              isArabic ? 'متأخر' : 'OVERDUE',
                              style: const TextStyle(
                                fontSize: 9,
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                      ],
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${sub.amount.toStringAsFixed(2)} ${sub.currency}',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: isOverdue ? Colors.red : Colors.blue,
                          ),
                        ),
                        if (sub.expenseDate != null)
                          Text(
                            sub.expenseDate!,
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey[600],
                            ),
                          ),
                        Text(
                          isArabic
                              ? '$daysSince يوم منذ الصرف'
                              : '$daysSince day${daysSince == 1 ? "" : "s"} since disbursement',
                          style: TextStyle(
                            fontSize: 11,
                            color: isOverdue
                                ? Colors.red[400]
                                : Colors.grey[500],
                          ),
                        ),
                      ],
                    ),
                    trailing: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.orange[50],
                        border: Border.all(color: Colors.orange[200]!),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        isArabic ? 'مفتوح' : 'Open',
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.orange[700],
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ],
          ),
        );
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Tab 4 — History
// ─────────────────────────────────────────────────────────────

class _HistoryTab extends ConsumerWidget {
  final bool isArabic;
  const _HistoryTab({this.isArabic = false});

  Color _statusColor(OperationalCostStatus s) {
    switch (s) {
      case OperationalCostStatus.pending:
        return Colors.orange;
      case OperationalCostStatus.underReview:
        return Colors.blue;
      case OperationalCostStatus.approved:
        return Colors.green;
      case OperationalCostStatus.paid:
        return Colors.purple;
      case OperationalCostStatus.rejected:
      case OperationalCostStatus.cancelled:
        return Colors.red;
    }
  }

  IconData _statusIcon(OperationalCostStatus s) {
    switch (s) {
      case OperationalCostStatus.pending:
        return Icons.schedule;
      case OperationalCostStatus.underReview:
        return Icons.remove_red_eye;
      case OperationalCostStatus.approved:
        return Icons.check_circle;
      case OperationalCostStatus.paid:
        return Icons.paid;
      case OperationalCostStatus.rejected:
        return Icons.cancel;
      case OperationalCostStatus.cancelled:
        return Icons.block;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_submissionHistoryProvider);
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Text('Error: $e', style: const TextStyle(color: Colors.red)),
      ),
      data: (items) {
        if (items.isEmpty) {
          return _EmptyState(
            icon: Icons.history,
            title: isArabic ? 'لا يوجد سجل' : 'No History',
            subtitle: isArabic
                ? 'ستظهر هنا طلباتك السابقة'
                : 'Your past submissions will appear here',
          );
        }
        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(_submissionHistoryProvider),
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: items.length,
            itemBuilder: (ctx, i) {
              final sub = items[i];
              final sc = _statusColor(sub.status);
              return Card(
                margin: const EdgeInsets.only(bottom: 12),
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: sc.withValues(alpha: 0.1),
                    child: Icon(_statusIcon(sub.status), color: sc, size: 20),
                  ),
                  title: Text(
                    sub.description,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${sub.amount.toStringAsFixed(2)} ${sub.currency}',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      Text(
                        sub.fundingType.getLabel(isArabic),
                        style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                      ),
                      if (sub.expenseDate != null)
                        Text(
                          sub.expenseDate!,
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey[600],
                          ),
                        ),
                    ],
                  ),
                  trailing: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: sc.withValues(alpha: 0.1),
                      border: Border.all(color: sc.withValues(alpha: 0.3)),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      sub.status.getLabel(isArabic),
                      style: TextStyle(
                        fontSize: 11,
                        color: sc,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Document upload widget
// ─────────────────────────────────────────────────────────────

class _DocumentUpload extends StatefulWidget {
  final List<ops.SupportingDocument> documents;
  final bool isArabic;
  final ValueChanged<List<ops.SupportingDocument>> onChanged;
  const _DocumentUpload({
    required this.documents,
    required this.onChanged,
    this.isArabic = false,
  });

  @override
  State<_DocumentUpload> createState() => _DocumentUploadState();
}

class _DocumentUploadState extends State<_DocumentUpload> {
  bool _isUploading = false;

  static String _docType(String ext) {
    switch (ext.toLowerCase()) {
      case 'pdf':
        return 'receipt';
      case 'jpg':
      case 'jpeg':
      case 'png':
        return 'photo';
      default:
        return 'document';
    }
  }

  Future<void> _pick(ImageSource source) async {
    try {
      setState(() => _isUploading = true);
      final supabase = Supabase.instance.client;
      final picker = ImagePicker();
      final XFile? picked = await picker.pickImage(
        source: source,
        imageQuality: 85,
      );
      if (picked == null) return;
      int? sizeBytes;
      if (!kIsWeb) sizeBytes = await File(picked.path).length();
      if (sizeBytes != null && sizeBytes > 10 * 1024 * 1024) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                widget.isArabic
                    ? 'حجم الملف يتجاوز 10 ميجابايت'
                    : 'File exceeds 10 MB',
              ),
            ),
          );
        }
        return;
      }
      final ext = picked.name.contains('.')
          ? picked.name.split('.').last
          : 'jpg';
      final fileBytes = await picked.readAsBytes();
      final nowMs = DateTime.now().millisecondsSinceEpoch;
      final random = const Uuid().v4().substring(0, 8);
      final storagePath = 'cost-receipts/$nowMs-$random.${ext.toLowerCase()}';

      await supabase.storage.from('mmp-files').uploadBinary(
        storagePath,
        fileBytes,
        fileOptions: FileOptions(
          cacheControl: '3600',
          upsert: false,
          contentType: _contentTypeForExt(ext),
        ),
      );
      final publicUrl = supabase.storage.from('mmp-files').getPublicUrl(
        storagePath,
      );

      final doc = ops.SupportingDocument(
        url: publicUrl,
        type: _docType(ext),
        filename: picked.name,
        uploadedAt: DateTime.now().toIso8601String(),
      );
      widget.onChanged([...widget.documents, doc]);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _isUploading = false);
    }
  }

  void _showSheet() {
    showModalBottomSheet<void>(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: Text(
                widget.isArabic ? 'اختر من المعرض' : 'Choose from Gallery',
              ),
              onTap: () {
                Navigator.pop(context);
                _pick(ImageSource.gallery);
              },
            ),
            if (!kIsWeb)
              ListTile(
                leading: const Icon(Icons.camera_alt),
                title: Text(widget.isArabic ? 'التقط صورة' : 'Take a Photo'),
                onTap: () {
                  Navigator.pop(context);
                  _pick(ImageSource.camera);
                },
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final docs = widget.documents;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ...docs.map(
          (doc) => ListTile(
            dense: true,
            leading: doc.type == 'photo'
                ? ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: kIsWeb
                        ? Image.network(
                            doc.url,
                            width: 36,
                            height: 36,
                            fit: BoxFit.cover,
                            errorBuilder: (ctx, e, st) =>
                                const Icon(Icons.insert_drive_file),
                          )
                        : (doc.url.startsWith('http')
                              ? Image.network(
                                  doc.url,
                                  width: 36,
                                  height: 36,
                                  fit: BoxFit.cover,
                                  errorBuilder: (ctx, e, st) =>
                                      const Icon(Icons.insert_drive_file),
                                )
                              : Image.file(
                                  File(doc.url),
                                  width: 36,
                                  height: 36,
                                  fit: BoxFit.cover,
                                  errorBuilder: (ctx, e, st) =>
                                      const Icon(Icons.insert_drive_file),
                                )),
                  )
                : const Icon(Icons.insert_drive_file, size: 36),
            title: Text(doc.filename, overflow: TextOverflow.ellipsis),
            subtitle: Text(doc.type, style: const TextStyle(fontSize: 11)),
            trailing: IconButton(
              icon: const Icon(Icons.close, color: Colors.red, size: 18),
              onPressed: () =>
                  widget.onChanged(docs.where((d) => d != doc).toList()),
            ),
          ),
        ),
        if (docs.length < 10)
          _isUploading
              ? const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Center(child: CircularProgressIndicator()),
                )
              : OutlinedButton.icon(
                  onPressed: _showSheet,
                  icon: const Icon(Icons.upload_file, size: 18),
                  label: Text(
                    docs.isEmpty
                        ? (widget.isArabic ? 'رفع مستند' : 'Upload Document')
                        : (widget.isArabic
                              ? 'إضافة مستند آخر'
                              : 'Add another document'),
                    style: const TextStyle(fontSize: 13),
                  ),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
      ],
    );
  }

  static String _contentTypeForExt(String ext) {
    switch (ext.toLowerCase()) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      case 'pdf':
        return 'application/pdf';
      default:
        return 'application/octet-stream';
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────

class _InfoBanner extends StatelessWidget {
  final Color color;
  final IconData icon;
  final String message;
  const _InfoBanner({
    required this.color,
    required this.icon,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        border: Border.all(color: color.withValues(alpha: 0.4)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: color.withValues(alpha: 0.9),
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BalanceChip extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _BalanceChip({
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 11, color: Colors.grey[600])),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: color,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              title,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey[600]),
            ),
          ],
        ),
      ),
    );
  }
}
