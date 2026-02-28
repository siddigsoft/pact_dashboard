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

  List<Map<String, dynamic>> _installments = [];

  @override
  void initState() {
    super.initState();
    if (widget.transportationBudget > 0) {
      _amountController.text =
          widget.transportationBudget.toStringAsFixed(0);
    }
    _installments = [
      {
        'amount': widget.transportationBudget > 0
            ? widget.transportationBudget * 0.6
            : 0.0,
        'stage': 'before_travel',
        'description': 'Initial down-payment',
        'paid': false,
      },
      {
        'amount': widget.transportationBudget > 0
            ? widget.transportationBudget * 0.4
            : 0.0,
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

  double get _requestedAmount =>
      double.tryParse(_amountController.text) ?? 0.0;

  double get _installmentTotal => _installments.fold<double>(
        0.0,
        (sum, inst) => sum + (inst['amount'] as num? ?? 0).toDouble(),
      );

  void _setQuickAmount(double pct) {
    if (widget.transportationBudget <= 0) return;
    final val = (widget.transportationBudget * pct).floorToDouble();
    _amountController.text = val.toStringAsFixed(0);
    setState(() {});
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
    setState(() => _installments.removeAt(index));
  }

  void _updateInstallment(int index, String field, dynamic value) {
    setState(() => _installments[index][field] = value);
  }

  Future<void> _submit(bool isArabic) async {
    if (_justificationController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            isArabic
                ? 'يرجى إدخال مبرر للطلب'
                : 'Please provide justification for this request',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_requestedAmount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            isArabic
                ? 'يجب أن يكون المبلغ أكبر من صفر'
                : 'Requested amount must be greater than zero',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (widget.transportationBudget > 0 &&
        _requestedAmount > widget.transportationBudget) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            isArabic
                ? 'المبلغ يتجاوز الميزانية المحددة (${widget.transportationBudget.toStringAsFixed(0)} SDG)'
                : 'Amount cannot exceed budget (${widget.transportationBudget.toStringAsFixed(0)} SDG)',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_paymentType == 'installments' &&
        _installmentTotal != _requestedAmount) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            isArabic
                ? 'مجموع الأقساط (${_installmentTotal.toStringAsFixed(0)} SDG) يجب أن يساوي المبلغ المطلوب'
                : 'Installment total (${_installmentTotal.toStringAsFixed(0)} SDG) must equal requested amount',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() => _isSubmitting = true);
    try {
      Navigator.of(context).pop({
        'success': true,
        'requestedAmount': _requestedAmount,
        'paymentType': _paymentType,
        'justification': _justificationController.text.trim(),
        'installmentPlan':
            _paymentType == 'installments' ? _installments : [],
      });
    } catch (e) {
      if (mounted) {
        setState(() => _isSubmitting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isArabic =
        Localizations.localeOf(context).languageCode == 'ar';
    final siteName =
        widget.site['site_name'] ?? widget.site['siteName'] ?? 'Unknown Site';
    final siteCode =
        widget.site['site_code'] ?? widget.site['siteCode'] ?? '';
    final state = widget.site['state'] ?? '';
    final locality = widget.site['locality'] ?? '';
    final budget = widget.transportationBudget;
    final fillPct =
        budget > 0 ? (_requestedAmount / budget).clamp(0.0, 1.0) : 0.0;

    return Dialog(
      insetPadding:
          const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      backgroundColor: Colors.transparent,
      child: Container(
        constraints: const BoxConstraints(maxHeight: 680),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.18),
              blurRadius: 32,
              offset: const Offset(0, 12),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // ── Gradient header ─────────────────────────────────────────
            Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFF7C3AED), Color(0xFF5B21B6)],
                ),
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(24),
                  topRight: Radius.circular(24),
                ),
              ),
              padding: const EdgeInsets.fromLTRB(20, 20, 16, 20),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.account_balance_wallet_rounded,
                      color: Colors.white,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          isArabic ? 'طلب سلفة' : 'Request Advance',
                          style: GoogleFonts.poppins(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        Text(
                          'طلب سلفة | Request Advance',
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: Colors.white70,
                          ),
                        ),
                      ],
                    ),
                  ),
                  GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.close,
                        color: Colors.white,
                        size: 18,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // ── Site info strip ──────────────────────────────────────────
            Container(
              color: const Color(0xFFF5F0FF),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
              child: Row(
                children: [
                  Expanded(
                    flex: 2,
                    child: _infoTile(
                      'الموقع / Site',
                      siteName,
                      siteCode.isNotEmpty ? siteCode : null,
                      Icons.location_on_outlined,
                      const Color(0xFF7C3AED),
                    ),
                  ),
                  Container(
                    width: 1,
                    height: 44,
                    color: Colors.purple[100],
                  ),
                  Expanded(
                    child: _infoTile(
                      'ميزانية النقل\nTransport Budget',
                      budget > 0
                          ? '${budget.toStringAsFixed(0)} SDG'
                          : 'غير محدد / Open',
                      null,
                      Icons.payments_outlined,
                      Colors.green,
                    ),
                  ),
                  if (widget.hubName != null) ...[
                    Container(
                      width: 1,
                      height: 44,
                      color: Colors.purple[100],
                    ),
                    Expanded(
                      child: _infoTile(
                        'المحور / Hub',
                        widget.hubName!,
                        null,
                        Icons.hub_outlined,
                        Colors.orange,
                      ),
                    ),
                  ],
                ],
              ),
            ),

            // ── Form body ────────────────────────────────────────────────
            Expanded(
              child: Form(
                key: _formKey,
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Location row
                      if (state.isNotEmpty || locality.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 16),
                          child: Row(
                            children: [
                              const Icon(
                                Icons.map_outlined,
                                size: 14,
                                color: Color(0xFF7C3AED),
                              ),
                              const SizedBox(width: 4),
                              Text(
                                [locality, state]
                                    .where((s) => s.isNotEmpty)
                                    .join(', '),
                                style: GoogleFonts.poppins(
                                  fontSize: 12,
                                  color: Colors.grey.shade600,
                                ),
                              ),
                            ],
                          ),
                        ),

                      // Quick-select %
                      if (budget > 0) ...[
                        Row(
                          children: [
                            Text(
                              'اختيار سريع / Quick select:',
                              style: GoogleFonts.poppins(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: Colors.grey.shade500,
                              ),
                            ),
                            const SizedBox(width: 8),
                            ...[
                              ('25%', 0.25),
                              ('50%', 0.50),
                              ('75%', 0.75),
                              ('الكل / Max', 1.0),
                            ].map((entry) {
                              return Padding(
                                padding: const EdgeInsets.only(right: 6),
                                child: GestureDetector(
                                  onTap: () => _setQuickAmount(entry.$2),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 10,
                                      vertical: 5,
                                    ),
                                    decoration: BoxDecoration(
                                      color: const Color(
                                        0xFF7C3AED,
                                      ).withValues(alpha: 0.08),
                                      borderRadius: BorderRadius.circular(20),
                                      border: Border.all(
                                        color: const Color(
                                          0xFF7C3AED,
                                        ).withValues(alpha: 0.3),
                                      ),
                                    ),
                                    child: Text(
                                      entry.$1,
                                      style: GoogleFonts.poppins(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                        color: const Color(0xFF7C3AED),
                                      ),
                                    ),
                                  ),
                                ),
                              );
                            }),
                          ],
                        ),
                        const SizedBox(height: 12),
                      ],

                      // Amount label
                      Text(
                        'المبلغ المطلوب (SDG) *\nRequested Amount (SDG) *',
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),

                      // Amount input
                      TextFormField(
                        controller: _amountController,
                        keyboardType: TextInputType.number,
                        style: GoogleFonts.poppins(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                        decoration: InputDecoration(
                          hintText: 'أدخل المبلغ / Enter amount',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: BorderSide(
                              color: Colors.grey.shade300,
                            ),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: BorderSide(
                              color: Colors.grey.shade300,
                            ),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: const BorderSide(
                              color: Color(0xFF7C3AED),
                              width: 2,
                            ),
                          ),
                          filled: true,
                          fillColor: Colors.white,
                          suffixText: 'SDG',
                          suffixStyle: GoogleFonts.poppins(
                            color: Colors.grey.shade500,
                            fontWeight: FontWeight.w600,
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 16,
                          ),
                        ),
                        onChanged: (_) => setState(() {}),
                        validator: (value) {
                          final amount = double.tryParse(value ?? '') ?? 0;
                          if (amount <= 0) {
                            return isArabic
                                ? 'يجب أن يكون المبلغ أكبر من صفر'
                                : 'Amount must be greater than zero';
                          }
                          if (budget > 0 && amount > budget) {
                            return 'المبلغ يتجاوز ميزانية النقل (\${budget.toStringAsFixed(0)} SDG)\nCannot exceed \${budget.toStringAsFixed(0)} SDG';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 8),

                      // Budget cap hint + progress bar
                      Text(
                        budget > 0
                            ? 'الحد الأقصى: \${budget.toStringAsFixed(0)} SDG (ميزانية النقل)\nMaximum: \${budget.toStringAsFixed(0)} SDG (transport budget)'
                            : 'أدخل مبلغ السلفة المطلوبة\nEnter the advance amount you need',
                        style: GoogleFonts.poppins(
                          fontSize: 11.5,
                          color: Colors.grey.shade500,
                        ),
                      ),

                      if (budget > 0 && _requestedAmount > 0) ...[
                        const SizedBox(height: 8),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: fillPct,
                            minHeight: 6,
                            backgroundColor: Colors.grey.shade200,
                            valueColor: AlwaysStoppedAnimation<Color>(
                              fillPct > 1.0
                                  ? Colors.red
                                  : const Color(0xFF7C3AED),
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 20),

                      // Payment Type
                      Text(
                        'نوع الدفع / Payment Type *',
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: _paymentTypeCard(
                              label: 'سلفة كاملة / Full Advance',
                              sublabel: 'استلام المبلغ كاملاً\nReceive entire amount',
                              icon: Icons.payments_rounded,
                              value: 'full_advance',
                              isArabic: isArabic,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: _paymentTypeCard(
                              label: 'أقساط / Installments',
                              sublabel: 'دفعات متعددة\nReceive in stages',
                              icon: Icons.schedule_rounded,
                              value: 'installments',
                              isArabic: isArabic,
                            ),
                          ),
                        ],
                      ),

                      // Installment plan
                      if (_paymentType == 'installments') ...[
                        const SizedBox(height: 20),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              isArabic ? 'خطة الأقساط' : 'Installment Plan',
                              style: GoogleFonts.poppins(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            TextButton.icon(
                              onPressed: _addInstallment,
                              icon: const Icon(Icons.add, size: 16),
                              label: Text(
                                isArabic ? 'إضافة قسط' : 'Add',
                                style: GoogleFonts.poppins(fontSize: 12),
                              ),
                              style: TextButton.styleFrom(
                                foregroundColor: const Color(0xFF7C3AED),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        ...List.generate(_installments.length, (index) {
                          return Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              border: Border.all(
                                color: const Color(0xFF7C3AED).withValues(
                                  alpha: 0.2,
                                ),
                              ),
                              borderRadius: BorderRadius.circular(12),
                              color: const Color(0xFFF5F0FF),
                            ),
                            child: Column(
                              children: [
                                Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      '${isArabic ? 'القسط' : 'Installment'} ${index + 1}',
                                      style: GoogleFonts.poppins(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    if (_installments.length > 1)
                                      GestureDetector(
                                        onTap: () =>
                                            _removeInstallment(index),
                                        child: const Icon(
                                          Icons.remove_circle_outline,
                                          color: Colors.red,
                                          size: 20,
                                        ),
                                      ),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                Row(
                                  children: [
                                    Expanded(
                                      child: TextFormField(
                                        initialValue:
                                            (_installments[index]['amount']
                                                        as num?)
                                                    ?.toStringAsFixed(0) ??
                                                '0',
                                        keyboardType: TextInputType.number,
                                        decoration: InputDecoration(
                                          labelText: isArabic
                                              ? 'المبلغ (SDG)'
                                              : 'Amount (SDG)',
                                          border: OutlineInputBorder(
                                            borderRadius:
                                                BorderRadius.circular(8),
                                          ),
                                          filled: true,
                                          fillColor: Colors.white,
                                          isDense: true,
                                        ),
                                        onChanged: (v) => _updateInstallment(
                                          index,
                                          'amount',
                                          double.tryParse(v) ?? 0.0,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: TextFormField(
                                        initialValue:
                                            _installments[index]['stage']
                                                    as String? ??
                                                '',
                                        decoration: InputDecoration(
                                          labelText:
                                              isArabic ? 'المرحلة' : 'Stage',
                                          hintText: 'e.g. before_travel',
                                          border: OutlineInputBorder(
                                            borderRadius:
                                                BorderRadius.circular(8),
                                          ),
                                          filled: true,
                                          fillColor: Colors.white,
                                          isDense: true,
                                        ),
                                        onChanged: (v) => _updateInstallment(
                                            index, 'stage', v),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                TextFormField(
                                  initialValue:
                                      _installments[index]['description']
                                              as String? ??
                                          '',
                                  decoration: InputDecoration(
                                    labelText:
                                        isArabic ? 'الوصف' : 'Description',
                                    hintText: isArabic
                                        ? 'وصف مرحلة الدفع'
                                        : 'Describe this payment stage',
                                    border: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    filled: true,
                                    fillColor: Colors.white,
                                    isDense: true,
                                  ),
                                  onChanged: (v) => _updateInstallment(
                                      index, 'description', v),
                                ),
                              ],
                            ),
                          );
                        }),

                        // Installment total indicator
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: _installmentTotal == _requestedAmount &&
                                    _requestedAmount > 0
                                ? Colors.green.shade50
                                : Colors.orange.shade50,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: _installmentTotal == _requestedAmount &&
                                      _requestedAmount > 0
                                  ? Colors.green.shade200
                                  : Colors.orange.shade200,
                            ),
                          ),
                          child: Row(
                            children: [
                              Icon(
                                _installmentTotal == _requestedAmount &&
                                        _requestedAmount > 0
                                    ? Icons.check_circle_outline
                                    : Icons.warning_amber_outlined,
                                size: 16,
                                color: _installmentTotal == _requestedAmount &&
                                        _requestedAmount > 0
                                    ? Colors.green.shade700
                                    : Colors.orange.shade700,
                              ),
                              const SizedBox(width: 8),
                              Text(
                                '${isArabic ? 'مجموع الأقساط' : 'Installment total'}: ${_installmentTotal.toStringAsFixed(0)} SDG',
                                style: GoogleFonts.poppins(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: _installmentTotal == _requestedAmount &&
                                          _requestedAmount > 0
                                      ? Colors.green.shade700
                                      : Colors.orange.shade700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                      const SizedBox(height: 20),

                      // Justification
                      Text(
                        'المبرر / Justification *',
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextFormField(
                        controller: _justificationController,
                        maxLines: 3,
                        decoration: InputDecoration(
                          hintText: 'اذكر سبب طلب السلفة...\nExplain why you need this advance...',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide:
                                BorderSide(color: Colors.grey.shade300),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide:
                                BorderSide(color: Colors.grey.shade300),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(
                              color: Color(0xFF7C3AED),
                              width: 2,
                            ),
                          ),
                          filled: true,
                          fillColor: Colors.white,
                          contentPadding: const EdgeInsets.all(14),
                        ),
                      ),
                      const SizedBox(height: 24),
                    ],
                  ),
                ),
              ),
            ),

            // ── Footer buttons ───────────────────────────────────────────
            Container(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
              decoration: BoxDecoration(
                color: Colors.grey.shade50,
                borderRadius: const BorderRadius.only(
                  bottomLeft: Radius.circular(24),
                  bottomRight: Radius.circular(24),
                ),
                border: Border(
                  top: BorderSide(color: Colors.grey.shade200),
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        side: const BorderSide(color: Color(0xFF7C3AED)),
                      ),
                      child: Text(
                        isArabic ? 'إلغاء' : 'Cancel',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFF7C3AED),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton(
                      onPressed: _isSubmitting ? null : () => _submit(isArabic),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF7C3AED),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 0,
                      ),
                      child: _isSubmitting
                          ? const SizedBox(
                              height: 18,
                              width: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              isArabic ? 'إرسال الطلب' : 'Submit Request',
                              style: GoogleFonts.poppins(
                                fontWeight: FontWeight.w700,
                                fontSize: 14,
                              ),
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _infoTile(
    String label,
    String value,
    String? sub,
    IconData icon,
    Color color,
  ) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 12, color: color),
              const SizedBox(width: 4),
              Text(
                label,
                style: GoogleFonts.poppins(
                  fontSize: 10,
                  color: Colors.grey.shade500,
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.poppins(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
          if (sub != null && sub.isNotEmpty)
            Text(
              sub,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.poppins(
                fontSize: 10,
                color: Colors.grey.shade500,
              ),
            ),
        ],
      ),
    );
  }

  Widget _paymentTypeCard({
    required String label,
    required String sublabel,
    required IconData icon,
    required String value,
    required bool isArabic,
  }) {
    final isSelected = _paymentType == value;
    return GestureDetector(
      onTap: () => setState(() => _paymentType = value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
        decoration: BoxDecoration(
          color: isSelected
              ? const Color(0xFF7C3AED).withValues(alpha: 0.08)
              : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected
                ? const Color(0xFF7C3AED)
                : Colors.grey.shade300,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Column(
          children: [
            Icon(
              icon,
              color: isSelected ? const Color(0xFF7C3AED) : Colors.grey,
              size: 24,
            ),
            const SizedBox(height: 6),
            Text(
              label,
              textAlign: TextAlign.center,
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: isSelected
                    ? const Color(0xFF7C3AED)
                    : Colors.grey.shade700,
              ),
            ),
            Text(
              sublabel,
              textAlign: TextAlign.center,
              style: GoogleFonts.poppins(
                fontSize: 10,
                color: Colors.grey.shade500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
