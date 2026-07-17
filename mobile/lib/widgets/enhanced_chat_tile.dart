import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme/app_colors.dart';

/// Enhanced chat tile with message preview, unread badge, and last message timestamp
class EnhancedChatTile extends StatelessWidget {
  final String id;
  final String chatTitle;
  final String chatSubtitle;
  final String messagePreview;
  final DateTime timestamp;
  final int unreadCount;
  final bool isMuted;
  final bool isPinned;
  final bool isArabic;
  final VoidCallback onTap;
  final VoidCallback? onTogglePin;
  final VoidCallback onToggleMute;
  final VoidCallback? onLongPress;

  const EnhancedChatTile({
    required this.id,
    required this.chatTitle,
    required this.chatSubtitle,
    required this.messagePreview,
    required this.timestamp,
    required this.unreadCount,
    required this.isMuted,
    required this.isPinned,
    required this.isArabic,
    required this.onTap,
    this.onTogglePin,
    required this.onToggleMute,
    this.onLongPress,
  });

  String _formatTime(DateTime time) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = today.subtract(const Duration(days: 1));
    final messageDate = DateTime(time.year, time.month, time.day);

    if (messageDate == today) {
      return DateFormat('HH:mm').format(time);
    } else if (messageDate == yesterday) {
      return 'Yesterday';
    } else if (messageDate.year == today.year) {
      return DateFormat('MMM d').format(time);
    } else {
      return DateFormat('MMM d, yyyy').format(time);
    }
  }

  String _getMessagePreview(String message) {
    const maxLength = 50;
    if (message.length > maxLength) {
      return '${message.substring(0, maxLength)}...';
    }
    return message;
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      onLongPress: onLongPress,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: unreadCount > 0
              ? AppColors.primaryBlue.withOpacity(0.05)
              : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: unreadCount > 0
                ? AppColors.primaryBlue.withOpacity(0.2)
                : Colors.grey[200]!,
          ),
        ),
        child: ListTile(
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 12,
            vertical: 8,
          ),
          leading: Stack(
            children: [
              CircleAvatar(
                radius: 24,
                backgroundColor: AppColors.primaryBlue.withOpacity(0.1),
                child: Text(chatTitle.substring(0, 1).toUpperCase()),
              ),
              if (isMuted)
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: Container(
                    padding: const EdgeInsets.all(2),
                    decoration: const BoxDecoration(
                      color: Colors.grey,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.volume_off,
                      size: 10,
                      color: Colors.white,
                    ),
                  ),
                ),
            ],
          ),
          title: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  chatTitle,
                  style: TextStyle(
                    fontWeight: unreadCount > 0
                        ? FontWeight.bold
                        : FontWeight.w600,
                    fontSize: 14,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                _formatTime(timestamp),
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey[600],
                  fontWeight: unreadCount > 0
                      ? FontWeight.w600
                      : FontWeight.normal,
                ),
              ),
            ],
          ),
          subtitle: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  _getMessagePreview(messagePreview),
                  style: TextStyle(
                    fontSize: 13,
                    color: Colors.grey[600],
                    fontWeight: unreadCount > 0
                        ? FontWeight.w500
                        : FontWeight.normal,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (unreadCount > 0)
                Container(
                  margin: const EdgeInsets.only(left: 8),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.primaryBlue,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    unreadCount > 99 ? '99+' : unreadCount.toString(),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
            ],
          ),
          trailing: SizedBox(
            width: 100,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (isPinned)
                  Icon(Icons.push_pin, size: 16, color: AppColors.primaryBlue),
                IconButton(
                  iconSize: 16,
                  padding: const EdgeInsets.all(4),
                  constraints: const BoxConstraints(),
                  icon: Icon(
                    isMuted ? Icons.notifications_off : Icons.notifications,
                    color: isMuted ? Colors.grey : Colors.green,
                  ),
                  onPressed: onToggleMute,
                ),
                if (onTogglePin != null)
                  IconButton(
                    iconSize: 16,
                    padding: const EdgeInsets.all(4),
                    constraints: const BoxConstraints(),
                    icon: Icon(
                      isPinned ? Icons.push_pin : Icons.push_pin_outlined,
                      color: isPinned ? AppColors.primaryBlue : Colors.grey,
                    ),
                    onPressed: onTogglePin,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
