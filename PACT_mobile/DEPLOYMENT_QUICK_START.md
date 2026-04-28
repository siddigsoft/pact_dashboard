# 🚀 Deployment Ready - Quick Start

## ✅ System Status

| Component | Status | Details |
|-----------|--------|---------|
| Edge Functions | ✅ DEPLOYED | send-missed-call-notification (Active), send-message-notification (Active) |
| Database | ✅ CONFIGURED | notification_logs table with RLS policies, triggers, and monitoring |
| Backend Hooks | ✅ INTEGRATED | call_history_service.dart, chat_service.dart |
| App Services | ✅ ENHANCED | Notification handlers, ringtone management, Firebase setup |
| Documentation | ✅ COMPLETE | Full testing guide and troubleshooting |

---

## Step 1: Build the App

### Android
```bash
cd c:\Users\PC\PACT_mobile
flutter clean
flutter pub get
flutter build apk --release
```

**Output:** `build/app/outputs/flutter-apk/app-release.apk`

### iOS
```bash
flutter clean
flutter pub get
flutter build ios --release
```

**Output:** `build/ios/iphoneos/Runner.app`

---

## Step 2: Deploy to Devices

### Android
```bash
adb install build/app/outputs/flutter-apk/app-release.apk
```

### iOS
```bash
# Use Xcode or:
open ios/Runner.xcworkspace
# Then archive and distribute
```

---

## Step 3: Configure Devices

**On each device:**

1. ✅ Install PACT app
2. ✅ Grant notification permissions when prompted
3. ✅ Log in with valid account
4. ✅ Wait 5 seconds for Firebase token registration
5. ✅ Verify app appears in notification log:
   ```sql
   SELECT * FROM profiles WHERE id = '<your-user-id>';
   -- Should see a firebase_device_token
   ```

---

## Step 4: Test Scenarios

### Test A: Missed Call
1. **Device A** (receiver) - App open, idle
2. **Device B** (caller) - Calls Device A
3. **Device A** - Reject or wait 30 seconds
4. **Device A** - Should see notification in 2 seconds

### Test B: Message (1:1)
1. **Device A** - Open chat with Device B
2. **Device B** - Send message "Test message"
3. **Device A** - Should see notification in 2 seconds

### Test C: Message (Group)
1. **Device A, B, C** - All in same group chat
2. **Device A** - Send message
3. **Device B & C** - Should each receive notification

---

## Step 5: Monitor

### Check Notifications
```bash
# SSH into Supabase
# Query notification log
SELECT * FROM notification_logs 
WHERE created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC;
```

### View Edge Function Logs
1. Go to Supabase Dashboard
2. Project: pactdb
3. Functions → send-missed-call-notification → Logs
4. Functions → send-message-notification → Logs

---

## Quick Troubleshooting

| Issue | Check |
|-------|-------|
| No notification | Firebase token in profiles? App has permission? |
| Wrong sound | Notification type? ringtone_service.dart initialized? |
| Duplicates | Check notification_logs for multiple entries |
| 401 error | Session token expired? Restart app |

---

## Success Indicators

✅ All green = System working perfectly
- [ ] Missed call received within 2s
- [ ] Message received within 2s  
- [ ] No duplicates in notification_logs
- [ ] Edge Function logs show 200 status
- [ ] Ringtone plays for missed call
- [ ] Silent for messages

---

## Rollback Plan

If issues occur:

1. **Stop notifications:** Comment out lines in `call_history_service.dart:193-197` and `chat_service.dart:877-880`
2. **Revert:** Use git to revert the service files
3. **Redeploy:** `flutter build && deploy`

---

## Next: Monitor in Production

After deployment, watch:
- notification_logs table growth
- Edge Function error rates
- Device battery impact
- User complaint rate

Setup alerts for:
- Failed notifications (> 1% failure rate)
- Response time > 5 seconds
- Firebase token issues

---

## Support Contact

For issues:
1. Check [BACKEND_INTEGRATION_COMPLETE.md](BACKEND_INTEGRATION_COMPLETE.md) troubleshooting section
2. View app logs: `flutter logs`
3. Check device logs: `adb logcat | grep PACT`
4. Review Edge Function logs in Supabase dashboard
