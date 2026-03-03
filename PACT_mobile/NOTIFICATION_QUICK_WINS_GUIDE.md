# 🔨 Notification System - Quick Wins & Implementation Guide

**Focus:** High-impact, low-effort improvements (5-10 hours total)

---

## Quick Win 1: Unified Route Manager (3 hours)

### Problem
Routes defined in 2 places:
- `main.dart` NotificationService callback
- `notification_routing_service.dart` handleNotificationTap

### Solution
Create single source of truth

### Implementation

**Create:** `lib/services/notification_route_manager.dart`

```dart
import 'package:flutter/foundation.dart';

/// Unified notification route manager
/// Single source of truth for all notification → route mappings
class NotificationRouteManager {
  static final NotificationRouteManager _instance =
      NotificationRouteManager._internal();

  factory NotificationRouteManager() => _instance;
  NotificationRouteManager._internal();

  /// Parse notification payload and return route + params
  ({String route, Map<String, dynamic> params}) parsePayload(String payload) {
    debugPrint('[RouteManager] Parsing payload: $payload');

    // Chat messages
    if (payload.startsWith('chat:')) {
      final userId = payload.replaceFirst('chat:', '');
      return (route: 'chat', params: {'userId': userId});
    }

    // Incoming calls
    if (payload.startsWith('call:')) {
      final callId = payload.replaceFirst('call:', '');
      return (route: 'call', params: {'callId': callId});
    }

    // Wallet — advances
    if (payload == 'wallet:advances' || payload.startsWith('advance:')) {
      final advanceId = payload.replaceFirst('advance:', '');
      return (
        route: 'wallet',
        params: {'tab': 'advances', if (advanceId.isNotEmpty) 'id': advanceId}
      );
    }

    // Wallet — cost payments
    if (payload == 'wallet:cost_payments' || payload.startsWith('cost:')) {
      final costId = payload.replaceFirst('cost:', '');
      return (
        route: 'wallet',
        params: {'tab': 'cost_payments', if (costId.isNotEmpty) 'id': costId}
      );
    }

    // Cost submission status
    if (payload.startsWith('cost_submission_approved:')) {
      final submissionId = payload.substring(24);
      return (
        route: 'cost_submission_detail',
        params: {'id': submissionId, 'status': 'approved'}
      );
    }
    if (payload.startsWith('cost_submission_rejected:')) {
      final submissionId = payload.substring(24);
      return (
        route: 'cost_submission_detail',
        params: {'id': submissionId, 'status': 'rejected'}
      );
    }
    if (payload.startsWith('cost_submission_revision:')) {
      final submissionId = payload.substring(24);
      return (
        route: 'cost_submission_detail',
        params: {'id': submissionId, 'status': 'revision'}
      );
    }

    // Budget alerts
    if (payload.startsWith('budget_alert:')) {
      final siteVisitId = payload.substring(13);
      return (
        route: 'cost_submission',
        params: {'siteVisitId': siteVisitId}
      );
    }

    // Communications
    if (payload == 'communications') {
      return (route: 'communications', params: {});
    }

    // Notifications panel
    if (payload == 'notifications' ||
        payload == 'broadcast' ||
        payload.startsWith('broadcast:')) {
      return (route: 'notifications', params: {'tab': 'broadcasts'});
    }

    // Offline sync
    if (payload == 'offline_sync_completed') {
      return (route: 'cost_submission', params: {});
    }

    // Updates
    if (payload.startsWith('update:')) {
      return (route: 'system', params: {'action': 'update'});
    }

    // Default: home
    return (route: 'home', params: {});
  }

  /// Get human-readable route name for logging
  String getRouteName(String payload) {
    if (payload.startsWith('chat:')) return 'CHAT';
    if (payload.startsWith('call:')) return 'CALL';
    if (payload.startsWith('wallet:')) return 'WALLET';
    if (payload.startsWith('cost_submission_')) return 'COST_SUBMISSION';
    if (payload.startsWith('budget_alert:')) return 'BUDGET_ALERT';
    if (payload == 'communications') return 'COMMUNICATIONS';
    if (payload == 'notifications' || payload.startsWith('broadcast')) return 'NOTIFICATIONS';
    if (payload.startsWith('update:')) return 'UPDATE';
    return 'HOME';
  }

  /// Test if payload is valid
  bool isValid(String payload) {
    try {
      parsePayload(payload);
      return true;
    } catch (_) {
      return false;
    }
  }
}
```

### Update main.dart

Replace the huge NotificationService callback with:

```dart
// OLD: Replace this entire block (lines ~215-265):
await NotificationService.initialize(
  onNotificationTap: (response) {
    final payload = response.payload;
    if (payload != null) {
      if (payload.startsWith('chat:')) { /* ... 50 lines ... */ }
      // ... tons of if statements
    }
  },
);

// NEW: Replace with this:
await NotificationService.initialize(
  onNotificationTap: (response) {
    final payload = response.payload;
    if (payload != null && payload.isNotEmpty) {
      _handleNotificationNavigation(payload);
    }
  },
);
```

Then add this helper method:

```dart
void _handleNotificationNavigation(String payload) {
  try {
    final router = NotificationRouteManager();
    final (:route, :params) = router.parsePayload(payload);

    debugPrint('[AppNav] Route: $route, Params: $params');

    switch (route) {
      case 'chat':
        navigatorKey.currentState?.pushNamed(
          '/chat',
          arguments: params['userId'],
        );
      case 'call':
        navigatorKey.currentState?.pushNamedAndRemoveUntil(
          '/main',
          (route) => false,
          arguments: {'activeCall': true, 'callId': params['callId']},
        );
      case 'communications':
        navigatorKey.currentState?.pushNamed(
          '/main',
          arguments: {'tab': 0},
        );
      case 'wallet':
        final tab = params['tab'] == 'advances' ? 3 : 4;
        navigatorKey.currentState?.push(
          MaterialPageRoute(
            builder: (_) => WalletScreen(initialTab: tab),
          ),
        );
      case 'cost_submission_detail':
        navigatorKey.currentState?.pushNamed(
          '/cost_submission_detail',
          arguments: {
            'id': params['id'],
            'status': params['status'],
          },
        );
      case 'notifications':
        final ctx = navigatorKey.currentContext;
        if (ctx != null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            NotificationsPanel.show(
              ctx,
              initialTab: params['tab'] ?? 'broadcasts',
            );
          });
        }
      case 'system':
        if (params['action'] == 'update') {
          UpdateService().downloadAndInstallUpdate();
        }
      default:
        navigatorKey.currentState?.pushNamedAndRemoveUntil(
          '/main',
          (route) => route.isFirst,
        );
    }
  } catch (e) {
    debugPrint('[AppNav] Error handling notification: $e');
    navigatorKey.currentState?.pushNamedAndRemoveUntil(
      '/main',
      (route) => route.isFirst,
    );
  }
}
```

### Update NotificationRoutingService

```dart
// In notification_routing_service.dart, replace handleNotificationTap():

void handleNotificationTap({
  required String payload,
  String? title,
  String? body,
}) {
  try {
    // Stop ringtone if playing
    _ringtoneService.stopRingtone();

    // Use unified router
    final router = NotificationRouteManager();
    final (:route, :params) = router.parsePayload(payload);

    // Call navigation callback with parsed route
    _onNotificationTap?.call(route, params);

    debugPrint(
      '[NotificationRouting] Tap handled: $route with $params',
    );
  } catch (e) {
    debugPrint('[NotificationRouting] Error handling tap: $e');
  }
}
```

### Testing

```dart
// Quick unit tests to verify routing
void main() {
  final router = NotificationRouteManager();

  test('Chat payload parsing', () {
    final result = router.parsePayload('chat:user_123');
    expect(result.route, 'chat');
    expect(result.params['userId'], 'user_123');
  });

  test('Wallet advances payload', () {
    final result = router.parsePayload('wallet:advances');
    expect(result.route, 'wallet');
    expect(result.params['tab'], 'advances');
  });

  test('Call payload', () {
    final result = router.parsePayload('call:call_abc');
    expect(result.route, 'call');
    expect(result.params['callId'], 'call_abc');
  });

  test('Broadcast payload', () {
    final result = router.parsePayload('broadcast');
    expect(result.route, 'notifications');
    expect(result.params['tab'], 'broadcasts');
  });

  test('Unknown payload defaults to home', () {
    final result = router.parsePayload('random');
    expect(result.route, 'home');
  });
}
```

### Benefits
- ✅ Single source of truth
- ✅ Easy to add new routes
- ✅ Testable
- ✅ ~200 lines removed from main.dart
- ✅ Consistent behavior

---

## Quick Win 2: Call/Message State Sync (2 hours)

### Problem
When user answers a call, the "incoming call" notification still shows. Clicking it tries to call again.

### Solution
Track when call starts/ends and sync notification state

### Implementation

**Create:** `lib/services/notification_state_sync_service.dart`

```dart
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import './user_notification_service.dart';

/// Syncs notification state with actual events (calls, messages, etc.)
class NotificationStateSyncService {
  static final NotificationStateSyncService _instance =
      NotificationStateSyncService._internal();

  factory NotificationStateSyncService() => _instance;
  NotificationStateSyncService._internal();

  final _supabase = Supabase.instance.client;
  final _notificationService = UserNotificationService();

  /// Call started — add call_id to notification
  Future<void> onCallStarted({
    required String callId,
    required String callerId,
    required String callerName,
  }) async {
    try {
      // Find related call notification
      final notifications = _notificationService.currentNotifications;
      final callNotif = notifications.firstWhere(
        (n) =>
            n.body.contains(callerName) &&
            (n.type == 'incoming_call' || n.type == 'call'),
        orElse: () => throw Exception('Call notification not found'),
      );

      // Link notification to call
      // This way when call ends, we can auto-dismiss this notification
      await _supabase
          .from('notifications')
          .update({'metadata': {'call_id': callId}}).eq('id', callNotif.id);

      debugPrint(
        '[NotificationStateSync] Linked call $callId to notification ${callNotif.id}',
      );
    } catch (e) {
      debugPrint('[NotificationStateSync] Error on call start: $e');
    }
  }

  /// Call answered — auto-dismiss "incoming call" notification
  Future<void> onCallAnswered(String callId) async {
    try {
      // Find notification linked to this call
      final notif = _notificationService.currentNotifications.firstWhere(
        (n) => n.metadata?['call_id'] == callId,
        orElse: () => throw Exception('Notification not found'),
      );

      // Mark as read (this will hide it from list)
      await _notificationService.markAsRead(notif.id);

      debugPrint(
        '[NotificationStateSync] Dismissed notification for answered call',
      );
    } catch (e) {
      debugPrint('[NotificationStateSync] Error on call answered: $e');
    }
  }

  /// Call declined/ended — auto-dismiss notification
  Future<void> onCallEnded(String callId) async {
    try {
      final notif = _notificationService.currentNotifications.firstWhere(
        (n) => n.metadata?['call_id'] == callId,
        orElse: () => throw Exception('Notification not found'),
      );

      await _notificationService.markAsRead(notif.id);

      debugPrint(
        '[NotificationStateSync] Dismissed notification for ended call',
      );
    } catch (e) {
      debugPrint('[NotificationStateSync] Error on call ended: $e');
    }
  }

  /// Chat opened — mark related message notifications as read
  Future<void> onChatOpened(String userId) async {
    try {
      final messageNotifs = _notificationService.currentNotifications
          .where(
            (n) =>
                n.metadata?['sender_id'] == userId &&
                (n.type == 'message' || n.type == 'chat'),
          )
          .toList();

      for (final notif in messageNotifs) {
        await _notificationService.markAsRead(notif.id);
      }

      debugPrint(
        '[NotificationStateSync] Marked ${messageNotifs.length} messages as read',
      );
    } catch (e) {
      debugPrint('[NotificationStateSync] Error on chat opened: $e');
    }
  }
}
```

### Integrate with existing services

**Update CallService/WebRTCService:**

```dart
// When call starts
await NotificationStateSyncService().onCallStarted(
  callId: callId,
  callerId: peer.id,
  callerName: peer.name,
);

// When user answers
await NotificationStateSyncService().onCallAnswered(callId);

// When call ends/declined
await NotificationStateSyncService().onCallEnded(callId);
```

**Update ChatService/ChatScreen:**

```dart
// When chat screen opens
@override
void initState() {
  super.initState();
  NotificationStateSyncService().onChatOpened(widget.userId);
  // ... rest of init
}
```

### Benefits
- ✅ Notifications disappear when action taken
- ✅ No duplicate calls from old notifications
- ✅ Better UX
- ✅ ~40 lines of code

---

## Quick Win 3: Basic Notification Expiration (2 hours)

### Problem
Broadcasts accumulate forever. Old broadcasts clutter the list.

### Solution
Add TTL (time-to-live) based on type

### Implementation

**Update UserNotificationService:**

```dart
// Add these constants at top of file
class _NotificationTTL {
  static const int incomingCallSeconds = 5 * 60; // 5 minutes
  static const int messageSeconds = 30 * 24 * 3600; // 30 days
  static const int broadcastSeconds = 90 * 24 * 3600; // 90 days
  static const int financialSeconds = 365 * 24 * 3600; // 1 year
  static const int systemSeconds = 30 * 24 * 3600; // 30 days

  static int getTTL(String type) {
    return switch (type) {
      'incoming_call' => incomingCallSeconds,
      'message' || 'chat' => messageSeconds,
      'broadcast' => broadcastSeconds,
      'financial' || 'advance' || 'cost_submission' => financialSeconds,
      _ => systemSeconds,
    };
  }
}

// Add method to check expiration
bool _isExpired(UserNotification notif) {
  final ttl = _NotificationTTL.getTTL(notif.type);
  final age = DateTime.now().difference(notif.createdAt).inSeconds;
  return age > ttl;
}

// In _loadFromCache(), filter expired:
Future<void> _loadFromCache() async {
  if (_cacheBox == null) return;
  _notifications.clear();
  for (final key in _cacheBox!.keys) {
    final raw = _cacheBox!.get(key);
    if (raw is Map<String, dynamic>) {
      final notif = UserNotification.fromJson(raw);
      if (!_isExpired(notif)) {
        _notifications.add(notif);
      }
    }
  }
}

// Add cleanup job
Future<void> _cleanupExpired() async {
  try {
    final expiredIds = _notifications
        .where((n) => _isExpired(n))
        .map((n) => n.id)
        .toList();

    if (expiredIds.isEmpty) return;

    // Delete from database
    final sanitizedIds = expiredIds
        .map((id) => '"${id.replaceAll('"', '""')}"')
        .join(',');
    await _supabase
        .from('notifications')
        .delete()
        .filter('id', 'in', '($sanitizedIds)');

    // Remove from cache
    for (final id in expiredIds) {
      await _cacheBox?.delete(id);
    }

    _notifications.removeWhere((n) => expiredIds.contains(n.id));
    _emit();

    debugPrint('[UserNotification] Cleaned up ${"${expiredIds.length}"} expired notifications');
  } catch (e) {
    debugPrint('[UserNotification] Cleanup error: $e');
  }
}

// Call cleanup periodically
void _startCleanupTimer() {
  Timer.periodic(const Duration(hours: 1), (_) {
    _cleanupExpired();
  });
}

// In initialize():
await initialize() async {
  // ... existing code ...
  _startCleanupTimer();
}
```

### Benefits
- ✅ Old data removed automatically
- ✅ Cleaner notifications list
- ✅ Faster queries
- ✅ ~50 lines of code

---

## Quick Win 4: Improved Offline Broadcast Sync (2 hours)

### Problem
If app starts offline, user misses all broadcasts that arrived.

### Solution
Sync broadcasts on startup and when coming online

### Implementation

**Update UserNotificationService:**

```dart
Future<void> initialize() async {
  if (_isInitialized || _isInitializing) {
    if (_isInitialized) _emit();
    return;
  }

  final currentUser = _supabase.auth.currentUser;
  if (currentUser == null) {
    debugPrint('UserNotificationService: No authenticated user');
    return;
  }

  _isInitializing = true;

  try {
    _cacheBox ??= await Hive.openBox<dynamic>(_cacheBoxName);
    await _loadFromCache();
    
    // Sync latest broadcasts (NEW)
    await _syncLatestBroadcasts(currentUser.id);
    
    await _fetchLatest(currentUser.id);
    _subscribeToRealtime(currentUser.id);
    _isInitialized = true;
    _emit();
  } catch (e) {
    debugPrint('UserNotificationService initialize error: $e');
  } finally {
    _isInitializing = false;
  }
}

// Add sync method
Future<void> _syncLatestBroadcasts(String userId) async {
  try {
    // Get timestamp of last notification we have
    final lastNotif = _notifications.isEmpty
        ? null
        : _notifications.reduce((a, b) =>
            a.createdAt.isAfter(b.createdAt) ? a : b);

    final since = lastNotif?.createdAt ?? DateTime.now().subtract(
      const Duration(days: 7),
    );

    debugPrint(
      '[UserNotification] Syncing broadcasts since: $since',
    );

    // Fetch only new broadcasts
    final response = await _supabase
        .from('notifications')
        .select()
        .eq('is_broadcast', true)
        .gte('created_at', since.toIso8601String())
        .order('created_at', ascending: false);

    for (final item in response) {
      final notif = UserNotification.fromJson(item);
      if (!_notifications.any((n) => n.id == notif.id)) {
        _notifications.insert(0, notif);
        await _cacheNotification(notif);
      }
    }

    debugPrint(
      '[UserNotification] Synced ${"${response.length}"} new broadcasts',
    );
  } catch (e) {
    debugPrint('[UserNotification] Sync error: $e');
  }
}

// Listen to connectivity changes
void _listenToConnectivity() {
  // Requires: connectivity_plus package
  final connectivity = Connectivity();
  connectivity.onConnectivityChanged.listen((event) {
    if (event.contains(ConnectivityResult.mobile) ||
        event.contains(ConnectivityResult.wifi)) {
      debugPrint('[UserNotification] Online detected - syncing broadcasts');
      if (_isInitialized) {
        final userId = _supabase.auth.currentUser?.id;
        if (userId != null) {
          _syncLatestBroadcasts(userId);
        }
      }
    }
  });
}

// Call in initialize()
await initialize() async {
  // ... existing code ...
  _listenToConnectivity();
}
```

### Benefits
- ✅ No missed broadcasts
- ✅ Syncs when coming online
- ✅ Uses efficient timestamp-based sync
- ✅ ~60 lines of code

---

## Quick Win 5: Basic Search in NotificationsPanel (1 hour)

### Problem
Can't search for specific notifications. 100 notifications = hard to find one.

### Solution
Add simple text search

### Implementation

**Update NotificationsPanel:**

```dart
class _NotificationsPanelContentState
    extends State<_NotificationsPanelContent> {
  late String _activeTab;
  String _searchQuery = ''; // ADD THIS
  List<UserNotification> _notifications = [];
  // ... rest of existing code ...

  // UPDATE this getter to filter by search:
  List<UserNotification> get _filtered {
    List<UserNotification> list;
    switch (_activeTab) {
      case 'broadcasts':
        list = _notifications.where((n) => n.isBroadcast).toList();
      case 'updates':
        list = _notifications.where((n) => !n.isBroadcast).toList();
      default:
        list = _notifications.toList();
    }

    // ADD: Apply search filter
    if (_searchQuery.isNotEmpty) {
      final query = _searchQuery.toLowerCase();
      list = list.where((n) {
        return n.title.toLowerCase().contains(query) ||
            n.body.toLowerCase().contains(query);
      }).toList();
    }

    list.sort((a, b) {
      int rank(UserNotification n) {
        if (!n.isRead && n.priority == 'urgent') return 0;
        if (!n.isRead && n.priority == 'high') return 1;
        if (!n.isRead) return 2;
        return 3;
      }

      final cmp = rank(a).compareTo(rank(b));
      if (cmp != 0) return cmp;
      return b.createdAt.compareTo(a.createdAt);
    });
    return list;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFFF8FAFC),
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(24),
          topRight: Radius.circular(24),
        ),
      ),
      child: Column(
        children: [
          // Handle bar
          Container(
            margin: const EdgeInsets.only(top: 12, bottom: 4),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey[400],
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          // ADD: Search field
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: TextField(
              onChanged: (value) {
                setState(() => _searchQuery = value);
              },
              decoration: InputDecoration(
                hintText: 'Search notifications...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          setState(() => _searchQuery = '');
                        },
                      )
                    : null,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
          ),

          // Tabs
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _buildTab('All', 'all', _unreadAll),
                _buildTab('Broadcasts', 'broadcasts', _unreadBroadcasts),
                _buildTab('Updates', 'updates', _unreadUpdates),
              ],
            ),
          ),

          // ... rest of existing code ...
        ],
      ),
    );
  }
}
```

### Benefits
- ✅ Find notifications quickly
- ✅ 20 lines of code
- ✅ Instant feedback

---

## Implementation Checklist

### Week 1
- [ ] Create `NotificationRouteManager`
- [ ] Update `main.dart` to use it (remove 50 lines)
- [ ] Update `NotificationRoutingService`
- [ ] Remove duplicate routes from `notification_routing_service.dart`
- [ ] Write unit tests for routing
- [ ] Commit: "Consolidate notification routing"

### Week 2
- [ ] Create `NotificationStateSyncService`
- [ ] Integrate with `CallService`
- [ ] Integrate with `ChatService`
- [ ] Test on actual calls/messages
- [ ] Commit: "Sync notification state with real events"

- [ ] Add TTL to `UserNotificationService`
- [ ] Add cleanup timer
- [ ] Test cleanup works
- [ ] Commit: "Add notification expiration"

- [ ] Add sync method to `UserNotificationService`
- [ ] Add connectivity listener
- [ ] Test offline → online sync
- [ ] Commit: "Improve offline broadcast sync"

- [ ] Add search to `NotificationsPanel`
- [ ] Test filtering works
- [ ] Commit: "Add notification search"

---

## Testing Guide

### Manual Testing

1. **Route Manager**
   ```
   Test payloads:
   - chat:user_123 → Navigate to chat
   - call:call_abc → Answer call dialog
   - wallet:advances → Wallet screen
   - broadcast → Notifications panel
   ```

2. **Call State Sync**
   ```
   - Start call → Notification shows with call_id
   - Answer call → Notification auto-dismissed
   - End call → Notification hidden
   ```

3. **Notification Expiration**
   ```
   - Create test broadcasts with old created_at
   - Run app → Check they disappear after 90 days
   - System logs: "Cleaned up X notifications"
   ```

4. **Offline Sync**
   ```
   - Start app offline → broadcasts not loaded
   - Go online → broadcasts sync (check logs)
   - Compare timestamps → only fetch new ones
   ```

5. **Search**
   ```
   - Type in search box → list filters
   - Search "financial" → shows payment broadcasts only
   - Clear search → all return
   ```

### Unit Tests

```dart
void main() {
  group('NotificationRouteManager', () {
    final router = NotificationRouteManager();

    test('parses chat payload', () {
      final result = router.parsePayload('chat:user123');
      expect(result.route, 'chat');
      expect(result.params['userId'], 'user123');
    });

    test('parses wallet payload', () {
      final result = router.parsePayload('wallet:advances');
      expect(result.route, 'wallet');
      expect(result.params['tab'], 'advances');
    });

    test('handles invalid payload', () {
      final result = router.parsePayload('invalid');
      expect(result.route, 'home');
    });
  });
}
```

---

## Timeline & Estimate

| Task | Hours | Days | Priority |
|------|-------|------|----------|
| Route Manager | 3 | 1 | P0 |
| Call State Sync | 2 | 0.5 | P1 |
| Notification TTL | 2 | 0.5 | P1 |
| Offline Sync | 2 | 0.5 | P1 |
| Search | 1 | 0.25 | P2 |
| Testing | 3 | 1 | P0 |
| **TOTAL** | **13** | **~3.75 days** | |

---

## Next Steps

1. **This week:** Implement Route Manager (enables all routing fixes)
2. **Next week:** Add Call State Sync (improves UX)
3. **Week 3:** Add TTL + Offline Sync (improves stability)
4. **After stabilization:** Begin Priority 2 work (delivery confirmation, analytics)

All of these are high-impact, low-risk changes that will significantly improve the notification system with minimal code changes.
