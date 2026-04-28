part of '../../screens/site_verification_screen.dart';

/// Verification Dialog with Visit Date Input
/// Supports both single date (non-DM) and date range (DM activities like GFA, CBT, EBSFP)
class _VerificationDialog extends StatefulWidget {
  final Map<String, dynamic> site;
  final bool isDMActivity;
  final bool isMultiVisitActivity;
  final bool isUrgentActivity;

  const _VerificationDialog({
    required this.site,
    required this.isDMActivity,
    this.isMultiVisitActivity = false,
    this.isUrgentActivity = false,
  });

  @override
  State<_VerificationDialog> createState() => _VerificationDialogState();
}

class _VerificationDialogState extends State<_VerificationDialog> {
  final TextEditingController _notesController = TextEditingController();
  DateTime? _visitDate;
  DateTime? _distributionStart;
  DateTime? _distributionEnd;
  DateTime? _followUpDate; // For multi-visit activities
  bool _requiresFollowUp = false; // For multi-visit activities

  /// Date-only "today" so picker boundaries are calendar-based (fixes mobile
  /// issue where time component prevented selecting expected date).
  static DateTime get _today =>
      DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day);

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final siteName = widget.site['site_name']?.toString() ?? 'Unknown Site';
    final activity =
        '${widget.site['main_activity'] ?? ''} ${widget.site['activity'] ?? ''}'
            .trim();

    // Determine activity type
    final isMultiVisit = widget.isMultiVisitActivity;
    final isUrgent = widget.isUrgentActivity;

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      elevation: 8,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      child: Container(
        width: double.infinity,
        constraints: const BoxConstraints(maxHeight: 800),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          color: Colors.white,
        ),
        child: Column(
          children: [
            // ── Enhanced Gradient Header ────────────────────────────────
            Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [Color(0xFF10B981), Color(0xFF059669)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(20),
                  topRight: Radius.circular(20),
                ),
              ),
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.25),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(
                          Icons.verified_user_rounded,
                          color: Colors.white,
                          size: 24,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Verify Site',
                              style: GoogleFonts.poppins(
                                fontSize: 20,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                            ),
                            Text(
                              'تأكيد الموقـــع',
                              textAlign: TextAlign.right,
                              style: GoogleFonts.poppins(
                                fontSize: 14,
                                fontWeight: FontWeight.w500,
                                color: Colors.white.withValues(alpha: 0.9),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // ── Scrollable Content ──────────────────────────────────────
            Expanded(
              child: SingleChildScrollView(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Enhanced Site Info Card
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: const Color(
                            0xFF10B981,
                          ).withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: const Color(
                              0xFF10B981,
                            ).withValues(alpha: 0.2),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              siteName,
                              style: GoogleFonts.poppins(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                color: AppColors.textDark,
                              ),
                            ),
                            if (activity.isNotEmpty) ...[
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  Icon(
                                    Icons.shopping_bag_rounded,
                                    size: 14,
                                    color: Colors.grey[600],
                                  ),
                                  const SizedBox(width: 6),
                                  Expanded(
                                    child: Text(
                                      'Activity: $activity',
                                      style: GoogleFonts.poppins(
                                        fontSize: 12,
                                        color: Colors.grey[600],
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                            // Activity type indicator
                            const SizedBox(height: 10),
                            _buildActivityTypeBadge(),
                          ],
                        ),
                      ),
                      const SizedBox(height: 18),

                      // Bilingual Info Box with Better Design
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: const Color(
                            0xFF10B981,
                          ).withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: const Color(
                              0xFF10B981,
                            ).withValues(alpha: 0.3),
                          ),
                        ),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(6),
                              decoration: BoxDecoration(
                                color: const Color(
                                  0xFF10B981,
                                ).withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: const Icon(
                                Icons.info_rounded,
                                color: Color(0xFF10B981),
                                size: 18,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'This will mark the site as verified and notify supervisors.',
                                    style: GoogleFonts.poppins(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: Colors.teal[800],
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    'سيتم تحديد الموقع كمُتحقّق والإشعار بالمشرفين.',
                                    textAlign: TextAlign.right,
                                    style: GoogleFonts.poppins(
                                      fontSize: 11,
                                      color: Colors.teal[700],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 18),

                      // Date inputs based on activity type
                      if (widget.isDMActivity) ...[
                        // DM Activities: 3 date fields
                        _buildBilingualLabel(
                          'Expected Distribution Start *',
                          'تاريخ بداية التوزيع المتوقع *',
                        ),
                        const SizedBox(height: 8),
                        _buildDatePicker(
                          label: _bi('Select Start Date', 'اختر تاريخ البداية'),
                          value: _distributionStart,
                          onTap: () async {
                            final date = await showDatePicker(
                              context: context,
                              initialDate: _distributionStart ?? _today,
                              firstDate: _today.subtract(
                                const Duration(days: 30),
                              ),
                              lastDate: _today.add(const Duration(days: 365)),
                            );
                            if (date != null) {
                              setState(() => _distributionStart = date);
                            }
                          },
                        ),
                        const SizedBox(height: 14),

                        _buildBilingualLabel(
                          'Expected Distribution End *',
                          'تاريخ نهاية التوزيع المتوقع *',
                        ),
                        const SizedBox(height: 8),
                        _buildDatePicker(
                          label: _bi('Select End Date', 'اختر تاريخ النهاية'),
                          value: _distributionEnd,
                          onTap: () async {
                            final date = await showDatePicker(
                              context: context,
                              initialDate:
                                  _distributionEnd ??
                                  _distributionStart ??
                                  _today,
                              firstDate: _distributionStart ?? _today,
                              lastDate: _today.add(const Duration(days: 365)),
                            );
                            if (date != null) {
                              setState(() => _distributionEnd = date);
                            }
                          },
                        ),
                        const SizedBox(height: 14),

                        _buildBilingualLabel(
                          'Expected Visit Date *',
                          'تاريخ الزيارة المتوقع *',
                        ),
                        const SizedBox(height: 8),
                        _buildDatePicker(
                          label: _bi(
                            'Select Date (must be within distribution period)',
                            'اختر التاريخ',
                          ),
                          value: _visitDate,
                          onTap: () async {
                            final firstDate =
                                _distributionStart ??
                                _today.subtract(const Duration(days: 30));
                            final lastDate =
                                _distributionEnd ??
                                _today.add(const Duration(days: 365));
                            final date = await showDatePicker(
                              context: context,
                              initialDate: _visitDate ?? _today,
                              firstDate: firstDate,
                              lastDate: lastDate,
                            );
                            if (date != null) {
                              setState(() => _visitDate = date);
                            }
                          },
                        ),
                        const SizedBox(height: 14),
                      ] else if (isMultiVisit) ...[
                        // Multi-visit activities: Initial visit + follow-up option
                        _buildBilingualLabel(
                          'Visit Schedule *',
                          'جدول الزيارات *',
                        ),
                        const SizedBox(height: 8),

                        // Initial Visit Date
                        _buildDatePicker(
                          label: _bi(
                            'Initial Visit Date',
                            'تاريخ الزيارة الأولية',
                          ),
                          value: _visitDate,
                          onTap: () async {
                            final date = await showDatePicker(
                              context: context,
                              initialDate: _visitDate ?? _today,
                              firstDate: isUrgent
                                  ? _today
                                  : _today.subtract(const Duration(days: 30)),
                              lastDate: _today.add(const Duration(days: 365)),
                            );
                            if (date != null) {
                              setState(() => _visitDate = date);
                            }
                          },
                        ),
                        const SizedBox(height: 12),

                        // Follow-up visit option
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: const Color(
                              0xFF10B981,
                            ).withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: const Color(
                                0xFF10B981,
                              ).withValues(alpha: 0.2),
                            ),
                          ),
                          child: Row(
                            children: [
                              Checkbox(
                                value: _requiresFollowUp,
                                onChanged: (value) {
                                  setState(
                                    () => _requiresFollowUp = value ?? false,
                                  );
                                },
                                activeColor: const Color(0xFF10B981),
                              ),
                              Expanded(
                                child: Text(
                                  _bi(
                                    'Schedule follow-up visit',
                                    'جدولة زيارة متابعة',
                                  ),
                                  style: GoogleFonts.poppins(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),

                        if (_requiresFollowUp) ...[
                          const SizedBox(height: 12),
                          _buildDatePicker(
                            label: _bi('Follow-up Date', 'تاريخ المتابعة'),
                            value: _followUpDate,
                            onTap: () async {
                              final date = await showDatePicker(
                                context: context,
                                initialDate:
                                    _followUpDate ??
                                    (_visitDate?.add(
                                          const Duration(days: 30),
                                        ) ??
                                        _today.add(const Duration(days: 30))),
                                firstDate: _visitDate ?? _today,
                                lastDate: _today.add(const Duration(days: 365)),
                              );
                              if (date != null) {
                                setState(() => _followUpDate = date);
                              }
                            },
                          ),
                        ],
                        const SizedBox(height: 14),
                      ] else if (isUrgent) ...[
                        // Urgent activities: Today or tomorrow only
                        _buildBilingualLabel(
                          'Urgent Visit Date *',
                          'تاريخ الزيارة العاجلة *',
                          color: Colors.red,
                        ),
                        const SizedBox(height: 8),

                        _buildDatePicker(
                          label: _bi(
                            'Visit Date (Today/Tomorrow)',
                            'التاريخ (اليوم/غداً)',
                          ),
                          value: _visitDate,
                          onTap: () async {
                            final date = await showDatePicker(
                              context: context,
                              initialDate: _today,
                              firstDate: _today,
                              lastDate: _today.add(const Duration(days: 1)),
                            );
                            if (date != null) {
                              setState(() => _visitDate = date);
                            }
                          },
                        ),
                        const SizedBox(height: 14),
                      ] else ...[
                        // Standard activities: Expected visit date
                        _buildBilingualLabel(
                          'Expected Visit Date *',
                          'تاريخ الزيارة المتوقع *',
                        ),
                        const SizedBox(height: 8),

                        _buildDatePicker(
                          label: _bi('Select Date', 'اختر التاريخ'),
                          value: _visitDate,
                          onTap: () async {
                            final date = await showDatePicker(
                              context: context,
                              initialDate: _visitDate ?? _today,
                              firstDate: _today.subtract(
                                const Duration(days: 30),
                              ),
                              lastDate: _today.add(const Duration(days: 365)),
                            );
                            if (date != null) {
                              setState(() => _visitDate = date);
                            }
                          },
                        ),
                        const SizedBox(height: 14),
                      ],

                      // Notes Section with Bilingual Label
                      _buildBilingualLabel(
                        'Verification Notes (optional)',
                        'ملاحظات التحقق (اختياري)',
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _notesController,
                        maxLines: 3,
                        decoration: InputDecoration(
                          hintText: _bi(
                            'Add any notes...',
                            'أضف أي ملاحظات...',
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: BorderSide(
                              color: Colors.grey.withValues(alpha: 0.3),
                            ),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(
                              color: Color(0xFF10B981),
                              width: 2,
                            ),
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                          filled: true,
                          fillColor: Colors.grey.withValues(alpha: 0.02),
                        ),
                        style: GoogleFonts.poppins(fontSize: 13),
                      ),
                      const SizedBox(height: 20),
                    ],
                  ),
                ),
              ),
            ),

            // ── Action Buttons ─────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  // Cancel Button
                  Expanded(
                    child: GestureDetector(
                      onTap: () => Navigator.pop(context, null),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          color: Colors.grey.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: Colors.grey.withValues(alpha: 0.2),
                          ),
                        ),
                        child: Column(
                          children: [
                            Text(
                              'Cancel',
                              style: GoogleFonts.poppins(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: Colors.grey[700],
                              ),
                            ),
                            Text(
                              'إلغاء',
                              style: GoogleFonts.poppins(
                                fontSize: 10,
                                color: Colors.grey[600],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  // Verify Button
                  Expanded(
                    child: GestureDetector(
                      onTap: _canVerify()
                          ? () {
                              Navigator.pop(context, {
                                'visit_date': _visitDate,
                                'distribution_start': _distributionStart,
                                'distribution_end': _distributionEnd,
                                'follow_up_date': _followUpDate,
                                'activity_type': widget.isDMActivity
                                    ? 'distribution'
                                    : widget.isMultiVisitActivity
                                    ? 'multi_visit'
                                    : widget.isUrgentActivity
                                    ? 'urgent'
                                    : 'standard',
                                'requires_follow_up':
                                    widget.isMultiVisitActivity &&
                                    _requiresFollowUp,
                              });
                            }
                          : null,
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          gradient: _canVerify()
                              ? const LinearGradient(
                                  colors: [
                                    Color(0xFF10B981),
                                    Color(0xFF059669),
                                  ],
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                )
                              : null,
                          color: _canVerify() ? null : Colors.grey[300],
                          borderRadius: BorderRadius.circular(12),
                          boxShadow: _canVerify()
                              ? [
                                  BoxShadow(
                                    color: const Color(
                                      0xFF10B981,
                                    ).withValues(alpha: 0.3),
                                    blurRadius: 8,
                                    offset: const Offset(0, 2),
                                  ),
                                ]
                              : null,
                        ),
                        child: Column(
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  Icons.check_circle_rounded,
                                  color: _canVerify()
                                      ? Colors.white
                                      : Colors.grey[400],
                                  size: 18,
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  'Verify',
                                  style: GoogleFonts.poppins(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                    color: _canVerify()
                                        ? Colors.white
                                        : Colors.grey[400],
                                  ),
                                ),
                              ],
                            ),
                            Text(
                              'تحقق',
                              style: GoogleFonts.poppins(
                                fontSize: 10,
                                color: _canVerify()
                                    ? Colors.white
                                    : Colors.grey[400],
                              ),
                            ),
                          ],
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

  Widget _buildActivityTypeBadge() {
    final isMultiVisit = widget.isMultiVisitActivity;
    final isUrgent = widget.isUrgentActivity;

    final color = widget.isDMActivity
        ? Colors.blue
        : isMultiVisit
        ? AppColors.primaryBlue
        : isUrgent
        ? Colors.red
        : Colors.green;

    final label = widget.isDMActivity
        ? 'Distribution Activity (DM)'
        : isMultiVisit
        ? 'Multi-Visit Activity'
        : isUrgent
        ? 'Urgent Activity'
        : 'Standard Activity';

    final labelAr = widget.isDMActivity
        ? 'نشاط التوزيع'
        : isMultiVisit
        ? 'نشاط متعدد الزيارات'
        : isUrgent
        ? 'نشاط عاجل'
        : 'نشاط قياسي';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: GoogleFonts.poppins(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: color,
              letterSpacing: 0.3,
            ),
          ),
          Text(
            labelAr,
            textAlign: TextAlign.right,
            style: GoogleFonts.poppins(
              fontSize: 10,
              color: color.withValues(alpha: 0.8),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBilingualLabel(
    String en,
    String ar, {
    Color color = const Color(0xFF374151),
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          en,
          style: GoogleFonts.poppins(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: color,
          ),
        ),
        Text(
          ar,
          textAlign: TextAlign.right,
          style: GoogleFonts.poppins(
            fontSize: 11,
            color: color.withValues(alpha: 0.8),
          ),
        ),
      ],
    );
  }

  bool _canVerify() {
    // All activities require a visit date
    if (_visitDate == null) return false;

    // DM activities require distribution period
    if (widget.isDMActivity) {
      if (_distributionStart == null || _distributionEnd == null) return false;
      // Validate visit date is within distribution period
      if (_visitDate!.isBefore(_distributionStart!) ||
          _visitDate!.isAfter(_distributionEnd!)) {
        return false;
      }
    }

    // Multi-visit activities require follow-up date if follow-up is requested
    if (widget.isMultiVisitActivity && _requiresFollowUp) {
      if (_followUpDate == null) return false;
    }

    return true;
  }

  Widget _buildDatePicker({
    required String label,
    required DateTime? value,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        decoration: BoxDecoration(
          border: Border.all(
            color: value != null ? AppColors.primaryBlue : Colors.grey[300]!,
          ),
          borderRadius: BorderRadius.circular(8),
          color: value != null
              ? AppColors.primaryBlue.withValues(alpha: 0.05)
              : Colors.grey[50],
        ),
        child: Row(
          children: [
            Icon(
              Icons.calendar_today,
              size: 18,
              color: value != null ? AppColors.primaryBlue : Colors.grey[600],
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                value != null
                    ? DateFormat('MMM dd, yyyy').format(value)
                    : label,
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  color: value != null ? Colors.black87 : Colors.grey[600],
                ),
              ),
            ),
            Icon(Icons.arrow_drop_down, color: Colors.grey[600]),
          ],
        ),
      ),
    );
  }
}
