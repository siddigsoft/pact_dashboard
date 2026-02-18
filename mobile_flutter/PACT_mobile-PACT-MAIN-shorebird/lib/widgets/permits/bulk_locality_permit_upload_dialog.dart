import 'dart:io';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'package:intl/intl.dart';
import '../../theme/app_colors.dart';
import '../../services/permit_upload_service.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:pact_mobile/l10n/app_localizations_extension.dart';
import 'permit_types.dart';

class BulkLocalityPermitItem {
  final String state;
  final String locality;
  File? file;
  String? fileName;
  DateTime? issueDate;
  DateTime? expiryDate;
  String? comments;
  PermitUploadStatus status;
  String? errorMessage;

  BulkLocalityPermitItem({
    required this.state,
    required this.locality,
    this.file,
    this.fileName,
    this.issueDate,
    this.expiryDate,
    this.comments,
    this.status = PermitUploadStatus.pending,
    this.errorMessage,
  });

  bool get isReady => file != null && issueDate != null && expiryDate != null;
}

class BulkLocalityPermitUploadDialog extends StatefulWidget {
  final List<Map<String, String>> localities;
  final String mmpFileId;
  final VoidCallback onPermitsUploaded;
  final VoidCallback? onCancel;
  final String userType;

  const BulkLocalityPermitUploadDialog({
    super.key,
    required this.localities,
    required this.mmpFileId,
    required this.onPermitsUploaded,
    this.onCancel,
    this.userType = 'coordinator',
  });

  @override
  State<BulkLocalityPermitUploadDialog> createState() =>
      _BulkLocalityPermitUploadDialogState();
}

class _BulkLocalityPermitUploadDialogState
    extends State<BulkLocalityPermitUploadDialog> {
  final PermitUploadService _uploadService = PermitUploadService();
  final ImagePicker _imagePicker = ImagePicker();

  late List<BulkLocalityPermitItem> _permitItems;
  bool _isUploading = false;
  int _currentUploadIndex = -1;
  int _successCount = 0;
  int _errorCount = 0;

  @override
  void initState() {
    super.initState();
    _permitItems = widget.localities
        .map(
          (loc) => BulkLocalityPermitItem(
            state: loc['state'] ?? '',
            locality: loc['locality'] ?? '',
          ),
        )
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
              title: Text(
                AppLocalizations.of(context)?.translate('gallery') ?? 'Gallery',
              ),
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
                AppLocalizations.of(context)?.translate('camera') ?? 'Camera',
              ),
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
              leading: const Icon(Icons.picture_as_pdf, color: Colors.red),
              title: Text(
                AppLocalizations.of(context)?.translate('selectPdfOrImage') ??
                    'Select PDF',
              ),
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

  Future<void> _selectDate(int index, bool isIssueDate) async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime(2030),
    );
    if (picked != null) {
      setState(() {
        if (isIssueDate) {
          _permitItems[index].issueDate = picked;
        } else {
          _permitItems[index].expiryDate = picked;
        }
      });
    }
  }

  Future<void> _uploadAllPermits() async {
    final readyItems = _permitItems.where((item) => item.isReady).toList();
    if (readyItems.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            AppLocalizations.of(context)?.translate('no_permits_ready') ??
                'No permits ready for upload',
          ),
          backgroundColor: Colors.orange,
        ),
      );
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
        _permitItems[i].status = PermitUploadStatus.uploading;
      });

      try {
        await _uploadService.uploadLocalityPermit(
          mmpFileId: widget.mmpFileId,
          state: item.state,
          locality: item.locality,
          file: item.file!,
        );

        setState(() {
          _permitItems[i].status = PermitUploadStatus.success;
          _successCount++;
        });
      } catch (e) {
        setState(() {
          _permitItems[i].status = PermitUploadStatus.error;
          _permitItems[i].errorMessage = e.toString();
          _errorCount++;
        });
      }
    }

    setState(() {
      _isUploading = false;
      _currentUploadIndex = -1;
    });

    if (_successCount > 0) {
      widget.onPermitsUploaded();
    }

    _showResultDialog();
  }

  void _showResultDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          AppLocalizations.of(context)?.translate('upload_complete') ??
              'Upload Complete',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.check_circle, color: Colors.green),
                const SizedBox(width: 8),
                Text(
                  '${AppLocalizations.of(context)?.translate('successful') ?? 'Successful'}: $_successCount',
                  style: GoogleFonts.poppins(),
                ),
              ],
            ),
            if (_errorCount > 0) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.error, color: Colors.red),
                  const SizedBox(width: 8),
                  Text(
                    '${AppLocalizations.of(context)?.translate('failed') ?? 'Failed'}: $_errorCount',
                    style: GoogleFonts.poppins(),
                  ),
                ],
              ),
            ],
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              if (_successCount > 0 && _errorCount == 0) {
                Navigator.pop(context);
              }
            },
            child: Text(AppLocalizations.of(context)?.translate('ok') ?? 'OK'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final readyCount = _permitItems.where((item) => item.isReady).length;

    return Dialog(
      insetPadding: const EdgeInsets.all(16),
      child: Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.85,
          maxWidth: 600,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.primaryGreen,
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(12),
                ),
              ),
              child: Row(
                children: [
                  const Icon(Icons.upload_file, color: Colors.white),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      isArabic
                          ? 'رفع تصاريح المحليات بالجملة'
                          : 'Bulk Locality Permit Upload',
                      style: GoogleFonts.poppins(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: _isUploading
                        ? null
                        : () => Navigator.pop(context),
                    icon: const Icon(Icons.close, color: Colors.white),
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: Colors.grey[100],
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    isArabic
                        ? '${_permitItems.length} محلية'
                        : '${_permitItems.length} localities',
                    style: GoogleFonts.poppins(
                      fontSize: 14,
                      color: Colors.grey[600],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: readyCount > 0
                          ? Colors.green[50]
                          : Colors.grey[200],
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Text(
                      isArabic
                          ? '$readyCount جاهز للرفع'
                          : '$readyCount ready to upload',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        color: readyCount > 0
                            ? Colors.green[700]
                            : Colors.grey[600],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Flexible(
              child: ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: _permitItems.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (context, index) {
                  final item = _permitItems[index];
                  return _buildPermitItemCard(item, index, isArabic);
                },
              ),
            ),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.1),
                    blurRadius: 4,
                    offset: const Offset(0, -2),
                  ),
                ],
              ),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _isUploading
                          ? null
                          : () {
                              widget.onCancel?.call();
                              Navigator.pop(context);
                            },
                      child: Text(isArabic ? 'إلغاء' : 'Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: _isUploading || readyCount == 0
                          ? null
                          : _uploadAllPermits,
                      icon: _isUploading
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(
                                  Colors.white,
                                ),
                              ),
                            )
                          : const Icon(Icons.cloud_upload),
                      label: Text(
                        _isUploading
                            ? (isArabic ? 'جاري الرفع...' : 'Uploading...')
                            : (isArabic
                                  ? 'رفع $readyCount تصريح'
                                  : 'Upload $readyCount Permits'),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryGreen,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
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

  Widget _buildPermitItemCard(
    BulkLocalityPermitItem item,
    int index,
    bool isArabic,
  ) {
    Color statusColor;
    IconData statusIcon;

    switch (item.status) {
      case PermitUploadStatus.uploading:
        statusColor = Colors.blue;
        statusIcon = Icons.cloud_upload;
        break;
      case PermitUploadStatus.success:
        statusColor = Colors.green;
        statusIcon = Icons.check_circle;
        break;
      case PermitUploadStatus.error:
        statusColor = Colors.red;
        statusIcon = Icons.error;
        break;
      default:
        statusColor = item.isReady ? Colors.green : Colors.grey;
        statusIcon = item.isReady ? Icons.check : Icons.pending;
    }

    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: statusColor.withOpacity(0.3), width: 1),
        ),
        child: ExpansionTile(
          leading: Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: statusColor.withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(statusIcon, color: statusColor, size: 20),
          ),
          title: Text(
            item.locality,
            style: GoogleFonts.poppins(
              fontWeight: FontWeight.w600,
              fontSize: 14,
            ),
          ),
          subtitle: Text(
            item.state,
            style: GoogleFonts.poppins(fontSize: 12, color: Colors.grey[600]),
          ),
          trailing: item.status == PermitUploadStatus.uploading
              ? const SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : null,
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  InkWell(
                    onTap: _isUploading
                        ? null
                        : () => _selectFileForItem(index),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.grey[300]!),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            item.file != null
                                ? Icons.insert_drive_file
                                : Icons.add_photo_alternate,
                            color: item.file != null
                                ? AppColors.primaryGreen
                                : Colors.grey,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              item.fileName ??
                                  (isArabic
                                      ? 'اختر ملف التصريح'
                                      : 'Select permit file'),
                              style: GoogleFonts.poppins(
                                color: item.file != null
                                    ? Colors.black
                                    : Colors.grey,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: InkWell(
                          onTap: _isUploading
                              ? null
                              : () => _selectDate(index, true),
                          child: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              border: Border.all(color: Colors.grey[300]!),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  isArabic ? 'تاريخ الإصدار' : 'Issue Date',
                                  style: GoogleFonts.poppins(
                                    fontSize: 12,
                                    color: Colors.grey[600],
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  item.issueDate != null
                                      ? DateFormat(
                                          'yyyy-MM-dd',
                                        ).format(item.issueDate!)
                                      : (isArabic ? 'اختر' : 'Select'),
                                  style: GoogleFonts.poppins(
                                    fontWeight: FontWeight.w500,
                                    color: item.issueDate != null
                                        ? Colors.black
                                        : Colors.grey,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: InkWell(
                          onTap: _isUploading
                              ? null
                              : () => _selectDate(index, false),
                          child: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              border: Border.all(color: Colors.grey[300]!),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  isArabic ? 'تاريخ الانتهاء' : 'Expiry Date',
                                  style: GoogleFonts.poppins(
                                    fontSize: 12,
                                    color: Colors.grey[600],
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  item.expiryDate != null
                                      ? DateFormat(
                                          'yyyy-MM-dd',
                                        ).format(item.expiryDate!)
                                      : (isArabic ? 'اختر' : 'Select'),
                                  style: GoogleFonts.poppins(
                                    fontWeight: FontWeight.w500,
                                    color: item.expiryDate != null
                                        ? Colors.black
                                        : Colors.grey,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (item.errorMessage != null) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.red[50],
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.error_outline,
                            color: Colors.red,
                            size: 16,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              item.errorMessage!,
                              style: GoogleFonts.poppins(
                                fontSize: 12,
                                color: Colors.red[700],
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
        ),
      ),
    );
  }
}
