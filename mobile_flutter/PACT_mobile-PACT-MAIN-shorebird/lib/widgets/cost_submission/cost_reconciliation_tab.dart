/// Cost Reconciliation Tab Widget
/// Form for reconciling advance payments
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../models/operational_cost_submission.dart';
import '../../services/operational_cost_service.dart';
import 'package:intl/intl.dart';

class CostReconciliationTab extends StatefulWidget {
  final bool isArabic;
  final List<OperationalCostSubmission> submissions;
  final VoidCallback? onReconciled;

  const CostReconciliationTab({
    super.key,
    this.isArabic = false,
    required this.submissions,
    this.onReconciled,
  });

  @override
  State<CostReconciliationTab> createState() => _CostReconciliationTabState();
}

class _CostReconciliationTabState extends State<CostReconciliationTab> {
  final _service = OperationalCostService();
  OperationalCostSubmission? _selectedSubmission;
  final _actualAmountController = TextEditingController();
  final _notesController = TextEditingController();
  bool _isSubmitting = false;

  @override
  void dispose() {
    _actualAmountController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.submissions.isEmpty) {
      return _buildEmptyState(context);
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Info Card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.blue.withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.blue.withOpacity(0.3)),
            ),
            child: Row(
              children: [
                Icon(Icons.info_outline, color: Colors.blue.shade700),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    widget.isArabic
                        ? 'قم بتسوية السلف المدفوعة بالمبلغ الفعلي المصروف'
                        : 'Reconcile paid advances with the actual amount spent',
                    style: TextStyle(color: Colors.blue.shade700, fontSize: 13),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Select Advance
          Text(
            widget.isArabic
                ? 'اختر السلفة للتسوية'
                : 'Select Advance to Reconcile',
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          _buildAdvanceSelector(),
          const SizedBox(height: 24),

          if (_selectedSubmission != null) ...[
            // Selected Advance Details
            _buildSelectedAdvanceCard(),
            const SizedBox(height: 24),

            // Actual Amount
            Text(
              widget.isArabic
                  ? 'المبلغ الفعلي المصروف (جنيه سوداني)'
                  : 'Actual Amount Spent (SDG)',
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: _actualAmountController,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'^\d+\.?\d{0,2}')),
              ],
              decoration: InputDecoration(
                hintText: _selectedSubmission!.amount.toStringAsFixed(2),
                prefixIcon: const Icon(Icons.attach_money),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                helperText: widget.isArabic
                    ? 'أدخل المبلغ الفعلي المصروف'
                    : 'Enter the actual amount spent',
              ),
            ),
            const SizedBox(height: 8),

            // Variance display
            if (_actualAmountController.text.isNotEmpty)
              _buildVarianceDisplay(),
            const SizedBox(height: 24),

            // Notes
            Text(
              widget.isArabic ? 'ملاحظات التسوية' : 'Reconciliation Notes',
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: _notesController,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: widget.isArabic
                    ? 'أضف ملاحظات حول التسوية'
                    : 'Add notes about the reconciliation',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 32),

            // Submit Button
            SizedBox(
              height: 52,
              child: ElevatedButton.icon(
                onPressed: _isSubmitting ? null : _submitReconciliation,
                icon: _isSubmitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.check_circle),
                label: Text(
                  _isSubmitting
                      ? (widget.isArabic ? 'جاري التسوية...' : 'Reconciling...')
                      : (widget.isArabic
                            ? 'تأكيد التسوية'
                            : 'Confirm Reconciliation'),
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.grey.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.receipt_long,
                size: 64,
                color: Colors.grey.shade400,
              ),
            ),
            const SizedBox(height: 24),
            Text(
              widget.isArabic
                  ? 'لا توجد سلف للتسوية'
                  : 'No Advances to Reconcile',
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              widget.isArabic
                  ? 'لا توجد سلف مدفوعة تحتاج إلى تسوية'
                  : 'No paid advances require reconciliation',
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: Colors.grey.shade600),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAdvanceSelector() {
    return DropdownButtonFormField<OperationalCostSubmission>(
      value: _selectedSubmission,
      decoration: InputDecoration(
        prefixIcon: const Icon(Icons.receipt),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        hintText: widget.isArabic ? 'اختر سلفة' : 'Select an advance',
      ),
      items: widget.submissions.map((submission) {
        final dateFormat = DateFormat('MMM dd');
        return DropdownMenuItem<OperationalCostSubmission>(
          value: submission,
          child: Row(
            children: [
              Expanded(
                child: Text(
                  '${submission.expenseCategory.getLabel(widget.isArabic)} - ${dateFormat.format(submission.createdAt)}',
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '${submission.amount.toStringAsFixed(0)} SDG',
                style: TextStyle(
                  color: Colors.green.shade700,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        );
      }).toList(),
      onChanged: (value) {
        setState(() {
          _selectedSubmission = value;
          _actualAmountController.text = value?.amount.toStringAsFixed(2) ?? '';
        });
      },
    );
  }

  Widget _buildSelectedAdvanceCard() {
    final submission = _selectedSubmission!;
    final dateFormat = DateFormat('MMM dd, yyyy');

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.blue.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.receipt_long,
                  size: 20,
                  color: Colors.blue,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  submission.expenseCategory.getLabel(widget.isArabic),
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _buildDetailRow(
            widget.isArabic ? 'مبلغ السلفة' : 'Advance Amount',
            '${submission.amount.toStringAsFixed(2)} ${submission.currency}',
            valueColor: Colors.green.shade700,
          ),
          _buildDetailRow(
            widget.isArabic ? 'تاريخ الدفع' : 'Payment Date',
            dateFormat.format(submission.createdAt),
          ),
          if (submission.projectName != null)
            _buildDetailRow(
              widget.isArabic ? 'المشروع' : 'Project',
              submission.projectName!,
            ),
          const SizedBox(height: 8),
          Text(
            submission.description,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 13,
              color: Theme.of(context).colorScheme.onSurface.withOpacity(0.7),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailRow(String label, String value, {Color? valueColor}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
          ),
          Text(
            value,
            style: TextStyle(fontWeight: FontWeight.w600, color: valueColor),
          ),
        ],
      ),
    );
  }

  Widget _buildVarianceDisplay() {
    final actualAmount = double.tryParse(_actualAmountController.text) ?? 0;
    final advanceAmount = _selectedSubmission!.amount;
    final variance = actualAmount - advanceAmount;
    final isRefund = variance < 0;
    final isOverspent = variance > 0;

    Color color = Colors.grey;
    String message = '';
    IconData icon = Icons.check_circle;

    if (isRefund) {
      color = Colors.blue;
      message = widget.isArabic
          ? 'مبلغ الإرجاع: ${variance.abs().toStringAsFixed(2)} SDG'
          : 'Refund amount: ${variance.abs().toStringAsFixed(2)} SDG';
      icon = Icons.arrow_back;
    } else if (isOverspent) {
      color = Colors.orange;
      message = widget.isArabic
          ? 'مبلغ إضافي مطلوب: ${variance.toStringAsFixed(2)} SDG'
          : 'Additional amount needed: ${variance.toStringAsFixed(2)} SDG';
      icon = Icons.warning;
    } else {
      color = Colors.green;
      message = widget.isArabic ? 'المبلغ متطابق' : 'Amount matches exactly';
      icon = Icons.check_circle;
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.w500,
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _submitReconciliation() async {
    if (_selectedSubmission == null) return;

    final actualAmount = double.tryParse(_actualAmountController.text);
    if (actualAmount == null || actualAmount < 0) {
      _showError(
        widget.isArabic
            ? 'يرجى إدخال مبلغ صحيح'
            : 'Please enter a valid amount',
      );
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      final success = await _service.reconcileAdvance(
        submissionId: _selectedSubmission!.id,
        actualAmount: actualAmount,
        notes: _notesController.text.isNotEmpty ? _notesController.text : null,
      );

      if (success && mounted) {
        _showSuccess(
          widget.isArabic
              ? 'تمت التسوية بنجاح'
              : 'Reconciliation completed successfully',
        );
        _resetForm();
        widget.onReconciled?.call();
      }
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  void _resetForm() {
    setState(() {
      _selectedSubmission = null;
      _actualAmountController.clear();
      _notesController.clear();
    });
  }

  void _showSuccess(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.green),
    );
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red),
    );
  }
}
