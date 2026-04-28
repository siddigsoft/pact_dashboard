import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Backup management and history widget
class BackupManagementWidget extends StatelessWidget {
  final List<Map<String, dynamic>> backups;
  final bool isArabic;
  final VoidCallback? onCreateBackup;
  final Function(String)? onRestoreBackup;
  final Function(String)? onDeleteBackup;

  const BackupManagementWidget({
    super.key,
    required this.backups,
    this.isArabic = false,
    this.onCreateBackup,
    this.onRestoreBackup,
    this.onDeleteBackup,
  });

  String _formatFileSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final difference = now.difference(date);

    if (difference.inMinutes < 1) {
      return isArabic ? 'للتو' : 'Just now';
    } else if (difference.inMinutes < 60) {
      return '${difference.inMinutes} ${isArabic ? 'دقيقة' : 'min'} ago';
    } else if (difference.inHours < 24) {
      return '${difference.inHours} ${isArabic ? 'ساعة' : 'h'} ago';
    } else if (difference.inDays < 7) {
      return '${difference.inDays} ${isArabic ? 'يوم' : 'd'} ago';
    } else {
      return '${date.day}/${date.month}/${date.year}';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                isArabic ? '💾 النسخ الاحتياطية' : '💾 Backups',
                style: GoogleFonts.poppins(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              if (onCreateBackup != null)
                ElevatedButton.icon(
                  onPressed: onCreateBackup,
                  icon: const Icon(Icons.add, size: 16),
                  label: Text(isArabic ? 'جديد' : 'New'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryBlue,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (backups.isEmpty)
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.amber.shade50,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.amber.shade200),
            ),
            child: Row(
              children: [
                Icon(Icons.info_outline, color: Colors.amber.shade700),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    isArabic
                        ? 'لا توجد نسخ احتياطية حتى الآن'
                        : 'No backups yet',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.amber.shade700,
                    ),
                  ),
                ),
              ],
            ),
          )
        else
          ...backups.asMap().entries.map((entry) {
            final backup = entry.value;
            final id = (backup['id'] as String?) ?? '';
            final timestamp =
                DateTime.tryParse((backup['created_at'] as String?) ?? '') ??
                DateTime.now();
            final notes = (backup['notes'] as String?) ?? '';
            final status = (backup['status'] as String?) ?? 'completed';
            final fileSize = (backup['file_size'] as num?)?.toInt() ?? 0;

            return Container(
              margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey.shade200),
                boxShadow: [
                  BoxShadow(
                    color: Colors.grey.withOpacity(0.1),
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Icon(
                                  status == 'completed'
                                      ? Icons.check_circle
                                      : Icons.schedule,
                                  size: 18,
                                  color: status == 'completed'
                                      ? Colors.green
                                      : Colors.orange,
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  _formatDate(timestamp),
                                  style: GoogleFonts.poppins(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                            if (notes.isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(
                                notes,
                                style: GoogleFonts.poppins(
                                  fontSize: 11,
                                  color: AppColors.textLight,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade100,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          _formatFileSize(fileSize),
                          style: GoogleFonts.poppins(
                            fontSize: 10,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      if (onRestoreBackup != null)
                        TextButton.icon(
                          onPressed: () => onRestoreBackup!(id),
                          icon: const Icon(Icons.restore, size: 16),
                          label: Text(isArabic ? 'استرجاع' : 'Restore'),
                          style: TextButton.styleFrom(
                            foregroundColor: AppColors.primaryBlue,
                          ),
                        ),
                      if (onDeleteBackup != null)
                        TextButton.icon(
                          onPressed: () => onDeleteBackup!(id),
                          icon: const Icon(Icons.delete_outline, size: 16),
                          label: Text(isArabic ? 'حذف' : 'Delete'),
                          style: TextButton.styleFrom(
                            foregroundColor: Colors.red,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            );
          }),
      ],
    );
  }
}
