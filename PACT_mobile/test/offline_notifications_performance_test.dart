import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:pact_mobile/services/offline_notifications_service.dart';
import 'package:pact_mobile/services/offline_queue_manager.dart';
import 'package:pact_mobile/services/offline_notifications_retry_handler.dart';

void main() {
  group('Offline Notifications Performance Tests', () {
    late OfflineNotificationsService service;

    setUp(() async {
      await Hive.initFlutter();
      service = OfflineNotificationsService();
      await service.initialize();
    });

    tearDown(() async {
      service.dispose();
      await Hive.deleteBoxFromDisk('offline_notifications_queue');
      await Hive.deleteBoxFromDisk('notification_metrics');
      await Hive.deleteBoxFromDisk('dnd_settings');
    });

    test('Performance: Queue 1000 notifications under 5 seconds', () async {
      final stopwatch = Stopwatch()..start();

      for (int i = 0; i < 1000; i++) {
        await service.queueNotification(
          title: 'Perf Test $i',
          body: 'Performance benchmark notification',
          type: 'chat',
        );
      }

      stopwatch.stop();
      expect(
        stopwatch.elapsedMilliseconds,
        lessThan(5000),
        reason:
            'Queueing 1000 notifications took ${stopwatch.elapsedMilliseconds}ms',
      );
    });

    test('Performance: Retrieve 500 notifications under 1 second', () async {
      // Queue 500
      for (int i = 0; i < 500; i++) {
        await service.queueNotification(
          title: 'Item $i',
          body: 'Body',
          type: 'chat',
        );
      }

      final stopwatch = Stopwatch()..start();
      final notifications = await service.getQueuedNotifications();
      stopwatch.stop();

      expect(notifications.length, 500);
      expect(
        stopwatch.elapsedMilliseconds,
        lessThan(1000),
        reason:
            'Retrieving 500 notifications took ${stopwatch.elapsedMilliseconds}ms',
      );
    });

    test('Performance: Sort 500 mixed-priority items under 500ms', () async {
      final items = <Map<String, dynamic>>[];

      // Create mixed types with different priorities
      for (int i = 0; i < 500; i++) {
        final type = i % 4 == 0
            ? 'call_signal'
            : i % 3 == 0
            ? 'notification'
            : i % 2 == 0
            ? 'chat_message'
            : 'status_update';

        items.add({
          'id': '$i',
          'type': type,
          'title': 'Item $i',
          'timestamp': DateTime.now()
              .subtract(Duration(seconds: i))
              .toIso8601String(),
        });
      }

      final stopwatch = Stopwatch()..start();
      final sorted = OfflineQueueManager.sortByPriority(items);
      stopwatch.stop();

      expect(sorted.length, 500);
      expect(
        sorted.first['type'],
        'call_signal',
        reason: 'Call signals should be first',
      );
      expect(
        stopwatch.elapsedMilliseconds,
        lessThan(500),
        reason: 'Sorting 500 items took ${stopwatch.elapsedMilliseconds}ms',
      );
    });

    test(
      'Performance: Retry retry handler with 100 items under 100ms',
      () async {
        final retryHandler = OfflineNotificationRetryHandler();

        final stopwatch = Stopwatch()..start();

        for (int i = 0; i < 100; i++) {
          retryHandler.recordRetryAttempt('item_$i');
          retryHandler.shouldRetry('item_$i');
        }

        stopwatch.stop();

        expect(
          stopwatch.elapsedMilliseconds,
          lessThan(100),
          reason: 'Retry handler ops took ${stopwatch.elapsedMilliseconds}ms',
        );
      },
    );

    test('Performance: Clear synced from 500 items under 500ms', () async {
      // Queue 500 and mark half as synced
      for (int i = 0; i < 500; i++) {
        await service.queueNotification(
          title: 'Item $i',
          body: 'Body',
          type: 'chat',
        );
      }

      // Mark half as synced
      final notifications = await service.getQueuedNotifications();
      for (int i = 0; i < 250; i++) {
        await service.markAsSynced(notifications[i]['id'] as String);
      }

      final stopwatch = Stopwatch()..start();
      await service.clearSyncedNotifications();
      stopwatch.stop();

      final remaining = await service.getQueuedNotifications();
      expect(remaining.length, 250);
      expect(
        stopwatch.elapsedMilliseconds,
        lessThan(500),
        reason: 'Clearing synced took ${stopwatch.elapsedMilliseconds}ms',
      );
    });

    test('Performance: Memory usage with 100 notifications', () async {
      for (int i = 0; i < 100; i++) {
        await service.queueNotification(
          title: 'Item $i',
          body: 'This is a test notification body with some content $i',
          type: 'chat',
          data: {
            'key1': 'value1',
            'key2': 'value2',
            'nested': {'inner': 'data'},
          },
        );
      }

      final notifications = await service.getQueuedNotifications();
      expect(notifications.length, 100);

      // Calculate approximate size
      int totalSize = 0;
      for (final n in notifications) {
        totalSize += (n.toString().length); // Rough estimate of serialized size
      }

      final avgSize = totalSize ~/ 100;
      expect(avgSize, greaterThan(0));
      print('Average notification size: ~$avgSize bytes');
    });

    test(
      'Performance: DND operations on 10000 checks under 2 seconds',
      () async {
        await service.saveDndSettings(
          dndEnabled: true,
          startTime: const TimeOfDay(hour: 22, minute: 0),
          endTime: const TimeOfDay(hour: 8, minute: 0),
        );

        final stopwatch = Stopwatch()..start();

        for (int i = 0; i < 10000; i++) {
          await service.getDndSettings();
        }

        stopwatch.stop();

        expect(
          stopwatch.elapsedMilliseconds,
          lessThan(2000),
          reason: 'DND operations took ${stopwatch.elapsedMilliseconds}ms',
        );
      },
    );

    test('Performance: Batch queue operations - 100 items in 500ms', () async {
      final stopwatch = Stopwatch()..start();

      for (int i = 0; i < 100; i++) {
        await service.queueNotification(
          title: 'Batch $i',
          body: 'Batch operation test',
          type: i % 3 == 0 ? 'call' : 'chat',
          priority: i % 2 == 0
              ? NotificationPriority.urgent
              : NotificationPriority.normal,
        );
      }

      stopwatch.stop();

      expect(
        stopwatch.elapsedMilliseconds,
        lessThan(500),
        reason: 'Batch queueing took ${stopwatch.elapsedMilliseconds}ms',
      );

      final count = await service.getQueueSize();
      expect(count, 100);
    });

    test(
      'Performance: Stream listeners with 50 concurrent subscribers',
      () async {
        final stopwatch = Stopwatch()..start();

        final subscriptions = <void>[];

        for (int i = 0; i < 50; i++) {
          subscriptions.add(service.queueCountStream.listen((_) {}));
          subscriptions.add(service.syncStatusStream.listen((_) {}));
        }

        stopwatch.stop();

        expect(
          stopwatch.elapsedMilliseconds,
          lessThan(100),
          reason:
              'Creating 100 subscriptions took ${stopwatch.elapsedMilliseconds}ms',
        );

        // Cleanup
        for (final sub in subscriptions) {
          // Note: subscriptions are dynamic, actual cleanup would be different
        }
      },
    );
  });
}
