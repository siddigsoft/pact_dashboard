import 'dart:io';
import 'package:flutter/material.dart';
import '../models/cost_submission.dart';
import '../services/document_upload_service.dart';

/// Document Upload Widget for Cost Submissions
///
/// Features:
/// - Camera capture
/// - Gallery selection
/// - Multiple file support
/// - Upload progress indicator
/// - Document type selection

class DocumentUploadWidget extends StatefulWidget {
  final DocumentUploadService uploadService;
  final List<SupportingDocument> documents;
  final Function(List<SupportingDocument>) onDocumentsChanged;
  final bool isArabic;
  final int maxDocuments;

  const DocumentUploadWidget({
    super.key,
    required this.uploadService,
    required this.documents,
    required this.onDocumentsChanged,
    this.isArabic = false,
    this.maxDocuments = 5,
  });

  @override
  State<DocumentUploadWidget> createState() => _DocumentUploadWidgetState();
}

class _DocumentUploadWidgetState extends State<DocumentUploadWidget> {
  bool _isUploading = false;
  double _uploadProgress = 0;
  String _selectedDocType = 'receipt';

  final List<Map<String, String>> _documentTypes = [
    {'value': 'receipt', 'en': 'Receipt', 'ar': 'إيصال'},
    {'value': 'invoice', 'en': 'Invoice', 'ar': 'فاتورة'},
    {'value': 'photo', 'en': 'Photo', 'ar': 'صورة'},
    {'value': 'other', 'en': 'Other', 'ar': 'أخرى'},
  ];

  @override
  Widget build(BuildContext context) {
    final isArabic = widget.isArabic;
    final canAddMore = widget.documents.length < widget.maxDocuments;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Document type selector
        if (canAddMore) ...[
          Text(
            isArabic ? 'نوع المستند' : 'Document Type',
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: _documentTypes.map((type) {
              final isSelected = _selectedDocType == type['value'];
              return ChoiceChip(
                label: Text(isArabic ? type['ar']! : type['en']!),
                selected: isSelected,
                onSelected: (selected) {
                  if (selected) {
                    setState(() => _selectedDocType = type['value']!);
                  }
                },
              );
            }).toList(),
          ),
          const SizedBox(height: 16),
        ],

        // Upload area
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            border: Border.all(color: Colors.grey[300]!),
            borderRadius: BorderRadius.circular(12),
            color: Colors.grey[50],
          ),
          child: Column(
            children: [
              // Uploaded documents list
              if (widget.documents.isNotEmpty) ...[
                ...widget.documents.map((doc) => _buildDocumentItem(doc)),
                const SizedBox(height: 16),
                const Divider(),
                const SizedBox(height: 8),
              ],

              // Upload progress
              if (_isUploading) ...[
                LinearProgressIndicator(value: _uploadProgress),
                const SizedBox(height: 8),
                Text(
                  isArabic
                      ? 'جاري الرفع... ${(_uploadProgress * 100).toInt()}%'
                      : 'Uploading... ${(_uploadProgress * 100).toInt()}%',
                  style: TextStyle(color: Colors.grey[600], fontSize: 13),
                ),
                const SizedBox(height: 16),
              ],

              // Add document buttons
              if (canAddMore && !_isUploading) ...[
                Text(
                  isArabic
                      ? 'إضافة مستند (${widget.documents.length}/${widget.maxDocuments})'
                      : 'Add Document (${widget.documents.length}/${widget.maxDocuments})',
                  style: TextStyle(color: Colors.grey[600], fontSize: 13),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Camera button
                    _ActionButton(
                      icon: Icons.camera_alt,
                      label: isArabic ? 'كاميرا' : 'Camera',
                      onTap: _captureFromCamera,
                    ),
                    const SizedBox(width: 24),
                    // Gallery button
                    _ActionButton(
                      icon: Icons.photo_library,
                      label: isArabic ? 'المعرض' : 'Gallery',
                      onTap: _pickFromGallery,
                    ),
                  ],
                ),
              ] else if (!canAddMore) ...[
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.check_circle,
                      color: Colors.green[600],
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      isArabic
                          ? 'تم الوصول للحد الأقصى من المستندات'
                          : 'Maximum documents reached',
                      style: TextStyle(color: Colors.grey[600]),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),

        // Required hint
        if (widget.documents.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(
              children: [
                Icon(Icons.info_outline, size: 14, color: Colors.orange[700]),
                const SizedBox(width: 4),
                Text(
                  isArabic
                      ? 'مطلوب مستند داعم واحد على الأقل'
                      : 'At least one supporting document is required',
                  style: TextStyle(color: Colors.orange[700], fontSize: 12),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildDocumentItem(SupportingDocument doc) {
    final typeLabel = _documentTypes.firstWhere(
      (t) => t['value'] == doc.type,
      orElse: () => {'en': 'Document', 'ar': 'مستند'},
    );

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey[200]!),
      ),
      child: Row(
        children: [
          // Thumbnail or icon
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: Colors.blue.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: _getDocumentIcon(doc.type),
          ),
          const SizedBox(width: 12),

          // Document info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  doc.filename,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w500),
                ),
                const SizedBox(height: 2),
                Text(
                  '${widget.isArabic ? typeLabel['ar'] : typeLabel['en']} • ${DocumentUploadService.formatFileSize(doc.size)}',
                  style: TextStyle(color: Colors.grey[600], fontSize: 12),
                ),
              ],
            ),
          ),

          // Delete button
          IconButton(
            icon: const Icon(Icons.close, color: Colors.red, size: 20),
            onPressed: () => _removeDocument(doc),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
          ),
        ],
      ),
    );
  }

  Widget _getDocumentIcon(String type) {
    IconData icon;
    Color color;

    switch (type) {
      case 'receipt':
        icon = Icons.receipt;
        color = Colors.green;
        break;
      case 'invoice':
        icon = Icons.description;
        color = Colors.blue;
        break;
      case 'photo':
        icon = Icons.image;
        color = Colors.purple;
        break;
      default:
        icon = Icons.insert_drive_file;
        color = Colors.grey;
    }

    return Icon(icon, color: color);
  }

  Future<void> _captureFromCamera() async {
    try {
      final file = await widget.uploadService.captureFromCamera();
      if (file != null) {
        await _uploadFile(file);
      }
    } catch (e) {
      _showError('Failed to capture image');
    }
  }

  Future<void> _pickFromGallery() async {
    try {
      final remaining = widget.maxDocuments - widget.documents.length;

      if (remaining > 1) {
        // Allow multiple selection
        final files = await widget.uploadService.pickMultipleFromGallery(
          maxImages: remaining,
        );
        if (files.isNotEmpty) {
          await _uploadMultipleFiles(files);
        }
      } else {
        // Single selection
        final file = await widget.uploadService.pickFromGallery();
        if (file != null) {
          await _uploadFile(file);
        }
      }
    } catch (e) {
      _showError('Failed to select image');
    }
  }

  Future<void> _uploadFile(File file) async {
    setState(() {
      _isUploading = true;
      _uploadProgress = 0;
    });

    try {
      final doc = await widget.uploadService.uploadFile(
        file: file,
        documentType: _selectedDocType,
      );

      if (doc != null) {
        final updatedDocs = [...widget.documents, doc];
        widget.onDocumentsChanged(updatedDocs);
      }
    } catch (e) {
      _showError('Failed to upload document');
    } finally {
      setState(() {
        _isUploading = false;
        _uploadProgress = 0;
      });
    }
  }

  Future<void> _uploadMultipleFiles(List<File> files) async {
    setState(() {
      _isUploading = true;
      _uploadProgress = 0;
    });

    try {
      final docs = await widget.uploadService.uploadMultipleFiles(
        files: files,
        documentType: _selectedDocType,
        onProgress: (uploaded, total) {
          setState(() => _uploadProgress = uploaded / total);
        },
      );

      if (docs.isNotEmpty) {
        final updatedDocs = [...widget.documents, ...docs];
        widget.onDocumentsChanged(updatedDocs);
      }
    } catch (e) {
      _showError('Failed to upload documents');
    } finally {
      setState(() {
        _isUploading = false;
        _uploadProgress = 0;
      });
    }
  }

  void _removeDocument(SupportingDocument doc) {
    final updatedDocs = widget.documents
        .where((d) => d.url != doc.url)
        .toList();
    widget.onDocumentsChanged(updatedDocs);

    // Optionally delete from storage
    widget.uploadService.deleteDocument(doc.url);
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(widget.isArabic ? 'حدث خطأ' : message),
        backgroundColor: Colors.red,
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _ActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        decoration: BoxDecoration(
          color: Theme.of(context).primaryColor.withOpacity(0.1),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: Theme.of(context).primaryColor.withOpacity(0.3),
          ),
        ),
        child: Column(
          children: [
            Icon(icon, color: Theme.of(context).primaryColor, size: 28),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                color: Theme.of(context).primaryColor,
                fontWeight: FontWeight.w500,
                fontSize: 13,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
