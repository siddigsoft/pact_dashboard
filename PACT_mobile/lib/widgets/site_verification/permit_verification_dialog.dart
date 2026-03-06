part of 'site_verification_screen.dart';

// Permit Verification Dialog - Matches PermitVerificationQuestions.tsx flow
class _PermitVerificationDialog extends StatefulWidget {
  final Map<String, dynamic> site;
  final Function(PermitDecision) onComplete;
  final Function(String)? onSendBackToFOM;

  const _PermitVerificationDialog({
    required this.site,
    required this.onComplete,
    this.onSendBackToFOM,
  });

  @override
  State<_PermitVerificationDialog> createState() =>
      _PermitVerificationDialogState();
}

enum _PermitStep {
  stateQuestion,
  stateUpload,
  stateFollowUp,
  localityQuestion,
  localityUpload,
  localityFollowUp,
  complete,
}

class _PermitVerificationDialogState extends State<_PermitVerificationDialog> {
  _PermitStep _currentStep = _PermitStep.stateQuestion;
  String? _statePermitRequirement;
  String? _canWorkWithoutStatePermit;
  bool _statePermitUploaded = false;
  File? _statePermitImage;
  DateTime? _statePermitIssueDate;
  DateTime? _statePermitExpiryDate;
  final ImagePicker _imagePicker = ImagePicker();

  // Locality permit state
  String? _localityPermitRequirement;
  String? _canWorkWithoutLocalityPermit;
  bool _localityPermitUploaded = false;
  File? _localityPermitImage;
  DateTime? _localityPermitIssueDate;
  DateTime? _localityPermitExpiryDate;

  @override
  void initState() {
    super.initState();
    // Initialize dates from persisted additional_data if present
    final additional =
        widget.site['additional_data'] as Map<String, dynamic>? ?? {};
    try {
      final sIssue = additional['state_permit_issue_date'] as String?;
      final sExpiry = additional['state_permit_expiry_date'] as String?;
      if (sIssue != null) _statePermitIssueDate = DateTime.tryParse(sIssue);
      if (sExpiry != null) _statePermitExpiryDate = DateTime.tryParse(sExpiry);

      final lIssue = additional['locality_permit_issue_date'] as String?;
      final lExpiry = additional['locality_permit_expiry_date'] as String?;
      if (lIssue != null) _localityPermitIssueDate = DateTime.tryParse(lIssue);
      if (lExpiry != null) {
        _localityPermitExpiryDate = DateTime.tryParse(lExpiry);
      }

      if (additional['state_permit_attached'] == true) {
        _statePermitUploaded = true;
      }
      if (additional['locality_permit_attached'] == true) {
        _localityPermitUploaded = true;
      }
    } catch (e) {
      debugPrint('Failed to parse permit dates from additional_data: $e');
    }
  }

  // Confirmation dialog state
  bool _confirmationDialogOpen = false;
  String _confirmationMessage = '';
  PermitDecision? _pendingDecision;

  String _formatDate(DateTime date) =>
      '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

  /// Helper to build a placeholder for broken/unavailable images
  Widget _buildImagePlaceholder() {
    return Container(
      height: 150,
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.grey[200],
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.broken_image, size: 48, color: Colors.grey[400]),
          const SizedBox(height: 8),
          Text(
            'Image unavailable',
            style: GoogleFonts.poppins(color: Colors.grey[600]),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.site['state']?.toString() ?? '';

    return Stack(
      children: [
        Dialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          backgroundColor: Colors.white,
          child: Container(
            constraints: const BoxConstraints(maxWidth: 600, maxHeight: 700),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Content
                Flexible(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(24),
                    child: _buildCurrentStep(state),
                  ),
                ),
              ],
            ),
          ),
        ),
        // Confirmation Dialog
        if (_confirmationDialogOpen)
          Dialog(
            child: Container(
              padding: const EdgeInsets.all(24),
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.check_circle,
                        color: Colors.green,
                        size: 28,
                      ),
                      const SizedBox(width: 12),
                      Text(
                        'Process Completed',
                        style: GoogleFonts.poppins(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text(
                    _confirmationMessage,
                    style: GoogleFonts.poppins(
                      fontSize: 14,
                      color: Colors.grey[700],
                    ),
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _handleConfirmationOkay,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryBlue,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: Text('Okay', style: GoogleFonts.poppins()),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildCurrentStep(String state) {
    final locality = widget.site['locality']?.toString() ?? '';

    switch (_currentStep) {
      case _PermitStep.stateQuestion:
        return _buildStatePermitQuestion(state);
      case _PermitStep.stateUpload:
        return _buildStatePermitUpload();
      case _PermitStep.stateFollowUp:
        return _buildCanWorkWithoutQuestion(state);
      case _PermitStep.localityQuestion:
        return _buildLocalityPermitQuestion(locality);
      case _PermitStep.localityUpload:
        return _buildLocalityPermitUpload();
      case _PermitStep.localityFollowUp:
        return _buildCanWorkWithoutLocalityQuestion(locality);
      case _PermitStep.complete:
        return const SizedBox.shrink();
    }
  }

  Widget _buildStatePermitQuestion(String state) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.primaryOrange, Color(0xFFE67E22)],
          ),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.verified_user_rounded,
                    color: Colors.white,
                    size: 28,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      isArabic
                          ? 'التحقق من تصريح الولاية'
                          : 'State Permit Verification',
                      style: GoogleFonts.poppins(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                      softWrap: true,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                isArabic
                    ? 'تحقق من متطلبات تصريح الولاية للـ $state'
                    : 'Verify state permit requirements for $state',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  color: Colors.white.withValues(alpha: 0.9),
                ),
              ),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.95),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isArabic
                          ? 'هل تحتاج إلى تصريح ولاية في ولايتك؟'
                          : 'Do you require a State permit in your state?',
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: Colors.grey[800],
                      ),
                    ),
                    const SizedBox(height: 16),
                    _buildOptionWithDescription(
                      isArabic
                          ? 'نعم، مطلوب وسأقوم بتحميله'
                          : 'Yes, it\'s required and I will upload it',
                      isArabic
                          ? 'لدي تصريح الولاية وسأقوم بتحميله الآن'
                          : 'I have the state permit and will upload it now',
                      'required_have_it',
                      _statePermitRequirement,
                      (value) =>
                          setState(() => _statePermitRequirement = value),
                    ),
                    _buildOptionWithDescription(
                      isArabic
                          ? 'نعم، مطلوب لكن ليس لدي'
                          : 'Yes, it\'s required but I don\'t have it',
                      isArabic
                          ? 'تصريح الولاية مطلوب لكن غير متاح'
                          : 'The state permit is required but not available',
                      'required_dont_have_it',
                      _statePermitRequirement,
                      (value) =>
                          setState(() => _statePermitRequirement = value),
                    ),
                    _buildOptionWithDescription(
                      isArabic
                          ? 'لا، ليس مطلوباً'
                          : 'No, it\'s not a requirement',
                      isArabic
                          ? 'تصريح الولاية غير مطلوب في هذه الولاية'
                          : 'State permit is not required in this state',
                      'not_required',
                      _statePermitRequirement,
                      (value) =>
                          setState(() => _statePermitRequirement = value),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => Navigator.pop(context),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.grey.shade300,
                        foregroundColor: Colors.grey.shade700,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: Text(
                        isArabic ? 'إلغاء' : 'Cancel',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w600,
                          color: Colors.grey.shade700,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: _statePermitRequirement != null
                          ? _handleStatePermitNext
                          : null,
                      icon: Icon(
                        isArabic ? Icons.arrow_back : Icons.arrow_forward,
                        size: 18,
                      ),
                      label: Text(
                        isArabic ? 'التالي' : 'Next',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryOrange,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _handleStatePermitNext() {
    if (_statePermitRequirement == null) return;

    if (_statePermitRequirement == 'required_have_it') {
      setState(() => _currentStep = _PermitStep.stateUpload);
    } else if (_statePermitRequirement == 'required_dont_have_it') {
      // Required but don't have it - show follow-up question about working without it
      setState(() => _currentStep = _PermitStep.stateFollowUp);
    } else if (_statePermitRequirement == 'not_required') {
      // Not required - complete with state not required, locality required but not uploaded
      final decision = PermitDecision(
        statePermit: PermitStatus(requirement: 'not_required'),
        localityPermit: PermitStatus(
          requirement: 'required_have_it',
          uploaded: false,
        ),
      );
      widget.onComplete(decision);
      Navigator.pop(context);
    }
  }

  Widget _buildCanWorkWithoutQuestion(String state) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.primaryBlue, Color(0xFF2E5C8A)],
          ),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.warning_rounded, color: Colors.white, size: 28),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      isArabic
                          ? 'تصريح الولاية غير متاح'
                          : 'State Permit Not Available',
                      style: GoogleFonts.poppins(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                isArabic
                    ? 'أشرت إلى أن تصريح الولاية للـ $state مطلوب لكن غير متاح'
                    : 'You indicated the state permit for $state is required but not available',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  color: Colors.white.withValues(alpha: 0.9),
                ),
              ),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.1),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.3),
                  ),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Icon(Icons.info_outline, color: Colors.white, size: 20),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        isArabic
                            ? 'تصريح الولاية مطلوب لكن ليس لديك. هل يمكنك المتابعة مع التحقق بدونه؟'
                            : 'The state permit is required but you don\'t have it. Can you proceed with the verification without it?',
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.95),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isArabic
                          ? 'هل يمكنك العمل بدون تصريح الولاية؟'
                          : 'Are you able to work without the state permit?',
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: Colors.grey[800],
                      ),
                    ),
                    const SizedBox(height: 16),
                    _buildOptionWithDescription(
                      isArabic
                          ? 'نعم، يمكنني المتابعة بدونه'
                          : 'Yes, I can proceed without it',
                      isArabic
                          ? 'سأستمر مع التحقق من وثائق الحقوق'
                          : 'I will continue with the CP verification',
                      'yes',
                      _canWorkWithoutStatePermit,
                      (value) =>
                          setState(() => _canWorkWithoutStatePermit = value),
                    ),
                    _buildOptionWithDescription(
                      isArabic
                          ? 'لا، لا يمكنني المتابعة بدونه'
                          : 'No, I cannot proceed without it',
                      isArabic
                          ? 'إعادة الخطة الرئيسية إلى المسؤول الميداني للإجراء'
                          : 'Send the MMP back to FOM for action',
                      'no',
                      _canWorkWithoutStatePermit,
                      (value) =>
                          setState(() => _canWorkWithoutStatePermit = value),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => setState(
                        () => _currentStep = _PermitStep.stateQuestion,
                      ),
                      icon: Icon(
                        isArabic ? Icons.arrow_forward : Icons.arrow_back,
                        size: 18,
                      ),
                      label: Text(
                        isArabic ? 'للأمام' : 'Back',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w600,
                          color: Colors.grey.shade700,
                        ),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.grey.shade300,
                        foregroundColor: Colors.grey.shade700,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: _canWorkWithoutStatePermit != null
                          ? _handleStateFollowUpNext
                          : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _canWorkWithoutStatePermit == 'no'
                            ? AppColors.accentRed
                            : AppColors.primaryOrange,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      icon: Icon(
                        _canWorkWithoutStatePermit == 'no'
                            ? Icons.send_rounded
                            : isArabic
                            ? Icons.arrow_back
                            : Icons.arrow_forward,
                        size: 18,
                        color: Colors.white,
                      ),
                      label: Text(
                        _canWorkWithoutStatePermit == 'no'
                            ? (isArabic
                                  ? 'إرسال إلى المسؤول'
                                  : 'Send Back to FOM')
                            : (isArabic ? 'متابعة' : 'Continue'),
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _handleStateFollowUpNext() {
    if (_canWorkWithoutStatePermit == null) return;

    if (_canWorkWithoutStatePermit == 'yes') {
      // Can work without state permit - complete state verification and let user navigate to locality manually
      final decision = PermitDecision(
        statePermit: PermitStatus(
          requirement: 'required_dont_have_it',
          canWorkWithout: 'yes',
          uploaded: false,
        ),
        localityPermit: PermitStatus(
          requirement: 'required_have_it',
          uploaded: false,
        ),
      );
      widget.onComplete(decision);
      Navigator.pop(context);
    } else {
      // Cannot work without - send back to FOM
      final state = widget.site['state']?.toString() ?? '';
      final reason =
          'State permit is required for $state but coordinator does not have it and cannot proceed without it.';

      if (widget.onSendBackToFOM != null) {
        widget.onSendBackToFOM!(reason);
      }
      Navigator.pop(context);
    }
  }

  Widget _buildStatePermitUpload() {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ElevatedButton.icon(
          onPressed: () =>
              setState(() => _currentStep = _PermitStep.stateQuestion),
          icon: Icon(
            isArabic ? Icons.arrow_forward : Icons.arrow_back,
            size: 18,
          ),
          label: Text(
            isArabic ? 'العودة للأسئلة' : 'Back to Questions',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
          ),
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.grey.shade300,
            foregroundColor: Colors.grey.shade700,
            padding: const EdgeInsets.symmetric(vertical: 12),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
        ),
        const SizedBox(height: 24),
        Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [AppColors.primaryOrange, Color(0xFFE67E22)],
            ),
            borderRadius: BorderRadius.circular(16),
          ),
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.upload_file_rounded,
                    color: Colors.white,
                    size: 28,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      isArabic ? 'تحميل تصريح الولاية' : 'Upload State Permit',
                      style: GoogleFonts.poppins(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                isArabic
                    ? 'التقط صورة أو اختر من المعرض'
                    : 'Take a photo or select from gallery',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  color: Colors.white.withValues(alpha: 0.9),
                ),
              ),
              const SizedBox(height: 24),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  border: Border.all(
                    color: _statePermitUploaded
                        ? Colors.green.shade400
                        : Colors.white.withValues(alpha: 0.5),
                    width: _statePermitUploaded ? 2 : 1,
                  ),
                  borderRadius: BorderRadius.circular(12),
                  color: _statePermitUploaded
                      ? Colors.green.withValues(alpha: 0.15)
                      : Colors.white.withValues(alpha: 0.1),
                ),
                child: Column(
                  children: [
                    if (_statePermitImage != null) ...[
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: kIsWeb
                            ? Image.network(
                                _statePermitImage!.path,
                                height: 150,
                                width: double.infinity,
                                fit: BoxFit.cover,
                                errorBuilder: (context, error, stackTrace) {
                                  return _buildImagePlaceholder();
                                },
                              )
                            : Image.file(
                                _statePermitImage!,
                                height: 150,
                                width: double.infinity,
                                fit: BoxFit.cover,
                                errorBuilder: (context, error, stackTrace) {
                                  return _buildImagePlaceholder();
                                },
                              ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.check_circle_rounded,
                            color: AppColors.accentGreen,
                            size: 22,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            isArabic
                                ? 'تم التحميل بنجاح'
                                : 'Uploaded Successfully',
                            style: GoogleFonts.poppins(
                              color: AppColors.accentGreen,
                              fontWeight: FontWeight.w600,
                              fontSize: 14,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      ElevatedButton.icon(
                        onPressed: () => _pickPermitImage(isState: true),
                        icon: const Icon(Icons.refresh_rounded, size: 16),
                        label: Text(
                          isArabic ? 'استبدل الصورة' : 'Replace Image',
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: AppColors.primaryOrange,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                      ),
                    ] else ...[
                      Icon(
                        Icons.add_photo_alternate_rounded,
                        size: 56,
                        color: Colors.white.withValues(alpha: 0.8),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        isArabic
                            ? 'انقر لتحميل صورة التصريح'
                            : 'Tap to upload permit photo',
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontWeight: FontWeight.w500,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 20),
                      Wrap(
                        alignment: WrapAlignment.center,
                        spacing: 12,
                        runSpacing: 12,
                        children: [
                          ElevatedButton.icon(
                            onPressed: () => _pickPermitImage(
                              isState: true,
                              useCamera: true,
                            ),
                            icon: const Icon(Icons.camera_alt, size: 16),
                            label: Text(
                              isArabic ? 'الكاميرا' : 'Camera',
                              style: GoogleFonts.poppins(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.white,
                              foregroundColor: Colors.orange.shade600,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 20,
                                vertical: 12,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                          ),
                          ElevatedButton.icon(
                            onPressed: () => _pickPermitImage(
                              isState: true,
                              useCamera: false,
                            ),
                            icon: const Icon(Icons.photo_library, size: 16),
                            label: Text(
                              isArabic ? 'المعرض' : 'Gallery',
                              style: GoogleFonts.poppins(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.white.withValues(
                                alpha: 0.8,
                              ),
                              foregroundColor: Colors.orange.shade600,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 20,
                                vertical: 12,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () async {
                        final picked = await showDatePicker(
                          context: context,
                          initialDate: _statePermitIssueDate ?? DateTime.now(),
                          firstDate: DateTime(2000),
                          lastDate: DateTime(2100),
                        );
                        if (picked != null) {
                          setState(() => _statePermitIssueDate = picked);
                        }
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          vertical: 12,
                          horizontal: 12,
                        ),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.3),
                          ),
                          color: Colors.white.withValues(alpha: 0.1),
                        ),
                        child: Text(
                          _statePermitIssueDate != null
                              ? isArabic
                                    ? 'التاريخ: ${_formatDate(_statePermitIssueDate!)}'
                                    : 'Issue: ${_formatDate(_statePermitIssueDate!)}'
                              : (isArabic
                                    ? 'اختر تاريخ الإصدار'
                                    : 'Select issue date'),
                          style: GoogleFonts.poppins(
                            fontSize: 13,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: GestureDetector(
                      onTap: () async {
                        final picked = await showDatePicker(
                          context: context,
                          initialDate: _statePermitExpiryDate ?? DateTime.now(),
                          firstDate: DateTime(2000),
                          lastDate: DateTime(2100),
                        );
                        if (picked != null) {
                          setState(() => _statePermitExpiryDate = picked);
                        }
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          vertical: 12,
                          horizontal: 12,
                        ),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.3),
                          ),
                          color: Colors.white.withValues(alpha: 0.1),
                        ),
                        child: Text(
                          _statePermitExpiryDate != null
                              ? isArabic
                                    ? 'الانتهاء: ${_formatDate(_statePermitExpiryDate!)}'
                                    : 'Expiry: ${_formatDate(_statePermitExpiryDate!)}'
                              : (isArabic
                                    ? 'اختر تاريخ الانتهاء'
                                    : 'Select expiry date'),
                          style: GoogleFonts.poppins(
                            fontSize: 13,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              if ((_statePermitIssueDate != null ||
                      _statePermitExpiryDate != null) &&
                  (_statePermitIssueDate == null ||
                      _statePermitExpiryDate == null ||
                      (_statePermitIssueDate != null &&
                          _statePermitExpiryDate != null &&
                          _statePermitExpiryDate!.isBefore(
                            _statePermitIssueDate!,
                          )))) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.red.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.red.shade300),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.warning_rounded,
                        color: Colors.red.shade400,
                        size: 18,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          isArabic
                              ? 'تأكد من حدوث كلا التاريخين وأن الانتهاء بعد الإصدار'
                              : 'Please ensure both Issue and Expiry dates are set and Expiry is after Issue.',
                          style: GoogleFonts.poppins(
                            color: Colors.red.shade400,
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildLocalityPermitQuestion(String locality) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.green[200]!, width: 1),
      ),
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Colors.green[50]!.withValues(alpha: 0.5), Colors.white],
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.location_on, color: Colors.green[600], size: 24),
                  const SizedBox(width: 8),
                  Text(
                    'Locality Permit Verification',
                    style: GoogleFonts.poppins(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: Colors.green[800],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Verify locality permit requirements for $locality',
                style: GoogleFonts.poppins(
                  fontSize: 13,
                  color: Colors.grey[600],
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'Do you require a Locality permit in your locality?',
                style: GoogleFonts.poppins(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Colors.grey[800],
                ),
              ),
              const SizedBox(height: 16),
              _buildOptionWithDescription(
                'Yes, it\'s required and I will upload it',
                'I have the locality permit and will upload it now',
                'required_have_it',
                _localityPermitRequirement,
                (value) => setState(() => _localityPermitRequirement = value),
              ),
              _buildOptionWithDescription(
                'Yes, it\'s required but I don\'t have it',
                'The locality permit is required but not available',
                'required_dont_have_it',
                _localityPermitRequirement,
                (value) => setState(() => _localityPermitRequirement = value),
              ),
              _buildOptionWithDescription(
                'No, it\'s not a requirement',
                'Locality permit is not required in this locality',
                'not_required',
                _localityPermitRequirement,
                (value) => setState(() => _localityPermitRequirement = value),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => setState(
                        () => _currentStep = _PermitStep.stateQuestion,
                      ),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: Text(
                        'Back to State',
                        style: GoogleFonts.poppins(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton(
                      onPressed: _localityPermitRequirement != null
                          ? _handleLocalityPermitNext
                          : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryBlue,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            'Next',
                            style: GoogleFonts.poppins(color: Colors.white),
                          ),
                          const SizedBox(width: 8),
                          const Icon(
                            Icons.arrow_forward,
                            size: 18,
                            color: Colors.white,
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _handleLocalityPermitNext() {
    if (_localityPermitRequirement == null) return;

    if (_localityPermitRequirement == 'required_have_it') {
      setState(() => _currentStep = _PermitStep.localityUpload);
    } else if (_localityPermitRequirement == 'required_dont_have_it') {
      setState(() => _currentStep = _PermitStep.localityFollowUp);
    } else {
      // Not required - complete
      _handleComplete();
    }
  }

  Widget _buildLocalityPermitUpload() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        OutlinedButton.icon(
          onPressed: () =>
              setState(() => _currentStep = _PermitStep.stateQuestion),
          icon: const Icon(Icons.arrow_back, size: 18),
          label: Text('Back to State Question', style: GoogleFonts.poppins()),
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 12),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'Upload Locality Permit',
          style: GoogleFonts.poppins(fontSize: 16, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 8),
        Text(
          'Take a photo or select from gallery',
          style: GoogleFonts.poppins(fontSize: 12, color: Colors.grey[600]),
        ),
        const SizedBox(height: 16),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            border: Border.all(
              color: _localityPermitUploaded ? Colors.green : Colors.grey[300]!,
              width: _localityPermitUploaded ? 2 : 1,
            ),
            borderRadius: BorderRadius.circular(12),
            color: _localityPermitUploaded
                ? Colors.green.withValues(alpha: 0.1)
                : null,
          ),
          child: Column(
            children: [
              if (_localityPermitImage != null) ...[
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: kIsWeb
                      ? Image.network(
                          _localityPermitImage!.path,
                          height: 150,
                          width: double.infinity,
                          fit: BoxFit.cover,
                          errorBuilder: (context, error, stackTrace) {
                            return _buildImagePlaceholder();
                          },
                        )
                      : Image.file(
                          _localityPermitImage!,
                          height: 150,
                          width: double.infinity,
                          fit: BoxFit.cover,
                          errorBuilder: (context, error, stackTrace) {
                            return _buildImagePlaceholder();
                          },
                        ),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(
                      Icons.check_circle,
                      color: Colors.green,
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Permit Uploaded',
                      style: GoogleFonts.poppins(
                        color: Colors.green,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: () => _pickPermitImage(isState: false),
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('Replace Image'),
                ),
              ] else ...[
                Icon(Icons.add_a_photo, size: 48, color: Colors.grey[400]),
                const SizedBox(height: 12),
                Text(
                  'Tap to upload permit photo',
                  style: GoogleFonts.poppins(color: Colors.grey[600]),
                ),
                const SizedBox(height: 16),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    ElevatedButton.icon(
                      onPressed: () =>
                          _pickPermitImage(isState: false, useCamera: true),
                      icon: const Icon(Icons.camera_alt, size: 16),
                      label: const Text(
                        'Camera',
                        style: TextStyle(fontSize: 12),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryBlue,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                    OutlinedButton.icon(
                      onPressed: () =>
                          _pickPermitImage(isState: false, useCamera: false),
                      icon: const Icon(Icons.photo_library, size: 16),
                      label: const Text(
                        'Gallery',
                        style: TextStyle(fontSize: 12),
                      ),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.primaryBlue,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                        side: const BorderSide(color: AppColors.primaryBlue),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildCanWorkWithoutLocalityQuestion(String locality) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: AppColors.primaryOrange.withValues(alpha: 0.12),
          width: 1,
        ),
      ),
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              AppColors.primaryOrange.withValues(alpha: 0.05),
              Colors.white,
            ],
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(
                    Icons.warning_amber_rounded,
                    color: AppColors.primaryOrange,
                    size: 24,
                  ),
                  const SizedBox(width: 8),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Locality Permit Not Available',
                        style: GoogleFonts.poppins(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primaryOrange,
                        ),
                      ),
                      Text(
                        'تصريح المحلية غير متاح',
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primaryOrange,
                        ),
                        textDirection: ui.TextDirection.rtl,
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'You indicated the locality permit for $locality is required but not available',
                    style: GoogleFonts.poppins(
                      fontSize: 13,
                      color: Colors.grey[600],
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'لقد أشرت إلى أن تصريح المحلية لـ $locality مطلوب لكنه غير متاح',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                    textDirection: ui.TextDirection.rtl,
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.primaryOrange.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: AppColors.primaryOrange.withValues(alpha: 0.15),
                    width: 1.5,
                  ),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.info_rounded,
                      color: AppColors.primaryOrange,
                      size: 20,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'The locality permit is required but you don\'t have it. Can you proceed with the verification without it?',
                            style: GoogleFonts.poppins(
                              fontSize: 13,
                              color: Colors.grey[700],
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'تصريح المحلية مطلوب لكنك لا تملكه. هل يمكنك المتابعة مع التحقق بدونه؟',
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              color: Colors.grey[700],
                            ),
                            textDirection: ui.TextDirection.rtl,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Are you able to work without the locality permit?',
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                      color: Colors.grey[800],
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'هل يمكنك العمل بدون تصريح المحلية؟',
                    style: GoogleFonts.poppins(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: Colors.grey[700],
                    ),
                    textDirection: ui.TextDirection.rtl,
                  ),
                ],
              ),
              const SizedBox(height: 16),
              _buildBilingualOption(
                'Yes, I can proceed without it',
                'I will continue with the verification',
                'نعم، يمكنني المتابعة بدونه',
                'سأتابع مع التحقق',
                'yes',
                _canWorkWithoutLocalityPermit,
                (value) =>
                    setState(() => _canWorkWithoutLocalityPermit = value),
              ),
              _buildBilingualOption(
                'No, I cannot proceed without it',
                'Send the sites back to FOM for action',
                'لا، لا يمكنني المتابعة بدونه',
                'أرسل المواقع للعودة إلى إدارة العمليات',
                'no',
                _canWorkWithoutLocalityPermit,
                (value) =>
                    setState(() => _canWorkWithoutLocalityPermit = value),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => setState(
                        () => _currentStep = _PermitStep.localityQuestion,
                      ),
                      icon: const Icon(Icons.arrow_back, size: 18),
                      label: Text('Back', style: GoogleFonts.poppins()),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: _canWorkWithoutLocalityPermit != null
                          ? _handleLocalityFollowUpNext
                          : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _canWorkWithoutLocalityPermit == 'no'
                            ? AppColors.accentRed
                            : AppColors.primaryOrange,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      icon: Icon(
                        _canWorkWithoutLocalityPermit == 'no'
                            ? Icons.send
                            : Icons.arrow_forward,
                        size: 18,
                        color: Colors.white,
                      ),
                      label: Text(
                        _canWorkWithoutLocalityPermit == 'no'
                            ? _bi('Send Back to FOM', 'أرسل بالعودة')
                            : _bi('Continue', 'متابعة'),
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _handleLocalityFollowUpNext() {
    if (_canWorkWithoutLocalityPermit == null) return;

    if (_canWorkWithoutLocalityPermit == 'yes') {
      // Can work without locality permit - complete
      _handleComplete();
    } else {
      // Cannot work without - send back to FOM
      final locality = widget.site['locality']?.toString() ?? '';
      final reason =
          'Locality permit is required for $locality but coordinator does not have it and cannot proceed without it.';

      if (widget.onSendBackToFOM != null) {
        widget.onSendBackToFOM!(reason);
      }
      Navigator.pop(context);
    }
  }

  void _handleLocalityPermitUploaded() {
    // Ensure localityPermitRequirement is set (should be 'required_have_it' at this point)
    if (_localityPermitRequirement != 'required_have_it') {
      debugPrint(
        'Locality permit uploaded but requirement is not set correctly: $_localityPermitRequirement',
      );
    }
    _handleComplete(uploadedOverride: true);
  }

  Future<void> _pickPermitImage({
    required bool isState,
    bool useCamera = false,
  }) async {
    try {
      final XFile? image = await _imagePicker.pickImage(
        source: useCamera ? ImageSource.camera : ImageSource.gallery,
        imageQuality: 80,
        maxWidth: 1200,
      );

      if (image != null) {
        setState(() {
          if (isState) {
            _statePermitImage = File(image.path);
            _statePermitUploaded = true;
          } else {
            _localityPermitImage = File(image.path);
            _localityPermitUploaded = true;
          }
        });
        // Prompt for dates when uploading
        if (isState) {
          await _promptForStatePermitDates();
          _handleStatePermitUploaded();
        } else {
          await _promptForLocalityPermitDates();
          _handleLocalityPermitUploaded();
        }
      }
    } catch (e) {
      debugPrint('Error picking image: $e');
    }
  }

  /// Prompt the coordinator to optionally enter Issue and Expiry dates for state permit
  Future<void> _promptForStatePermitDates() async {
    DateTime? tempIssue = _statePermitIssueDate;
    DateTime? tempExpiry = _statePermitExpiryDate;

    final result = await showDialog<String?>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setStateDialog) {
            return AlertDialog(
              title: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Enter State Permit Dates',
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    'أدخل تواريخ تصريح الولاية',
                    style: GoogleFonts.poppins(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: Colors.grey[600],
                    ),
                    textDirection: ui.TextDirection.rtl,
                  ),
                ],
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Guide section in both languages
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.blue[50],
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.blue[200]!),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Instructions:',
                          style: GoogleFonts.poppins(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: Colors.blue[800],
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Please select or enter both permit dates (Issue and Expiry). The expiry date must be after the issue date.',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: Colors.blue[700],
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'التعليمات:',
                          style: GoogleFonts.poppins(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: Colors.blue[800],
                          ),
                          textDirection: ui.TextDirection.rtl,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'يرجى تحديد تواريخ التصريح (الإصدار والانتهاء). يجب أن يكون تاريخ الانتهاء بعد تاريخ الإصدار.',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: Colors.blue[700],
                          ),
                          textDirection: ui.TextDirection.rtl,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  GestureDetector(
                    onTap: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: tempIssue ?? DateTime.now(),
                        firstDate: DateTime(2000),
                        lastDate: DateTime(2100),
                      );
                      if (picked != null) {
                        setStateDialog(() => tempIssue = picked);
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        vertical: 12,
                        horizontal: 12,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.grey[300]!),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(
                                Icons.calendar_today,
                                size: 18,
                                color: Colors.grey[700],
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  tempIssue != null
                                      ? 'Issue: ${_formatDate(tempIssue!)}'
                                      : 'Select issue date',
                                  style: GoogleFonts.poppins(fontSize: 13),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            tempIssue != null
                                ? 'الإصدار: ${_formatDate(tempIssue!)}'
                                : 'حدد تاريخ الإصدار',
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              color: Colors.grey[600],
                            ),
                            textDirection: ui.TextDirection.rtl,
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  GestureDetector(
                    onTap: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: tempExpiry ?? DateTime.now(),
                        firstDate: DateTime(2000),
                        lastDate: DateTime(2100),
                      );
                      if (picked != null) {
                        setStateDialog(() => tempExpiry = picked);
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        vertical: 12,
                        horizontal: 12,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.grey[300]!),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Row(
                            children: [
                              Icon(
                                Icons.calendar_today_outlined,
                                size: 18,
                                color: Colors.grey[700],
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  tempExpiry != null
                                      ? 'Expiry: ${_formatDate(tempExpiry!)}'
                                      : 'Select expiry date',
                                  style: GoogleFonts.poppins(fontSize: 13),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            tempExpiry != null
                                ? 'الانتهاء: ${_formatDate(tempExpiry!)}'
                                : 'حدد تاريخ الانتهاء',
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              color: Colors.grey[600],
                            ),
                            textDirection: ui.TextDirection.rtl,
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  if ((tempIssue != null || tempExpiry != null) &&
                      (tempIssue == null ||
                          tempExpiry == null ||
                          (tempIssue != null &&
                              tempExpiry != null &&
                              tempExpiry!.isBefore(tempIssue!))))
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Please provide both dates and ensure Expiry is after Issue.',
                          style: GoogleFonts.poppins(
                            color: Colors.red,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'يرجى تحديد كلا التاريخين والتأكد من أن تاريخ الانتهاء بعد الإصدار.',
                          style: GoogleFonts.poppins(
                            color: Colors.red,
                            fontSize: 11,
                          ),
                          textDirection: ui.TextDirection.rtl,
                        ),
                      ],
                    ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context, null),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('Cancel'),
                      Text('إلغاء', style: GoogleFonts.poppins(fontSize: 10)),
                    ],
                  ),
                ),
                TextButton(
                  onPressed: () => Navigator.pop(context, 'skip'),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('Skip'),
                      Text('تخطي', style: GoogleFonts.poppins(fontSize: 10)),
                    ],
                  ),
                ),
                ElevatedButton(
                  onPressed: () {
                    // Validate before closing
                    if ((tempIssue != null || tempExpiry != null) &&
                        (tempIssue == null || tempExpiry == null)) {
                      // keep dialog open
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Please set both dates or Skip.'),
                        ),
                      );
                      return;
                    }
                    if (tempIssue != null &&
                        tempExpiry != null &&
                        tempExpiry!.isBefore(tempIssue!)) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Expiry must be after Issue.'),
                        ),
                      );
                      return;
                    }

                    // Save to state
                    setState(() {
                      _statePermitIssueDate = tempIssue;
                      _statePermitExpiryDate = tempExpiry;
                    });

                    Navigator.pop(context, 'saved');
                  },
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('Save'),
                      Text('احفظ', style: GoogleFonts.poppins(fontSize: 10)),
                    ],
                  ),
                ),
              ],
            );
          },
        );
      },
    );

    if (result == 'saved') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('State permit dates recorded')),
      );
    }
  }

  /// Prompt the coordinator to optionally enter Issue and Expiry dates for locality permit
  Future<bool> _promptForLocalityPermitDates() async {
    DateTime? tempIssue = _localityPermitIssueDate;
    DateTime? tempExpiry = _localityPermitExpiryDate;

    final result = await showDialog<bool?>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setStateDialog) {
            return AlertDialog(
              title: const Text('Enter Permit Dates'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  GestureDetector(
                    onTap: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: tempIssue ?? DateTime.now(),
                        firstDate: DateTime(2000),
                        lastDate: DateTime(2100),
                      );
                      if (picked != null) {
                        setStateDialog(() => tempIssue = picked);
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        vertical: 12,
                        horizontal: 12,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.grey[300]!),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.calendar_today,
                            size: 18,
                            color: Colors.grey[700],
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              tempIssue != null
                                  ? 'Issue: ${_formatDate(tempIssue!)}'
                                  : 'Select issue date',
                              style: GoogleFonts.poppins(fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  GestureDetector(
                    onTap: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: tempExpiry ?? DateTime.now(),
                        firstDate: DateTime(2000),
                        lastDate: DateTime(2100),
                      );
                      if (picked != null) {
                        setStateDialog(() => tempExpiry = picked);
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        vertical: 12,
                        horizontal: 12,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.grey[300]!),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.calendar_today_outlined,
                            size: 18,
                            color: Colors.grey[700],
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              tempExpiry != null
                                  ? 'Expiry: ${_formatDate(tempExpiry!)}'
                                  : 'Select expiry date',
                              style: GoogleFonts.poppins(fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  if ((tempIssue != null || tempExpiry != null) &&
                      (tempIssue == null ||
                          tempExpiry == null ||
                          (tempIssue != null &&
                              tempExpiry != null &&
                              tempExpiry!.isBefore(tempIssue!))))
                    Text(
                      'Please provide both dates and ensure Expiry is after Issue.',
                      style: GoogleFonts.poppins(
                        color: Colors.red,
                        fontSize: 12,
                      ),
                    ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  onPressed: () {
                    // Validate before closing
                    if (tempIssue == null || tempExpiry == null) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text(
                            'Please set both Issue and Expiry dates.',
                          ),
                        ),
                      );
                      return;
                    }
                    if (tempExpiry!.isBefore(tempIssue!)) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Expiry must be after Issue.'),
                        ),
                      );
                      return;
                    }

                    // Save to state
                    setState(() {
                      _localityPermitIssueDate = tempIssue;
                      _localityPermitExpiryDate = tempExpiry;
                    });

                    Navigator.pop(context, true);
                  },
                  child: const Text('Save'),
                ),
              ],
            );
          },
        );
      },
    );

    if (result == true) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Permit dates recorded')));
      return true;
    }
    return false;
  }

  void _handleStatePermitUploaded() {
    // Ensure statePermitRequirement is set (should be 'required_have_it' at this point)
    if (_statePermitRequirement != 'required_have_it') {
      debugPrint(
        'State permit uploaded but requirement is not set correctly: $_statePermitRequirement',
      );
    }
    // After uploading state permit, do NOT automatically move to locality — complete state-only flow
    _handleStateComplete(uploadedOverride: true, proceedToLocality: false);
  }

  void _handleStateComplete({
    bool? uploadedOverride,
    bool proceedToLocality = true,
  }) {
    // Validate that we have the required information
    if (_statePermitRequirement == null) {
      debugPrint('Cannot complete: statePermitRequirement is not set');
      return;
    }

    // Determine the effective uploaded flag
    final effectiveUploaded = uploadedOverride ?? _statePermitUploaded;

    // Additional validation: if requirement is 'required_have_it', uploaded must be true
    if (_statePermitRequirement == 'required_have_it' && !effectiveUploaded) {
      debugPrint('Cannot complete: state permit is required but not uploaded');
    }

    // Additional validation: if requirement is 'required_dont_have_it', canWorkWithout must be set
    if (_statePermitRequirement == 'required_dont_have_it' &&
        _canWorkWithoutStatePermit == null) {
      debugPrint(
        'Cannot complete: state permit is required but canWorkWithout is not set',
      );
      return;
    }

    if (proceedToLocality) {
      // Proceed to locality questions as before
      setState(() => _currentStep = _PermitStep.localityQuestion);
      return;
    }

    // Finish state-only: create a PermitDecision with only state info and persist
    final decision = PermitDecision(
      statePermit: PermitStatus(
        requirement: _statePermitRequirement,
        canWorkWithout: _canWorkWithoutStatePermit,
        uploaded: effectiveUploaded,
        issueDate: _statePermitIssueDate != null
            ? _formatDate(_statePermitIssueDate!)
            : null,
        expiryDate: _statePermitExpiryDate != null
            ? _formatDate(_statePermitExpiryDate!)
            : null,
      ),
      localityPermit: PermitStatus(),
    );

    // Prepare a confirmation message for state-only completion
    final state = widget.site['state']?.toString() ?? '';
    String message = '';
    if (_statePermitRequirement == 'required_have_it' && effectiveUploaded) {
      message =
          'State permit uploaded successfully for $state. You can upload the locality permit separately.';
    } else if (_statePermitRequirement == 'required_dont_have_it' &&
        _canWorkWithoutStatePermit == 'yes') {
      message =
          'Proceeding without the state permit for $state. You can upload the locality permit separately.';
    } else if (_statePermitRequirement == 'required_dont_have_it' &&
        _canWorkWithoutStatePermit == 'no') {
      message =
          'The MMP has been sent back to FOM because a state permit is required for $state and you cannot proceed without it.';
    } else if (_statePermitRequirement == 'not_required') {
      message =
          'State permit not required for $state. You can upload the locality permit separately if needed.';
    }

    setState(() {
      _confirmationMessage = message;
      _pendingDecision = decision;
      _confirmationDialogOpen = true;
    });
  }

  void _handleComplete({bool? uploadedOverride}) {
    // Validate that we have the required information
    if (_statePermitRequirement == null || _localityPermitRequirement == null) {
      debugPrint('Cannot complete: permit requirements not set');
      return;
    }

    // Determine the effective uploaded flags
    final effectiveStateUploaded = _statePermitUploaded;
    final effectiveLocalityUploaded =
        uploadedOverride ?? _localityPermitUploaded;

    // Additional validation: if requirement is 'required_have_it', uploaded must be true
    if (_statePermitRequirement == 'required_have_it' &&
        !effectiveStateUploaded) {
      debugPrint('Cannot complete: state permit is required but not uploaded');
    }
    if (_localityPermitRequirement == 'required_have_it' &&
        !effectiveLocalityUploaded) {
      debugPrint(
        'Cannot complete: locality permit is required but not uploaded',
      );
    }

    // Additional validation: if requirement is 'required_dont_have_it', canWorkWithout must be set
    if (_statePermitRequirement == 'required_dont_have_it' &&
        _canWorkWithoutStatePermit == null) {
      debugPrint(
        'Cannot complete: state permit is required but canWorkWithout is not set',
      );
      return;
    }
    if (_localityPermitRequirement == 'required_dont_have_it' &&
        _canWorkWithoutLocalityPermit == null) {
      debugPrint(
        'Cannot complete: locality permit is required but canWorkWithout is not set',
      );
      return;
    }

    final state = widget.site['state']?.toString() ?? '';
    final locality = widget.site['locality']?.toString() ?? '';

    final decision = PermitDecision(
      statePermit: PermitStatus(
        requirement: _statePermitRequirement,
        canWorkWithout: _canWorkWithoutStatePermit,
        uploaded: effectiveStateUploaded,
        issueDate: _statePermitIssueDate != null
            ? _formatDate(_statePermitIssueDate!)
            : null,
        expiryDate: _statePermitExpiryDate != null
            ? _formatDate(_statePermitExpiryDate!)
            : null,
      ),
      localityPermit: PermitStatus(
        requirement: _localityPermitRequirement,
        canWorkWithout: _canWorkWithoutLocalityPermit,
        uploaded: effectiveLocalityUploaded,
        issueDate: _localityPermitIssueDate != null
            ? _formatDate(_localityPermitIssueDate!)
            : null,
        expiryDate: _localityPermitExpiryDate != null
            ? _formatDate(_localityPermitExpiryDate!)
            : null,
      ),
    );

    // Generate summary message based on decision
    String message = '';
    final stateReq = _statePermitRequirement;
    final localityReq = _localityPermitRequirement;

    if (stateReq == 'not_required' && localityReq == 'not_required') {
      message =
          'No permits are required for $state/$locality. The verification process is complete.';
    } else if (stateReq == 'required_have_it' &&
        effectiveStateUploaded &&
        localityReq == 'not_required') {
      message =
          'State permit uploaded successfully. No locality permit required. The verification process is complete.';
    } else if (stateReq == 'not_required' &&
        localityReq == 'required_have_it' &&
        effectiveLocalityUploaded) {
      message =
          'Locality permit uploaded successfully. No state permit required. The verification process is complete.';
    } else if (stateReq == 'required_have_it' &&
        effectiveStateUploaded &&
        localityReq == 'required_have_it' &&
        effectiveLocalityUploaded) {
      message =
          'Both state and locality permits uploaded successfully. The verification process is complete.';
    } else if (stateReq == 'required_dont_have_it' &&
        _canWorkWithoutStatePermit == 'yes' &&
        localityReq == 'not_required') {
      message =
          'State permit required but proceeding without it. No locality permit required. The verification process is complete.';
    } else if (stateReq == 'not_required' &&
        localityReq == 'required_dont_have_it' &&
        _canWorkWithoutLocalityPermit == 'yes') {
      message =
          'Locality permit required but proceeding without it. No state permit required. The verification process is complete.';
    } else if (stateReq == 'required_dont_have_it' &&
        _canWorkWithoutStatePermit == 'yes' &&
        localityReq == 'required_dont_have_it' &&
        _canWorkWithoutLocalityPermit == 'yes') {
      message =
          'Both permits required but proceeding without them. The verification process is complete.';
    } else if (stateReq == 'required_dont_have_it' &&
        _canWorkWithoutStatePermit == 'no') {
      message =
          'The MMP has been sent back to FOM because a state permit is required for $state and you cannot proceed without it. No further action is needed here.';
    } else if (localityReq == 'required_dont_have_it' &&
        _canWorkWithoutLocalityPermit == 'no') {
      message =
          'The MMP has been sent back to FOM because a locality permit is required for $locality and you cannot proceed without it. No further action is needed here.';
    }

    setState(() {
      _confirmationMessage = message;
      _pendingDecision = decision;
      _confirmationDialogOpen = true;
    });
  }

  void _handleConfirmationOkay() {
    if (_pendingDecision != null) {
      widget.onComplete(_pendingDecision!);
    }
    setState(() {
      _confirmationDialogOpen = false;
      _pendingDecision = null;
    });
    Navigator.pop(context);
  }

  Widget _buildOptionWithDescription(
    String label,
    String description,
    String value,
    String? selectedValue,
    Function(String) onSelect, [
    bool isArabic = false,
  ]) {
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
          textDirection: isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
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
                crossAxisAlignment: isArabic
                    ? CrossAxisAlignment.end
                    : CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: GoogleFonts.poppins(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: isSelected
                          ? AppColors.primaryBlue
                          : Colors.black87,
                    ),
                    textAlign: isArabic ? TextAlign.right : TextAlign.left,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    description,
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                    textAlign: isArabic ? TextAlign.right : TextAlign.left,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

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
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: isSelected
                          ? AppColors.primaryBlue
                          : Colors.black87,
                    ),
                    textDirection: ui.TextDirection.rtl,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    arDescription,
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
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

