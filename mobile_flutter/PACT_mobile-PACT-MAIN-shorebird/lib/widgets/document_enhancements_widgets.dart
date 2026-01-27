import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../services/document_enhancements_service.dart';

class DocumentFolderCard extends StatelessWidget {
  final DocumentFolder folder;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final String locale;

  const DocumentFolderCard({
    super.key,
    required this.folder,
    this.onTap,
    this.onLongPress,
    this.locale = 'en',
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      onLongPress: onLongPress,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey.shade200),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 4,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: AppColors.primaryBlue.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                Icons.folder,
                color: AppColors.primaryBlue,
                size: 28,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    folder.name,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    locale == 'ar'
                        ? '${folder.documentCount} مستند'
                        : '${folder.documentCount} documents',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: Colors.grey.shade400),
          ],
        ),
      ),
    );
  }
}

class DocumentVersionTile extends StatelessWidget {
  final DocumentVersion version;
  final bool isCurrent;
  final VoidCallback? onRestore;
  final VoidCallback? onView;
  final String locale;

  const DocumentVersionTile({
    super.key,
    required this.version,
    this.isCurrent = false,
    this.onRestore,
    this.onView,
    this.locale = 'en',
  });

  @override
  Widget build(BuildContext context) {
    final isArabic = locale == 'ar';
    
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isCurrent ? AppColors.primaryBlue.withOpacity(0.05) : Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isCurrent ? AppColors.primaryBlue : Colors.grey.shade200,
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.primaryBlue.withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                'v${version.versionNumber}',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: AppColors.primaryBlue,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      isArabic ? 'الإصدار ${version.versionNumber}' : 'Version ${version.versionNumber}',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (isCurrent) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.primaryBlue,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          isArabic ? 'الحالي' : 'Current',
                          style: const TextStyle(
                            fontSize: 10,
                            color: Colors.white,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  _formatDate(version.createdAt),
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                  ),
                ),
                if (version.changeNotes != null && version.changeNotes!.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    version.changeNotes!,
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade700,
                      fontStyle: FontStyle.italic,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
          if (!isCurrent && onRestore != null)
            IconButton(
              onPressed: onRestore,
              icon: Icon(Icons.restore, color: AppColors.primaryBlue),
              tooltip: isArabic ? 'استعادة' : 'Restore',
            ),
          if (onView != null)
            IconButton(
              onPressed: onView,
              icon: Icon(Icons.visibility_outlined, color: Colors.grey.shade600),
              tooltip: isArabic ? 'عرض' : 'View',
            ),
        ],
      ),
    );
  }

  String _formatDate(DateTime date) {
    final day = date.day.toString().padLeft(2, '0');
    final month = date.month.toString().padLeft(2, '0');
    final year = date.year.toString();
    final hour = date.hour.toString().padLeft(2, '0');
    final minute = date.minute.toString().padLeft(2, '0');
    return '$day/$month/$year $hour:$minute';
  }
}

class DocumentAnnotationToolbar extends StatelessWidget {
  final String selectedTool;
  final Function(String tool) onToolSelected;
  final Color selectedColor;
  final Function(Color color) onColorSelected;
  final String locale;

  const DocumentAnnotationToolbar({
    super.key,
    required this.selectedTool,
    required this.onToolSelected,
    required this.selectedColor,
    required this.onColorSelected,
    this.locale = 'en',
  });

  static const List<Color> annotationColors = [
    Colors.yellow,
    Colors.orange,
    Colors.red,
    Colors.green,
    Colors.blue,
    Colors.purple,
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildToolButton(Icons.highlight, 'highlight'),
          _buildToolButton(Icons.sticky_note_2_outlined, 'note'),
          _buildToolButton(Icons.draw, 'drawing'),
          _buildToolButton(Icons.verified_outlined, 'stamp'),
          Container(
            width: 1,
            height: 24,
            color: Colors.grey.shade300,
            margin: const EdgeInsets.symmetric(horizontal: 8),
          ),
          ...annotationColors.map((color) => _buildColorButton(color)),
        ],
      ),
    );
  }

  Widget _buildToolButton(IconData icon, String tool) {
    final isSelected = selectedTool == tool;
    return GestureDetector(
      onTap: () => onToolSelected(tool),
      child: Container(
        width: 40,
        height: 40,
        margin: const EdgeInsets.symmetric(horizontal: 2),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primaryBlue.withOpacity(0.1) : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(
          icon,
          color: isSelected ? AppColors.primaryBlue : Colors.grey.shade600,
          size: 22,
        ),
      ),
    );
  }

  Widget _buildColorButton(Color color) {
    final isSelected = selectedColor == color;
    return GestureDetector(
      onTap: () => onColorSelected(color),
      child: Container(
        width: 28,
        height: 28,
        margin: const EdgeInsets.symmetric(horizontal: 2),
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(
            color: isSelected ? Colors.black : Colors.transparent,
            width: 2,
          ),
        ),
      ),
    );
  }
}

class DocumentExpiryAlertCard extends StatelessWidget {
  final DocumentExpiryAlert alert;
  final VoidCallback? onTap;
  final String locale;

  const DocumentExpiryAlertCard({
    super.key,
    required this.alert,
    this.onTap,
    this.locale = 'en',
  });

  @override
  Widget build(BuildContext context) {
    final isArabic = locale == 'ar';
    final isUrgent = alert.daysUntilExpiry <= 7;
    final isWarning = alert.daysUntilExpiry <= 14;
    
    final color = isUrgent ? Colors.red : (isWarning ? Colors.orange : Colors.amber);
    
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withOpacity(0.3)),
        ),
        child: Row(
          children: [
            Icon(
              isUrgent ? Icons.warning : Icons.schedule,
              color: color,
              size: 24,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    alert.documentName,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    isArabic
                        ? 'ينتهي خلال ${alert.daysUntilExpiry} أيام'
                        : 'Expires in ${alert.daysUntilExpiry} days',
                    style: TextStyle(
                      fontSize: 12,
                      color: color,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  Text(
                    _getCategoryLabel(alert.category, isArabic),
                    style: TextStyle(
                      fontSize: 11,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: Colors.grey.shade400),
          ],
        ),
      ),
    );
  }

  String _getCategoryLabel(String category, bool isArabic) {
    final labels = {
      'federal_permit': isArabic ? 'تصريح فيدرالي' : 'Federal Permit',
      'state_permit': isArabic ? 'تصريح ولاية' : 'State Permit',
      'local_permit': isArabic ? 'تصريح محلي' : 'Local Permit',
    };
    return labels[category] ?? category;
  }
}

class OfflineDocumentBadge extends StatelessWidget {
  final bool isAvailableOffline;
  final String locale;

  const OfflineDocumentBadge({
    super.key,
    required this.isAvailableOffline,
    this.locale = 'en',
  });

  @override
  Widget build(BuildContext context) {
    final isArabic = locale == 'ar';
    
    if (!isAvailableOffline) return const SizedBox.shrink();
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: Colors.green.shade100,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.offline_pin, size: 12, color: Colors.green.shade700),
          const SizedBox(width: 4),
          Text(
            isArabic ? 'متاح بلا اتصال' : 'Available offline',
            style: TextStyle(
              fontSize: 10,
              color: Colors.green.shade700,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

class DocumentShareDialog extends StatefulWidget {
  final List<Map<String, dynamic>> users;
  final Function(List<String> userIds, String permission) onShare;
  final String locale;

  const DocumentShareDialog({
    super.key,
    required this.users,
    required this.onShare,
    this.locale = 'en',
  });

  @override
  State<DocumentShareDialog> createState() => _DocumentShareDialogState();
}

class _DocumentShareDialogState extends State<DocumentShareDialog> {
  final Set<String> _selectedUsers = {};
  String _permission = 'view';

  @override
  Widget build(BuildContext context) {
    final isArabic = widget.locale == 'ar';
    
    return AlertDialog(
      title: Text(isArabic ? 'مشاركة المستند' : 'Share Document'),
      content: SizedBox(
        width: double.maxFinite,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              isArabic ? 'اختر المستخدمين:' : 'Select users:',
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 200,
              child: ListView.builder(
                itemCount: widget.users.length,
                itemBuilder: (context, index) {
                  final user = widget.users[index];
                  final userId = user['id'] as String;
                  final isSelected = _selectedUsers.contains(userId);
                  
                  return CheckboxListTile(
                    value: isSelected,
                    onChanged: (value) {
                      setState(() {
                        if (value == true) {
                          _selectedUsers.add(userId);
                        } else {
                          _selectedUsers.remove(userId);
                        }
                      });
                    },
                    title: Text(user['full_name'] ?? user['email'] ?? 'Unknown'),
                    subtitle: Text(user['email'] ?? ''),
                    dense: true,
                    controlAffinity: ListTileControlAffinity.leading,
                  );
                },
              ),
            ),
            const SizedBox(height: 16),
            Text(
              isArabic ? 'الصلاحية:' : 'Permission:',
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              value: _permission,
              decoration: InputDecoration(
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              ),
              items: [
                DropdownMenuItem(
                  value: 'view',
                  child: Text(isArabic ? 'عرض فقط' : 'View only'),
                ),
                DropdownMenuItem(
                  value: 'edit',
                  child: Text(isArabic ? 'تعديل' : 'Edit'),
                ),
                DropdownMenuItem(
                  value: 'sign',
                  child: Text(isArabic ? 'توقيع' : 'Sign'),
                ),
              ],
              onChanged: (value) => setState(() => _permission = value ?? 'view'),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(isArabic ? 'إلغاء' : 'Cancel'),
        ),
        ElevatedButton(
          onPressed: _selectedUsers.isEmpty
              ? null
              : () {
                  widget.onShare(_selectedUsers.toList(), _permission);
                  Navigator.pop(context);
                },
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primaryBlue,
          ),
          child: Text(
            isArabic ? 'مشاركة' : 'Share',
            style: const TextStyle(color: Colors.white),
          ),
        ),
      ],
    );
  }
}
