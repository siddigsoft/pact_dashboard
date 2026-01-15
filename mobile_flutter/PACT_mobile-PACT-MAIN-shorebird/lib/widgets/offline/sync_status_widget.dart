import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../providers/offline_provider.dart';
import '../services/offline/models.dart';

/// Displays current sync status and provides quick sync button
class SyncStatusBar extends ConsumerWidget {
  final VoidCallback? onSyncPressed;

  const SyncStatusBar({super.key, this.onSyncPressed});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(offlineStatsStreamProvider);
    final syncResultAsync = ref.watch(syncCompleteProvider);

    return statsAsync.when(
      data: (stats) {
        final isOffline = !stats.isOnline;
        final hasPending = stats.totalPending > 0;

        return Container(
          color: isOffline ? Colors.orange[50] : Colors.green[50],
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              // Status indicator
              Icon(
                isOffline ? Icons.cloud_off : Icons.cloud_done,
                color: isOffline ? Colors.orange : Colors.green,
                size: 20,
              ),
              const SizedBox(width: 12),

              // Status text
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      isOffline ? 'Offline Mode' : 'Online',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: isOffline
                            ? Colors.orange[900]
                            : Colors.green[900],
                      ),
                    ),
                    if (hasPending)
                      Text(
                        '${stats.totalPending} pending sync',
                        style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                      ),
                  ],
                ),
              ),

              // Sync button
              if (hasPending)
                SizedBox(
                  height: 32,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      ref.read(syncNotifierProvider.notifier).forceSync();
                      onSyncPressed?.call();
                    },
                    icon: const Icon(Icons.sync, size: 16),
                    label: const Text('Sync'),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
      loading: () {
        return Container(
          color: Colors.blue[50],
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              const SizedBox(width: 12),
              const Text('Checking sync status...'),
            ],
          ),
        );
      },
      error: (error, st) {
        return Container(
          color: Colors.red[50],
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Text('Sync error: $error'),
        );
      },
    );
  }
}

/// Toast-style progress indicator for ongoing syncs
class SyncProgressToast extends ConsumerWidget {
  const SyncProgressToast({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final progressAsync = ref.watch(syncProgressProvider);

    return progressAsync.when(
      data: (progress) {
        return Positioned(
          bottom: 24,
          left: 16,
          right: 16,
          child: Material(
            elevation: 4,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.grey[900],
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(
                          valueColor: AlwaysStoppedAnimation(Colors.blue[400]),
                          strokeWidth: 2,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              'Syncing ${progress.phase}...',
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              progress.message ?? '',
                              style: TextStyle(
                                color: Colors.grey[300],
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  // Progress bar
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: progress.percentage / 100,
                      backgroundColor: Colors.grey[700],
                      valueColor: AlwaysStoppedAnimation(Colors.blue[400]),
                      minHeight: 4,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${progress.percentage}% (${progress.current}/${progress.total})',
                    style: TextStyle(color: Colors.grey[400], fontSize: 11),
                  ),
                ],
              ),
            ),
          ),
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (error, st) => const SizedBox.shrink(),
    );
  }
}

/// Compact sync indicator with stats
class UberSyncIndicator extends ConsumerWidget {
  final VoidCallback? onPressed;

  const UberSyncIndicator({super.key, this.onPressed});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(offlineStatsStreamProvider);
    final syncResultAsync = ref.watch(syncNotifierProvider);

    return statsAsync.when(
      data: (stats) {
        final isSyncing = syncResultAsync is AsyncLoading;
        final hasPending = stats.totalPending > 0;

        if (!hasPending && !isSyncing) {
          return const SizedBox.shrink();
        }

        return GestureDetector(
          onTap: () {
            ref.read(syncNotifierProvider.notifier).forceSync();
            onPressed?.call();
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.orange[100],
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.orange[300]!),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (isSyncing)
                  SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation(Colors.orange[600]),
                    ),
                  )
                else
                  Icon(Icons.cloud_upload, size: 16, color: Colors.orange[600]),
                const SizedBox(width: 8),
                Text(
                  '${stats.totalPending} pending',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Colors.orange[900],
                  ),
                ),
              ],
            ),
          ),
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (error, st) => const SizedBox.shrink(),
    );
  }
}

/// Badge showing number of queued requests
class OfflineQueueBadge extends ConsumerWidget {
  const OfflineQueueBadge({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final queueAsync = ref.watch(queuedRequestsProvider);

    return queueAsync.when(
      data: (status) {
        final pending = status['pending'] as int;
        if (pending == 0) {
          return const SizedBox.shrink();
        }

        return Positioned(
          top: 0,
          right: 0,
          child: Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: Colors.red,
              borderRadius: BorderRadius.circular(10),
            ),
            constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
            child: Text(
              pending > 99 ? '99+' : '$pending',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),
          ),
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (error, st) => const SizedBox.shrink(),
    );
  }
}

/// Banner showing offline status
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(offlineStatsStreamProvider);

    return statsAsync.when(
      data: (stats) {
        if (stats.isOnline) {
          return const SizedBox.shrink();
        }

        return Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.orange[400],
            border: Border(bottom: BorderSide(color: Colors.orange[600]!)),
          ),
          child: Row(
            children: [
              Icon(Icons.cloud_off, color: Colors.white, size: 20),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'You are offline. Your changes will sync automatically.',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (error, st) => const SizedBox.shrink(),
    );
  }
}
