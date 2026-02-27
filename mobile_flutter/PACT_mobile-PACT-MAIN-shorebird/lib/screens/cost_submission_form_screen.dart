import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/operational_cost_submission.dart';
import '../services/operational_cost_service.dart';

class CostSubmissionFormScreen extends StatefulWidget {
  final String? editSubmissionId;
  final bool isArabic;

  const CostSubmissionFormScreen({
    super.key,
    this.editSubmissionId,
    this.isArabic = false,
  });

  @override
  State<CostSubmissionFormScreen> createState() => _CostSubmissionFormScreenState();
}

class _CostSubmissionFormScreenState extends State<CostSubmissionFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _costService = OperationalCostService();
  final _amountController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _justificationController = TextEditingController();
  final _vendorController = TextEditingController();
  final _referenceController = TextEditingController();

  ExpenseCategory _selectedCategory = ExpenseCategory.transport;
  FundingType _selectedFundingType = FundingType.advance;
  String _selectedCurrency = 'SDG';
  String? _selectedSiteVisitId;
  String? _selectedProjectId;
  DateTime _expenseDate = DateTime.now();
  bool _isSubmitting = false;
  bool _isLoading = false;

  double? _budgetLimit;
  double? _budgetUsed;

  List<Map<String, dynamic>> _projects = [];
  List<Map<String, dynamic>> _hubs = [];
  String? _selectedHubId;

  @override
  void initState() {
    super.initState();
    if (widget.editSubmissionId != null) _loadExisting();
    _amountController.addListener(_onAmountChanged);
    _loadPickerData();
  }

  Future<void> _loadPickerData() async {
    try {
      final projects = await _costService.getAvailableProjects();
      final hubs = await _costService.getAvailableHubs();
      if (mounted) {
        setState(() {
          _projects = projects;
          _hubs = hubs;
        });
      }
    } catch (_) {}
  }

  void _onAmountChanged() {
    setState(() {});
  }

  Future<void> _loadExisting() async {
    setState(() => _isLoading = true);
    try {
      final submissions = await _costService.getAllSubmissions();
      final match = submissions.where((s) => s.id == widget.editSubmissionId).toList();
      if (match.isNotEmpty) {
        final s = match.first;
        setState(() {
          _selectedCategory = s.expenseCategory;
          _selectedFundingType = s.fundingType;
          _amountController.text = s.amount.toStringAsFixed(2);
          _descriptionController.text = s.description;
          _justificationController.text = s.justification ?? '';
          _vendorController.text = s.vendor ?? '';
          _referenceController.text = s.referenceNumber ?? '';
          _selectedCurrency = s.currency;
          _selectedSiteVisitId = s.siteVisitId;
          _selectedProjectId = s.projectId;
          _selectedHubId = s.hubId;
          if (s.expenseDate != null) {
            _expenseDate = DateTime.tryParse(s.expenseDate!) ?? DateTime.now();
          }
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  void dispose() {
    _amountController.dispose();
    _descriptionController.dispose();
    _justificationController.dispose();
    _vendorController.dispose();
    _referenceController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = widget.isArabic;
    final isEdit = widget.editSubmissionId != null;

    return Scaffold(
      appBar: AppBar(
        title: Text(isEdit
            ? (isArabic ? 'تعديل الطلب' : 'Edit Submission')
            : (isArabic ? 'تقديم طلب جديد' : 'New Submission')),
        elevation: 0,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _buildAmountCard(),
                  const SizedBox(height: 20),
                  _buildCategorySelector(),
                  const SizedBox(height: 16),
                  _buildFundingTypeSelector(),
                  const SizedBox(height: 16),
                  _buildCurrencyAndDate(),
                  const SizedBox(height: 16),
                  _buildDescriptionField(),
                  const SizedBox(height: 16),
                  _buildJustificationField(),
                  const SizedBox(height: 16),
                  _buildProjectHubPickers(),
                  const SizedBox(height: 16),
                  _buildVendorAndReference(),
                  if (_budgetLimit != null) ...[
                    const SizedBox(height: 16),
                    _buildBudgetTracker(),
                  ],
                  const SizedBox(height: 24),
                  _buildSubmitButton(),
                  const SizedBox(height: 16),
                ],
              ),
            ),
    );
  }

  Widget _buildAmountCard() {
    final amount = double.tryParse(_amountController.text) ?? 0;

    return Card(
      elevation: 3,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [Theme.of(context).primaryColor, Theme.of(context).primaryColor.withValues(alpha: 0.8)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(16),
        ),
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Text(
              widget.isArabic ? 'المبلغ' : 'Amount',
              style: const TextStyle(color: Colors.white70, fontSize: 14),
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: _amountController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d{0,2}'))],
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.bold),
              decoration: InputDecoration(
                border: InputBorder.none,
                hintText: '0.00',
                hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 32),
                suffixText: _selectedCurrency,
                suffixStyle: const TextStyle(color: Colors.white70, fontSize: 16),
              ),
              validator: (val) {
                if (val == null || val.isEmpty) {
                  return widget.isArabic ? 'يرجى إدخال المبلغ' : 'Please enter amount';
                }
                final parsed = double.tryParse(val);
                if (parsed == null || parsed <= 0) {
                  return widget.isArabic ? 'المبلغ غير صالح' : 'Invalid amount';
                }
                return null;
              },
            ),
            Text(
              '${amount.toStringAsFixed(2)} $_selectedCurrency',
              style: const TextStyle(color: Colors.white54, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCategorySelector() {
    final isArabic = widget.isArabic;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.category, color: Theme.of(context).primaryColor),
                const SizedBox(width: 8),
                Text(
                  isArabic ? 'فئة المصروف' : 'Expense Category',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const Text(' *', style: TextStyle(color: Colors.red)),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: ExpenseCategory.values.map((cat) {
                final isSelected = _selectedCategory == cat;
                return ChoiceChip(
                  label: Text(isArabic ? cat.labelAr : cat.labelEn, style: TextStyle(fontSize: 12)),
                  selected: isSelected,
                  onSelected: (sel) {
                    if (sel) setState(() => _selectedCategory = cat);
                  },
                  selectedColor: Theme.of(context).primaryColor.withValues(alpha: 0.2),
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFundingTypeSelector() {
    final isArabic = widget.isArabic;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.payment, color: Theme.of(context).primaryColor),
                const SizedBox(width: 8),
                Text(
                  isArabic ? 'نوع التمويل' : 'Funding Type',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: FundingType.values.map((ft) {
                final isSelected = _selectedFundingType == ft;
                return Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(right: ft != FundingType.values.last ? 8 : 0),
                    child: ChoiceChip(
                      label: SizedBox(
                        width: double.infinity,
                        child: Text(
                          isArabic ? ft.labelAr : ft.labelEn,
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                      selected: isSelected,
                      onSelected: (sel) {
                        if (sel) setState(() => _selectedFundingType = ft);
                      },
                      selectedColor: Theme.of(context).primaryColor.withValues(alpha: 0.2),
                    ),
                  ),
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCurrencyAndDate() {
    final isArabic = widget.isArabic;
    return Row(
      children: [
        Expanded(
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(isArabic ? 'العملة' : 'Currency', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    value: _selectedCurrency,
                    decoration: const InputDecoration(
                      border: OutlineInputBorder(),
                      isDense: true,
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    ),
                    items: const [
                      DropdownMenuItem(value: 'SDG', child: Text('SDG')),
                      DropdownMenuItem(value: 'USD', child: Text('USD')),
                      DropdownMenuItem(value: 'EUR', child: Text('EUR')),
                    ],
                    onChanged: (v) => setState(() => _selectedCurrency = v!),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Card(
            child: InkWell(
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _expenseDate,
                  firstDate: DateTime(2020),
                  lastDate: DateTime.now(),
                );
                if (picked != null) setState(() => _expenseDate = picked);
              },
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(isArabic ? 'تاريخ المصروف' : 'Expense Date', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Icon(Icons.calendar_today, size: 18, color: Theme.of(context).primaryColor),
                        const SizedBox(width: 8),
                        Text(
                          '${_expenseDate.year}-${_expenseDate.month.toString().padLeft(2, '0')}-${_expenseDate.day.toString().padLeft(2, '0')}',
                          style: const TextStyle(fontSize: 14),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildDescriptionField() {
    final isArabic = widget.isArabic;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: TextFormField(
          controller: _descriptionController,
          maxLines: 3,
          decoration: InputDecoration(
            labelText: isArabic ? 'الوصف *' : 'Description *',
            hintText: isArabic ? 'أدخل وصف المصروف...' : 'Describe the expense...',
            border: const OutlineInputBorder(),
            prefixIcon: const Icon(Icons.description),
          ),
          validator: (val) {
            if (val == null || val.trim().isEmpty) {
              return isArabic ? 'يرجى إدخال الوصف' : 'Description is required';
            }
            return null;
          },
        ),
      ),
    );
  }

  Widget _buildJustificationField() {
    final isArabic = widget.isArabic;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: TextFormField(
          controller: _justificationController,
          maxLines: 2,
          decoration: InputDecoration(
            labelText: isArabic ? 'التبرير' : 'Justification',
            hintText: isArabic ? 'لماذا هذا المصروف ضروري؟' : 'Why is this expense needed?',
            border: const OutlineInputBorder(),
            prefixIcon: const Icon(Icons.info_outline),
          ),
        ),
      ),
    );
  }

  Widget _buildProjectHubPickers() {
    final isArabic = widget.isArabic;
    return Row(
      children: [
        if (_projects.isNotEmpty)
          Expanded(
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(isArabic ? 'المشروع' : 'Project', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      value: _selectedProjectId,
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        isDense: true,
                        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      ),
                      isExpanded: true,
                      hint: Text(isArabic ? 'اختر' : 'Select', style: const TextStyle(fontSize: 13)),
                      items: _projects.map((p) => DropdownMenuItem<String>(
                        value: p['id'] as String,
                        child: Text(p['name'] as String, style: const TextStyle(fontSize: 13), overflow: TextOverflow.ellipsis),
                      )).toList(),
                      onChanged: (v) => setState(() => _selectedProjectId = v),
                    ),
                  ],
                ),
              ),
            ),
          ),
        if (_projects.isNotEmpty && _hubs.isNotEmpty) const SizedBox(width: 8),
        if (_hubs.isNotEmpty)
          Expanded(
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(isArabic ? 'المحور' : 'Hub', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      value: _selectedHubId,
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        isDense: true,
                        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      ),
                      isExpanded: true,
                      hint: Text(isArabic ? 'اختر' : 'Select', style: const TextStyle(fontSize: 13)),
                      items: _hubs.map((h) => DropdownMenuItem<String>(
                        value: h['id'] as String,
                        child: Text(h['name'] as String, style: const TextStyle(fontSize: 13), overflow: TextOverflow.ellipsis),
                      )).toList(),
                      onChanged: (v) => setState(() => _selectedHubId = v),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildVendorAndReference() {
    final isArabic = widget.isArabic;
    return Row(
      children: [
        Expanded(
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: TextFormField(
                controller: _vendorController,
                decoration: InputDecoration(
                  labelText: isArabic ? 'المورد' : 'Vendor',
                  border: const OutlineInputBorder(),
                  isDense: true,
                  prefixIcon: const Icon(Icons.store, size: 20),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: TextFormField(
                controller: _referenceController,
                decoration: InputDecoration(
                  labelText: isArabic ? 'رقم المرجع' : 'Reference #',
                  border: const OutlineInputBorder(),
                  isDense: true,
                  prefixIcon: const Icon(Icons.tag, size: 20),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildBudgetTracker() {
    final amount = double.tryParse(_amountController.text) ?? 0;
    final used = (_budgetUsed ?? 0) + amount;
    final percent = _budgetLimit! > 0 ? (used / _budgetLimit!) * 100 : 0.0;
    final isOver = used > _budgetLimit!;
    final isNear = percent > 80 && !isOver;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  isOver ? Icons.warning : Icons.account_balance_wallet,
                  color: isOver ? Colors.red : Colors.green,
                ),
                const SizedBox(width: 8),
                Text(
                  widget.isArabic ? 'تتبع الميزانية' : 'Budget Tracking',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 12),
            LinearProgressIndicator(
              value: (percent / 100).clamp(0, 1),
              backgroundColor: Colors.grey[300],
              valueColor: AlwaysStoppedAnimation<Color>(
                isOver ? Colors.red : isNear ? Colors.orange : Colors.green,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '${percent.toStringAsFixed(1)}% ${widget.isArabic ? "مستخدم" : "used"} (${used.toStringAsFixed(2)} / ${_budgetLimit!.toStringAsFixed(2)} $_selectedCurrency)',
              style: TextStyle(
                fontSize: 12,
                color: isOver ? Colors.red : isNear ? Colors.orange : Colors.grey[600],
              ),
            ),
            if (isOver) ...[
              const SizedBox(height: 4),
              Text(
                widget.isArabic ? 'تجاوز الميزانية!' : 'Over budget!',
                style: const TextStyle(fontSize: 12, color: Colors.red, fontWeight: FontWeight.bold),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildSubmitButton() {
    final isArabic = widget.isArabic;
    final isEdit = widget.editSubmissionId != null;

    return ElevatedButton(
      onPressed: _isSubmitting ? null : _handleSubmit,
      style: ElevatedButton.styleFrom(
        backgroundColor: Theme.of(context).primaryColor,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      child: _isSubmitting
          ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
          : Text(
              isEdit
                  ? (isArabic ? 'تحديث الطلب' : 'Update Submission')
                  : (isArabic ? 'تقديم الطلب' : 'Submit'),
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
    );
  }

  Future<void> _notifyApproversOfNewSubmission(OperationalCostSubmission submission) async {
    try {
      final currentUser = Supabase.instance.client.auth.currentUser;
      final userProfile = await Supabase.instance.client
          .from('profiles')
          .select('full_name, role')
          .eq('id', currentUser!.id)
          .maybeSingle();

      final submitterName = userProfile?['full_name'] as String? ?? 'Team Member';
      final submitterRole = userProfile?['role'] as String? ?? '';

      List<String> approverRoles;
      if (submitterRole.toLowerCase().contains('coordinator')) {
        approverRoles = ['supervisor', 'Supervisor', 'hubSupervisor'];
      } else if (submitterRole.toLowerCase().contains('supervisor')) {
        approverRoles = ['admin', 'Admin', 'CountryDirector', 'Field Operation Manager (FOM)'];
      } else {
        approverRoles = ['admin', 'Admin', 'super_admin', 'SuperAdmin'];
      }

      final approvers = await Supabase.instance.client
          .from('profiles')
          .select('id')
          .inFilter('role', approverRoles)
          .eq('status', 'approved');

      final approverIds = (approvers as List).map((a) => a['id'] as String).toList();

      if (approverIds.isNotEmpty) {
        await _costService.notifyNewSubmission(
          submission: submission,
          approverIds: approverIds,
          submitterName: submitterName,
        );
      }
    } catch (e) {
      debugPrint('Error notifying approvers: $e');
    }
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSubmitting = true);

    try {
      final currentUser = Supabase.instance.client.auth.currentUser;
      if (currentUser == null) throw Exception('Not authenticated');

      final amount = double.parse(_amountController.text);
      final description = _descriptionController.text.trim();
      final justification = _justificationController.text.trim().isNotEmpty ? _justificationController.text.trim() : null;
      final vendor = _vendorController.text.trim().isNotEmpty ? _vendorController.text.trim() : null;
      final reference = _referenceController.text.trim().isNotEmpty ? _referenceController.text.trim() : null;
      final expDate = _expenseDate.toIso8601String().split('T').first;

      if (widget.editSubmissionId != null) {
        final result = await _costService.updateSubmission(
          submissionId: widget.editSubmissionId!,
          expenseCategory: _selectedCategory,
          fundingType: _selectedFundingType,
          amount: amount,
          description: description,
          justification: justification,
          vendor: vendor,
          referenceNumber: reference,
          expenseDate: expDate,
          projectId: _selectedProjectId,
          hubId: _selectedHubId,
        );
        if (result != null && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(widget.isArabic ? 'تم تحديث الطلب' : 'Submission updated'),
              backgroundColor: Colors.green,
            ),
          );
          Navigator.pop(context, true);
        } else if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(widget.isArabic ? 'فشل في تحديث الطلب' : 'Failed to update submission'),
              backgroundColor: Colors.red,
            ),
          );
        }
      } else {
        final result = await _costService.submitCost(
          expenseCategory: _selectedCategory,
          fundingType: _selectedFundingType,
          amount: amount,
          currency: _selectedCurrency,
          description: description,
          justification: justification,
          vendor: vendor,
          referenceNumber: reference,
          expenseDate: expDate,
          projectId: _selectedProjectId,
          hubId: _selectedHubId,
        );
        if (result != null && mounted) {
          _notifyApproversOfNewSubmission(result);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(widget.isArabic ? 'تم تقديم الطلب بنجاح' : 'Submission created successfully'),
              backgroundColor: Colors.green,
            ),
          );
          Navigator.pop(context, true);
        } else if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(widget.isArabic ? 'فشل في حفظ الطلب' : 'Failed to save submission'),
              backgroundColor: Colors.red,
            ),
          );
        }
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
}
