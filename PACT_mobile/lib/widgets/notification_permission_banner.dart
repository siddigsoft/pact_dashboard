// lib/widgets/notification_permission_banner.dart
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import '../services/notification_permission_cache_service.dart';
import 'dart:developer' as developer;

/// GAP #3: Shows banner when notification permission denied
/// Allows user to enable notifications in settings
class NotificationPermissionBanner extends StatefulWidget {
  final VoidCallback? onPermissionChanged;

  const NotificationPermissionBanner({Key? key, this.onPermissionChanged})
    : super(key: key);

  @override
  State<NotificationPermissionBanner> createState() =>
      _NotificationPermissionBannerState();
}

class _NotificationPermissionBannerState
    extends State<NotificationPermissionBanner> {
  final _cacheService = NotificationPermissionCacheService();
  bool _isDismissed = false;
  int _unreadCount = 0;

  @override
  void initState() {
    super.initState();
    _checkNotificationStatus();
  }

  Future<void> _checkNotificationStatus() async {
    if (_isDismissed) return;

    try {
      final isDenied = _cacheService.isPermissionDenied();
      final count =
          await _cacheService.getUnreadMessageCount() +
          (await _cacheService.getMissedCallCount());

      if (mounted) {
        setState(() {
          _unreadCount = count;
        });
      }

      developer.log(
        '[NotificationBanner] Permission denied: $isDenied, unread: $count',
      );
    } catch (e) {
      developer.log('[NotificationBanner] Error checking status: $e', error: e);
    }
  }

  Future<void> _openSettings() async {
    try {
      await openAppSettings();
      // Check status after user returns
      Future.delayed(const Duration(seconds: 1), _checkNotificationStatus);
      widget.onPermissionChanged?.call();
    } catch (e) {
      developer.log(
        '[NotificationBanner] Error opening settings: $e',
        error: e,
      );
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('Could not open settings'),
          backgroundColor: Colors.red.shade400,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isDismissed || !_cacheService.isPermissionDenied()) {
      return const SizedBox.shrink();
    }

    return Material(
      child: Container(
        color: Colors.orange.shade50,
        child: Padding(
          padding: const EdgeInsets.all(12.0),
          child: Row(
            children: [
              // Warning icon
              Padding(
                padding: const EdgeInsets.only(right: 12.0),
                child: Icon(
                  Icons.notifications_off,
                  color: Colors.orange.shade700,
                  size: 24,
                ),
              ),

              // Message with unread count
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Notifications Disabled',
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: Colors.orange.shade900,
                        fontSize: 14,
                      ),
                    ),
                    if (_unreadCount > 0)
                      Padding(
                        padding: const EdgeInsets.only(top: 2.0),
                        child: Text(
                          'You have $_unreadCount unread messages',
                          style: TextStyle(
                            color: Colors.orange.shade700,
                            fontSize: 12,
                          ),
                        ),
                      )
                    else
                      Padding(
                        padding: const EdgeInsets.only(top: 2.0),
                        child: Text(
                          'Calls and messages won\'t show as notifications',
                          style: TextStyle(
                            color: Colors.orange.shade700,
                            fontSize: 12,
                          ),
                        ),
                      ),
                  ],
                ),
              ),

              // Action buttons
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    height: 32,
                    child: TextButton(
                      onPressed: _openSettings,
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        backgroundColor: Colors.orange.shade700,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                      child: const Text(
                        'Enable',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  SizedBox(
                    height: 32,
                    child: TextButton(
                      onPressed: () {
                        setState(() => _isDismissed = true);
                      },
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                      ),
                      child: const Text(
                        'Dismiss',
                        style: TextStyle(fontSize: 12),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
