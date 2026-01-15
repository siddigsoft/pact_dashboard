import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

class RequestAdvanceDialog extends StatefulWidget {
  final Map<String, dynamic> site;
  final double transportationBudget;
  final String? hubId;
  final String? hubName;

  const RequestAdvanceDialog({
    super.key,
    required this.site,
    required this.transportationBudget,
    this.hubId,
    this.hubName,
  });

  @override
  State<RequestAdvanceDialog> createState() => _RequestAdvanceDialogState();
}

class _RequestAdvanceDialogState extends State<RequestAdvanceDialog> {
  final _formKey = GlobalKey<FormState>();
  final _amountController = TextEditingController();
  final _justificationController = TextEditingController();
  
  String _paymentType = 'full_advance';
  bool _isSubmitting = false;
  
  // Installment plan
  List<Map<String, dynamic>> _installments = [];

  @override
  void initState() {
    super.initState();
    _amountController.text = widget.transportationBudget.toStringAsFixed(0);
    _installments = [
      {
        'amount': widget.transportationBudget * 0.6,
        'stage': 'before_travel',
        'description': 'Initial down-payment',
        'paid': false,
      },
      {
        'amount': widget.transportationBudget * 0.4,
        'stage': 'after_completion',
        'description': 'Final payment',
        'paid': false,
      },
    ];
  }

  @override
  void dispose() {
    _amountController.dispose();
    _justificationController.dispose();
    super.dispose();
  }

  double get _requestedAmount {
    return double.tryParse(_amountController.text) ?? 0.0;
  }

  double get _installmentTotal {
    return _installments.fold<double>(
      0.0,
      (sum, inst) => sum + (inst['amount'] as num? ?? 0).toDouble(),
    );
  }

  void _addInstallment() {
    setState(() {
      _installments.add({
        'amount': 0.0,
        'stage': '',
        'description': '',
        'paid': false,
      });
    });
  }

  void _removeInstallment(int index) {
    setState(() {
      _installments.removeAt(index);
    });
  }

  void _updateInstallment(int index, String field, dynamic value) {
    setState(() {
      _installments[index][field] = value;
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    if (_justificationController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please provide justification for this request'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_requestedAmount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Requested amount must be greater than zero'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_requestedAmount > widget.transportationBudget) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Requested amount (${_requestedAmount.toStringAsFixed(0)} SDG) cannot exceed transportation budget (${widget.transportationBudget.toStringAsFixed(0)} SDG)',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_paymentType == 'installments') {
      if (_installmentTotal != _requestedAmount) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Installment total (${_installmentTotal.toStringAsFixed(0)} SDG) must equal requested amount (${_requestedAmount.toStringAsFixed(0)} SDG)',
            ),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }
    }

    setState(() => _isSubmitting = true);

    try {
      Navigator.of(context).pop({
        'success': true,
        'requestedAmount': _requestedAmount,
        'paymentType': _paymentType,
        'justification': _justificationController.text.trim(),
        'installmentPlan': _paymentType == 'installments' ? _installments : [],
      });
    } catch (e) {
      debugPrint('Error submitting advance request: $e');
      if (mounted) {
        setState(() => _isSubmitting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final siteName = widget.site['site_name'] ?? widget.site['siteName'] ?? 'Unknown Site';

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        constraints: const BoxConstraints(maxHeight: 600),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.primaryBlue,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(16),
                  topRight: Radius.circular(16),
                ),
              ),
              child: Row(
                children: [
                  const Icon(Icons.payment, color: Colors.white, size: 24),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Request Advance',
                      style: GoogleFonts.poppins(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
            // Content
            Expanded(
              child: Form(
                key: _formKey,
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Site Info Card
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: AppColors.backgroundGray,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'Site Name',
                                        style: GoogleFonts.poppins(
                                          fontSize: 12,
                                          color: AppColors.textLight,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        siteName,
                                        style: GoogleFonts.poppins(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text(
                                      'Transport Budget',
                                      style: GoogleFonts.poppins(
                                        fontSize: 12,
                                        color: AppColors.textLight,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '${widget.transportationBudget.toStringAsFixed(0)} SDG',
                                      style: GoogleFonts.poppins(
                                        fontSize: 16,
                                        fontWeight: FontWeight.bold,
                                        color: AppColors.primaryBlue,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                            if (widget.hubName != null) ...[
                              const Divider(height: 24),
                              Row(
                                children: [
                                  Text(
                                    'Hub: ',
                                    style: GoogleFonts.poppins(
                                      fontSize: 12,
                                      color: AppColors.textLight,
                                    ),
                                  ),
                                  Text(
                                    widget.hubName!,
                                    style: GoogleFonts.poppins(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),

                      // Requested Amount
                      Text(
                        'Requested Amount (SDG) *',
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextFormField(
                        controller: _amountController,
                        keyboardType: TextInputType.number,
                        decoration: InputDecoration(
                          hintText: 'Enter amount',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          filled: true,
                          fillColor: Colors.white,
                          errorText: _requestedAmount > widget.transportationBudget
                              ? 'Amount exceeds budget by ${(_requestedAmount - widget.transportationBudget).toStringAsFixed(0)} SDG'
                              : _requestedAmount <= 0
                                  ? 'Amount must be greater than zero'
                                  : null,
                          suffixText: 'SDG',
                        ),
                        validator: (value) {
                          final amount = double.tryParse(value ?? '') ?? 0;
                          if (amount <= 0) {
                            return 'Amount must be greater than zero';
                          }
                          if (amount > widget.transportationBudget) {
                            return 'Amount cannot exceed ${widget.transportationBudget.toStringAsFixed(0)} SDG';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Maximum: ${widget.transportationBudget.toStringAsFixed(0)} SDG (total transportation budget)',
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          color: AppColors.textLight,
                        ),
                      ),
                      const SizedBox(height: 20),

                      // Payment Type
                      Text(
                        'Payment Type *',
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: RadioListTile<String>(
                              title: Text(
                                'Full Advance',
                                style: GoogleFonts.poppins(fontSize: 13),
                              ),
                              subtitle: Text(
                                'Receive entire amount upfront',
                                style: GoogleFonts.poppins(
                                  fontSize: 11,
                                  color: AppColors.textLight,
                                ),
                              ),
                              value: 'full_advance',
                              groupValue: _paymentType,
                              onChanged: (value) {
                                setState(() => _paymentType = value ?? 'full_advance');
                              },
                              contentPadding: EdgeInsets.zero,
                            ),
                          ),
                          Expanded(
                            child: RadioListTile<String>(
                              title: Text(
                                'Installments',
                                style: GoogleFonts.poppins(fontSize: 13),
                              ),
                              subtitle: Text(
                                'Receive payment in stages',
                                style: GoogleFonts.poppins(
                                  fontSize: 11,
                                  color: AppColors.textLight,
                                ),
                              ),
                              value: 'installments',
                              groupValue: _paymentType,
                              onChanged: (value) {
                                setState(() => _paymentType = value ?? 'installments');
                              },
                              contentPadding: EdgeInsets.zero,
                            ),
                          ),
                        ],
                      ),

                      // Installment Plan
                      if (_paymentType == 'installments') ...[
                        const SizedBox(height: 20),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Installment Plan',
                              style: GoogleFonts.poppins(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            TextButton.icon(
                              onPressed: _addInstallment,
                              icon: const Icon(Icons.add, size: 18),
                              label: const Text('Add Installment'),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        ...List.generate(_installments.length, (index) {
                          return Container(
                            margin: const EdgeInsets.only(bottom: 12),
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              border: Border.all(color: AppColors.backgroundGray),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Column(
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      'Installment ${index + 1}',
                                      style: GoogleFonts.poppins(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    if (_installments.length > 1)
                                      IconButton(
                                        icon: const Icon(Icons.delete, color: Colors.red, size: 20),
                                        onPressed: () => _removeInstallment(index),
                                      ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                Row(
                                  children: [
                                    Expanded(
                                      child: TextFormField(
                                        initialValue: (_installments[index]['amount'] as num?)?.toStringAsFixed(0) ?? '0',
                                        keyboardType: TextInputType.number,
                                        decoration: InputDecoration(
                                          labelText: 'Amount (SDG)',
                                          border: OutlineInputBorder(
                                            borderRadius: BorderRadius.circular(8),
                                          ),
                                          filled: true,
                                          fillColor: Colors.white,
                                          isDense: true,
                                        ),
                                        onChanged: (value) {
                                          _updateInstallment(
                                            index,
                                            'amount',
                                            double.tryParse(value) ?? 0.0,
                                          );
                                        },
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: TextFormField(
                                        initialValue: _installments[index]['stage'] as String? ?? '',
                                        decoration: InputDecoration(
                                          labelText: 'Stage',
                                          hintText: 'e.g., before_travel',
                                          border: OutlineInputBorder(
                                            borderRadius: BorderRadius.circular(8),
                                          ),
                                          filled: true,
                                          fillColor: Colors.white,
                                          isDense: true,
                                        ),
                                        onChanged: (value) {
                                          _updateInstallment(index, 'stage', value);
                                        },
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                TextFormField(
                                  initialValue: _installments[index]['description'] as String? ?? '',
                                  decoration: InputDecoration(
                                    labelText: 'Description',
                                    hintText: 'Describe this payment stage',
                                    border: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    filled: true,
                                    fillColor: Colors.white,
                                    isDense: true,
                                  ),
                                  onChanged: (value) {
                                    _updateInstallment(index, 'description', value);
                                  },
                                ),
                              ],
                            ),
                          );
                        }),
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: AppColors.backgroundGray,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'Total Installments:',
                                style: GoogleFonts.poppins(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              Text(
                                '${_installmentTotal.toStringAsFixed(0)} SDG',
                                style: GoogleFonts.poppins(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                  color: _installmentTotal == _requestedAmount
                                      ? Colors.green
                                      : Colors.red,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (_installmentTotal != _requestedAmount) ...[
                          const SizedBox(height: 8),
                          Text(
                            '⚠️ Installment total must equal requested amount',
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              color: Colors.red,
                            ),
                          ),
                        ],
                      ],

                      const SizedBox(height: 20),

                      // Justification
                      Text(
                        'Justification *',
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextFormField(
                        controller: _justificationController,
                        maxLines: 4,
                        decoration: InputDecoration(
                          hintText: 'Explain why you need this advance and how it will be used...',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          filled: true,
                          fillColor: Colors.white,
                        ),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'Justification is required';
                          }
                          return null;
                        },
                      ),
                    ],
                  ),
                ),
              ),
            ),
            // Footer
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                border: Border(
                  top: BorderSide(color: AppColors.backgroundGray),
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: _isSubmitting ? null : () => Navigator.of(context).pop(),
                    child: const Text('Cancel'),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    onPressed: _isSubmitting ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green,
                      foregroundColor: Colors.white,
                    ),
                    child: _isSubmitting
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                            ),
                          )
                        : const Text('Submit Request'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

