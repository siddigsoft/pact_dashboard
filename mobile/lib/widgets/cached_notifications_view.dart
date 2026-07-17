// lib/widgets/cached_notifications_view.dart
import 'package:flutter/material.dart';
import '../services/notification_permission_cache_service.dart';
import 'dart:developer' as developer;

/// GAP #3: Shows cached notifications that arrived while permission was denied
/// Allows user to navigate to missed messages/calls
class CachedNotificationsView extends StatefulWidget {
  final VoidCallback? onMessageTap;
  final VoidCallback? onCallTap;
  final VoidCallback? onClose;

  const CachedNotificationsView({
    Key? key,
    this.onMessageTap,
    this.onCallTap,
    this.onClose,
  }) : super(key: key);

  @override
  State<CachedNotificationsView> createState() =>
      _CachedNotificationsViewState();
}

class _CachedNotificationsViewState extends State<CachedNotificationsView> {
  final _cacheService = NotificationPermissionCacheService();
  late Future<_CachedData> _dataFuture;

  @override
  void initState() {
    super.initState();
    _dataFuture = _loadCachedData();
  }

  Future<_CachedData> _loadCachedData() async {
    try {
      final messages = await _cacheService.getCachedMessages();
      final calls = await _cacheService.getCachedCalls();

      developer.log(
        '[CachedNotifications] Loaded: ${messages.length} messages, ${calls.length} calls',
      );

      return _CachedData(messages: messages, calls: calls);
    } catch (e) {
      developer.log('[CachedNotifications] Error loading data: $e', error: e);
      return _CachedData(messages: [], calls: []);
    }
  }

  Future<void> _clearCache() async {
    try {
      await _cacheService.clearAllCache();
      if (mounted) {
        setState(() {
          _dataFuture = _loadCachedData();
        });
      }
    } catch (e) {
      developer.log('[CachedNotifications] Error clearing cache: $e', error: e);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<_CachedData>(
      future: _dataFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final data = snapshot.data;
        if (!snapshot.hasData || data is! _CachedData || data.isEmpty()) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.notifications_none,
                  size: 48,
                  color: Colors.grey.shade400,
                ),
                const SizedBox(height: 16),
                Text(
                  'No Missed Notifications',
                  style: TextStyle(fontSize: 16, color: Colors.grey.shade600),
                ),
              ],
            ),
          );
        }
        final _CachedData dataCasted = data;
        return SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Missed Calls Section
              if (data.calls.isNotEmpty) ...[
                Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Missed Calls (${data.calls.length})',
                            style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 16,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Column(
                        children: data.calls.map((call) {
                          return _buildCallItem(call);
                        }).toList(),
                      ),
                    ],
                  ),
                ),
                const Divider(),
              ],

              // Unread Messages Section
              if (data.messages.isNotEmpty) ...[
                Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Unread Messages (${data.messages.length})',
                            style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 16,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Column(
                        children: data.messages.map((msg) {
                          return _buildMessageItem(msg);
                        }).toList(),
                      ),
                    ],
                  ),
                ),
              ],

              // Clear cache button
              if (data.isNotEmpty())
                Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: _clearCache,
                      style: OutlinedButton.styleFrom(
                        side: BorderSide(color: Colors.grey.shade400),
                      ),
                      child: const Text('Clear All'),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildCallItem(Map<String, dynamic> call) {
    final callerName = call['callerName'] as String? ?? 'Unknown';
    final isVideoCall = call['isVideoCall'] as bool? ?? false;
    final timestamp = _formatTimestamp(call['timestamp'] as String?);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: isVideoCall
              ? Colors.blue.shade100
              : Colors.green.shade100,
          child: Icon(
            isVideoCall ? Icons.videocam : Icons.call,
            color: isVideoCall ? Colors.blue : Colors.green,
          ),
        ),
        title: Text(callerName),
        subtitle: Text(
          isVideoCall
              ? 'Missed video call • $timestamp'
              : 'Missed call • $timestamp',
          style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
        ),
        trailing: Icon(
          Icons.arrow_forward_ios,
          size: 16,
          color: Colors.grey.shade400,
        ),
        onTap: widget.onCallTap,
      ),
    );
  }

  Widget _buildMessageItem(Map<String, dynamic> msg) {
    final senderName = msg['senderName'] as String? ?? 'Unknown';
    final preview = msg['preview'] as String? ?? '';
    final timestamp = _formatTimestamp(msg['timestamp'] as String?);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: Colors.orange.shade100,
          child: Icon(Icons.message, color: Colors.orange.shade700),
        ),
        title: Text(senderName),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              preview.length > 60 ? '${preview.substring(0, 60)}...' : preview,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
            Text(
              timestamp,
              style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
            ),
          ],
        ),
        trailing: Icon(
          Icons.arrow_forward_ios,
          size: 16,
          color: Colors.grey.shade400,
        ),
        onTap: widget.onMessageTap,
      ),
    );
  }

  String _formatTimestamp(String? timestamp) {
    if (timestamp == null) return 'Just now';

    try {
      final dt = DateTime.parse(timestamp);
      final now = DateTime.now();
      final diff = now.difference(dt);

      if (diff.inMinutes < 1) {
        return 'Just now';
      } else if (diff.inMinutes < 60) {
        return '${diff.inMinutes}m ago';
      } else if (diff.inHours < 24) {
        return '${diff.inHours}h ago';
      } else {
        return '${diff.inDays}d ago';
      }
    } catch (e) {
      return 'Recently';
    }
  }
}

class _CachedData {
  final List<Map<String, dynamic>> messages;
  final List<Map<String, dynamic>> calls;

  _CachedData({required this.messages, required this.calls});

  bool isEmpty() => messages.isEmpty && calls.isEmpty;

  bool isNotEmpty() => !isEmpty();
}
