# Notification Sync Status Enhancement

## Overview
Enhanced `OfflineNotificationsService` with comprehensive sync status tracking and real-time stream updates for better visibility into notification synchronization operations.

## Key Enhancements

### 1. Stream Controllers Added
- **`syncStatusStream`**: Broadcasts `NotificationSyncStatus` updates during sync operations
  - States: `idle`, `syncing`, `success`, `failed`, `partiallyFailed`
  - Subscribers can listen for real-time status changes
  - Enables UI indicators (loading spinners, success checkmarks, error badges)

### 2. Sync Status Enum
```dart
enum NotificationSyncStatus {
  idle,           // No sync in progress
  syncing,        // Actively syncing notifications
  success,        // All notifications synced successfully
  failed,         // All sync attempts failed
  partiallyFailed // Some succeeded, some failed
}
```

### 3. Enhanced syncOfflineNotifications() Method
The method now:
- **Emits status updates** at key points (start, end of sync)
- **Tracks metrics** including:
  - `totalSynced`: Count of successfully synced notifications
  - `totalFailed`: Count of failed sync attempts
  - `lastSyncTime`: ISO 8601 timestamp of last sync
  - `averageSyncTimeMs`: Average time per notification sync
- **Distinguishes failure modes**:
  - Complete failure → `NotificationSyncStatus.failed`
  - Partial success → `NotificationSyncStatus.partiallyFailed`
  - Full success → `NotificationSyncStatus.success`
- **Measures performance** with sync duration tracking
- **Returns accurate count** of actually synced notifications

### 4. Metrics Tracking
New metrics tracked in Hive box `notification_metrics`:
```dart
{
  'totalQueued': int,           // Total notifications ever queued
  'totalSynced': int,           // Total successfully synced
  'totalFailed': int,           // Total sync failures
  'lastSyncTime': String,       // ISO 8601 timestamp
  'averageSyncTimeMs': int,     // Performance metric
}
```

## Integration Example

### Using in ConnectivityService
```dart
// When connectivity restored
_offlineNotificationsService.syncOfflineNotifications((notification) {
  return _supabaseService.insertNotification(notification);
});
```

### Listening to Sync Status in UI
```dart
StreamBuilder<NotificationSyncStatus>(
  stream: _offlineNotificationsService.syncStatusStream,
  builder: (context, snapshot) {
    final status = snapshot.data ?? NotificationSyncStatus.idle;
    
    return switch(status) {
      NotificationSyncStatus.idle => Icon(Icons.done),
      NotificationSyncStatus.syncing => CircularProgressIndicator(),
      NotificationSyncStatus.success => Icon(Icons.check_circle, color: Colors.green),
      NotificationSyncStatus.failed => Icon(Icons.error, color: Colors.red),
      NotificationSyncStatus.partiallyFailed => Icon(Icons.warning, color: Colors.orange),
    };
  },
)
```

## Data Flow

```
┌─ Connection Restored
│
├─ Trigger syncOfflineNotifications()
│
├─ Emit: syncStatusStream → syncing
│
├─ For each queued notification:
│  ├─ Call syncFunction() (UserSupabase insert)
│  ├─ Mark as synced if successful
│  ├─ Track success/failure
│  └─ Update metrics
│
├─ Emit: syncStatusStream → [success|failed|partiallyFailed]
│
└─ Return synced count
```

## Status Transitions

```
idle
  ↓
syncing (sync starts)
  ↓
[success|failed|partiallyFailed] (sync completes)
  ↓
idle (wait for next sync trigger)
```

## Error Handling

- **Individual notification failure**: Tracked in metrics, doesn't stop sync
- **Entire sync failure**: Caught in try-catch, emits `failed` status
- **Partial failures**: Correctly identified and status set to `partiallyFailed`
- **Retry tracking**: Failed notifications can be retried via `retryFailedNotifications()`

## Performance Characteristics

- **Averaging**: Sum of all notification sync times / count synced
- **Duration measurement**: Total time for all sync operations
- **Efficient tracking**: Metrics stored once after complete sync

## Testing Recommendations

### Unit Tests
```dart
test('syncStatusStream emits syncing then success', () async {
  final service = OfflineNotificationsService();
  await service.initialize();
  
  // Queue a notification
  await service.queueNotification(
    title: 'Test',
    body: 'Body',
    type: 'test',
  );
  
  // Listen to stream
  final statuses = <NotificationSyncStatus>[];
  service.syncStatusStream.listen(statuses.add);
  
  // Trigger sync
  await service.syncOfflineNotifications((n) async {
    // Mock sync function
  });
  
  // Verify sequence
  expect(statuses, [
    NotificationSyncStatus.syncing,
    NotificationSyncStatus.success,
  ]);
});
```

### Integration Tests
1. Queue notifications while offline + trigger sync on reconnect
2. Simulate sync failures + verify partial sync status
3. Monitor queue count stream while syncing
4. Verify metrics updated correctly after sync

### Manual Testing
1. **Success path**: Queue notification → Restore connection → Verify stream emits success and metrics updated
2. **Failure path**: Queue notification → With network error → Verify stream emits failed
3. **Partial failure**: Queue 5 notifications → Simulate 3 syncs failing → Verify partiallyFailed
4. **Metrics**: After successful sync, check _metricsBox contains updated lastSyncTime and averageSyncTimeMs

## Related Changes

- **Notification Priority Enum**: Added to support urgent vs. normal distinction in DND handling
- **Storage Limits**: MAX_QUEUE_SIZE prevents unbounded growth
- **Queue Count Stream**: Real-time queue size for UI badge updates
- **Cleanup Logic**: Automatic removal of old notifications (7-day retention)
- **Retry Logic**: Failed notifications can be manually retried with exponential backoff

## Next Steps

1. **UI Integration**: Add StreamBuilder listeners in Settings/Dashboard screens
2. **ConnectivityService Integration**: Hook sync trigger to connectivity restoration events
3. **SyncManager Integration**: Move OfflineNotifications into main sync pipeline
4. **Metrics Dashboard**: Optional UI to display sync statistics
5. **Logging & Monitoring**: Enhanced debug logs for production support

## Files Modified

- `lib/services/offline_notifications_service.dart`:
  - Added `NotificationSyncStatus` enum
  - Enhanced `syncOfflineNotifications()` method with stream emissions and metrics
  - Added sync duration and performance tracking

## API Reference

### Public Properties
```dart
Stream<NotificationSyncStatus> get syncStatusStream
// Broadcast stream of sync status updates
```

### Public Methods
```dart
Future<int> syncOfflineNotifications(
  Future<void> Function(Map<String, dynamic> notification) syncFunction,
)
// Syncs all queued notifications, returns count of successfully synced
```

### Metrics Box Keys
```dart
'totalQueued'        // Total notifications ever queued
'totalSynced'        // Total successfully synced
'totalFailed'        // Total failed synced attempts
'lastSyncTime'       // ISO 8601 timestamp
'averageSyncTimeMs'  // Average sync time per notification
```
