import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/site_visit.dart';
import '../providers/down_payment_provider.dart';
import '../providers/site_visit_provider.dart';
import '../utils/currency_utils.dart';

// ── Request mode ────────────────────────────────────────────────────────────
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

  // Budget in "internal" units (same calculation the existing code used)
  double get _budgetUnits =>
      (_selectedVisit?.transportFee ?? 0) * 100;

  // Budget as a human-readable SDG display
  String get _budgetDisplay => formatCurrency(_budgetUnits);

  @override
  void dispose() {
    _amountController.dispose();
    _justificationController.dispose();
    super.dispose();
  }

  // ── Amount helpers ──────────────────────────────────────────────────────

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

  void _onAmountChanged(String raw) {
    final parsed = double.tryParse(raw);
    setState(() {
      if (parsed == null || parsed <= 0) {
        _amountError = _isAr
            ? 'أدخل مبلغاً صحيحاً'
            : 'Enter a valid amount';
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

  double get _percentRequested {
    if (_budgetUnits <= 0 || _parsedAmount == null) return 0;
    return (_parsedAmount! / _budgetUnits).clamp(0.0, 1.0);
  }

  bool get _canSubmit =>
      _selectedVisit != null &&
      _parsedAmount != null &&
      _parsedAmount! > 0 &&
      _parsedAmount! <= _budgetUnits &&
      _justificationController.text.trim().isNotEmpty &&
      !_isLoading;

  // ── Bank account check + submit ─────────────────────────────────────────

  Future<void> _submit() async {
    if (!_canSubmit) return;

    // 1. Check bank account
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
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(_isAr
                ? 'يرجى إضافة حسابك البنكي في إعدادات الملف الشخصي أولاً'
                : 'Please add your bank account in Profile Settings first'),
            backgroundColor: Colors.orange,
            duration: const Duration(seconds: 5),
          ));
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
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(_isAr
              ? 'تم تقديم طلب السلفة بنجاح ✓'
              : 'Advance request submitted successfully ✓'),
          backgroundColor: Colors.green,
        ));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('${_isAr ? 'خطأ' : 'Error'}: $e'),
          backgroundColor: Colors.red,
        ));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // ── Build ───────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final siteVisitsAsync = ref.watch(acceptedSiteVisitsStreamProvider);

    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildHeader(),
              const SizedBox(height: 18),

              // ── Step 1: Site visit ──────────────────────────────────────
              _stepLabel('1', _isAr ? 'اختر الزيارة الميدانية' : 'Select Site Visit'),
              const SizedBox(height: 8),
              _buildSiteVisitDropdown(siteVisitsAsync),
              const SizedBox(height: 20),

              // ── Step 2: Budget reveal (only after selection) ───────────
              if (_selectedVisit != null) ...[
                _buildBudgetCard(),
                const SizedBox(height: 20),

                // ── Step 3: Mode toggle ─────────────────────────────────
                _stepLabel('2', _isAr ? 'كيف تريد الاستلام؟' : 'How would you like to receive it?'),
                const SizedBox(height: 8),
                _buildModeToggle(),
                const SizedBox(height: 16),

                // ── Step 4: Amount ──────────────────────────────────────
                _stepLabel('3', _isAr ? 'المبلغ المطلوب' : 'Requested Amount'),
                const SizedBox(height: 8),
                _buildAmountField(),
                if (_mode == _RequestMode.partial && _parsedAmount != null && _amountError == null)
                  _buildProgressBar(),
                const SizedBox(height: 16),

                // ── Step 5: Justification ────────────────────────────────
                _stepLabel('4', _isAr ? 'سبب الطلب *' : 'Justification *'),
                const SizedBox(height: 8),
                _buildJustificationField(),
                const SizedBox(height: 20),

                // ── Actions ─────────────────────────────────────────────
                _buildActions(),
              ] else ...[
                // Placeholder when no visit selected yet
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 24),
                  alignment: Alignment.center,
                  child: Column(
                    children: [
                      Icon(Icons.touch_app_outlined,
                          size: 40, color: Colors.grey.shade400),
                      const SizedBox(height: 8),
                      Text(
                        _isAr
                            ? 'اختر زيارة ميدانية أعلاه لعرض ميزانية المواصلات'
                            : 'Select a site visit above to see your transportation budget',
                        textAlign: TextAlign.center,
                        style: GoogleFonts.poppins(
                            fontSize: 12, color: Colors.grey.shade500),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: Text(_isAr ? 'إلغاء' : 'Cancel',
                          style: GoogleFonts.poppins(color: Colors.grey.shade600)),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  // ── Sub-widgets ─────────────────────────────────────────────────────────

  Widget _buildHeader() {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: const Color(0xFF8B5CF6).withValues(alpha: 0.12),
            shape: BoxShape.circle,
          ),
          child: const Icon(Icons.directions_car_rounded,
              color: Color(0xFF8B5CF6), size: 22),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _isAr
                    ? 'طلب سلفة مواصلات'
                    : 'Request Transportation Advance',
                style: GoogleFonts.poppins(
                    fontSize: 15, fontWeight: FontWeight.w700),
              ),
              Text(
                _isAr
                    ? 'السلفة محدودة بميزانية المواصلات المعتمدة'
                    : 'Limited to your dispatched transportation budget',
                style: GoogleFonts.poppins(
                    fontSize: 11, color: Colors.grey.shade500),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _stepLabel(String number, String label) {
    return Row(
      children: [
        Container(
          width: 22,
          height: 22,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: const Color(0xFF8B5CF6),
            shape: BoxShape.circle,
          ),
          child: Text(number,
              style: GoogleFonts.poppins(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: Colors.white)),
        ),
        const SizedBox(width: 8),
        Text(label,
            style: GoogleFonts.poppins(
                fontSize: 12, fontWeight: FontWeight.w700)),
      ],
    );
  }

  Widget _buildSiteVisitDropdown(AsyncValue<List<SiteVisit>> async) {
    return async.when(
      loading: () => const Center(
          child: SizedBox(
              height: 48,
              child: CircularProgressIndicator(strokeWidth: 2))),
      error: (e, _) => Text('${_isAr ? 'خطأ' : 'Error'}: $e',
          style: GoogleFonts.poppins(color: Colors.red, fontSize: 12)),
      data: (all) {
        final visits = all
            .where((v) => v.status.toLowerCase().startsWith('accept'))
            .toList();

        if (visits.isEmpty) {
          return Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.amber.shade50,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.amber.shade200),
            ),
            child: Row(
              children: [
                Icon(Icons.info_outline,
                    size: 16, color: Colors.amber.shade700),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _isAr
                        ? 'لا توجد زيارات ميدانية مقبولة حالياً'
                        : 'No accepted site visits available',
                    style: GoogleFonts.poppins(
                        fontSize: 12, color: Colors.amber.shade800),
                  ),
                ),
              ],
            ),
          );
        }

        return DropdownButtonFormField<SiteVisit>(
          value: _selectedVisit,
          isExpanded: true,
          decoration: InputDecoration(
            hintText: _isAr ? 'اختر زيارة...' : 'Choose a site visit...',
            border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10)),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Color(0xFF8B5CF6), width: 2),
            ),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
                _amountController.text =
                    ((v.transportFee ?? 0) * 100).toStringAsFixed(2);
              } else {
                _amountController.clear();
              }
            });
          },
        );
      },
    );
  }

  Widget _buildBudgetCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            const Color(0xFF8B5CF6).withValues(alpha: 0.15),
            const Color(0xFF06B6D4).withValues(alpha: 0.10),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
            color: const Color(0xFF8B5CF6).withValues(alpha: 0.30)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.account_balance_wallet_rounded,
                  size: 16, color: const Color(0xFF8B5CF6)),
              const SizedBox(width: 6),
              Text(
                _isAr
                    ? 'ميزانية المواصلات المعتمدة'
                    : 'Your Approved Transportation Budget',
                style: GoogleFonts.poppins(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: const Color(0xFF8B5CF6)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            _budgetDisplay,
            style: GoogleFonts.poppins(
              fontSize: 28,
              fontWeight: FontWeight.w800,
              color: const Color(0xFF1E293B),
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            _isAr
                ? 'هذا هو الحد الأقصى الذي يمكنك طلبه — المبلغ المخصص في مرحلة الإيفاد'
                : 'This is the maximum you can request — the amount budgeted at dispatch',
            style: GoogleFonts.poppins(
                fontSize: 10, color: Colors.grey.shade600),
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: Colors.green.shade50,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: Colors.green.shade200),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.location_on_rounded,
                    size: 12, color: Colors.green.shade700),
                const SizedBox(width: 4),
                Text(
                  _selectedVisit!.siteName,
                  style: GoogleFonts.poppins(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: Colors.green.shade800),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildModeToggle() {
    return Row(
      children: [
        Expanded(child: _modeButton(_RequestMode.full)),
        const SizedBox(width: 10),
        Expanded(child: _modeButton(_RequestMode.partial)),
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
              ? const Color(0xFF8B5CF6)
              : Colors.grey.shade100,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected
                ? const Color(0xFF8B5CF6)
                : Colors.grey.shade300,
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
              color: selected ? Colors.white : Colors.grey.shade500,
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
                color: selected ? Colors.white : Colors.grey.shade700,
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
                color: selected
                    ? Colors.white.withValues(alpha: 0.85)
                    : Colors.grey.shade500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAmountField() {
    final isFull = _mode == _RequestMode.full;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
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
            color: isFull
                ? const Color(0xFF8B5CF6)
                : const Color(0xFF1E293B),
          ),
          decoration: InputDecoration(
            prefixText: 'ج.س  ',
            prefixStyle: GoogleFonts.poppins(
                fontSize: 13,
                color: Colors.grey.shade500,
                fontWeight: FontWeight.w600),
            hintText: _isAr ? 'أدخل المبلغ...' : 'Enter amount...',
            border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10)),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(
                  color: _amountError != null
                      ? Colors.red.shade400
                      : Colors.grey.shade300),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(
                  color: _amountError != null
                      ? Colors.red
                      : const Color(0xFF8B5CF6),
                  width: 2),
            ),
            disabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: const Color(0xFF8B5CF6).withValues(alpha: 0.4)),
            ),
            filled: isFull,
            fillColor: const Color(0xFF8B5CF6).withValues(alpha: 0.06),
            suffixIcon: isFull
                ? Padding(
                    padding: const EdgeInsets.only(right: 10),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.lock_outline_rounded,
                            size: 14, color: const Color(0xFF8B5CF6)),
                        const SizedBox(width: 4),
                        Text(_isAr ? 'كامل' : 'Full',
                            style: GoogleFonts.poppins(
                                fontSize: 11,
                                color: const Color(0xFF8B5CF6),
                                fontWeight: FontWeight.w600)),
                      ],
                    ),
                  )
                : null,
            errorText: _amountError,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          ),
        ),
        if (isFull) ...[
          const SizedBox(height: 6),
          Row(
            children: [
              Icon(Icons.info_outline,
                  size: 12, color: Colors.grey.shade400),
              const SizedBox(width: 4),
              Text(
                _isAr
                    ? 'سيتم طلب المبلغ الكامل تلقائياً'
                    : 'The full transportation budget will be requested automatically',
                style: GoogleFonts.poppins(
                    fontSize: 10, color: Colors.grey.shade500),
              ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _buildProgressBar() {
    final pct = _percentRequested;
    final color = pct > 0.9
        ? Colors.orange.shade600
        : pct > 0.5
            ? const Color(0xFF8B5CF6)
            : Colors.green.shade600;

    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                _isAr ? 'النسبة من الميزانية' : 'Portion of budget',
                style: GoogleFonts.poppins(
                    fontSize: 10, color: Colors.grey.shade500),
              ),
              Text(
                '${(pct * 100).toStringAsFixed(0)}%',
                style: GoogleFonts.poppins(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: color),
              ),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: pct,
              minHeight: 6,
              backgroundColor: Colors.grey.shade200,
              valueColor: AlwaysStoppedAnimation<Color>(color),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            _isAr
                ? 'المتبقي: ${formatCurrency(_budgetUnits - (_parsedAmount ?? 0))}'
                : 'Remaining: ${formatCurrency(_budgetUnits - (_parsedAmount ?? 0))}',
            style: GoogleFonts.poppins(
                fontSize: 10, color: Colors.grey.shade500),
          ),
        ],
      ),
    );
  }

  Widget _buildJustificationField() {
    return TextField(
      controller: _justificationController,
      maxLines: 3,
      maxLength: 500,
      onChanged: (_) => setState(() {}),
      style: GoogleFonts.poppins(fontSize: 13),
      decoration: InputDecoration(
        hintText: _isAr
            ? 'اشرح سبب حاجتك لهذه السلفة...'
            : 'Explain why you need this advance...',
        border:
            OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide:
              const BorderSide(color: Color(0xFF8B5CF6), width: 2),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        isDense: true,
      ),
    );
  }

  Widget _buildActions() {
    return Row(
      children: [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.of(context).pop(),
          child: Text(
            _isAr ? 'إلغاء' : 'Cancel',
            style: GoogleFonts.poppins(
                color: Colors.grey.shade600, fontWeight: FontWeight.w600),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: ElevatedButton.icon(
            onPressed: _canSubmit ? _submit : null,
            icon: _isLoading
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.send_rounded, size: 16),
            label: Text(
              _isLoading
                  ? (_isAr ? 'جارٍ الإرسال...' : 'Submitting...')
                  : (_isAr ? 'تقديم الطلب' : 'Submit Request'),
              style: GoogleFonts.poppins(
                  fontWeight: FontWeight.w700, fontSize: 13),
            ),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF8B5CF6),
              foregroundColor: Colors.white,
              disabledBackgroundColor:
                  const Color(0xFF8B5CF6).withValues(alpha: 0.4),
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
            ),
          ),
        ),
      ],
    );
  }
}
