import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import '../models/cost_submission.dart';
import '../services/document_upload_service.dart';
import 'document_upload_widget.dart';

/// Cost Reconciliation Form Widget
/// 
/// Used for reconciling advances after money has been disbursed.
/// Allows users to:
/// - Report actual amount spent
/// - Upload reconciliation receipts
/// - Add notes about expenses

class CostReconciliationForm extends StatefulWidget {
  final OperationalCostSubmission submission;
  final DocumentUploadService uploadService;
  final bool isArabic;
  final Function(int actualSpentCents, List<SupportingDocument> documents, String? notes) onSubmit;

  const CostReconciliationForm({
    Key? key,
    required this.submission,
    required this.uploadService,
    required this.onSubmit,
    this.isArabic = false,
  }) : super(key: key);

  @override
  State<CostReconciliationForm> createState() => _CostReconciliationFormState();
}

class _CostReconciliationFormState extends State<CostReconciliationForm> {
  final _formKey = GlobalKey<FormState>();
  final _amountController = TextEditingController();
  final _notesController = TextEditingController();
  List<SupportingDocument> _documents = [];
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    // Pre-fill with disbursed amount
    _amountController.text = widget.submission.amountInCurrency.toStringAsFixed(2);
  }

  @override
  void dispose() {
    _amountController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = widget.isArabic;
    final disbursedAmount = widget.submission.amountInCurrency;
    final currency = widget.submission.currency;

    return SingleChildScrollView(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Original submission info
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.blue.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.blue.withOpacity(0.3)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isArabic ? 'تفاصيل السلفة الأصلية' : 'Original Advance Details',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 12),
                    _DetailRow(
                      label: isArabic ? 'الفئة' : 'Category',
                      value: isArabic
                          ? widget.submission.expenseCategory.labelAr
                          : widget.submission.expenseCategory.labelEn,
                    ),
                    _DetailRow(
                      label: isArabic ? 'المبلغ المصروف' : 'Disbursed Amount',
                      value: '${disbursedAmount.toStringAsFixed(2)} $currency',
                      valueColor: Colors.blue,
                    ),
                    _DetailRow(
                      label: isArabic ? 'التاريخ' : 'Date',
                      value: DateFormat('MMM dd, yyyy').format(
                        DateTime.parse(widget.submission.submittedAt),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Actual spent amount
              Text(
                isArabic ? 'المبلغ المصروف فعلياً *' : 'Actual Amount Spent *',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _amountController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'^\d+\.?\d{0,2}')),
                ],
                decoration: InputDecoration(
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  prefixIcon: const Icon(Icons.attach_money),
                  suffixText: currency,
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return isArabic ? 'مطلوب' : 'Required';
                  }
                  final amount = double.tryParse(value);
                  if (amount == null || amount < 0) {
                    return isArabic ? 'أدخل مبلغ صحيح' : 'Enter valid amount';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 8),

              // Balance indicator
              _buildBalanceIndicator(),
              const SizedBox(height: 24),

              // Reconciliation notes
              Text(
                isArabic ? 'ملاحظات التسوية' : 'Reconciliation Notes',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _notesController,
                maxLines: 3,
                decoration: InputDecoration(
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  hintText: isArabic
                      ? 'أضف أي ملاحظات حول الإنفاق...'
                      : 'Add any notes about the expenses...',
                ),
              ),
              const SizedBox(height: 24),

              // Document upload
              Text(
                isArabic ? 'إيصالات التسوية *' : 'Reconciliation Receipts *',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              DocumentUploadWidget(
                uploadService: widget.uploadService,
                documents: _documents,
                onDocumentsChanged: (docs) {
                  setState(() => _documents = docs);
                },
                isArabic: isArabic,
                maxDocuments: 10,
              ),
              const SizedBox(height: 32),

              // Submit button
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: _isSubmitting ? null : _handleSubmit,
                  style: ElevatedButton.styleFrom(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(
                          isArabic ? 'تقديم التسوية' : 'Submit Reconciliation',
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBalanceIndicator() {
    final isArabic = widget.isArabic;
    final disbursed = widget.submission.amountInCurrency;
    final spent = double.tryParse(_amountController.text) ?? 0;
    final balance = disbursed - spent;
    
    Color color;
    String label;
    IconData icon;
    
    if (balance == 0) {
      color = Colors.green;
      label = isArabic ? 'المبلغ مطابق' : 'Amount matches - No balance';
      icon = Icons.check_circle;
    } else if (balance > 0) {
      color = Colors.orange;
      label = isArabic
          ? 'رصيد للإرجاع: ${balance.toStringAsFixed(2)} ${widget.submission.currency}'
          : 'Balance to return: ${balance.toStringAsFixed(2)} ${widget.submission.currency}';
      icon = Icons.arrow_upward;
    } else {
      color = Colors.red;
      label = isArabic
          ? 'مبلغ إضافي مطلوب: ${(-balance).toStringAsFixed(2)} ${widget.submission.currency}'
          : 'Additional amount needed: ${(-balance).toStringAsFixed(2)} ${widget.submission.currency}';
      icon = Icons.arrow_downward;
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
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              label,
              style: TextStyle(color: color, fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;

    if (_documents.isEmpty) {
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
      final spentAmount = double.parse(_amountController.text);
      final spentCents = (spentAmount * 100).round();

      await widget.onSubmit(
        spentCents,
        _documents,
        _notesController.text.isNotEmpty ? _notesController.text : null,
      );
    } finally {
      setState(() => _isSubmitting = false);
    }
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;

  const _DetailRow({
    required this.label,
    required this.value,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(color: Colors.grey[600]),
          ),
          Text(
            value,
            style: TextStyle(
              fontWeight: FontWeight.w500,
              color: valueColor,
            ),
          ),
        ],
      ),
    );
  }
}
