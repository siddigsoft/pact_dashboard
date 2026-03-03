# Offline Notifications System - API Documentation

## Overview

The Offline Notifications System provides comprehensive offline support for notifications, chats, calls, and status updates. It automatically queues items when the device is offline and syncs them when connectivity is restored.

## Core Components

### 1. OfflineNotificationsService
Main service for managing offline notifications queue.

#### Initialization
```dart
final service = OfflineNotificationsService();
await service.initialize();
```

#### Queue Notification
```dart
final queued = await service.queueNotification(
  title: 'Message from John',
  body: 'Hey, how are you?',
  type: 'chat',  // 'chat', 'call', 'update'
  data: {'senderId': '123'},
  priority: NotificationPriority.normal,
);
```

**Parameters:**
- `title` (String): Notification title
- `body` (String): Notification body
- `type` (String): One of 'chat', 'call', 'update'
- `data` (Map?): Additional metadata
- `priority` (NotificationPriority): low, normal, high, urgent

**Returns:** `bool` - True if queued successfully

#### Get Queued Notifications
```dart
final notifications = await service.getQueuedNotifications();
// Returns list of Map<String, dynamic>
```

#### Mark as Synced
```dart
await service.markAsSynced(notificationId);
```

#### Clear Synced Notifications
```dart
await service.clearSyncedNotifications();
```

#### Get Queue Size
```dart
final size = await service.getQueueSize();
```

#### Streams
```dart
// Listen to queue count changes
service.queueCountStream.listen((count) {
  print('Queue size: $count');
});

// Listen to sync status changes
service.syncStatusStream.listen((status) {
  print('Sync status: $status');  // idle, syncing, success, failed, partiallyFailed
});
```

#### DND (Do Not Disturb) Settings
```dart
// Save DND settings
await service.saveDndSettings(
  dndEnabled: true,
  startTime: TimeOfDay(hour: 22, minute: 0),
  endTime: TimeOfDay(hour: 8, minute: 0),
);

// Get DND settings
final settings = await service.getDndSettings();
```

#### Auto-Sync Callback
```dart
service.onConnectivityRestored(() async {
  // Called automatically when network is restored
  print('Network restored, syncing...');
});
```

### 2. OfflineNotificationRetryHandler
Manages retry logic with exponential backoff.

```dart
final retryHandler = OfflineNotificationRetryHandler();

// Check if should retry
if (retryHandler.shouldRetry(notificationId)) {
  // Retry logic
}

// Record retry attempt (automatically calculates backoff)
retryHandler.recordRetryAttempt(notificationId);

// Get retry count
final count = retryHandler.getRetryCount(notificationId);

// Get next delay
final delay = retryHandler.getNextDelay(retryCount);
// Exponential backoff: 5s → 10s → 20s → ...

// Metrics
final metrics = RetryMetrics();
metrics.recordSuccess();
print('Success rate: ${metrics.successRate}%');
```

**Constants:**
- `MAX_RETRIES`: 3
- `INITIAL_DELAY`: 5 seconds

### 3. OfflineQueueManager
Manages multi-type offline queues with priority handling.

```dart
// Create queue item
final item = OfflineQueueManager.createQueueItem(
  id: '1',
  type: 'call_signal',  // notification, chat_message, call_signal, status_update
  title: 'Incoming Call',
  body: 'From John',
  timestamp: DateTime.now(),
  priority: 4,
);

// Sort by priority
final sorted = OfflineQueueManager.sortByPriority(items);
// Order: call_signal > notification > chat_message > status_update

// Check if item can be queued
final canQueue = OfflineQueueManager.canQueue(currentSize, maxSize, type);

// Cleanup old items
final cleaned = OfflineQueueManager.cleanupOldItems(
  items,
  Duration(days: 7),
  typeFilter: 'chat_message',
);
```

**Priority Weights:**
```
call_signal: 4 (highest)
notification: 3
chat_message: 2
status_update: 1 (lowest)
```

### 4. OfflineNotificationsSyncOrchestrator
Coordinates retry logic with sync pipeline.

```dart
final orchestrator = OfflineNotificationsSyncOrchestrator();
await orchestrator.initialize(notificationBox);

// Orchestrate sync with retry
final synced = await orchestrator.orchestrateSync(
  (notification) async {
    // Your sync logic here
    return await sendToServer(notification);
  },
  retryFailed: true,
  maxRetries: 3,
);

// Track progress
orchestrator.syncProgressStream.listen((progress) {
  print('${progress.completed}/${progress.total} synced');
  print('Progress: ${progress.progress * 100}%');
});

// Manually retry
final success = await orchestrator.retryNotification(
  notificationId,
  syncFunction,
);

// Get metrics
final metrics = orchestrator.metrics;
print('Retry stats: ${metrics.successRate}% success rate');
```

### 5. BackgroundSyncScheduler
Schedules periodic background sync tasks.

```dart
// Initialize background sync (runs every 15 minutes)
await BackgroundSyncScheduler.initialize(
  syncInterval: Duration(minutes: 15),
  retryInterval: Duration(minutes: 5),
);

// Trigger manual sync
await BackgroundSyncScheduler.triggerManualSync();

// Get status
final status = await BackgroundSyncScheduler.getStatus();

// Cancel all tasks
await BackgroundSyncScheduler.cancelAll();

// Cancel specific task
await BackgroundSyncScheduler.cancelTask('offline_sync_task');
```

## Enums

### NotificationPriority
```dart
enum NotificationPriority { low, normal, high, urgent }
```

### NotificationSyncStatus
```dart
enum NotificationSyncStatus { 
  idle,           // No sync in progress
  syncing,        // Currently syncing
  success,        // Last sync succeeded
  failed,         // Last sync failed
  partiallyFailed // Some items failed
}
```

## Architecture Diagram

```
Network Status Change
         ↓
OnConnectivityRestored Callback
         ↓
OfflineNotificationsSyncOrchestrator
         ↓
    ↙        ↘
Retry Handler  QueueManager
    (backoff)     (priority)
         ↓
Sync Handler (actual server call)
         ↓
Mark as Synced / Record Failure
```

## Constants

```dart
// Queue Manager
MAX_QUEUE_SIZE = 500
HIGH_WATER_MARK = 400
RETENTION_PERIOD = Duration(days: 7)

// Retry Handler
MAX_RETRIES = 3
INITIAL_DELAY = Duration(seconds: 5)

// Background Sync
DEFAULT_SYNC_INTERVAL = Duration(minutes: 15)
DEFAULT_RETRY_INTERVAL = Duration(minutes: 5)
```

## Example Usage

### Complete Offline Flow

```dart
// 1. Initialize service
final service = OfflineNotificationsService();
await service.initialize();

// 2. Initialize scheduler
await BackgroundSyncScheduler.initialize();

// 3. Queue notification when offline
await service.queueNotification(
  title: 'Message',
  body: 'You have a new message',
  type: 'chat',
);

// 4. Listen to updates
service.queueCountStream.listen((count) {
  updateUI('Queue: $count');
});

// 5. Setup sync orchestrator
final orchestrator = OfflineNotificationsSyncOrchestrator();
await orchestrator.initialize(notificationBox);

// 6. When connectivity restored, sync automatically
service.onConnectivityRestored(() async {
  final synced = await orchestrator.orchestrateSync(
    (notification) => sendToServer(notification),
  );
  print('Synced $synced notifications');
});

// 7. Handle failures with retries (automatic via orchestrator)
// Manual retry if needed:
await orchestrator.retryNotification(failedId, syncHandler);
```

## Error Handling

```dart
try {
  await service.queueNotification(
    title: 'Test',
    body: 'Body',
    type: 'chat',
  );
} catch (e) {
  print('Failed to queue: $e');
}
```

## Performance Characteristics

- Queue 1000 items: ~5 seconds
- Retrieve 500 items: ~1 second  
- Sort 500 prioritized items: ~500ms
- DND check on 10000 items: ~2 seconds
- Stream listener creation (50 listeners): ~100ms

## Best Practices

1. **Always initialize** before use:
   ```dart
   await service.initialize();
   ```

2. **Handle streams properly**:
   ```dart
   final subscription = service.queueCountStream.listen((count) {
     // Handle count
   });
   // Remember to cancel when done
   subscription.cancel();
   ```

3. **Use priority levels wisely**:
   - Calls: `urgent`
   - Chat messages: `normal`
   - Status updates: `low`

4. **Cleanup old notifications** periodically:
   ```dart
   // Automatic via service, or manual:
   final cleaned = OfflineQueueManager.cleanupOldItems(
     items,
     Duration(days: 7),
   );
   ```

5. **Monitor retry metrics**:
   ```dart
   print('Success rate: ${orchestrator.metrics.successRate}%');
   print('Recent failures: ${orchestrator.metrics.recentFailures}');
   ```

## Troubleshooting

### Queue not syncing
- Check connectivity status: `service.isOnline`
- Verify sync callback is registered: `service.onConnectivityRestored(...)`
- Check retry count: `orchestrator.getRetryCount(id)`

### DND not working
- Verify DND is enabled: `settings['dndEnabled']`
- Check time range: `settings['startTime']` and `settings['endTime']`
- Ensure notification priority is normal or below

### Performance issues
- Check queue size: `await service.getQueueSize()`
- If >400, cleanup old notifications: `await service.clearSyncedNotifications()`
- Monitor subscriber count on streams

## Testing

See `test/offline_notifications_integration_test.dart` for unit tests.
See `test/offline_notifications_performance_test.dart` for performance benchmarks.

Run tests:
```bash
flutter test test/offline_notifications_integration_test.dart
flutter test test/offline_notifications_performance_test.dart
```
