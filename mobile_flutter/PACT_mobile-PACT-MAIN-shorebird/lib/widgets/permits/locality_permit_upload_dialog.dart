// lib/widgets/permits/locality_permit_upload_dialog.dart

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'package:intl/intl.dart';
import '../../theme/app_colors.dart';
import '../../services/permit_upload_service.dart';
import '../../l10n/app_localizations.dart';

class LocalityPermitUploadDialog extends StatefulWidget {
  final String state;
  final String locality;
  final String mmpFileId;
  final List<String> siteIds;
  final VoidCallback onPermitUploaded;
  final VoidCallback? onCancel;

  const LocalityPermitUploadDialog({
    super.key,
    required this.state,
    required this.locality,
    required this.mmpFileId,
    required this.siteIds,
    required this.onPermitUploaded,
    this.onCancel,
  });

  @override
  State<LocalityPermitUploadDialog> createState() => _LocalityPermitUploadDialogState();
}

class _LocalityPermitUploadDialogState extends State<LocalityPermitUploadDialog> {
  final PermitUploadService _uploadService = PermitUploadService();
  final TextEditingController _commentsController = TextEditingController();
  final ImagePicker _imagePicker = ImagePicker();

  File? _selectedFile;
  String? _fileName;
  bool _uploading = false;
  bool _showPreview = false;
  DateTime? _issueDate;
  DateTime? _expiryDate;
  int _currentStep = 0;

  @override
  void dispose() {
    _commentsController.dispose();
    super.dispose();
  }

  Future<void> _selectFile() async {
    showModalBottomSheet(
      context: context,
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: Text(AppLocalizations.of(context)?.translate('gallery') ?? 'Gallery'),
              onTap: () async {
                Navigator.pop(context);
                final XFile? image = await _imagePicker.pickImage(
                  source: ImageSource.gallery,
                  imageQuality: 85,
                );
                if (image != null) {
                  setState(() {
                    _selectedFile = File(image.path);
                    _fileName = image.name;
                    _currentStep = 1;
                  });
                }
              },
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: Text(AppLocalizations.of(context)?.translate('camera') ?? 'Camera'),
              onTap: () async {
                Navigator.pop(context);
                final XFile? image = await _imagePicker.pickImage(
                  source: ImageSource.camera,
                  imageQuality: 85,
                );
                if (image != null) {
                  setState(() {
                    _selectedFile = File(image.path);
                    _fileName = image.name;
                    _currentStep = 1;
                  });
                }
              },
            ),
            ListTile(
              leading: const Icon(Icons.picture_as_pdf),
              title: Text(AppLocalizations.of(context)?.translate('pdfDocument') ?? 'PDF Document'),
              onTap: () async {
                Navigator.pop(context);
                final result = await FilePicker.platform.pickFiles(
                  type: FileType.custom,
                  allowedExtensions: ['pdf'],
                );
                if (result != null && result.files.single.path != null) {
                  setState(() {
                    _selectedFile = File(result.files.single.path!);
                    _fileName = result.files.single.name;
                    _currentStep = 1;
                  });
                }
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _selectDate(bool isIssueDate) async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: isIssueDate
          ? (_issueDate ?? DateTime.now())
          : (_expiryDate ?? DateTime.now().add(const Duration(days: 365))),
      firstDate: isIssueDate ? DateTime(2020) : (_issueDate ?? DateTime(2020)),
      lastDate: DateTime(2030),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: ColorScheme.light(
              primary: AppColors.primaryBlue,
              onPrimary: Colors.white,
              surface: Colors.white,
              onSurface: Colors.black,
            ),
          ),
          child: child!,
        );
      },
    );
    if (picked != null) {
      setState(() {
        if (isIssueDate) {
          _issueDate = picked;
          if (_expiryDate != null && _expiryDate!.isBefore(picked)) {
            _expiryDate = null;
          }
        } else {
          _expiryDate = picked;
        }
        if (_issueDate != null && _expiryDate != null && _currentStep < 2) {
          _currentStep = 2;
        }
      });
    }
  }

  void _clearFile() {
    setState(() {
      _selectedFile = null;
      _fileName = null;
      _showPreview = false;
      _currentStep = 0;
    });
  }

  Future<void> _uploadPermit() async {
    if (_selectedFile == null) {
      _showError(AppLocalizations.of(context)?.translate('selectFile') ?? 'Please select a file');
      return;
    }
    if (_issueDate == null || _expiryDate == null) {
      _showError(AppLocalizations.of(context)?.translate('datesRequired') ?? 'Please select issue and expiry dates');
      return;
    }
    if (_expiryDate!.isBefore(_issueDate!) || _expiryDate!.isAtSameMomentAs(_issueDate!)) {
      _showError(AppLocalizations.of(context)?.translate('expiryAfterIssue') ?? 'Expiry date must be after issue date');
      return;
    }

    setState(() => _uploading = true);

    try {
      final result = await _uploadService.uploadLocalityPermit(
        file: _selectedFile!,
        mmpFileId: widget.mmpFileId,
        state: widget.state,
        locality: widget.locality,
      );

      if (!result.success) {
        _showError(result.error ?? 'Upload failed');
        return;
      }

      final permitData = {
        'state': widget.state,
        'locality': widget.locality,
        'fileName': _fileName,
        'fileUrl': result.fileUrl,
        'uploadedAt': DateTime.now().toIso8601String(),
        'uploadedBy': 'coordinator',
        'verified': false,
        'issueDate': DateFormat('yyyy-MM-dd').format(_issueDate!),
        'expiryDate': DateFormat('yyyy-MM-dd').format(_expiryDate!),
        'comments': _commentsController.text.isNotEmpty ? _commentsController.text : null,
      };

      await _uploadService.updateMmpFilePermits(
        mmpFileId: widget.mmpFileId,
        permitData: permitData,
        permitType: 'locality',
      );

      await _uploadService.updateSiteEntriesAfterLocalityPermit(
        mmpFileId: widget.mmpFileId,
        state: widget.state,
        locality: widget.locality,
        siteIds: widget.siteIds,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              AppLocalizations.of(context)?.translate('permitUploadSuccess') ??
                  'Locality permit uploaded successfully for ${widget.locality}',
            ),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.of(context).pop();
        widget.onPermitUploaded();
      }
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted) {
        setState(() => _uploading = false);
      }
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 500, maxHeight: 700),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildHeader(l10n),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _buildInfoBanner(l10n),
                    const SizedBox(height: 20),
                    _buildStepIndicator(l10n),
                    const SizedBox(height: 20),
                    _buildStep1FileSelection(l10n),
                    const SizedBox(height: 16),
                    _buildStep2DateSelection(l10n),
                    const SizedBox(height: 16),
                    _buildStep3Comments(l10n),
                    const SizedBox(height: 24),
                    _buildUploadButton(l10n),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(AppLocalizations? l10n) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.primaryBlue.withOpacity(0.1),
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(16),
          topRight: Radius.circular(16),
        ),
      ),
      child: Row(
        children: [
          Icon(Icons.location_on, color: AppColors.primaryBlue, size: 28),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n?.translate('localityPermitRequired') ?? 'Locality Permit Required',
                  style: GoogleFonts.poppins(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: AppColors.primaryBlue,
                  ),
                ),
                Text(
                  widget.locality,
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    color: Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close),
            onPressed: () {
              Navigator.of(context).pop();
              widget.onCancel?.call();
            },
          ),
        ],
      ),
    );
  }

  Widget _buildInfoBanner(AppLocalizations? l10n) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.primaryBlue.withOpacity(0.05),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.primaryBlue.withOpacity(0.2)),
      ),
      child: Row(
        children: [
          Icon(Icons.info_outline, color: AppColors.primaryBlue, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              l10n?.localityPermitDescription(widget.locality) ??
                  'Please upload the locality permit for ${widget.locality} to continue.',
              style: GoogleFonts.poppins(fontSize: 13, color: Colors.grey.shade800),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStepIndicator(AppLocalizations? l10n) {
    return Row(
      children: [
        _buildStepDot(0, l10n?.translate('step1SelectFile') ?? 'File'),
        Expanded(child: Container(height: 2, color: _currentStep >= 1 ? AppColors.primaryBlue : Colors.grey.shade300)),
        _buildStepDot(1, l10n?.translate('step2EnterDates') ?? 'Dates'),
        Expanded(child: Container(height: 2, color: _currentStep >= 2 ? AppColors.primaryBlue : Colors.grey.shade300)),
        _buildStepDot(2, l10n?.translate('step3AddComments') ?? 'Comments'),
        Expanded(child: Container(height: 2, color: _currentStep >= 3 ? AppColors.primaryBlue : Colors.grey.shade300)),
        _buildStepDot(3, l10n?.translate('step4Upload') ?? 'Upload'),
      ],
    );
  }

  Widget _buildStepDot(int step, String label) {
    final isActive = _currentStep >= step;
    return Column(
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isActive ? AppColors.primaryBlue : Colors.grey.shade300,
          ),
          child: Center(
            child: Text(
              '${step + 1}',
              style: GoogleFonts.poppins(
                color: isActive ? Colors.white : Colors.grey.shade600,
                fontWeight: FontWeight.w600,
                fontSize: 12,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildStep1FileSelection(AppLocalizations? l10n) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n?.translate('step1SelectFile') ?? 'Step 1: Select File',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w600, fontSize: 14),
          ),
          const SizedBox(height: 12),
          if (_selectedFile == null)
            InkWell(
              onTap: _selectFile,
              borderRadius: BorderRadius.circular(8),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 32),
                decoration: BoxDecoration(
                  border: Border.all(color: AppColors.primaryBlue, style: BorderStyle.solid),
                  borderRadius: BorderRadius.circular(8),
                  color: AppColors.primaryBlue.withOpacity(0.05),
                ),
                child: Column(
                  children: [
                    Icon(Icons.cloud_upload_outlined, size: 48, color: AppColors.primaryBlue),
                    const SizedBox(height: 8),
                    Text(
                      l10n?.translate('tapToSelectFile') ?? 'Tap to select file',
                      style: GoogleFonts.poppins(color: AppColors.primaryBlue, fontWeight: FontWeight.w500),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      l10n?.translate('supportedFormats') ?? 'Supported formats: PDF, JPG, PNG',
                      style: GoogleFonts.poppins(fontSize: 12, color: Colors.grey),
                    ),
                    Text(
                      l10n?.maxFileSize(10) ?? 'Maximum file size: 10 MB',
                      style: GoogleFonts.poppins(fontSize: 12, color: Colors.grey),
                    ),
                  ],
                ),
              ),
            )
          else
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.green.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.green.shade200),
              ),
              child: Row(
                children: [
                  Icon(Icons.check_circle, color: Colors.green.shade600),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _fileName ?? 'File selected',
                          style: GoogleFonts.poppins(fontWeight: FontWeight.w500),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (_showPreview && _selectedFile != null && !_fileName!.toLowerCase().endsWith('.pdf'))
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.file(
                                _selectedFile!,
                                height: 150,
                                fit: BoxFit.cover,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: Icon(_showPreview ? Icons.visibility_off : Icons.visibility),
                    onPressed: () => setState(() => _showPreview = !_showPreview),
                    tooltip: _showPreview
                        ? (l10n?.translate('hidePreview') ?? 'Hide Preview')
                        : (l10n?.translate('showPreview') ?? 'Show Preview'),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.red),
                    onPressed: _clearFile,
                    tooltip: l10n?.translate('clearFile') ?? 'Clear',
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildStep2DateSelection(AppLocalizations? l10n) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n?.translate('step2EnterDates') ?? 'Step 2: Enter Dates',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w600, fontSize: 14),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _buildDateField(
                  label: l10n?.translate('issueDate') ?? 'Issue Date',
                  date: _issueDate,
                  onTap: () => _selectDate(true),
                  icon: Icons.calendar_today,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildDateField(
                  label: l10n?.translate('expiryDate') ?? 'Expiry Date',
                  date: _expiryDate,
                  onTap: () => _selectDate(false),
                  icon: Icons.event,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildDateField({
    required String label,
    required DateTime? date,
    required VoidCallback onTap,
    required IconData icon,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        decoration: BoxDecoration(
          border: Border.all(color: date != null ? AppColors.primaryBlue : Colors.grey.shade300),
          borderRadius: BorderRadius.circular(8),
          color: date != null ? AppColors.primaryBlue.withOpacity(0.05) : null,
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: date != null ? AppColors.primaryBlue : Colors.grey),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: GoogleFonts.poppins(fontSize: 11, color: Colors.grey.shade600),
                  ),
                  Text(
                    date != null ? DateFormat('MMM dd, yyyy').format(date) : 'Select date',
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w500,
                      color: date != null ? Colors.black : Colors.grey,
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

  Widget _buildStep3Comments(AppLocalizations? l10n) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n?.translate('step3AddComments') ?? 'Step 3: Add Comments (Optional)',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w600, fontSize: 14),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _commentsController,
            maxLines: 3,
            decoration: InputDecoration(
              hintText: l10n?.translate('addCommentsOptional') ?? 'Add comments (optional)',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
              contentPadding: const EdgeInsets.all(12),
            ),
            onChanged: (_) {
              if (_issueDate != null && _expiryDate != null && _currentStep < 3) {
                setState(() => _currentStep = 3);
              }
            },
          ),
        ],
      ),
    );
  }

  Widget _buildUploadButton(AppLocalizations? l10n) {
    final canUpload = _selectedFile != null && _issueDate != null && _expiryDate != null;

    return Row(
      children: [
        Expanded(
          child: OutlinedButton(
            onPressed: _uploading
                ? null
                : () {
                    Navigator.of(context).pop();
                    widget.onCancel?.call();
                  },
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: Text(l10n?.translate('cancel') ?? 'Cancel'),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          flex: 2,
          child: ElevatedButton.icon(
            onPressed: _uploading || !canUpload ? null : _uploadPermit,
            icon: _uploading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.cloud_upload),
            label: Text(
              _uploading
                  ? (l10n?.translate('uploading') ?? 'Uploading...')
                  : (l10n?.translate('uploadPermit') ?? 'Upload Permit'),
            ),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryBlue,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
          ),
        ),
      ],
    );
  }
}
