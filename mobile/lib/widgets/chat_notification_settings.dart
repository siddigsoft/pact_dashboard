import 'package:flutter/material.dart';
import '../services/user_preferences_service.dart';
import '../theme/app_colors.dart';

/// Dialog for managing per-chat notification settings
class ChatNotificationSettingsDialog extends StatefulWidget {
  final String chatId;
  final String chatName;

  const ChatNotificationSettingsDialog({
    required this.chatId,
    required this.chatName,
  });

  @override
  State<ChatNotificationSettingsDialog> createState() =>
      _ChatNotificationSettingsDialogState();
}

class _ChatNotificationSettingsDialogState
    extends State<ChatNotificationSettingsDialog> {
  late String _selectedMode;

  @override
  void initState() {
    super.initState();
    _loadCurrentMode();
  }

  Future<void> _loadCurrentMode() async {
    final mode = await UserPreferencesService.getChatNotificationMode(
      widget.chatId,
    );
    if (mounted) {
      setState(() {
        _selectedMode = mode;
      });
    }
  }

  void _saveSettings() async {
    await UserPreferencesService.setChatNotificationMode(
      widget.chatId,
      _selectedMode,
    );
    if (mounted) {
      Navigator.of(context).pop(_selectedMode);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Notifications for ${widget.chatName}'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildNotificationOption(
            'all',
            'All Messages',
            'Get notified for every message',
            Icons.notifications,
            Colors.green,
          ),
          const SizedBox(height: 12),
          _buildNotificationOption(
            'mentions',
            'Mentions Only',
            'Get notified only when mentioned',
            Icons.notifications_active,
            Colors.blue,
          ),
          const SizedBox(height: 12),
          _buildNotificationOption(
            'none',
            'Muted',
            'Do not get notified',
            Icons.notifications_off,
            Colors.grey,
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: _saveSettings,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primaryBlue,
          ),
          child: const Text('Save'),
        ),
      ],
    );
  }

  Widget _buildNotificationOption(
    String value,
    String title,
    String subtitle,
    IconData icon,
    Color color,
  ) {
    return GestureDetector(
      onTap: () {
        setState(() {
          _selectedMode = value;
        });
      },
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: _selectedMode == value ? color : Colors.grey[300]!,
            width: _selectedMode == value ? 2 : 1,
          ),
          color: _selectedMode == value ? color.withOpacity(0.1) : Colors.white,
        ),
        child: Row(
          children: [
            Icon(icon, color: color, size: 24),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                  ),
                ],
              ),
            ),
            if (_selectedMode == value)
              Icon(Icons.check_circle, color: color, size: 20)
            else
              Icon(
                Icons.radio_button_unchecked,
                color: Colors.grey[400],
                size: 20,
              ),
          ],
        ),
      ),
    );
  }
}

/// Compact widget for showing/changing chat notification mode
class ChatNotificationBadge extends StatefulWidget {
  final String chatId;
  final String chatName;
  final bool showLabel;

  const ChatNotificationBadge({
    required this.chatId,
    required this.chatName,
    this.showLabel = false,
  });

  @override
  State<ChatNotificationBadge> createState() => _ChatNotificationBadgeState();
}

class _ChatNotificationBadgeState extends State<ChatNotificationBadge> {
  late String _mode;

  @override
  void initState() {
    super.initState();
    _loadMode();
  }

  Future<void> _loadMode() async {
    final mode = await UserPreferencesService.getChatNotificationMode(
      widget.chatId,
    );
    if (mounted) {
      setState(() {
        _mode = mode;
      });
    }
  }

  IconData _getIcon() {
    switch (_mode) {
      case 'all':
        return Icons.notifications;
      case 'mentions':
        return Icons.notifications_active;
      case 'none':
        return Icons.notifications_off;
      default:
        return Icons.notifications;
    }
  }

  Color _getColor() {
    switch (_mode) {
      case 'all':
        return Colors.green;
      case 'mentions':
        return Colors.blue;
      case 'none':
        return Colors.grey;
      default:
        return Colors.grey;
    }
  }

  String _getLabel() {
    switch (_mode) {
      case 'all':
        return 'All';
      case 'mentions':
        return 'Mentions';
      case 'none':
        return 'Muted';
      default:
        return 'All';
    }
  }

  void _showSettings() {
    showDialog(
      context: context,
      builder: (ctx) => ChatNotificationSettingsDialog(
        chatId: widget.chatId,
        chatName: widget.chatName,
      ),
    ).then((result) {
      if (result != null) {
        _loadMode();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (widget.showLabel) {
      return GestureDetector(
        onTap: _showSettings,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: _getColor().withOpacity(0.1),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: _getColor().withOpacity(0.3)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(_getIcon(), size: 14, color: _getColor()),
              const SizedBox(width: 4),
              Text(
                _getLabel(),
                style: TextStyle(
                  fontSize: 11,
                  color: _getColor(),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return IconButton(
      iconSize: 18,
      constraints: const BoxConstraints(),
      padding: const EdgeInsets.all(4),
      icon: Icon(_getIcon(), color: _getColor()),
      onPressed: _showSettings,
      tooltip: 'Notification settings',
    );
  }
}
