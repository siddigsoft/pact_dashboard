import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:pact_mobile/services/offline_notifications_service.dart';

void main() {
  group('OfflineNotificationsService Integration Tests', () {
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

    test('Queue persistence stores notifications', () async {
      final queued = await service.queueNotification(
        title: 'Test notification',
        body: 'Test body',
        type: 'chat',
      );
      expect(queued, true);

      final notifications = await service.getQueuedNotifications();
      expect(notifications.length, 1);
      expect(notifications.first['title'], 'Test notification');
    });

    test('Queue count increases with notifications', () async {
      final size1 = await service.getQueueSize();

      await service.queueNotification(
        title: 'First',
        body: 'Body',
        type: 'chat',
      );

      final size2 = await service.getQueueSize();
      expect(size2, size1 + 1);
    });

    test('Storage limits enforced at MAX_QUEUE_SIZE', () async {
      // Add more than allowed
      for (int i = 0; i < 510; i++) {
        await service.queueNotification(
          title: 'Test $i',
          body: 'Body $i',
          type: 'chat',
        );
      }

      final size = await service.getQueueSize();
      expect(size, lessThanOrEqualTo(500));
    });

    test('DND settings stored and retrieved', () async {
      await service.saveDndSettings(
        dndEnabled: true,
        startTime: TimeOfDay(hour: 21, minute: 0),
        endTime: TimeOfDay(hour: 8, minute: 0),
      );

      final settings = await service.getDndSettings();
      expect(settings['dndEnabled'], true);
    });

    test('Multiple notifications can be queued', () async {
      for (int i = 0; i < 5; i++) {
        final queued = await service.queueNotification(
          title: 'Notification $i',
          body: 'Body $i',
          type: 'chat',
        );
        expect(queued, true);
      }

      final notifications = await service.getQueuedNotifications();
      expect(notifications.length, 5);
    });

    test('Priority levels are respected', () async {
      final urgent = await service.queueNotification(
        title: 'Urgent call',
        body: 'Incoming call',
        type: 'call',
        priority: NotificationPriority.urgent,
      );

      final normal = await service.queueNotification(
        title: 'Chat message',
        body: 'You have a new message',
        type: 'chat',
        priority: NotificationPriority.normal,
      );

      expect(urgent, true);
      expect(normal, true);

      final notifications = await service.getQueuedNotifications();
      expect(notifications.length, 2);
    });

    test('Mark notification as synced', () async {
      await service.queueNotification(
        title: 'To sync',
        body: 'Waiting to sync',
        type: 'chat',
      );

      final notifications = await service.getQueuedNotifications();
      expect(notifications.length, 1);
      expect(notifications.first['synced'], false);

      final notificationId = notifications.first['id'] as String;
      await service.markAsSynced(notificationId);

      final updated = await service.getQueuedNotifications();
      expect(updated.length, 1);
      expect(updated.first['synced'], true);
    });

    test('Clear synced notifications removes synced items', () async {
      // Queue two notifications
      await service.queueNotification(
        title: 'First',
        body: 'Body 1',
        type: 'chat',
      );
      await service.queueNotification(
        title: 'Second',
        body: 'Body 2',
        type: 'chat',
      );

      // Mark first as synced
      final notifications = await service.getQueuedNotifications();
      await service.markAsSynced(notifications.first['id'] as String);

      // Clear synced
      await service.clearSyncedNotifications();

      final remaining = await service.getQueuedNotifications();
      expect(remaining.length, 1);
      expect(remaining.first['synced'], false);
    });

    test('Clear all empties queue', () async {
      await service.queueNotification(title: 'One', body: 'Body', type: 'chat');
      await service.queueNotification(title: 'Two', body: 'Body', type: 'chat');

      final before = await service.getQueuedNotifications();
      expect(before.length, 2);

      await service.clearAll();

      final after = await service.getQueuedNotifications();
      expect(after.isEmpty, true);
    });

    test('DND suppresses non-urgent notifications', () async {
      // Set DND active for current time
      await service.saveDndSettings(
        dndEnabled: true,
        startTime: TimeOfDay(hour: 0, minute: 0),
        endTime: TimeOfDay(hour: 23, minute: 59),
      );

      // Queue normal notification (should be suppressed)
      await service.queueNotification(
        title: 'Normal during DND',
        body: 'Body',
        type: 'chat',
        priority: NotificationPriority.normal,
      );

      final notifications = await service.getQueuedNotifications();
      expect(notifications.first['dnd_suppressed'], true);
    });

    test('DND does not suppress urgent notifications', () async {
      // Set DND active
      await service.saveDndSettings(
        dndEnabled: true,
        startTime: TimeOfDay(hour: 0, minute: 0),
        endTime: TimeOfDay(hour: 23, minute: 59),
      );

      // Queue urgent notification (should NOT be suppressed)
      await service.queueNotification(
        title: 'Urgent during DND',
        body: 'Urgent call',
        type: 'call',
        priority: NotificationPriority.urgent,
      );

      final notifications = await service.getQueuedNotifications();
      expect(notifications.first['dnd_suppressed'], false);
    });
  });
}
