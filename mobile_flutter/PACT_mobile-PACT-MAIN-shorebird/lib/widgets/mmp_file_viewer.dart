import 'package:flutter/material.dart';
import 'package:open_file/open_file.dart';
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
      // Request storage permission
      var status = await Permission.storage.request();
      if (!status.isGranted) {
        throw Exception('Storage permission denied');
      }

      // Get the local path where the file is stored
      final directory = await getApplicationDocumentsDirectory();
      final filePath = '${directory.path}/${mmpFile.fileName}';

      // Check if file exists locally, if not, download it
      final file = File(filePath);
      if (!await file.exists()) {
        // Download file from Supabase storage
        final supabase = Supabase.instance.client;
        final bytes = await supabase.storage
            .from('mmps')
            .download(mmpFile.filePath);
        await file.writeAsBytes(bytes);
      }

      // Open the file with system default application
      final result = await OpenFile.open(filePath);
      if (result.type != ResultType.done) {
        throw Exception('Could not open file: ${result.message}');
      }
    } catch (e) {
      debugPrint('Error opening file: $e');
      // Handle error appropriately
    }
  }

  @override
  Widget build(BuildContext context) {
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
                    _getFileIcon(mmpFile.fileType),
                    size: 24,
                    color: Theme.of(context).primaryColor,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      mmpFile.fileName,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Date: ${_formatDate(mmpFile.dateSent)}',
                style: const TextStyle(color: Colors.grey),
              ),
              if (mmpFile.siteVisit != null) ...[
                const SizedBox(height: 4),
                Text(
                  'Site: ${mmpFile.siteVisit!.siteName}',
                  style: const TextStyle(color: Colors.grey),
                ),
              ],
              const SizedBox(height: 8),
              Text(
                'Status: ${mmpFile.status}',
                style: TextStyle(color: _getStatusColor(mmpFile.status)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  IconData _getFileIcon(String fileType) {
    switch (fileType.toLowerCase()) {
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

  String _formatDate(DateTime date) {
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
