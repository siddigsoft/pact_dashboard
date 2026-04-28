import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';

/// Service for managing network status UI indicators
class NetworkStatusIndicatorService extends ChangeNotifier {
  bool _isOnline = true;
  String _networkType = 'unknown';
  DateTime? _lastStatusChange;
  final StreamController<bool> _statusStream =
      StreamController<bool>.broadcast();

  bool get isOnline => _isOnline;
  String get networkType => _networkType;
  bool get isOffline => !_isOnline;
  DateTime? get lastStatusChange => _lastStatusChange;
  Stream<bool> get statusStream => _statusStream.stream;

  /// Update network status
  void updateStatus(bool online, {String? networkType}) {
    if (_isOnline != online) {
      _isOnline = online;
      _networkType = networkType ?? _networkType;
      _lastStatusChange = DateTime.now();

      _statusStream.add(online);
      notifyListeners();

      final statusMsg = online ? 'Online' : 'Offline';
      debugPrint('[NetworkStatus] Status changed to: $statusMsg');
    }
  }

  /// Get status message for UI
  String getStatusMessage() {
    if (_isOnline) {
      return 'Connected • $_networkType';
    } else {
      return 'Offline • Check connection';
    }
  }

  /// Get status color for UI
  Color getStatusColor() {
    if (_isOnline) {
      return const Color(0xFF25D366); // WhatsApp green
    } else {
      return const Color(0xFFFF6B6B); // Red
    }
  }

  /// Get status icon for UI
  IconData getStatusIcon() {
    if (_isOnline) {
      return Icons.cloud_done;
    } else {
      return Icons.cloud_off;
    }
  }

  /// Check if data is syncing
  bool get shouldShowSyncIndicator => !_isOnline;

  /// Get retry suggestions
  List<String> getRecommendations() {
    if (_isOnline) {
      return [];
    }

    return [
      'Check WiFi connection',
      'Enable mobile data',
      'Move closer to WiFi router',
      'Restart app',
    ];
  }

  /// Dispose resources
  @override
  void dispose() {
    _statusStream.close();
    super.dispose();
  }
}

/// Widget for displaying network status banner
class NetworkStatusBanner extends StatelessWidget {
  final NetworkStatusIndicatorService statusService;
  final bool showDetail;

  const NetworkStatusBanner({
    super.key,
    required this.statusService,
    this.showDetail = false,
  });

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: ValueNotifier(statusService.isOnline),
      builder: (context, isOnline, _) {
        if (isOnline) return const SizedBox.shrink();

        return Container(
          color: statusService.getStatusColor().withOpacity(0.9),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              Icon(
                statusService.getStatusIcon(),
                color: Colors.white,
                size: 20,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      statusService.getStatusMessage(),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                    if (showDetail)
                      Text(
                        'Messages will sync when connected',
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.8),
                          fontSize: 12,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Widget for showing offline indicator on messages
class OfflineMessageIndicator extends StatelessWidget {
  final bool isSynced;
  final bool isSending;

  const OfflineMessageIndicator({
    super.key,
    required this.isSynced,
    required this.isSending,
  });

  @override
  Widget build(BuildContext context) {
    if (isSynced) {
      return const Icon(Icons.check_circle, color: Colors.green, size: 16);
    } else if (isSending) {
      return const SizedBox(
        width: 16,
        height: 16,
        child: CircularProgressIndicator(strokeWidth: 2),
      );
    } else {
      return Tooltip(
        message: 'Waiting to send',
        child: Icon(Icons.schedule, color: Colors.orange.shade600, size: 16),
      );
    }
  }
}

/// Widget for network status dropdown in settings
class NetworkStatusDebugPanel extends StatelessWidget {
  final NetworkStatusIndicatorService statusService;

  const NetworkStatusDebugPanel({super.key, required this.statusService});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Network Status',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    color: statusService.getStatusColor(),
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  statusService.getStatusMessage(),
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ],
            ),
            if (statusService.lastStatusChange != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  'Last changed: ${statusService.lastStatusChange!.toLocal()}',
                  style: Theme.of(context).textTheme.labelSmall,
                ),
              ),
            if (statusService.isOffline &&
                statusService.getRecommendations().isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Try this:',
                      style: Theme.of(context).textTheme.labelSmall,
                    ),
                    ...statusService.getRecommendations().map(
                      (rec) => Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text('• $rec'),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
