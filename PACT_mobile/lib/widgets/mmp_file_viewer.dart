import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/mmp_file.dart';
import 'package:path_provider/path_provider.dart';
import 'dart:io';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:permission_handler/permission_handler.dart';

class MMPFileViewer extends StatelessWidget {
  final MMPFile mmpFile;

  const MMPFileViewer({super.key, required this.mmpFile});

  Future<void> _openFile() async {
    try {
      // If a public URL exists, open it directly.
      if (mmpFile.fileUrl != null) {
        final uri = Uri.parse(mmpFile.fileUrl!);
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
          return;
        }
      }

      // Fallback to downloading from storage when we have a storage path.
      if (mmpFile.filePath == null) {
        throw Exception('No file reference available');
      }

      final status = await Permission.storage.request();
      if (!status.isGranted) {
        throw Exception('Storage permission denied');
      }

      final directory = await getApplicationDocumentsDirectory();
      final localFileName = _displayName;
      final localPath = '${directory.path}/$localFileName';
      final file = File(localPath);

      if (!await file.exists()) {
        final supabase = Supabase.instance.client;
        final bytes =
            await supabase.storage.from('mmps').download(mmpFile.filePath!);
        await file.writeAsBytes(bytes);
      }

      final uri = Uri.file(localPath);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri);
      } else {
        throw Exception('Could not open file: $localPath');
      }
    } catch (e) {
      debugPrint('Error opening file: $e');
    }
  }

  String get _displayName =>
      mmpFile.originalFilename ?? mmpFile.name ?? 'MMP file';

  @override
  Widget build(BuildContext context) {
    final status = mmpFile.status ?? 'unknown';
    final uploadedDate = mmpFile.uploadedAt ?? mmpFile.createdAt;

    return Card(
      margin: const EdgeInsets.all(8.0),
      child: InkWell(
        onTap: _openFile,
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    _getFileIcon(_displayName),
                    size: 24,
                    color: Theme.of(context).primaryColor,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _displayName,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Date: ${_formatDate(uploadedDate)}',
                style: const TextStyle(color: Colors.grey),
              ),
              const SizedBox(height: 8),
              Text(
                'Status: $status',
                style: TextStyle(color: _getStatusColor(status)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  IconData _getFileIcon(String? fileName) {
    final ext = _fileExtension(fileName);
    switch (ext) {
      case 'pdf':
        return Icons.picture_as_pdf;
      case 'doc':
      case 'docx':
        return Icons.description;
      case 'xls':
      case 'xlsx':
        return Icons.table_chart;
      default:
        return Icons.insert_drive_file;
    }
  }

  String? _fileExtension(String? fileName) {
    if (fileName == null) return null;
    final parts = fileName.split('.');
    return parts.length > 1 ? parts.last.toLowerCase() : null;
  }

  String _formatDate(DateTime? date) {
    if (date == null) return 'N/A';
    return '${date.day}/${date.month}/${date.year}';
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'pending':
        return Colors.orange;
      case 'completed':
        return Colors.green;
      case 'rejected':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }
}
