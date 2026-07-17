import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/mmp_file.dart';
import 'package:intl/intl.dart';

class MMPFileCard extends StatelessWidget {
  final MMPFile file;
  final VoidCallback? onTap;

  const MMPFileCard({super.key, required this.file, this.onTap});

  Future<void> _openFile() async {
    if (file.fileUrl != null) {
      final url = Uri.parse(file.fileUrl!);
      if (await canLaunchUrl(url)) {
        await launchUrl(url, mode: LaunchMode.externalApplication);
      } else {
        debugPrint('Could not launch $url');
      }
    }
  }

  String _formatDate(DateTime? date) {
    if (date == null) return 'N/A';
    return DateFormat('MMM d, y h:mm a').format(date);
  }

  String _getStatusColor() {
    switch (file.status?.toLowerCase()) {
      case 'approved':
        return '#4CAF50';
      case 'pending':
        return '#FFC107';
      case 'rejected':
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 4,
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: InkWell(
        onTap: () => _openFile(),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(
                      file.name ?? 'Unnamed Document',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: Color(
                        int.parse(
                              _getStatusColor().substring(1, 7),
                              radix: 16,
                            ) +
                            0xFF000000,
                      ),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      file.status?.toUpperCase() ?? 'N/A',
                      style: const TextStyle(color: Colors.white, fontSize: 12),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              _buildInfoRow('Original File:', file.originalFilename ?? 'N/A'),
              _buildInfoRow('Uploaded:', _formatDate(file.uploadedAt)),
              _buildInfoRow('Created:', _formatDate(file.createdAt)),
              if (file.approvedBy != null)
                _buildInfoRow('Approved By:', file.approvedBy!),
              if (file.approvedAt != null)
                _buildInfoRow('Approved On:', _formatDate(file.approvedAt)),
              if (file.entries != null)
                _buildInfoRow(
                  'Progress:',
                  '${file.processedEntries ?? 0}/${file.entries} entries',
                ),
              const SizedBox(height: 8),
              LinearProgressIndicator(
                value: file.entries == null || file.entries == 0
                    ? 0
                    : (file.processedEntries ?? 0) / file.entries!,
                backgroundColor: Colors.grey[200],
                valueColor: AlwaysStoppedAnimation<Color>(
                  Color(
                    int.parse(_getStatusColor().substring(1, 7), radix: 16) +
                        0xFF000000,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: const TextStyle(
                fontWeight: FontWeight.w500,
                color: Colors.grey,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }
}
