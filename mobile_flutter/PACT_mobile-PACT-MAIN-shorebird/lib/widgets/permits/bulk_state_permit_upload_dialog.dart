import 'dart:io';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'package:intl/intl.dart';
import '../../theme/app_colors.dart';
import '../../services/permit_upload_service.dart';
import '../../l10n/app_localizations.dart';

class BulkStatePermitItem {
  final String state;
  File? file;
  String? fileName;
  DateTime? issueDate;
  DateTime? expiryDate;
  String? comments;
  UploadStatus status;
  String? errorMessage;

  BulkStatePermitItem({
    required this.state,
    this.file,
    this.fileName,
    this.issueDate,
    this.expiryDate,
    this.comments,
    this.status = UploadStatus.pending,
    this.errorMessage,
  });

  bool get isReady =>
      file != null && issueDate != null && expiryDate != null;
}

enum UploadStatus { pending, uploading, success, error }

class BulkStatePermitUploadDialog extends StatefulWidget {
  final List<String> states;
  final String mmpFileId;
  final VoidCallback onPermitsUploaded;
  final VoidCallback? onCancel;
  final String userType;

  const BulkStatePermitUploadDialog({
    super.key,
    required this.states,
    required this.mmpFileId,
    required this.onPermitsUploaded,
    this.onCancel,
    this.userType = 'coordinator',
  });

  @override
  State<BulkStatePermitUploadDialog> createState() =>
      _BulkStatePermitUploadDialogState();
}

class _BulkStatePermitUploadDialogState
    extends State<BulkStatePermitUploadDialog> {
  final PermitUploadService _uploadService = PermitUploadService();
  final ImagePicker _imagePicker = ImagePicker();

  late List<BulkStatePermitItem> _permitItems;
  bool _isUploading = false;
  int _currentUploadIndex = -1;
  int _successCount = 0;
  int _errorCount = 0;

  @override
  void initState() {
    super.initState();
    _permitItems = widget.states
        .map((state) => BulkStatePermitItem(state: state))
        .toList();
  }

  Future<void> _selectFileForItem(int index) async {
    showModalBottomSheet(
      context: context,
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: Text(AppLocalizations.of(context)?.translate('gallery') ??
                  'Gallery'),
              onTap: () async {
                Navigator.pop(context);
                final XFile? image = await _imagePicker.pickImage(
                  source: ImageSource.gallery,
                  imageQuality: 85,
                );
                if (image != null) {
                  setState(() {
                    _permitItems[index].file = File(image.path);
                    _permitItems[index].fileName = image.name;
                  });
                }
              },
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: Text(
                  AppLocalizations.of(context)?.translate('camera') ?? 'Camera'),
              onTap: () async {
                Navigator.pop(context);
                final XFile? image = await _imagePicker.pickImage(
                  source: ImageSource.camera,
                  imageQuality: 85,
                );
                if (image != null) {
                  setState(() {
                    _permitItems[index].file = File(image.path);
                    _permitItems[index].fileName = image.name;
                  });
                }
              },
            ),
            ListTile(
              leading: const Icon(Icons.picture_as_pdf),
              title: Text(
                  AppLocalizations.of(context)?.translate('pdfDocument') ??
                      'PDF Document'),
              onTap: () async {
                Navigator.pop(context);
                final result = await FilePicker.platform.pickFiles(
                  type: FileType.custom,
                  allowedExtensions: ['pdf'],
                );
                if (result != null && result.files.single.path != null) {
                  setState(() {
                    _permitItems[index].file = File(result.files.single.path!);
                    _permitItems[index].fileName = result.files.single.name;
                  });
                }
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _selectDateForItem(int index, bool isIssueDate) async {
    final item = _permitItems[index];
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: isIssueDate
          ? (item.issueDate ?? DateTime.now())
          : (item.expiryDate ?? DateTime.now().add(const Duration(days: 365))),
      firstDate: isIssueDate ? DateTime(2020) : (item.issueDate ?? DateTime(2020)),
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
          _permitItems[index].issueDate = picked;
          if (item.expiryDate != null && item.expiryDate!.isBefore(picked)) {
            _permitItems[index].expiryDate = null;
          }
        } else {
          _permitItems[index].expiryDate = picked;
        }
      });
    }
  }

  void _clearFileForItem(int index) {
    setState(() {
      _permitItems[index].file = null;
      _permitItems[index].fileName = null;
    });
  }

  bool get _canUpload {
    return _permitItems.any((item) => item.isReady) && !_isUploading;
  }

  int get _readyCount {
    return _permitItems.where((item) => item.isReady).length;
  }

  Future<void> _uploadAllPermits() async {
    final readyItems =
        _permitItems.where((item) => item.isReady).toList();
    if (readyItems.isEmpty) {
      _showError(AppLocalizations.of(context)?.translate('noPermitsReady') ??
          'No permits ready for upload');
      return;
    }

    setState(() {
      _isUploading = true;
      _successCount = 0;
      _errorCount = 0;
    });

    for (int i = 0; i < _permitItems.length; i++) {
      final item = _permitItems[i];
      if (!item.isReady) continue;

      setState(() {
        _currentUploadIndex = i;
        _permitItems[i].status = UploadStatus.uploading;
      });

      try {
        if (item.expiryDate!.isBefore(item.issueDate!) ||
            item.expiryDate!.isAtSameMomentAs(item.issueDate!)) {
          throw Exception('Expiry date must be after issue date');
        }

        final result = await _uploadService.uploadStatePermit(
          file: item.file!,
          mmpFileId: widget.mmpFileId,
          state: item.state,
        );

        if (!result.success) {
          throw Exception(result.error ?? 'Upload failed');
        }

        final permitData = {
          'state': item.state,
          'fileName': item.fileName,
          'fileUrl': result.fileUrl,
          'uploadedAt': DateTime.now().toIso8601String(),
          'uploadedBy': widget.userType,
          'verified': widget.userType == 'fom',
          'issueDate': DateFormat('yyyy-MM-dd').format(item.issueDate!),
          'expiryDate': DateFormat('yyyy-MM-dd').format(item.expiryDate!),
          'comments': item.comments,
        };

        await _uploadService.updateMmpFilePermits(
          mmpFileId: widget.mmpFileId,
          permitData: permitData,
          permitType: 'state',
        );

        await _uploadService.updateSiteEntriesAfterStatePermit(
          mmpFileId: widget.mmpFileId,
          state: item.state,
        );

        setState(() {
          _permitItems[i].status = UploadStatus.success;
          _successCount++;
        });
      } catch (e) {
        setState(() {
          _permitItems[i].status = UploadStatus.error;
          _permitItems[i].errorMessage = e.toString();
          _errorCount++;
        });
      }
    }

    setState(() {
      _isUploading = false;
      _currentUploadIndex = -1;
    });

    if (_successCount > 0 && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '$_successCount state permit(s) uploaded successfully${_errorCount > 0 ? ', $_errorCount failed' : ''}',
          ),
          backgroundColor: _errorCount > 0 ? Colors.orange : Colors.green,
        ),
      );

      if (_errorCount == 0) {
        Navigator.of(context).pop();
        widget.onPermitsUploaded();
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
        constraints: const BoxConstraints(maxWidth: 600, maxHeight: 700),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildHeader(l10n),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    _buildInfoBanner(l10n),
                    const SizedBox(height: 16),
                    _buildProgressSummary(l10n),
                    const SizedBox(height: 16),
                    ..._permitItems.asMap().entries.map((entry) {
                      return _buildPermitItemCard(entry.key, entry.value, l10n);
                    }),
                  ],
                ),
              ),
            ),
            _buildFooter(l10n),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(AppLocalizations? l10n) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.amber.shade50,
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(16),
          topRight: Radius.circular(16),
        ),
      ),
      child: Row(
        children: [
          Icon(Icons.upload_file, color: Colors.amber.shade700, size: 28),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n?.translate('bulkStatePermitUpload') ??
                      'Bulk State Permit Upload',
                  style: GoogleFonts.poppins(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: Colors.amber.shade900,
                  ),
                ),
                Text(
                  '${widget.states.length} ${l10n?.translate('statesSelected') ?? 'states selected'}',
                  style: GoogleFonts.poppins(
                    fontSize: 13,
                    color: Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close),
            onPressed: _isUploading
                ? null
                : () {
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
        color: Colors.blue.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.blue.shade100),
      ),
      child: Row(
        children: [
          Icon(Icons.info_outline, color: Colors.blue.shade700, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              l10n?.translate('bulkUploadInstructions') ??
                  'Select files and dates for each state. Only states with complete information will be uploaded.',
              style: GoogleFonts.poppins(fontSize: 12, color: Colors.blue.shade900),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProgressSummary(AppLocalizations? l10n) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildStatItem(
            '${_readyCount}',
            l10n?.translate('ready') ?? 'Ready',
            Colors.green,
          ),
          _buildStatItem(
            '$_successCount',
            l10n?.translate('uploaded') ?? 'Uploaded',
            Colors.blue,
          ),
          _buildStatItem(
            '$_errorCount',
            l10n?.translate('failed') ?? 'Failed',
            Colors.red,
          ),
        ],
      ),
    );
  }

  Widget _buildStatItem(String value, String label, Color color) {
    return Column(
      children: [
        Text(
          value,
          style: GoogleFonts.poppins(
            fontSize: 20,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        Text(
          label,
          style: GoogleFonts.poppins(fontSize: 12, color: Colors.grey.shade600),
        ),
      ],
    );
  }

  Widget _buildPermitItemCard(
      int index, BulkStatePermitItem item, AppLocalizations? l10n) {
    final isCurrentlyUploading =
        _isUploading && _currentUploadIndex == index;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: item.status == UploadStatus.success
              ? Colors.green
              : item.status == UploadStatus.error
                  ? Colors.red
                  : item.isReady
                      ? Colors.green.shade200
                      : Colors.grey.shade300,
          width: item.status == UploadStatus.success ||
                  item.status == UploadStatus.error
              ? 2
              : 1,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _buildStatusIcon(item.status, isCurrentlyUploading),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    item.state,
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w600,
                      fontSize: 16,
                    ),
                  ),
                ),
                if (item.isReady && item.status == UploadStatus.pending)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.green.shade100,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      l10n?.translate('ready') ?? 'Ready',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        color: Colors.green.shade700,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
              ],
            ),
            if (item.status == UploadStatus.error && item.errorMessage != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  item.errorMessage!,
                  style: GoogleFonts.poppins(fontSize: 12, color: Colors.red),
                ),
              ),
            if (item.status != UploadStatus.success) ...[
              const SizedBox(height: 12),
              if (item.file == null)
                InkWell(
                  onTap: _isUploading ? null : () => _selectFileForItem(index),
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    decoration: BoxDecoration(
                      border: Border.all(
                          color: AppColors.primaryBlue, style: BorderStyle.solid),
                      borderRadius: BorderRadius.circular(8),
                      color: AppColors.primaryBlue.withOpacity(0.05),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.add, color: AppColors.primaryBlue),
                        const SizedBox(width: 8),
                        Text(
                          l10n?.translate('selectFile') ?? 'Select File',
                          style: GoogleFonts.poppins(
                            color: AppColors.primaryBlue,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                )
              else
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.green.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.green.shade200),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.check_circle, color: Colors.green.shade600, size: 20),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          item.fileName ?? 'File selected',
                          style: GoogleFonts.poppins(fontSize: 13),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close, color: Colors.red, size: 20),
                        onPressed:
                            _isUploading ? null : () => _clearFileForItem(index),
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _buildCompactDateField(
                      label: l10n?.translate('issueDate') ?? 'Issue Date',
                      date: item.issueDate,
                      onTap: _isUploading
                          ? null
                          : () => _selectDateForItem(index, true),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _buildCompactDateField(
                      label: l10n?.translate('expiryDate') ?? 'Expiry Date',
                      date: item.expiryDate,
                      onTap: _isUploading
                          ? null
                          : () => _selectDateForItem(index, false),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildStatusIcon(UploadStatus status, bool isCurrentlyUploading) {
    if (isCurrentlyUploading) {
      return const SizedBox(
        width: 24,
        height: 24,
        child: CircularProgressIndicator(strokeWidth: 2),
      );
    }

    switch (status) {
      case UploadStatus.success:
        return const Icon(Icons.check_circle, color: Colors.green, size: 24);
      case UploadStatus.error:
        return const Icon(Icons.error, color: Colors.red, size: 24);
      case UploadStatus.uploading:
        return const SizedBox(
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2),
        );
      default:
        return Icon(Icons.cloud_upload_outlined,
            color: Colors.grey.shade400, size: 24);
    }
  }

  Widget _buildCompactDateField({
    required String label,
    required DateTime? date,
    required VoidCallback? onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        decoration: BoxDecoration(
          border: Border.all(
              color: date != null ? AppColors.primaryBlue : Colors.grey.shade300),
          borderRadius: BorderRadius.circular(8),
          color: date != null ? AppColors.primaryBlue.withOpacity(0.05) : null,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: GoogleFonts.poppins(fontSize: 10, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 2),
            Text(
              date != null ? DateFormat('MMM dd, yyyy').format(date) : 'Select',
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: date != null ? Colors.black : Colors.grey,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFooter(AppLocalizations? l10n) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        borderRadius: const BorderRadius.only(
          bottomLeft: Radius.circular(16),
          bottomRight: Radius.circular(16),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: OutlinedButton(
              onPressed: _isUploading
                  ? null
                  : () {
                      Navigator.of(context).pop();
                      widget.onCancel?.call();
                    },
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8)),
              ),
              child: Text(l10n?.translate('cancel') ?? 'Cancel'),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 2,
            child: ElevatedButton.icon(
              onPressed: _canUpload ? _uploadAllPermits : null,
              icon: _isUploading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.cloud_upload),
              label: Text(
                _isUploading
                    ? '${l10n?.translate('uploading') ?? 'Uploading'}... (${_successCount + _errorCount}/${_readyCount})'
                    : '${l10n?.translate('uploadAll') ?? 'Upload All'} ($_readyCount)',
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryBlue,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
