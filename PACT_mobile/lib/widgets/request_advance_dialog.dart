import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Transportation Advance Request dialog.
///
/// Layout mirrors the Quick Withdrawal Request dialog exactly:
///   • Blue gradient header
///   • Light-blue info strip (site name | transport budget ceiling)
///   • Quick-select % chips  →  amount field (inline error if over-budget)
///   • Progress bar  →  notes field
///   • Green summary row (visible when amount is valid)
///   • Cancel / Submit buttons
///
/// Amount is hard-capped at [transportationBudget].  If the user types
/// more, the field shows "Amount not accepted" inline (same pattern as
/// the withdrawal dialog's "Insufficient balance" errorText) and the
/// submit button stays disabled.
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
  final _amountController = TextEditingController();
  final _notesController = TextEditingController();
  final bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    // Pre-fill with the full transport budget so the user just taps Submit.
    if (widget.transportationBudget > 0) {
      _amountController.text = widget.transportationBudget.toStringAsFixed(0);
    }
  }

  @override
  void dispose() {
    _amountController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  // ── Derived values ──────────────────────────────────────────────────────

  double get _amount => double.tryParse(_amountController.text) ?? 0.0;
  double get _budget => widget.transportationBudget;

  bool get _isOverBudget => _budget > 0 && _amount > _budget;
  bool get _isZeroOrEmpty => _amount <= 0;
  bool get _isValid => !_isZeroOrEmpty && !_isOverBudget;

  double get _fillPct =>
      _budget > 0 ? (_amount / _budget).clamp(0.0, 1.0) : 0.0;

  // ── Quick-select helpers ────────────────────────────────────────────────

  void _setQuickAmount(double pct) {
    if (_budget <= 0) return;
    final val = (_budget * pct).floorToDouble();
    _amountController.text = val.toStringAsFixed(0);
    setState(() {});
  }

  String _fmtCurrency(double v) =>
      '${v.toStringAsFixed(0).replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',')} SDG';

  // ── Submit ──────────────────────────────────────────────────────────────

  void _submit() {
    if (!_isValid || _isSubmitting) return;
    Navigator.of(context).pop({
      'success': true,
      'requestedAmount': _amount,
      'paymentType': 'full_advance',
      'justification': _notesController.text.trim().isEmpty
          ? 'Transportation advance'
          : _notesController.text.trim(),
      'installmentPlan': <Map<String, dynamic>>[],
    });
  }

  // ── Build ───────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final siteName =
        widget.site['site_name'] ?? widget.site['siteName'] ?? 'Unknown Site';
    final siteCode = widget.site['site_code'] ?? widget.site['siteCode'] ?? '';
    final state = widget.site['state'] ?? '';
    final locality = widget.site['locality'] ?? '';

    final amount = _amount;
    final isValid = _isValid;

    // Inline error text — matches withdrawal dialog's "Insufficient balance"
    String? errorText;
    if (_isOverBudget) {
      errorText = isArabic
          ? 'المبلغ غير مقبول — الحد ${_fmtCurrency(_budget)}'
          : 'Amount not accepted — max is ${_fmtCurrency(_budget)}';
    } else if (amount < 0) {
      errorText = isArabic ? 'مبلغ غير صالح' : 'Invalid amount';
    }

    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 32),
      backgroundColor: Colors.transparent,
      child: Container(
        constraints: const BoxConstraints(maxHeight: 640),
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
            // ── Gradient header (matches withdrawal dialog exactly) ──────
            Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [AppColors.primaryBlue, Color(0xFF2E5C8A)],
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
                      Icons.directions_car_rounded,
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
                          isArabic
                              ? 'طلب سلفة نقل'
                              : 'Request Transport Advance',
                          style: GoogleFonts.poppins(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        Text(
                          'طلب سلفة نقل | Transport Advance',
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

            // ── Info strip (matches withdrawal balance strip) ────────────
            Container(
              color: const Color(0xFFF0F7FF),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
              child: Row(
                children: [
                  Expanded(
                    flex: 2,
                    child: _summaryTile(
                      isArabic ? 'الموقع' : 'Site',
                      siteName,
                      siteCode.isNotEmpty
                          ? siteCode
                          : [
                              locality,
                              state,
                            ].where((s) => s.isNotEmpty).join(', '),
                      Icons.location_on_outlined,
                      AppColors.primaryBlue,
                    ),
                  ),
                  Container(width: 1, height: 44, color: Colors.blue[100]),
                  Expanded(
                    child: _summaryTile(
                      isArabic ? 'حد السلفة' : 'Max Advance',
                      _budget > 0 ? _fmtCurrency(_budget) : '—',
                      isArabic ? 'ميزانية النقل' : 'Transport budget',
                      Icons.lock_outline_rounded,
                      Colors.orange,
                    ),
                  ),
                ],
              ),
            ),

            // ── Form body ────────────────────────────────────────────────
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Transportation-only info banner
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFF7E6),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: Colors.orange.withValues(alpha: 0.4),
                        ),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.info_outline_rounded,
                            size: 16,
                            color: Colors.orange,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              isArabic
                                  ? 'السلفة مخصصة لتكاليف النقل فقط'
                                  : 'Advance is for transportation costs only',
                              style: GoogleFonts.poppins(
                                fontSize: 11.5,
                                color: Colors.orange.shade800,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 18),

                    // Quick-select chips (same style as withdrawal dialog)
                    Row(
                      children: [
                        Text(
                          isArabic ? 'اختيار سريع:' : 'Quick select:',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textLight,
                          ),
                        ),
                        const SizedBox(width: 8),
                        ...[
                          ('25%', 0.25),
                          ('50%', 0.50),
                          ('75%', 0.75),
                          (isArabic ? 'الكل' : 'Max', 1.0),
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
                                  color: AppColors.primaryBlue.withValues(
                                    alpha: 0.1,
                                  ),
                                  borderRadius: BorderRadius.circular(20),
                                  border: Border.all(
                                    color: AppColors.primaryBlue.withValues(
                                      alpha: 0.3,
                                    ),
                                  ),
                                ),
                                child: Text(
                                  entry.$1,
                                  style: GoogleFonts.poppins(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.primaryBlue,
                                  ),
                                ),
                              ),
                            ),
                          );
                        }),
                      ],
                    ),
                    const SizedBox(height: 14),

                    // Amount field — inline errorText when over-budget
                    TextField(
                      controller: _amountController,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      style: GoogleFonts.poppins(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                      decoration: InputDecoration(
                        labelText: isArabic ? 'المبلغ (SDG)' : 'Amount (SDG)',
                        prefixIcon: const Icon(
                          Icons.attach_money_rounded,
                          color: AppColors.primaryBlue,
                        ),
                        filled: true,
                        fillColor: const Color(0xFFF8FAFF),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(
                            color: AppColors.borderColor,
                          ),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide(
                            color: _isOverBudget
                                ? Colors.red
                                : AppColors.borderColor,
                            width: _isOverBudget ? 1.5 : 1,
                          ),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide(
                            color: _isOverBudget
                                ? Colors.red
                                : AppColors.primaryBlue,
                            width: 2,
                          ),
                        ),
                        // Inline error — same pattern as withdrawal dialog
                        errorText: errorText,
                        // Show % of budget as suffix when valid
                        suffix: amount > 0 && !_isOverBudget
                            ? Text(
                                '${(_fillPct * 100).toStringAsFixed(0)}%',
                                style: GoogleFonts.poppins(
                                  fontSize: 12,
                                  color: AppColors.primaryBlue,
                                  fontWeight: FontWeight.w700,
                                ),
                              )
                            : null,
                      ),
                      onChanged: (_) => setState(() {}),
                    ),

                    // Progress bar
                    const SizedBox(height: 8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: _fillPct,
                        minHeight: 5,
                        backgroundColor: Colors.grey[200],
                        color: _isOverBudget
                            ? AppColors.accentRed
                            : _fillPct > 0.9
                            ? AppColors.accentYellow
                            : AppColors.primaryBlue,
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            '0',
                            style: GoogleFonts.poppins(
                              fontSize: 10,
                              color: AppColors.textLight,
                            ),
                          ),
                          Text(
                            _budget > 0
                                ? _fmtCurrency(_budget)
                                : isArabic
                                ? 'غير محدد'
                                : 'No budget set',
                            style: GoogleFonts.poppins(
                              fontSize: 10,
                              color: AppColors.textLight,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Notes / reason (optional)
                    TextField(
                      controller: _notesController,
                      maxLines: 2,
                      decoration: InputDecoration(
                        labelText: isArabic
                            ? 'ملاحظات (اختياري)'
                            : 'Notes (optional)',
                        hintText: isArabic
                            ? 'تفاصيل الرحلة، وسيلة النقل...'
                            : 'Trip details, transport type…',
                        prefixIcon: const Icon(
                          Icons.edit_note_rounded,
                          color: AppColors.primaryBlue,
                        ),
                        filled: true,
                        fillColor: const Color(0xFFF8FAFF),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(
                            color: AppColors.primaryBlue,
                            width: 2,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // ── Green summary row when valid (matches withdrawal dialog) ─
            if (isValid)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0FDF4),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: AppColors.accentGreen.withValues(alpha: 0.4),
                    ),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.check_circle_rounded,
                        color: AppColors.accentGreen,
                        size: 18,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              isArabic
                                  ? 'سيتم طلب ${_fmtCurrency(amount)}'
                                  : 'Requesting ${_fmtCurrency(amount)}',
                              style: GoogleFonts.poppins(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: AppColors.accentGreen,
                              ),
                            ),
                            Text(
                              isArabic
                                  ? 'من ميزانية النقل — بانتظار موافقة المشرف'
                                  : 'From transport budget — pending supervisor approval',
                              style: GoogleFonts.poppins(
                                fontSize: 11,
                                color: AppColors.textLight,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),

            // ── Action buttons ────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        side: BorderSide(color: Colors.grey[300]!),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: Text(
                        isArabic ? 'إلغاء' : 'Cancel',
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textLight,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton(
                      onPressed: isValid && !_isSubmitting ? _submit : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryBlue,
                        disabledBackgroundColor: Colors.grey[300],
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                        elevation: 0,
                      ),
                      child: _isSubmitting
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              isArabic ? 'إرسال الطلب' : 'Submit Request',
                              style: GoogleFonts.poppins(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
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

  // ── Summary tile (matches withdrawal dialog) ────────────────────────────

  Widget _summaryTile(
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
              Icon(icon, size: 13, color: color),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  label,
                  style: GoogleFonts.poppins(
                    fontSize: 10,
                    color: AppColors.textLight,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: GoogleFonts.poppins(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: color,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          if (sub != null && sub.isNotEmpty)
            Text(
              sub,
              style: GoogleFonts.poppins(
                fontSize: 10,
                color: AppColors.textLight,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
        ],
      ),
    );
  }
}
