# End-to-End Testing Guide: Offline Notifications System

**Created**: February 24, 2026  
**Status**: Ready for Manual Testing  
**Scope**: Queue → Sync → Display flow validation

---

## 📋 Pre-Test Checklist

- [ ] App compiled and running
- [ ] Device/emulator battery > 20%
- [ ] Network available for initial setup
- [ ] Clear app cache: `flutter clean`
- [ ] Fresh dependencies: `flutter pub get`

---

## ✅ Test Cases

### **Test 1: Basic Queue Persistence** (10 min)
**Objective**: Verify queued notifications persist across app restarts

**Steps**:
1. Open app and navigate to **Settings → Notifications**
2. Go to **Flight Mode** (toggle airplane mode ON)
3. Verify "No connectivity" shown in settings
4. Close app completely
5. Restart app
6. Navigate back to **Settings → Notifications**
7. **Expected**: Queue badge/counter still shows same value

**Success Criteria**: 📍 Queue persists data after restart

---

### **Test 2: Real-Time Queue Updates** (15 min)
**Objective**: Verify queue count updates in real-time

**Steps**:
1. Activate **Flight Mode** (offline)
2. Open **Settings** screen (watch Notifications section)
3. From another test device/browser, send notification to this user
4. **Expected**: 
   - Orange "X notifications queued offline" appears
   - Count increases (1 → 2 → 3...)
   - Updates happen within 100ms

**Success Criteria**: 📍 Real-time queue count visible and responsive

---

### **Test 3: DND Suppression** (10 min)
**Objective**: Verify non-urgent notifications suppressed during DND

**Steps**:
1. Go to **Settings → Notifications** section
2. Enable **Do Not Disturb (DND)**
3. Set DND time to current time (e.g., if it's 3:00 PM, 2:00 PM - 4:00 PM)
4. Go **Flight Mode** (offline)
5. Send notification from another device
6. Check **Settings**: Note "dnd_suppressed: true" in queue
7. Disable DND
8. Send another notification
9. Check queue: Note "dnd_suppressed: false"

**Success Criteria**: 📍 DND correctly suppresses/allows notifications

---

### **Test 4: Auto-Sync on Network Restoration** (20 min)
**Objective**: Verify auto-sync triggers when connectivity restored

**Steps**:
1. Go **Flight Mode** (offline)
2. Open **Settings → Notifications**
3. From another device, send 5 notifications
4. Verify all 5 show in queue counter
5. Turn **Flight Mode OFF** (come online)
6. Watch **Settings** screen for status change:
   - Status changes to **"Syncing..."** (blue spinner)
   - After sync: **"Sync completed successfully"** (green)
   - Queue counter returns to **0**
7. Check **Duration**: Should complete within 5 seconds

**Success Criteria**: 📍 Auto-sync triggers and completes on network restoration

---

### **Test 5: Partial Sync Failure Handling** (15 min)
**Objective**: Verify system handles partial failures gracefully

**Prerequisites**: Need to simulate a sync failure
- Manually update one notification in Hive to have invalid data
- Or temporarily go offline after 3 of 5 notifications sync

**Steps**:
1. Queue 5 notifications while offline
2. Simulate sync failure (see prerequisites)
3. Turn online
4. Watch status:
   - Shows **"Syncing..."**
   - Shows **"Partial sync - some failed"** (orange)
5. Check metrics:
   - `totalSynced` = 3
   - `totalFailed` = 2
   - `lastSyncTime` = current timestamp

**Success Criteria**: 📍 Partial failures handled, status accurately reflects state

---

### **Test 6: Retry Logic** (20 min)
**Objective**: Verify exponential backoff retry mechanism

**Steps**:
1. Go **Flight Mode** (offline)
2. Queue 3 notifications
3. Go **Online** but simulate server error (temporarily disable notifications endpoint)
4. Observe sync status:
   - First attempt fails → Shows "Sync failed"
   - Wait 5 seconds
   - Auto-retry with delay
   - Status shows retry attempts
5. Fix server issue
6. Auto-retry should succeed
7. Status shows "Sync completed successfully"

**Success Criteria**: 📍 Retry logic executes with proper backoff timing

---

### **Test 7: Storage Limits** (10 min)
**Objective**: Verify queue respects MAX_QUEUE_SIZE (500 items)

**Steps**:
1. Run test script that causes rapid notification queue
2. Monitor queue count in **Settings**
3. At ~400 items (HIGH_WATER_MARK):
   - Auto-cleanup should trigger
   - Old notifications deleted
4. At 500 items:
   - New notifications rejected
   - Status shows "Queue full"
5. Cleanup removes older entries automatically

**Success Criteria**: 📍 Queue bounded at 500 items, cleanup prevents overflow

---

### **Test 8: Metrics Accuracy** (10 min)
**Objective**: Verify metrics tracked correctly

**Steps**:
1. Complete full sync cycle (queue → sync → success)
2. Go to **Settings → Notifications** and open browser dev console:
   ```javascript
   // You can inspect Hive box directly via flutter tools
   ```
3. Verify these metrics updated:
   - `totalQueued`: Incremented by queue size
   - `totalSynced`: Incremented by synced count
   - `totalFailed`: Tracks failed attempts
   - `lastSyncTime`: Current ISO 8601 timestamp
   - `averageSyncTimeMs`: Total duration / count

**Success Criteria**: 📍 All metrics tracked and updated correctly

---

### **Test 9: Dashboard Badge Display** (10 min)
**Objective**: Verify dashboard shows notification queue badge

**Steps**:
1. Go offline and queue 5 notifications
2. Navigate to **Dashboard**
3. Look for **Notifications** icon in top bar
4. Hover over icon or check for badge:
   - Red badge showing "5"
   - Or status text showing queue count
5. Add another notification while watching
6. Badge updates to "6" in real-time

**Success Criteria**: 📍 Dashboard badge visible and updates in real-time

---

### **Test 10: Settings Screen Display** (8 min)
**Objective**: Verify Settings screen shows status correctly

**Steps**:
1. Go to **Settings → Notifications**
2. When offline with queued items:
   - Orange container showing "X notifications queued offline"
   - Notifications icon displayed
3. During sync:
   - Status shows "Syncing notifications..." 
   - Spinner/loading indicator visible
4. After sync:
   - Option 1: Shows "All notifications synced" (green) if successful
   - Option 2: Shows error status if failed
5. Status changes within 100ms of sync completion

**Success Criteria**: 📍 Settings UI accurately reflects queue and sync status

---

## 🧪 Integration Test Flow

**Complete End-to-End Scenario (45 minutes)**:

```
1. Start: [App Fresh Install]
   ↓
2. Go Offline (Flight Mode)
   ↓
3. Send 10 notifications from another device
   ↓
4. Watch Settings: Queue shows "10" ✅
   ↓
5. Enable DND, send 1 more
   ↓
6. Check: DND notification marked as suppressed ✅
   ↓
7. Disable DND, send 1 more normal
   ✓
8. Queue shows "12" (1 suppressed, 1 normal) ✅
   ↓
9. Turn Flight Mode OFF (go online)
   ↓
10. Watch Status: "Syncing..." appears ✅
    ↓
11. Wait for completion: "Sync completed successfully" ✅
    ↓
12. Verify Queue: "0" items ✅
    ↓
13. Check Dashboard: Badge gone ✅
    ↓
14. Verify Metrics: Check totalSynced incremented ✅
    ↓
15. End: [System Validation Complete] ✅
```

---

## 📊 Performance Benchmarks

| Operation | Target | Acceptable Range |
|-----------|--------|-------------------|
| Queue operation | < 50ms | < 100ms |
| Stream emit | < 100ms | < 200ms |
| Sync per notification | < 500ms | < 1000ms |
| Full cleanup | < 200ms | < 500ms |
| Retry backoff | 5-20s | 3-30s |

---

## 🐛 Debugging Guide

### **If queue doesn't persist:**
- Check Hive box initialization: `offline_notifications_queue`
- Verify app has file system permissions
- Check `initialize()` is called in Settings screen

### **If updates aren't real-time:**
- Verify StreamBuilder listeners in Settings
- Check stream subscribers aren't closed
- Ensure `StreamController.broadcast()` used

### **If sync doesn't trigger automatically:**
- Verify `onConnectivityRestored` callback registered
- Check connectivity listener subscribed
- Look for "Network restored" in logs

### **If metrics not updating:**
- Verify Hive `_metricsBox` initialized
- Check `_updateMetrics()` called correctly
- Inspect box contents in Flutter DevTools

---

## 📱 Test Devices

**Recommended**:
- [ ] Physical Android device (real network conditions)
- [ ] iOS device (if available)
- [ ] Emulator (for controlled offline simulation)

**Simulator Setup**:
- Android: Use Android Studio emulator with airplane mode toggle
- iOS: Use Xcode simulator with network throttling

---

## ✂️ Quick Test Commands

```bash
# Get dependencies
flutter pub get

# Run with logging
flutter run -v

# Analyze code
flutter analyze

# Build APK
flutter build apk --debug

# Run tests (if created)
flutter test test/offline_notifications_test.dart
```

---

## 📋 Test Results Template

| Test # | Name | Status | Duration | Notes |
|--------|------|--------|----------|-------|
| 1 | Queue Persistence | ✅/❌ | __min | |
| 2 | Real-Time Updates | ✅/❌ | __min | |
| 3 | DND Suppression | ✅/❌ | __min | |
| 4 | Auto-Sync Restore | ✅/❌ | __min | |
| 5 | Partial Failure | ✅/❌ | __min | |
| 6 | Retry Logic | ✅/❌ | __min | |
| 7 | Storage Limits | ✅/❌ | __min | |
| 8 | Metrics Accuracy | ✅/❌ | __min | |
| 9 | Dashboard Badge | ✅/❌ | __min | |
| 10 | Settings Display | ✅/❌ | __min | |

**Total**: 113 minutes  
**Pass Rate**: __/10 tests

---

## 🎉 Success Criteria Summary

- [ ] All 10 tests pass
- [ ] No crashes during testing
- [ ] Performance benchmarks met
- [ ] All metrics accurate
- [ ] UI updates real-time (< 100ms)
- [ ] Auto-sync works on connectivity restore
- [ ] DND correctly filters notifications
- [ ] Queue persists across app restart
- [ ] Storage limits enforced
- [ ] Error handling doesn't break app

**Overall Status**: 🟢 **READY FOR PRODUCTION** when all pass

---

## 🔗 Related Documentation

- [SYNC_STATUS_ENHANCEMENT.md](SYNC_STATUS_ENHANCEMENT.md) - Sync status tracking
- [IMPROVEMENT_RECOMMENDATIONS.md](IMPROVEMENT_RECOMMENDATIONS.md) - Architecture details
- [IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md) - Implementation summary

---

## 📞 Support

For issues during testing:
1. Check logs: `flutter logs`
2. Enable breakpoints in VS Code
3. Inspect Hive boxes in Flutter DevTools
4. Review service initialization order

