part of 'site_verification_screen.dart';

/// Locality Permit Dialog for sites in Locality Permit tab
/// First asks if state permit is already uploaded, then proceeds to locality permit upload
class _LocalityPermitDialog extends StatefulWidget {
  final Map<String, dynamic> site;
  final Function(Map<String, dynamic>) onComplete;
  final VoidCallback onStatePermitMissing;
  final bool startOnUpload; // If true, open the dialog on the upload step
  final bool initialStateConfirmed; // Pre-fill state permit confirmation

  const _LocalityPermitDialog({
    required this.site,
    required this.onComplete,
    required this.onStatePermitMissing,
    this.startOnUpload = false,
    this.initialStateConfirmed = false,
  });

  @override
  State<_LocalityPermitDialog> createState() => _LocalityPermitDialogState();
}

class _LocalityPermitDialogState extends State<_LocalityPermitDialog> {
  int _currentStep = 0;
  bool _statePermitConfirmed = false;
  bool _localityPermitUploaded = false;
  File? _localityPermitImage;
  final ImagePicker _imagePicker = ImagePicker();

  @override
  void initState() {
    super.initState();
    // If dialog was requested to start on upload step, set initial state
    if (widget.initialStateConfirmed) {
      _statePermitConfirmed = true;
    }
    if (widget.startOnUpload) {
      _currentStep = 1;
    }
  }

  // Optional issue/expiry dates for locality permit (coordinator-entered)
  DateTime? _localityPermitIssueDate;
  DateTime? _localityPermitExpiryDate;

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
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 420, maxHeight: 700),
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
                  colors: [Colors.blue, Colors.blue[700]!],
                ),
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(20),
                  topRight: Radius.circular(20),
                ),
              ),
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
                              'Locality Permit',
                              style: GoogleFonts.poppins(
                                fontSize: 20,
                                fontWeight: FontWeight.w600,
                                color: Colors.white,
                              ),
                            ),
                            Text(
                              'تصريح المحلية',
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
                    child: Text(
                      widget.site['site_name']?.toString() ?? 'Site',
                      style: GoogleFonts.poppins(
                        fontSize: 13,
                        color: Colors.white,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
            // Content
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [_buildCurrentStep(), const SizedBox(height: 24)],
                ),
              ),
            ),
            // Action Buttons
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
              child: _buildNavigationButtons(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCurrentStep() {
    switch (_currentStep) {
      case 0:
        return _buildStatePermitConfirmation();
      case 1:
        return _buildLocalityPermitUpload();
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _buildStatePermitConfirmation() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Info box about locality permit requirement
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.blue.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.blue.withValues(alpha: 0.3)),
          ),
          child: Row(
            children: [
              Icon(Icons.info_outline, color: Colors.blue[700], size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'This site only requires a locality permit. Please confirm the state permit status.',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: Colors.blue[700],
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Is the Local Permit required for this locality?',
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'هل تصريح المحلية مطلوب لهذه المحلية؟',
              style: GoogleFonts.poppins(fontSize: 14, color: Colors.grey[700]),
              textDirection: ui.TextDirection.rtl,
            ),
          ],
        ),
        const SizedBox(height: 16),
        _buildConfirmOption(
          'Yes, It is required continue to upload',
          Icons.check_circle,
          Colors.green,
          true,
          _statePermitConfirmed == true,
        ),
        const SizedBox(height: 8),
        _buildConfirmOption(
          'No, Local permit is not required for this locality',
          Icons.error_outline,
          AppColors.primaryBlue,
          false,
          _statePermitConfirmed == false && _currentStep == 0,
        ),
      ],
    );
  }

  Widget _buildConfirmOption(
    String label,
    IconData icon,
    Color color,
    bool value,
    bool isSelected,
  ) {
    return InkWell(
      onTap: () {
        setState(() {
          if (value) {
            _statePermitConfirmed = true;
          } else {
            // State permit not uploaded - redirect to full permit dialog
            widget.onStatePermitMissing();
          }
        });
      },
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(
            color: isSelected ? color : const Color(0xFFE5E7EB),
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Icon(icon, color: isSelected ? color : Colors.grey[400], size: 24),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                  color: isSelected ? color : const Color(0xFF374151),
                ),
              ),
            ),
            if (isSelected)
              Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(shape: BoxShape.circle, color: color),
                child: const Icon(Icons.check, color: Colors.white, size: 14),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildLocalityPermitUpload() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Success indicator for state permit
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.green.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.green.withValues(alpha: 0.3)),
          ),
          child: Row(
            children: [
              const Icon(Icons.check_circle, color: Colors.green, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'State Permit Confirmed',
                      style: GoogleFonts.poppins(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Colors.green[700],
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'تم تأكيد تصريح الدولة',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.green[700],
                      ),
                      textDirection: ui.TextDirection.rtl,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Upload Locality Permit',
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: Colors.grey[800],
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'رفع تصريح المحلية',
              style: GoogleFonts.poppins(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Colors.grey[800],
              ),
              textDirection: ui.TextDirection.rtl,
            ),
          ],
        ),
        const SizedBox(height: 16),
        Text(
          'Permit Details (Required)',
          style: GoogleFonts.poppins(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: Colors.grey[800],
          ),
        ),
        const SizedBox(height: 12),
        // Photo Upload Section
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
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Permit Uploaded',
                          style: GoogleFonts.poppins(
                            color: Colors.green,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        Text(
                          'تم رفع التصريح',
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: Colors.green[700],
                          ),
                          textDirection: ui.TextDirection.rtl,
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: () => _pickLocalityPermitImage(),
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('Replace Image'),
                ),
              ] else ...[
                Icon(Icons.add_a_photo, size: 48, color: Colors.grey[400]),
                const SizedBox(height: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Text(
                      'Tap to upload permit photo',
                      style: GoogleFonts.poppins(color: Colors.grey[600]),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'اضغط لرفع صورة التصريح',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        color: Colors.grey[600],
                      ),
                      textDirection: ui.TextDirection.rtl,
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    ElevatedButton.icon(
                      onPressed: () =>
                          _pickLocalityPermitImage(useCamera: true),
                      icon: const Icon(Icons.camera_alt, size: 16),
                      label: const Text(
                        'Camera',
                        style: TextStyle(fontSize: 12),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.blue,
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
                          _pickLocalityPermitImage(useCamera: false),
                      icon: const Icon(Icons.photo_library, size: 16),
                      label: const Text(
                        'Gallery',
                        style: TextStyle(fontSize: 12),
                      ),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.blue,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                        side: const BorderSide(color: Colors.blue),
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
        const SizedBox(height: 12),
        // Date Pickers
        Row(
          children: [
            Expanded(
              child: GestureDetector(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _localityPermitIssueDate ?? DateTime.now(),
                    firstDate: DateTime(2000),
                    lastDate: DateTime(2100),
                  );
                  if (picked != null) {
                    setState(() => _localityPermitIssueDate = picked);
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
                      color: _localityPermitIssueDate != null
                          ? Colors.green
                          : Colors.grey[300]!,
                      width: _localityPermitIssueDate != null ? 2 : 1,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _localityPermitIssueDate != null
                            ? 'Issue: ${_formatDate(_localityPermitIssueDate!)}'
                            : 'Select issue date',
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          color: _localityPermitIssueDate != null
                              ? Colors.green[700]
                              : Colors.grey[600],
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _localityPermitIssueDate != null
                            ? 'التاريخ: ${_formatDate(_localityPermitIssueDate!)}'
                            : 'حدد تاريخ الإصدار',
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          color: _localityPermitIssueDate != null
                              ? Colors.green[600]
                              : Colors.grey[600],
                        ),
                        textDirection: ui.TextDirection.rtl,
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: GestureDetector(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _localityPermitExpiryDate ?? DateTime.now(),
                    firstDate: DateTime(2000),
                    lastDate: DateTime(2100),
                  );
                  if (picked != null) {
                    setState(() => _localityPermitExpiryDate = picked);
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
                      color: _localityPermitExpiryDate != null
                          ? Colors.green
                          : Colors.grey[300]!,
                      width: _localityPermitExpiryDate != null ? 2 : 1,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        _localityPermitExpiryDate != null
                            ? 'Expiry: ${_formatDate(_localityPermitExpiryDate!)}'
                            : 'Select expiry date',
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          color: _localityPermitExpiryDate != null
                              ? Colors.green[700]
                              : Colors.grey[600],
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _localityPermitExpiryDate != null
                            ? 'الصلاحية: ${_formatDate(_localityPermitExpiryDate!)}'
                            : 'حدد تاريخ الانتهاء',
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          color: _localityPermitExpiryDate != null
                              ? Colors.green[600]
                              : Colors.grey[600],
                        ),
                        textDirection: ui.TextDirection.rtl,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if ((_localityPermitIssueDate != null ||
                _localityPermitExpiryDate != null) &&
            (_localityPermitIssueDate == null ||
                _localityPermitExpiryDate == null ||
                (_localityPermitIssueDate != null &&
                    _localityPermitExpiryDate != null &&
                    _localityPermitExpiryDate!.isBefore(
                      _localityPermitIssueDate!,
                    )))) ...[
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Please ensure both Issue and Expiry dates are set and Expiry is after Issue.',
                style: GoogleFonts.poppins(color: Colors.red, fontSize: 12),
              ),
              const SizedBox(height: 2),
              Text(
                'يرجى التأكد من تعيين تاريخ الإصدار والصلاحية وأن الصلاحية بعد الإصدار.',
                style: GoogleFonts.poppins(color: Colors.red, fontSize: 11),
                textDirection: ui.TextDirection.rtl,
              ),
            ],
          ),
          const SizedBox(height: 8),
        ],
      ],
    );
  }

  Future<void> _pickLocalityPermitImage({bool useCamera = false}) async {
    try {
      final XFile? image = await _imagePicker.pickImage(
        source: useCamera ? ImageSource.camera : ImageSource.gallery,
        imageQuality: 80,
        maxWidth: 1200,
      );

      if (image != null) {
        setState(() {
          _localityPermitImage = File(image.path);
          _localityPermitUploaded = true;
          // Ensure we're on upload step when an image is selected
          _currentStep = 1;
        });

        // Prompt immediately for dates after upload; dates are required for locality permit
        final saved = await _promptForLocalityPermitDates();
        if (saved != true) {
          // User cancelled or did not save dates — revert upload
          setState(() {
            _localityPermitImage = null;
            _localityPermitUploaded = false;
            _currentStep = 0;
            _localityPermitIssueDate = null;
            _localityPermitExpiryDate = null;
          });
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Locality permit upload cancelled: dates are required',
              ),
              backgroundColor: AppColors.primaryBlue,
            ),
          );
          return;
        }

        // Ensure UI updates and canProceed recalculates
        setState(() {});
      }
    } catch (e) {
      debugPrint('Error picking image: $e');
    }
  }

  /// Prompt the coordinator to optionally enter Issue and Expiry dates
  Future<bool> _promptForLocalityPermitDates() async {
    DateTime? tempIssue = _localityPermitIssueDate;
    DateTime? tempExpiry = _localityPermitExpiryDate;

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
                    'Enter Permit Dates',
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    'أدخل تواريخ التصريح',
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
                      _localityPermitIssueDate = tempIssue;
                      _localityPermitExpiryDate = tempExpiry;
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
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Permit dates recorded')));
      return true;
    }

    return false;
  }

  Widget _buildNavigationButtons() {
    final isLastStep = _currentStep == 1;
    final canProceed = _canProceed();

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        if (_currentStep > 0)
          OutlinedButton.icon(
            onPressed: () => setState(() => _currentStep--),
            icon: const Icon(Icons.arrow_back, size: 18),
            label: const Text('Back'),
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.blue,
              side: const BorderSide(color: Colors.blue, width: 1.5),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          )
        else
          OutlinedButton.icon(
            onPressed: () => Navigator.pop(context, 'back'),
            icon: const Icon(Icons.arrow_back, size: 18),
            label: const Text('Back'),
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.grey[600],
              side: BorderSide(color: Colors.grey[300]!, width: 1),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
        if (!isLastStep)
          Container(
            decoration: BoxDecoration(
              gradient: canProceed
                  ? LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Colors.blue, Colors.blue[700]!],
                    )
                  : null,
              borderRadius: BorderRadius.circular(12),
            ),
            child: ElevatedButton.icon(
              onPressed: canProceed ? () => _goToNextStep() : null,
              icon: const Icon(Icons.arrow_forward, size: 18),
              label: const Text('Next'),
              style: ElevatedButton.styleFrom(
                backgroundColor: canProceed ? Colors.transparent : null,
                disabledBackgroundColor: const Color(0xFFE5E7EB),
                foregroundColor: Colors.white,
                shadowColor: Colors.transparent,
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 12,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          )
        else
          Container(
            decoration: BoxDecoration(
              gradient: canProceed
                  ? const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFF10B981), Color(0xFF059669)],
                    )
                  : null,
              borderRadius: BorderRadius.circular(12),
            ),
            child: ElevatedButton.icon(
              onPressed: canProceed ? _complete : null,
              icon: const Icon(Icons.check_circle, size: 18),
              label: const Text('Complete'),
              style: ElevatedButton.styleFrom(
                backgroundColor: canProceed ? Colors.transparent : null,
                disabledBackgroundColor: const Color(0xFFE5E7EB),
                foregroundColor: Colors.white,
                shadowColor: Colors.transparent,
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 12,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
      ],
    );
  }

  bool _canProceed() {
    switch (_currentStep) {
      case 0:
        return _statePermitConfirmed;
      case 1:
        // Step 1 requires: photo upload AND both dates set with expiry after issue
        if (_localityPermitImage == null) {
          return false; // Photo is required
        }
        if (_localityPermitIssueDate == null ||
            _localityPermitExpiryDate == null) {
          return false; // Both dates are required
        }
        if (_localityPermitExpiryDate!.isBefore(_localityPermitIssueDate!)) {
          return false; // Expiry must be after issue date
        }
        return true;
      default:
        return false;
    }
  }

  void _goToNextStep() {
    setState(() => _currentStep++);
  }

  void _complete() async {
    // Requirements already enforced by _canProceed():
    // 1. Photo must be uploaded (_localityPermitImage != null)
    // 2. Both dates must be set
    // 3. Expiry date must be after issue date

    // All requirements met - complete with locality permit data
    widget.onComplete({
      'state_permit_confirmed': true,
      'locality_permit_uploaded': true,
      'locality_permit_image': _localityPermitImage,
      'locality_permit_issue_date': _formatDate(_localityPermitIssueDate!),
      'locality_permit_expiry_date': _formatDate(_localityPermitExpiryDate!),
    });
  }
}

