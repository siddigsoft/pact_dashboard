import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';
import '../services/wallet_notification_service.dart';

/// Notification center widget showing wallet alerts
class NotificationCenterWidget extends StatefulWidget {
  final String userId;
  final bool isArabic;
  final VoidCallback? onNotificationRead;

  const NotificationCenterWidget({
    super.key,
    required this.userId,
    this.isArabic = false,
    this.onNotificationRead,
  });

  @override
  State<NotificationCenterWidget> createState() =>
      _NotificationCenterWidgetState();
}

class _NotificationCenterWidgetState extends State<NotificationCenterWidget> {
  late final WalletNotificationService _notificationService;
  late Future<List<Map<String, dynamic>>> _notificationsFuture;

  @override
  void initState() {
    super.initState();
    _notificationService = WalletNotificationService();
    _notificationsFuture = _notificationService.getUserNotifications(
      userId: widget.userId,
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _notificationsFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return Center(
            child: CircularProgressIndicator(color: AppColors.primaryBlue),
          );
        }

        if (snapshot.hasError) {
          return Center(
            child: Text(
              widget.isArabic
                  ? 'خطأ في تحميل الإشعارات'
                  : 'Error loading notifications',
              style: GoogleFonts.poppins(color: AppColors.textLight),
            ),
          );
        }

        final notifications = snapshot.data ?? [];

        if (notifications.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.notifications_none,
                    size: 64,
                    color: AppColors.textLight,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    widget.isArabic ? 'لا توجد إشعارات' : 'No notifications',
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      color: AppColors.textLight,
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        return ListView.builder(
          itemCount: notifications.length,
          padding: const EdgeInsets.all(16),
          itemBuilder: (context, index) {
            final notification = notifications[index];
            return _buildNotificationItem(context, notification);
          },
        );
      },
    );
  }

  Widget _buildNotificationItem(
    BuildContext context,
    Map<String, dynamic> notification,
  ) {
    final type = (notification['type'] as String?) ?? 'default';
    final title = widget.isArabic
        ? (notification['title_ar'] as String?) ?? 'Notification'
        : (notification['title_en'] as String?) ?? 'Notification';
    final message = widget.isArabic
        ? (notification['message_ar'] as String?) ?? ''
        : (notification['message_en'] as String?) ?? '';
    final isRead = (notification['is_read'] as bool?) ?? false;
    final createdAt = notification['created_at'] as String?;
    final notificationId = notification['id'] as String?;

    Color getIconColor() {
      switch (type) {
        case 'withdrawal_requested':
          return Colors.blue;
        case 'earnings_received':
          return Colors.green;
        case 'advance_approved':
          return Colors.purple;
        case 'budget_warning':
          return Colors.orange;
        default:
          return AppColors.primaryBlue;
      }
    }

    IconData getIcon() {
      switch (type) {
        case 'withdrawal_requested':
          return Icons.account_balance_wallet;
        case 'earnings_received':
          return Icons.trending_up;
        case 'advance_approved':
          return Icons.check_circle;
        case 'budget_warning':
          return Icons.warning;
        default:
          return Icons.notifications;
      }
    }

    String getTimeString(String dateStr) {
      try {
        final dateTime = DateTime.parse(dateStr).toLocal();
        final now = DateTime.now();
        final difference = now.difference(dateTime);

        if (difference.inMinutes < 1) {
          return widget.isArabic ? 'الآن' : 'Just now';
        } else if (difference.inMinutes < 60) {
          return '${difference.inMinutes}m ${widget.isArabic ? 'ago' : 'منذ'}';
        } else if (difference.inHours < 24) {
          return '${difference.inHours}h ${widget.isArabic ? 'ago' : 'منذ'}';
        } else {
          return '${difference.inDays}d ${widget.isArabic ? 'ago' : 'منذ'}';
        }
      } catch (e) {
        return widget.isArabic ? 'وقت ما' : 'Sometime ago';
      }
    }

    return GestureDetector(
      onTap: () {
        if (!isRead && notificationId != null) {
          _notificationService.markAsRead(notificationId);
          setState(() {
            _notificationsFuture = _notificationService.getUserNotifications(
              userId: widget.userId,
            );
          });
          widget.onNotificationRead?.call();
        }
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isRead
              ? Colors.white
              : AppColors.primaryBlue.withOpacity(0.05),
          border: Border.all(
            color: isRead
                ? Colors.grey.shade200
                : AppColors.primaryBlue.withOpacity(0.3),
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: getIconColor().withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(getIcon(), color: getIconColor(), size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          style: GoogleFonts.poppins(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textDark,
                          ),
                        ),
                      ),
                      if (!isRead)
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: AppColors.primaryBlue,
                            shape: BoxShape.circle,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    message,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: AppColors.textLight,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    createdAt != null ? getTimeString(createdAt) : '',
                    style: GoogleFonts.poppins(
                      fontSize: 10,
                      color: Colors.grey.shade500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            if (!isRead)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: IconButton(
                  icon: const Icon(Icons.close, size: 16),
                  onPressed: () {
                    if (notificationId != null) {
                      _notificationService.markAsRead(notificationId);
                      setState(() {
                        _notificationsFuture = _notificationService
                            .getUserNotifications(userId: widget.userId);
                      });
                    }
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }
}
