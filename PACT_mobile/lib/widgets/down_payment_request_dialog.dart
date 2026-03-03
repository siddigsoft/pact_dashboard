import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/site_visit.dart';
import '../providers/down_payment_provider.dart';
import '../providers/site_visit_provider.dart';
import '../theme/app_colors.dart';
import '../utils/currency_utils.dart';

enum _RequestMode { full, partial }

class DownPaymentRequestDialog extends ConsumerStatefulWidget {
  final String userId;
  final bool isArabic;

  const DownPaymentRequestDialog({
    super.key,
    required this.userId,
    this.isArabic = false,
  });

  @override
  ConsumerState<DownPaymentRequestDialog> createState() =>
      _DownPaymentRequestDialogState();
}

class _DownPaymentRequestDialogState
    extends ConsumerState<DownPaymentRequestDialog> {
  SiteVisit? _selectedVisit;
  _RequestMode _mode = _RequestMode.full;
  final _amountController = TextEditingController();
  final _justificationController = TextEditingController();
  bool _isLoading = false;
  String? _amountError;

  bool get _isAr => widget.isArabic;

  double get _budgetUnits => (_selectedVisit?.transportFee ?? 0) * 100;
  String get _budgetDisplay => formatCurrency(_budgetUnits);

  @override
  void dispose() {
    _amountController.dispose();
    _justificationController.dispose();
    super.dispose();
  }

  void _dismiss() {
    _amountController.clear();
    _justificationController.clear();
    Navigator.of(context).pop();
  }

  void _applyMode(_RequestMode mode) {
    setState(() {
      _mode = mode;
      _amountError = null;
      if (mode == _RequestMode.full) {
        _amountController.text = _budgetUnits.toStringAsFixed(2);
      } else {
        _amountController.clear();
      }
    });
  }

  void _setQuickAmount(double pct) {
    final val = (_budgetUnits * pct).floorToDouble();
    _amountController.text = val == val.floorToDouble()
        ? val.toStringAsFixed(0)
        : val.toStringAsFixed(2);
    _onAmountChanged(_amountController.text);
  }

  void _onAmountChanged(String raw) {
    final parsed = double.tryParse(raw);
    setState(() {
      if (parsed == null || parsed <= 0) {
        _amountError = _isAr ? 'أدخل مبلغاً صحيحاً' : 'Enter a valid amount';
      } else if (parsed > _budgetUnits) {
        _amountError = _isAr
            ? 'المبلغ أكبر من الميزانية المخصصة'
            : 'Amount exceeds the budgeted transportation amount';
      } else {
        _amountError = null;
      }
    });
  }

  double? get _parsedAmount => double.tryParse(_amountController.text);

  double get _requestPct {
    if (_budgetUnits <= 0 || _parsedAmount == null) return 0;
    return (_parsedAmount! / _budgetUnits).clamp(0.0, 1.0);
  }

  bool get _isValidAmount =>
      _parsedAmount != null &&
      _parsedAmount! > 0 &&
      _parsedAmount! <= _budgetUnits;

  bool get _canSubmit =>
      _selectedVisit != null &&
      _isValidAmount &&
      _justificationController.text.trim().isNotEmpty &&
      !_isLoading;

  Future<void> _submit() async {
    if (!_canSubmit) return;

    try {
      final profileData = await Supabase.instance.client
          .from('profiles')
          .select('bank_account')
          .eq('id', widget.userId)
          .maybeSingle();
      final bank = profileData?['bank_account'];
      final acct = bank?['accountNumber'] ?? bank?['account_number'];
      if (acct == null || (acct as String).isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                _isAr
                    ? 'يرجى إضافة حسابك البنكي في إعدادات الملف الشخصي أولاً'
                    : 'Please add your bank account in Profile Settings first',
              ),
              backgroundColor: Colors.orange,
              duration: const Duration(seconds: 5),
            ),
          );
        }
        return;
      }
    } catch (_) {}

    setState(() => _isLoading = true);

    try {
      await ref
          .read(downPaymentProvider(widget.userId).notifier)
          .createRequest(
            siteVisitId: _selectedVisit!.id,
            mmpSiteEntryId: _selectedVisit!.mmpId ?? '',
            siteName: _selectedVisit!.siteName,
            requesterRole: 'dataCollector',
            hubId: null,
            hubName: null,
            totalTransportationBudget: _budgetUnits,
            requestedAmount: _parsedAmount!,
            paymentType: _mode == _RequestMode.full
                ? 'full_advance'
                : 'installments',
            justification: _justificationController.text.trim(),
          );

      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _isAr
                  ? 'تم تقديم طلب السلفة بنجاح ✓'
                  : 'Advance request submitted successfully ✓',
            ),
            backgroundColor: AppColors.accentGreen,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${_isAr ? 'خطأ' : 'Error'}: $e'),
            backgroundColor: AppColors.accentRed,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final siteVisitsAsync = ref.watch(acceptedSiteVisitsStreamProvider);

    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 32),
      backgroundColor: Colors.transparent,
      child: Container(
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
            _buildHeader(),
            _buildBudgetStrip(siteVisitsAsync),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_selectedVisit != null) ...[
                      _buildModeSection(),
                      const SizedBox(height: 16),
                      _buildAmountSection(),
                      const SizedBox(height: 16),
                      _buildJustificationSection(),
                      const SizedBox(height: 4),
                    ] else ...[
                      _buildNoVisitPlaceholder(),
                    ],
                  ],
                ),
              ),
            ),
            if (_selectedVisit != null && _isValidAmount) _buildConfirmCard(),
            _buildActions(),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.primaryBlue, AppColors.darkBlue],
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
                  _isAr ? 'طلب سلفة مواصلات' : 'Request Transportation Advance',
                  style: GoogleFonts.poppins(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
                Text(
                  _isAr
                      ? 'السلفة محدودة بميزانية المواصلات المعتمدة'
                      : 'Limited to your dispatched transportation budget',
                  style: GoogleFonts.poppins(
                    fontSize: 11,
                    color: Colors.white70,
                  ),
                ),
              ],
            ),
          ),
          GestureDetector(
            onTap: _dismiss,
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.2),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.close, color: Colors.white, size: 18),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBudgetStrip(AsyncValue<List<SiteVisit>> siteVisitsAsync) {
    return Container(
      color: const Color(0xFFF0F7FF),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      child: siteVisitsAsync.when(
        loading: () => const Center(
          child: SizedBox(
            height: 40,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
        error: (e, _) => Text(
          '${_isAr ? 'خطأ' : 'Error'}: $e',
          style: GoogleFonts.poppins(color: AppColors.accentRed, fontSize: 12),
        ),
        data: (all) {
          final visits = all
              .where((v) => v.status.toLowerCase().startsWith('accept'))
              .toList();

          if (visits.isEmpty) {
            return Row(
              children: [
                Icon(
                  Icons.info_outline,
                  size: 16,
                  color: Colors.orange.shade700,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _isAr
                        ? 'لا توجد زيارات ميدانية مقبولة حالياً'
                        : 'No accepted site visits available',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.orange.shade800,
                    ),
                  ),
                ),
              ],
            );
          }

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DropdownButtonFormField<SiteVisit>(
                initialValue: _selectedVisit,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: _isAr ? 'الزيارة الميدانية' : 'Site Visit',
                  prefixIcon: const Icon(
                    Icons.location_on_rounded,
                    color: AppColors.primaryBlue,
                  ),
                  filled: true,
                  fillColor: const Color(0xFFF8FAFF),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: const BorderSide(color: AppColors.borderColor),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: const BorderSide(
                      color: AppColors.primaryBlue,
                      width: 2,
                    ),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                  isDense: true,
                ),
                items: visits.map((v) {
                  final budget = (v.transportFee ?? 0) * 100;
                  return DropdownMenuItem(
                    value: v,
                    child: Text(
                      '${v.siteName}  •  ${formatCurrency(budget)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.poppins(fontSize: 13),
                    ),
                  );
                }).toList(),
                onChanged: (v) {
                  setState(() {
                    _selectedVisit = v;
                    _mode = _RequestMode.full;
                    _amountError = null;
                    if (v != null) {
                      _amountController.text = ((v.transportFee ?? 0) * 100)
                          .toStringAsFixed(2);
                    } else {
                      _amountController.clear();
                    }
                  });
                },
              ),
              if (_selectedVisit != null) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _summaryTile(
                        _isAr ? 'ميزانية المواصلات' : 'Transport Budget',
                        _budgetDisplay,
                        AppColors.primaryBlue,
                        Icons.account_balance_wallet_rounded,
                      ),
                    ),
                    Container(width: 1, height: 40, color: Colors.blue[100]),
                    Expanded(
                      child: _summaryTile(
                        _isAr ? 'الموقع' : 'Site',
                        _selectedVisit!.siteName,
                        AppColors.accentGreen,
                        Icons.pin_drop_rounded,
                      ),
                    ),
                    Container(width: 1, height: 40, color: Colors.blue[100]),
                    Expanded(
                      child: _summaryTile(
                        _isAr ? 'النوع' : 'Mode',
                        _mode == _RequestMode.full
                            ? (_isAr ? 'كامل' : 'Full')
                            : (_isAr ? 'جزئي' : 'Partial'),
                        AppColors.accentYellow,
                        Icons.tune_rounded,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _summaryTile(String label, String value, Color color, IconData icon) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(height: 2),
          Text(
            label,
            style: GoogleFonts.poppins(fontSize: 9, color: AppColors.textLight),
            textAlign: TextAlign.center,
          ),
          Text(
            value,
            style: GoogleFonts.poppins(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: color,
            ),
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _buildNoVisitPlaceholder() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24),
      child: Center(
        child: Column(
          children: [
            Icon(
              Icons.touch_app_outlined,
              size: 40,
              color: Colors.grey.shade400,
            ),
            const SizedBox(height: 8),
            Text(
              _isAr
                  ? 'اختر زيارة ميدانية أعلاه لمتابعة الطلب'
                  : 'Select a site visit above to continue',
              textAlign: TextAlign.center,
              style: GoogleFonts.poppins(
                fontSize: 12,
                color: Colors.grey.shade500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildModeSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionLabel(
          _isAr ? 'طريقة الاستلام' : 'How would you like to receive it?',
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(child: _modeButton(_RequestMode.full)),
            const SizedBox(width: 10),
            Expanded(child: _modeButton(_RequestMode.partial)),
          ],
        ),
      ],
    );
  }

  Widget _modeButton(_RequestMode mode) {
    final selected = _mode == mode;
    final isFull = mode == _RequestMode.full;
    return GestureDetector(
      onTap: () => _applyMode(mode),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
        decoration: BoxDecoration(
          color: selected
              ? AppColors.primaryBlue.withValues(alpha: 0.1)
              : Colors.grey.shade50,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? AppColors.primaryBlue : Colors.grey.shade300,
            width: selected ? 2 : 1,
          ),
        ),
        child: Column(
          children: [
            Icon(
              isFull
                  ? Icons.check_circle_outline_rounded
                  : Icons.splitscreen_rounded,
              size: 22,
              color: selected ? AppColors.primaryBlue : Colors.grey.shade400,
            ),
            const SizedBox(height: 6),
            Text(
              isFull
                  ? (_isAr ? 'المبلغ الكامل' : 'Full Amount')
                  : (_isAr ? 'دفعات / جزئي' : 'Partial / Installment'),
              textAlign: TextAlign.center,
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: selected ? AppColors.primaryBlue : AppColors.textLight,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              isFull
                  ? (_isAr
                        ? 'استلام كامل المبلغ دفعة واحدة'
                        : 'Receive the full budget at once')
                  : (_isAr
                        ? 'اختر مبلغاً أقل من الإجمالي'
                        : 'Request less than the total'),
              textAlign: TextAlign.center,
              style: GoogleFonts.poppins(
                fontSize: 9,
                color: selected ? AppColors.primaryBlue : Colors.grey.shade400,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAmountSection() {
    final isFull = _mode == _RequestMode.full;
    final pct = _requestPct;
    final barColor = pct > 0.9
        ? AppColors.accentRed
        : pct > 0.6
        ? AppColors.accentYellow
        : AppColors.primaryBlue;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionLabel(
          _isAr ? 'المبلغ المطلوب (SDG)' : 'Requested Amount (SDG)',
        ),
        const SizedBox(height: 10),

        if (_mode == _RequestMode.partial) ...[
          Row(
            children: [
              Text(
                _isAr ? 'اختيار سريع:' : 'Quick select:',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textLight,
                ),
              ),
              const SizedBox(width: 8),
              ...[
                '25%',
                '50%',
                '75%',
                _isAr ? 'الكل' : 'Max',
              ].asMap().entries.map((e) {
                final pcts = [0.25, 0.50, 0.75, 1.0];
                return Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: GestureDetector(
                    onTap: () {
                      if (e.key == 3) {
                        _applyMode(_RequestMode.full);
                      } else {
                        _setQuickAmount(pcts[e.key]);
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.primaryBlue.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: AppColors.primaryBlue.withValues(alpha: 0.3),
                        ),
                      ),
                      child: Text(
                        e.value,
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
          const SizedBox(height: 12),
        ],

        TextField(
          controller: _amountController,
          enabled: !isFull,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
          ],
          onChanged: _onAmountChanged,
          style: GoogleFonts.poppins(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: isFull ? AppColors.primaryBlue : AppColors.textDark,
          ),
          decoration: InputDecoration(
            labelText: _isAr ? 'المبلغ (SDG)' : 'Amount (SDG)',
            prefixIcon: const Icon(
              Icons.attach_money_rounded,
              color: AppColors.primaryBlue,
            ),
            filled: true,
            fillColor: const Color(0xFFF8FAFF),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.borderColor),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(
                color: _amountError != null
                    ? AppColors.accentRed
                    : AppColors.borderColor,
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(
                color: _amountError != null
                    ? AppColors.accentRed
                    : AppColors.primaryBlue,
                width: 2,
              ),
            ),
            disabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(
                color: AppColors.primaryBlue.withValues(alpha: 0.4),
              ),
            ),
            errorText: _amountError,
            suffix: _parsedAmount != null && _parsedAmount! > 0
                ? Text(
                    '${(_requestPct * 100).toStringAsFixed(0)}%',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: AppColors.primaryBlue,
                      fontWeight: FontWeight.w700,
                    ),
                  )
                : null,
            suffixIcon: isFull
                ? Padding(
                    padding: const EdgeInsets.only(right: 10),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.lock_outline_rounded,
                          size: 14,
                          color: AppColors.primaryBlue,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          _isAr ? 'كامل' : 'Full',
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: AppColors.primaryBlue,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  )
                : null,
          ),
        ),

        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: pct,
            minHeight: 5,
            backgroundColor: Colors.grey[200],
            color: barColor,
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
                _budgetDisplay,
                style: GoogleFonts.poppins(
                  fontSize: 10,
                  color: AppColors.textLight,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildJustificationSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionLabel(_isAr ? 'سبب الطلب *' : 'Justification *'),
        const SizedBox(height: 10),
        TextField(
          controller: _justificationController,
          maxLines: 2,
          maxLength: 500,
          onChanged: (_) => setState(() {}),
          style: GoogleFonts.poppins(fontSize: 13),
          decoration: InputDecoration(
            labelText: _isAr ? 'سبب السلفة' : 'Reason for Advance',
            hintText: _isAr
                ? 'تكاليف النقل، الإقامة...'
                : 'Transportation, accommodation, etc.',
            prefixIcon: const Icon(
              Icons.edit_note_rounded,
              color: AppColors.primaryBlue,
            ),
            filled: true,
            fillColor: const Color(0xFFF8FAFF),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
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
    );
  }

  Widget _buildConfirmCard() {
    final remaining = _budgetUnits - (_parsedAmount ?? 0);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
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
                    _isAr
                        ? 'سيتم طلب ${formatCurrency(_parsedAmount!)}'
                        : 'Requesting ${formatCurrency(_parsedAmount!)}',
                    style: GoogleFonts.poppins(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.accentGreen,
                    ),
                  ),
                  Text(
                    _isAr
                        ? 'المتبقي: ${formatCurrency(remaining)}'
                        : 'Remaining: ${formatCurrency(remaining)}',
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
    );
  }

  Widget _buildActions() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      child: Row(
        children: [
          Expanded(
            child: OutlinedButton(
              onPressed: _isLoading ? null : _dismiss,
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                side: BorderSide(color: Colors.grey[300]!),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: Text(
                _isAr ? 'إلغاء' : 'Cancel',
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
              onPressed: _canSubmit ? _submit : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryBlue,
                disabledBackgroundColor: Colors.grey[300],
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                elevation: 0,
              ),
              child: _isLoading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.send_rounded,
                          color: Colors.white,
                          size: 18,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _isAr ? 'إرسال الطلب' : 'Submit Request',
                          style: GoogleFonts.poppins(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionLabel(String label) {
    return Row(
      children: [
        Container(
          width: 3,
          height: 16,
          decoration: BoxDecoration(
            color: AppColors.primaryBlue,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          label,
          style: GoogleFonts.poppins(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: AppColors.textDark,
          ),
        ),
      ],
    );
  }
}
