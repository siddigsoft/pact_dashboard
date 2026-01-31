/// Cost Submit Tab Widget
/// Form for submitting new operational cost requests

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../models/operational_cost_submission.dart';
import '../../services/operational_cost_service.dart';

class CostSubmitTab extends StatefulWidget {
  final bool isArabic;
  final VoidCallback? onSuccess;
  final bool canSubmit;

  const CostSubmitTab({
    super.key,
    this.isArabic = false,
    this.onSuccess,
    this.canSubmit = true,
  });

  @override
  State<CostSubmitTab> createState() => _CostSubmitTabState();
}

class _CostSubmitTabState extends State<CostSubmitTab> {
  final _formKey = GlobalKey<FormState>();
  final _service = OperationalCostService();
  
  FundingType _fundingType = FundingType.advance;
  ExpenseCategory? _expenseCategory;
  String? _projectId;
  String? _hubId;
  final _amountController = TextEditingController();
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _justificationController = TextEditingController();
  final _vendorController = TextEditingController();
  final _referenceController = TextEditingController();
  DateTime _expenseDate = DateTime.now();
  
  List<Map<String, dynamic>> _projects = [];
  List<Map<String, dynamic>> _hubs = [];
  bool _isLoading = false;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _loadDropdowns();
  }

  @override
  void dispose() {
    _amountController.dispose();
    _titleController.dispose();
    _descriptionController.dispose();
    _justificationController.dispose();
    _vendorController.dispose();
    _referenceController.dispose();
    super.dispose();
  }

  Future<void> _loadDropdowns() async {
    setState(() => _isLoading = true);
    try {
      _projects = await _service.getAvailableProjects();
      _hubs = await _service.getAvailableHubs();
    } catch (e) {
      debugPrint('Error loading dropdowns: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_expenseCategory == null) {
      _showError(widget.isArabic ? 'يرجى اختيار فئة المصروفات' : 'Please select an expense category');
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      final amount = double.tryParse(_amountController.text) ?? 0;
      final title = _titleController.text.trim();
      final description = _descriptionController.text.trim();
      final justification = _justificationController.text.trim();
      
      final fullDescription = '[${_fundingType.value.toUpperCase()}] $title\n\n$description\n\nJustification: $justification';

      await _service.submitCost(
        expenseCategory: _expenseCategory!,
        fundingType: _fundingType,
        amount: amount,
        currency: 'SDG',
        description: fullDescription,
        justification: justification,
        expenseDate: _expenseDate.toIso8601String().split('T')[0],
        vendor: _vendorController.text.isNotEmpty ? _vendorController.text : null,
        referenceNumber: _referenceController.text.isNotEmpty ? _referenceController.text : null,
        projectId: _projectId,
        hubId: _hubId,
      );

      if (mounted) {
        _showSuccess(widget.isArabic ? 'تم تقديم الطلب بنجاح' : 'Request submitted successfully');
        _resetForm();
        widget.onSuccess?.call();
      }
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  void _resetForm() {
    _formKey.currentState?.reset();
    _amountController.clear();
    _titleController.clear();
    _descriptionController.clear();
    _justificationController.clear();
    _vendorController.clear();
    _referenceController.clear();
    setState(() {
      _fundingType = FundingType.advance;
      _expenseCategory = null;
      _projectId = null;
      _expenseDate = DateTime.now();
    });
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red),
    );
  }

  void _showSuccess(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.green),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.canSubmit) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.lock_outline, size: 64, color: Colors.grey.shade400),
              const SizedBox(height: 16),
              Text(
                widget.isArabic 
                    ? 'ليس لديك صلاحية لتقديم التكاليف'
                    : 'You do not have permission to submit costs',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: Colors.grey.shade600,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Funding Type Selection
            _buildSectionTitle(widget.isArabic ? 'نوع التمويل' : 'Funding Type'),
            const SizedBox(height: 8),
            _buildFundingTypeSelector(),
            const SizedBox(height: 20),

            // Expense Category
            _buildSectionTitle(widget.isArabic ? 'فئة المصروفات' : 'Expense Category'),
            const SizedBox(height: 8),
            _buildExpenseCategoryDropdown(),
            const SizedBox(height: 20),

            // Project (optional)
            _buildSectionTitle(widget.isArabic ? 'المشروع (اختياري)' : 'Project (Optional)'),
            const SizedBox(height: 8),
            _buildProjectDropdown(),
            const SizedBox(height: 20),

            // Hub (optional)
            _buildSectionTitle(widget.isArabic ? 'المحور (اختياري)' : 'Hub (Optional)'),
            const SizedBox(height: 8),
            _buildHubDropdown(),
            const SizedBox(height: 20),

            // Amount
            _buildSectionTitle(widget.isArabic ? 'المبلغ (جنيه سوداني)' : 'Amount (SDG)'),
            const SizedBox(height: 8),
            TextFormField(
              controller: _amountController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'^\d+\.?\d{0,2}')),
              ],
              decoration: InputDecoration(
                hintText: '0.00',
                prefixIcon: const Icon(Icons.attach_money),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return widget.isArabic ? 'المبلغ مطلوب' : 'Amount is required';
                }
                final amount = double.tryParse(value);
                if (amount == null || amount <= 0) {
                  return widget.isArabic ? 'يجب أن يكون المبلغ أكبر من صفر' : 'Amount must be greater than 0';
                }
                return null;
              },
            ),
            const SizedBox(height: 20),

            // Title
            _buildSectionTitle(widget.isArabic ? 'العنوان' : 'Title'),
            const SizedBox(height: 8),
            TextFormField(
              controller: _titleController,
              decoration: InputDecoration(
                hintText: widget.isArabic ? 'عنوان الطلب' : 'Request title',
                prefixIcon: const Icon(Icons.title),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              validator: (value) {
                if (value == null || value.length < 3) {
                  return widget.isArabic ? 'العنوان مطلوب (3 أحرف على الأقل)' : 'Title is required (min 3 characters)';
                }
                return null;
              },
            ),
            const SizedBox(height: 20),

            // Description
            _buildSectionTitle(widget.isArabic ? 'الوصف' : 'Description'),
            const SizedBox(height: 8),
            TextFormField(
              controller: _descriptionController,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: widget.isArabic ? 'وصف تفصيلي للمصروف' : 'Detailed description of the expense',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              validator: (value) {
                if (value == null || value.length < 10) {
                  return widget.isArabic ? 'الوصف مطلوب (10 أحرف على الأقل)' : 'Description is required (min 10 characters)';
                }
                return null;
              },
            ),
            const SizedBox(height: 20),

            // Justification
            _buildSectionTitle(widget.isArabic ? 'المبرر' : 'Justification'),
            const SizedBox(height: 8),
            TextFormField(
              controller: _justificationController,
              maxLines: 2,
              decoration: InputDecoration(
                hintText: widget.isArabic ? 'لماذا هذا المصروف مطلوب' : 'Why is this expense needed',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              validator: (value) {
                if (value == null || value.length < 10) {
                  return widget.isArabic ? 'المبرر مطلوب (10 أحرف على الأقل)' : 'Justification is required (min 10 characters)';
                }
                return null;
              },
            ),
            const SizedBox(height: 20),

            // Expense Date
            _buildSectionTitle(widget.isArabic ? 'تاريخ المصروف' : 'Expense Date'),
            const SizedBox(height: 8),
            InkWell(
              onTap: _selectDate,
              child: InputDecorator(
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.calendar_today),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: Text(
                  '${_expenseDate.year}-${_expenseDate.month.toString().padLeft(2, '0')}-${_expenseDate.day.toString().padLeft(2, '0')}',
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Vendor (optional)
            _buildSectionTitle(widget.isArabic ? 'المورد (اختياري)' : 'Vendor (Optional)'),
            const SizedBox(height: 8),
            TextFormField(
              controller: _vendorController,
              decoration: InputDecoration(
                hintText: widget.isArabic ? 'اسم المورد' : 'Vendor name',
                prefixIcon: const Icon(Icons.store),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
            const SizedBox(height: 20),

            // Reference Number (optional)
            _buildSectionTitle(widget.isArabic ? 'رقم المرجع (اختياري)' : 'Reference Number (Optional)'),
            const SizedBox(height: 8),
            TextFormField(
              controller: _referenceController,
              decoration: InputDecoration(
                hintText: widget.isArabic ? 'رقم الفاتورة أو الإيصال' : 'Invoice or receipt number',
                prefixIcon: const Icon(Icons.numbers),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
            const SizedBox(height: 32),

            // Submit Button
            SizedBox(
              height: 52,
              child: ElevatedButton.icon(
                onPressed: _isSubmitting ? null : _submit,
                icon: _isSubmitting 
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.send),
                label: Text(
                  _isSubmitting
                      ? (widget.isArabic ? 'جاري الإرسال...' : 'Submitting...')
                      : (widget.isArabic ? 'تقديم الطلب' : 'Submit Request'),
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Theme.of(context).colorScheme.primary,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: Theme.of(context).colorScheme.onSurface.withOpacity(0.8),
      ),
    );
  }

  Widget _buildFundingTypeSelector() {
    return Row(
      children: [
        Expanded(
          child: _FundingTypeCard(
            type: FundingType.advance,
            isSelected: _fundingType == FundingType.advance,
            isArabic: widget.isArabic,
            onTap: () => setState(() => _fundingType = FundingType.advance),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _FundingTypeCard(
            type: FundingType.reimbursement,
            isSelected: _fundingType == FundingType.reimbursement,
            isArabic: widget.isArabic,
            onTap: () => setState(() => _fundingType = FundingType.reimbursement),
          ),
        ),
      ],
    );
  }

  Widget _buildExpenseCategoryDropdown() {
    return DropdownButtonFormField<ExpenseCategory>(
      value: _expenseCategory,
      decoration: InputDecoration(
        prefixIcon: const Icon(Icons.category),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        hintText: widget.isArabic ? 'اختر الفئة' : 'Select category',
      ),
      items: ExpenseCategory.values.map((category) {
        return DropdownMenuItem<ExpenseCategory>(
          value: category,
          child: Text(category.getLabel(widget.isArabic)),
        );
      }).toList(),
      onChanged: (value) => setState(() => _expenseCategory = value),
      validator: (value) {
        if (value == null) {
          return widget.isArabic ? 'يرجى اختيار فئة' : 'Please select a category';
        }
        return null;
      },
    );
  }

  Widget _buildProjectDropdown() {
    return DropdownButtonFormField<String>(
      value: _projectId,
      decoration: InputDecoration(
        prefixIcon: const Icon(Icons.folder),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        hintText: widget.isArabic ? 'اختر المشروع' : 'Select project',
      ),
      items: [
        DropdownMenuItem<String>(
          value: null,
          child: Text(widget.isArabic ? 'بدون مشروع' : 'No project'),
        ),
        ..._projects.map((project) {
          return DropdownMenuItem<String>(
            value: project['id'] as String,
            child: Text(project['name'] as String),
          );
        }),
      ],
      onChanged: (value) => setState(() => _projectId = value),
    );
  }

  Widget _buildHubDropdown() {
    return DropdownButtonFormField<String>(
      value: _hubId,
      decoration: InputDecoration(
        prefixIcon: const Icon(Icons.hub),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        hintText: widget.isArabic ? 'اختر المحور' : 'Select hub',
      ),
      items: [
        DropdownMenuItem<String>(
          value: null,
          child: Text(widget.isArabic ? 'بدون محور' : 'No hub'),
        ),
        ..._hubs.map((hub) {
          return DropdownMenuItem<String>(
            value: hub['id'] as String,
            child: Text(hub['name'] as String),
          );
        }),
      ],
      onChanged: (value) => setState(() => _hubId = value),
    );
  }

  Future<void> _selectDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _expenseDate,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 30)),
    );
    if (picked != null) {
      setState(() => _expenseDate = picked);
    }
  }
}

class _FundingTypeCard extends StatelessWidget {
  final FundingType type;
  final bool isSelected;
  final bool isArabic;
  final VoidCallback onTap;

  const _FundingTypeCard({
    required this.type,
    required this.isSelected,
    required this.isArabic,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final isAdvance = type == FundingType.advance;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isSelected
              ? (isAdvance ? Colors.blue.withOpacity(0.1) : Colors.green.withOpacity(0.1))
              : colorScheme.surface,
          border: Border.all(
            color: isSelected
                ? (isAdvance ? Colors.blue : Colors.green)
                : colorScheme.outline.withOpacity(0.3),
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Icon(
              isAdvance ? Icons.wallet : Icons.receipt_long,
              size: 28,
              color: isSelected
                  ? (isAdvance ? Colors.blue : Colors.green)
                  : colorScheme.onSurface.withOpacity(0.5),
            ),
            const SizedBox(height: 8),
            Text(
              type.getLabel(isArabic),
              style: TextStyle(
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                color: isSelected
                    ? (isAdvance ? Colors.blue : Colors.green)
                    : colorScheme.onSurface,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
