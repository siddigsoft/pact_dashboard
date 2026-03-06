part of 'site_verification_screen.dart';

// Bulk Locality Permit Requirement Dialog
class _BulkLocalityPermitRequirementDialog extends StatefulWidget {
  final String locality;
  final String state;
  final int siteCount;
  final bool isArabic;

  const _BulkLocalityPermitRequirementDialog({
    required this.locality,
    required this.state,
    required this.siteCount,
    this.isArabic = false,
  });

  @override
  State<_BulkLocalityPermitRequirementDialog> createState() =>
      _BulkLocalityPermitRequirementDialogState();
}

class _BulkLocalityPermitRequirementDialogState
    extends State<_BulkLocalityPermitRequirementDialog> {
  String? _localityPermitRequirement;

  @override
  Widget build(BuildContext context) {
    final isArabic = widget.isArabic;
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 480, maxHeight: 700),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Colors.white, Colors.blue.withValues(alpha: 0.02)],
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.max,
          children: [
            // Header with gradient
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Colors.green, Colors.green[700]!],
                ),
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(20),
                  topRight: Radius.circular(20),
                ),
              ),
              child: Builder(
                builder: (context) {
                  final l10n = AppLocalizations.of(context);
                  return Directionality(
                    textDirection: isArabic
                        ? ui.TextDirection.rtl
                        : ui.TextDirection.ltr,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(
                                Icons.location_on,
                                color: Colors.white,
                                size: 24,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    l10n?.bulkLocalityPermitVerification ??
                                        'Bulk Locality Permit Verification',
                                    style: GoogleFonts.poppins(
                                      fontSize: 20,
                                      fontWeight: FontWeight.w600,
                                      color: Colors.white,
                                    ),
                                  ),
                                  Text(
                                    'التحقق من تصاريح المحليات بالجملة',
                                    style: GoogleFonts.poppins(
                                      fontSize: 14,
                                      color: Colors.white70,
                                    ),
                                    textDirection: ui.TextDirection.rtl,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${widget.locality}, ${widget.state}',
                                style: GoogleFonts.poppins(
                                  fontSize: 13,
                                  color: Colors.white,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              Text(
                                '${widget.siteCount} sites affected',
                                style: GoogleFonts.poppins(
                                  fontSize: 11,
                                  color: Colors.white70,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
            // Content
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Builder(
                  builder: (context) {
                    final l10n = AppLocalizations.of(context);
                    return Directionality(
                      textDirection: isArabic
                          ? ui.TextDirection.rtl
                          : ui.TextDirection.ltr,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l10n?.localityPermitQuestion ??
                                'Do you require a Locality permit in this locality?',
                            style: GoogleFonts.poppins(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: Colors.grey[800],
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'هل تحتاج إلى تصريح محلية في هذه المحلية؟',
                            style: GoogleFonts.poppins(
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                              color: Colors.grey[700],
                            ),
                            textDirection: ui.TextDirection.rtl,
                          ),
                          const SizedBox(height: 20),
                          _buildBilingualOption(
                            'Yes, it\'s required and I will upload it',
                            'I have the locality permit and will upload it now',
                            'نعم، مطلوب وسأرفعه',
                            'لدي تصريح المحلية وسأرفعه الآن',
                            'required_have_it',
                            _localityPermitRequirement,
                            (value) => setState(
                              () => _localityPermitRequirement = value,
                            ),
                          ),
                          _buildBilingualOption(
                            'Yes, it\'s required but I don\'t have it',
                            'The locality permit is required but not available',
                            'نعم، مطلوب لكن ليس لدي',
                            'التصريح مطلوب لكن غير متاح',
                            'required_dont_have_it',
                            _localityPermitRequirement,
                            (value) => setState(
                              () => _localityPermitRequirement = value,
                            ),
                          ),
                          _buildBilingualOption(
                            'No, it\'s not a requirement',
                            'Locality permit is not required in this locality',
                            'لا، ليس مطلوباً',
                            'لا يوجد تصريح محلية مطلوب في هذه المحلية',
                            'not_required',
                            _localityPermitRequirement,
                            (value) => setState(
                              () => _localityPermitRequirement = value,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ),
            // Action Buttons
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
              child: Builder(
                builder: (context) {
                  final l10n = AppLocalizations.of(context);
                  return Directionality(
                    textDirection: isArabic
                        ? ui.TextDirection.rtl
                        : ui.TextDirection.ltr,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        OutlinedButton.icon(
                          onPressed: () => Navigator.of(context).pop(),
                          icon: const Icon(Icons.close, size: 18),
                          label: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                l10n?.cancel ?? 'Cancel',
                                style: GoogleFonts.poppins(fontSize: 13),
                              ),
                              Text(
                                'إلغاء',
                                style: GoogleFonts.poppins(
                                  fontSize: 10,
                                  color: Colors.grey[600],
                                ),
                                textDirection: ui.TextDirection.rtl,
                              ),
                            ],
                          ),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 12,
                            ),
                          ),
                        ),
                        ElevatedButton.icon(
                          onPressed: _localityPermitRequirement != null
                              ? () => Navigator.of(context).pop({
                                  'requirement': _localityPermitRequirement,
                                })
                              : null,
                          icon: const Icon(Icons.arrow_forward, size: 18),
                          label: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                l10n?.next ?? 'Next',
                                style: GoogleFonts.poppins(
                                  color: Colors.white,
                                  fontSize: 13,
                                ),
                              ),
                              Text(
                                'التالي',
                                style: GoogleFonts.poppins(
                                  color: Colors.white,
                                  fontSize: 10,
                                ),
                                textDirection: ui.TextDirection.rtl,
                              ),
                            ],
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primaryBlue,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 24,
                              vertical: 12,
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Widget to display radio options with both English and Arabic labels/descriptions
  Widget _buildBilingualOption(
    String enLabel,
    String enDescription,
    String arLabel,
    String arDescription,
    String value,
    String? selectedValue,
    Function(String) onSelect,
  ) {
    final isSelected = selectedValue == value;
    return InkWell(
      onTap: () => onSelect(value),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: isSelected
              ? LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    AppColors.primaryBlue.withValues(alpha: 0.15),
                    AppColors.primaryBlue.withValues(alpha: 0.05),
                  ],
                )
              : null,
          border: Border.all(
            color: isSelected ? AppColors.primaryBlue : Colors.grey[300]!,
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  isSelected
                      ? Icons.radio_button_checked
                      : Icons.radio_button_unchecked,
                  color: isSelected ? AppColors.primaryBlue : Colors.grey[400],
                  size: 20,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        enLabel,
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: isSelected
                              ? AppColors.primaryBlue
                              : Colors.black87,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        enDescription,
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          color: Colors.grey[600],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.only(left: 32),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    arLabel,
                    style: GoogleFonts.poppins(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: isSelected
                          ? AppColors.primaryBlue
                          : Colors.black87,
                    ),
                    textAlign: TextAlign.right,
                    textDirection: ui.TextDirection.rtl,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    arDescription,
                    style: GoogleFonts.poppins(
                      fontSize: 11,
                      color: Colors.grey[600],
                    ),
                    textAlign: TextAlign.right,
                    textDirection: ui.TextDirection.rtl,
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

// Bulk Locality Permit Follow-up Dialog
class _BulkLocalityPermitFollowUpDialog extends StatefulWidget {
  final String locality;
  final String state;
  final int siteCount;
  final bool isArabic;

  const _BulkLocalityPermitFollowUpDialog({
    required this.locality,
    required this.state,
    required this.siteCount,
    this.isArabic = false,
  });

  @override
  State<_BulkLocalityPermitFollowUpDialog> createState() =>
      _BulkLocalityPermitFollowUpDialogState();
}

class _BulkLocalityPermitFollowUpDialogState
    extends State<_BulkLocalityPermitFollowUpDialog> {
  String? _canWorkWithoutLocalityPermit;

  @override
  Widget build(BuildContext context) {
    final isArabic = widget.isArabic;

    void dismiss() => Navigator.of(context).pop();

    return Directionality(
      textDirection: isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
      child: Dialog(
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
              // ── Blue Gradient Header ──────────────────────────────────
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
                        Icons.location_on_rounded,
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
                            isArabic ? 'تصريح المحلية' : 'Locality Permit',
                            style: GoogleFonts.poppins(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                          Text(
                            _bi('Locality Permit', 'تصريح المحلية'),
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              color: Colors.white70,
                            ),
                          ),
                        ],
                      ),
                    ),
                    GestureDetector(
                      onTap: dismiss,
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

              // ── Info Summary Strip ────────────────────────────────────
              Container(
                color: const Color(0xFFF0F7FF),
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 14,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        children: [
                          Icon(
                            Icons.location_city_rounded,
                            color: AppColors.primaryBlue,
                            size: 18,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            isArabic ? 'الموقع' : 'Location',
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textLight,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            widget.locality,
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: AppColors.primaryBlue,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                    Container(width: 1, height: 50, color: Colors.blue[100]),
                    Expanded(
                      child: Column(
                        children: [
                          Icon(
                            Icons.domain_rounded,
                            color: AppColors.primaryBlue,
                            size: 18,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            isArabic ? 'الولاية' : 'State',
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textLight,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            widget.state,
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: AppColors.primaryBlue,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                    Container(width: 1, height: 50, color: Colors.blue[100]),
                    Expanded(
                      child: Column(
                        children: [
                          Icon(
                            Icons.pin_rounded,
                            color: AppColors.primaryBlue,
                            size: 18,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            isArabic ? 'المواقع' : 'Sites',
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textLight,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${widget.siteCount}',
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: AppColors.primaryBlue,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              // ── Form Body ─────────────────────────────────────────────
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Info container
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF3E0),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: AppColors.primaryOrange.withValues(alpha: 0.3),
                        ),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.warning_amber_rounded,
                            color: AppColors.primaryOrange,
                            size: 20,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  isArabic
                                      ? 'تصريح المحلية مطلوب لكنه غير متاح'
                                      : 'Locality permit is required but not available',
                                  style: GoogleFonts.poppins(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.primaryOrange,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  isArabic
                                      ? 'سيتأثر ${widget.siteCount} موقع بهذا القرار'
                                      : '${widget.siteCount} site(s) will be affected',
                                  style: GoogleFonts.poppins(
                                    fontSize: 11,
                                    color: Colors.grey[600],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Question title
                    Text(
                      isArabic
                          ? 'هل يمكنك المتابعة بدون تصريح؟'
                          : 'Can you proceed without the permit?',
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: Colors.grey[800],
                      ),
                    ),
                    const SizedBox(height: 14),

                    // Options
                    _buildOptionWithDescription(
                      'Yes, I can proceed without it',
                      'نعم، يمكنني المتابعة بدونه',
                      'I will continue with the verification',
                      'سأكمل عملية التحقق',
                      'yes',
                      _canWorkWithoutLocalityPermit,
                      (value) =>
                          setState(() => _canWorkWithoutLocalityPermit = value),
                    ),
                    _buildOptionWithDescription(
                      'No, I cannot proceed without it',
                      'لا، لا يمكنني المتابعة بدونه',
                      'Send the sites back to FOM for action',
                      'إعادة المواقع إلى مسؤول العمليات',
                      'no',
                      _canWorkWithoutLocalityPermit,
                      (value) =>
                          setState(() => _canWorkWithoutLocalityPermit = value),
                    ),
                  ],
                ),
              ),

              // ── Action Buttons ────────────────────────────────────────
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: dismiss,
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
                        onPressed: _canWorkWithoutLocalityPermit != null
                            ? () => Navigator.of(context).pop({
                                'canWorkWithout': _canWorkWithoutLocalityPermit,
                              })
                            : null,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _canWorkWithoutLocalityPermit == 'no'
                              ? AppColors.accentRed
                              : AppColors.primaryBlue,
                          disabledBackgroundColor: Colors.grey[300],
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                          elevation: 0,
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              _canWorkWithoutLocalityPermit == 'no'
                                  ? Icons.send_rounded
                                  : Icons.check_circle_rounded,
                              color: Colors.white,
                              size: 18,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              _canWorkWithoutLocalityPermit == 'no'
                                  ? (isArabic
                                        ? 'إرجاع للعمليات'
                                        : 'Send Back to FOM')
                                  : (isArabic ? 'متابعة' : 'Continue'),
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
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildOptionWithDescription(
    String labelEn,
    String labelAr,
    String descriptionEn,
    String descriptionAr,
    String value,
    String? selectedValue,
    Function(String) onSelect,
  ) {
    final isSelected = selectedValue == value;
    return InkWell(
      onTap: () => onSelect(value),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: isSelected
              ? LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    AppColors.primaryBlue.withValues(alpha: 0.15),
                    AppColors.primaryBlue.withValues(alpha: 0.05),
                  ],
                )
              : null,
          border: Border.all(
            color: isSelected ? AppColors.primaryBlue : Colors.grey[300]!,
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Icon(
              isSelected
                  ? Icons.radio_button_checked
                  : Icons.radio_button_unchecked,
              color: isSelected ? AppColors.primaryBlue : Colors.grey[400],
              size: 20,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // English label
                  Text(
                    labelEn,
                    style: GoogleFonts.poppins(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: isSelected
                          ? AppColors.primaryBlue
                          : Colors.black87,
                    ),
                    textAlign: TextAlign.left,
                  ),
                  // Arabic label
                  Directionality(
                    textDirection: ui.TextDirection.rtl,
                    child: Text(
                      labelAr,
                      style: GoogleFonts.poppins(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: isSelected
                            ? AppColors.primaryBlue
                            : Colors.black87,
                      ),
                      textAlign: TextAlign.right,
                    ),
                  ),
                  const SizedBox(height: 8),
                  // English description
                  Text(
                    descriptionEn,
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                    textAlign: TextAlign.left,
                  ),
                  // Arabic description
                  Directionality(
                    textDirection: ui.TextDirection.rtl,
                    child: Text(
                      descriptionAr,
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                      textAlign: TextAlign.right,
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
}
