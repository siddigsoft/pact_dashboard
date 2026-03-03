# 📞 Professional Call Screens - Implementation Guide

## Overview
This guide provides step-by-step instructions to implement the professional-grade call screens in your PACT mobile application.

---

## 🎯 What's Included

### 1. Professional Incoming Call Screen
**File:** `lib/screens/calls/professional_incoming_call_screen.dart`

**Features:**
- Professional caller verification badges
- Call context display (recent call history)
- Multiple action options (accept, reject, message, callback)
- Call type and priority indicators
- Glassmorphism UI effects
- Smooth animations and transitions
- Enterprise-grade visibility and accessibility

### 2. Professional Active Call Screen  
**File:** `lib/screens/calls/professional_active_call_screen.dart`

**Features:**
- Real-time call quality monitoring
- Professional call control layout
- Network status indicators
- Call duration tracking
- Participant management
- Multiple call features (mute, video, speaker, hold, add participant)
- Auto-hiding controls with status preservation
- Professional error handling

---

## 🔧 Integration Steps

### Step 1: Update Call State Model

Add these properties to `lib/models/call_state.dart`:

```dart
enum CallPriority { normal, high, urgent }
enum CallType { video, audio }

// Add to CallState class
class CallState {
  // ... existing properties ...
  
  /// Call priority (normal, high, urgent)
  final CallPriority priority;
  
  /// Call reason/subject
  final String? callReason;
  
  /// Scheduled call time (if applicable)
  final DateTime? scheduledTime;
  
  /// Caller verification status
  final bool isVerified;
  
  /// Caller department/organization
  final String? callerDepartment;
  
  /// Call context (recent history, previous calls, etc.)
  final Map<String, dynamic>? context;
  
  CallState({
    // ... existing parameters ...
    this.priority = CallPriority.normal,
    this.callReason,
    this.scheduledTime,
    this.isVerified = false,
    this.callerDepartment,
    this.context,
  });

  CallState copyWith({
    // ... existing fields ...
    CallPriority? priority,
    String? callReason,
    DateTime? scheduledTime,
    bool? isVerified,
    String? callerDepartment,
    Map<String, dynamic>? context,
  }) {
    return CallState(
      // ... existing copies ...
      priority: priority ?? this.priority,
      callReason: callReason ?? this.callReason,
      scheduledTime: scheduledTime ?? this.scheduledTime,
      isVerified: isVerified ?? this.isVerified,
      callerDepartment: callerDepartment ?? this.callerDepartment,
      context: context ?? this.context,
    );
  }
}
```

### Step 2: Create Call Quality Model

Create `lib/models/call_quality.dart`:

```dart
enum CallQuality {
  excellent,
  good,
  fair,
  poor,
  bad,
}

extension CallQualityExtension on CallQuality {
  String get label {
    switch (this) {
      case CallQuality.excellent:
        return 'Excellent';
      case CallQuality.good:
        return 'Good';
      case CallQuality.fair:
        return 'Fair';
      case CallQuality.poor:
        return 'Poor';
      case CallQuality.bad:
        return 'Bad';
    }
  }

  int get bars {
    switch (this) {
      case CallQuality.excellent:
        return 5;
      case CallQuality.good:
        return 4;
      case CallQuality.fair:
        return 3;
      case CallQuality.poor:
        return 2;
      case CallQuality.bad:
        return 1;
    }
  }

  Color get color {
    switch (this) {
      case CallQuality.excellent:
        return Colors.green;
      case CallQuality.good:
        return Colors.lime;
      case CallQuality.fair:
        return Colors.yellow;
      case CallQuality.poor:
        return Colors.orange;
      case CallQuality.bad:
        return Colors.red;
    }
  }
}
```

### Step 3: Update Call Navigation

Modify your navigation setup to include the new screens:

```dart
// In your routes configuration file
const String incomingCallRoute = '/incoming-call-professional';
const String activeCallRoute = '/active-call-professional';

// Route definitions
routes: {
  // ... existing routes ...
  incomingCallRoute: (context) {
    final args = ModalRoute.of(context)?.settings.arguments as Map?;
    return ProfessionalIncomingCallScreen(
      callerId: args?['callerId'] ?? '',
      callerName: args?['callerName'] ?? 'Unknown',
      callerAvatar: args?['callerAvatar'],
      callerDepartment: args?['callerDepartment'],
      isVerified: args?['isVerified'] ?? false,
      callType: args?['callType'] ?? CallType.audio,
      priority: args?['priority'] ?? CallPriority.normal,
      callReason: args?['callReason'],
      scheduledTime: args?['scheduledTime'],
      callContext: args?['callContext'],
    );
  },
  activeCallRoute: (context) {
    final args = ModalRoute.of(context)?.settings.arguments as Map?;
    return ProfessionalActiveCallScreen(
      remoteUserId: args?['remoteUserId'] ?? '',
      remoteUserName: args?['remoteUserName'] ?? 'Unknown',
      remoteUserAvatar: args?['remoteUserAvatar'],
      isVideoCall: args?['isVideoCall'] ?? false,
    );
  },
  // ... more routes ...
},
```

### Step 4: Update Incoming Call Dialog

Modify `lib/widgets/incoming_call_dialog.dart` to launch professional screen:

```dart
class IncomingCallDialog extends StatelessWidget {
  final String callerId;
  final String callerName;
  final String? callerAvatar;
  final bool isVideoCall;
  final bool useEnhancedScreen;  // Keep existing parameter
  final bool useProfessionalScreen;  // New parameter

  @override
  Widget build(BuildContext context) {
    // Route to professional screen if enabled
    if (useProfessionalScreen) {
      return Navigator(
        onGenerateRoute: (_) => MaterialPageRoute(
          builder: (_) => ProfessionalIncomingCallScreen(
            callerId: callerId,
            callerName: callerName,
            callerAvatar: callerAvatar,
            isVerified: true,  // Pull from your user verification service
            callType: isVideoCall ? CallType.video : CallType.audio,
            // ... other parameters from call context ...
          ),
        ),
      );
    }

    // ... existing implementation ...
  }
}
```

### Step 5: Integrate with Call Services

Update your call services to provide required data:

```dart
// In your call service (e.g., AgoraCallService or WebRTCService)

class YourCallService {
  // ... existing code ...

  /// Get caller context and verification info
  Future<Map<String, dynamic>> _getCallerContext(String callerId) async {
    try {
      // Fetch from your backend/database
      final caller = await _supabase
          .from('users')
          .select()
          .eq('id', callerId)
          .single();
      
      // Fetch recent call history
      final lastCall = await _supabase
          .from('call_history')
          .select()
          .eq('caller_id', callerId)
          .order('created_at', ascending: false)
          .limit(1)
          .maybeSingle();

      return {
        'isVerified': caller['is_verified'] ?? false,
        'callerDepartment': caller['department'],
        'callReason': caller['last_call_subject'],
        'lastCall': lastCall?['duration'],
        'lastCallTime': lastCall?['created_at'],
        'lastCallDuration': _formatCallDuration(lastCall?['duration']),
      };
    } catch (e) {
      debugPrint('Error fetching caller context: $e');
      return {};
    }
  }

  /// Start call with professional screen
  Future<void> startCallWithProfessionalUI({
    required String targetUserId,
    required String targetUserName,
    String? targetUserAvatar,
    bool isAudioOnly = true,
  }) async {
    try {
      // Get caller context
      final context = await _getCallerContext(targetUserId);

      // Launch professional incoming call screen
      navigatorKey.currentState?.pushNamed(
        '/incoming-call-professional',
        arguments: {
          'callerId': targetUserId,
          'callerName': targetUserName,
          'callerAvatar': targetUserAvatar,
          'isVideoCall': !isAudioOnly,
          'callType': isAudioOnly ? CallType.audio : CallType.video,
          'isVerified': context['isVerified'] ?? false,
          'callerDepartment': context['callerDepartment'],
          'callReason': context['callReason'],
          'callContext': context,
        },
      );
    } catch (e) {
      debugPrint('Error starting call: $e');
    }
  }
}
```

### Step 6: Call History Integration

Create `lib/services/call_history_service.dart`:

```dart
class CallHistoryService {
  static final CallHistoryService _instance = CallHistoryService._internal();

  factory CallHistoryService() => _instance;
  CallHistoryService._internal();

  final _supabase = Supabase.instance.client;

  /// Log a completed call to history
  Future<void> logCall({
    required String remoteUserId,
    required String remoteUserName,
    required String type,  // 'audio' or 'video'
    required Duration duration,
    required bool wasIncoming,
    required String outcome,  // 'completed', 'rejected', 'missed'
    CallQuality? quality,
  }) async {
    try {
      await _supabase.from('call_history').insert({
        'remote_user_id': remoteUserId,
        'remote_user_name': remoteUserName,
        'call_type': type,
        'duration_seconds': duration.inSeconds,
        'was_incoming': wasIncoming,
        'outcome': outcome,
        'quality': quality?.name,
        'created_at': DateTime.now().toIso8601String(),
      });
    } catch (e) {
      debugPrint('Error logging call: $e');
    }
  }

  /// Get recent calls for a user
  Future<List<Map<String, dynamic>>> getRecentCalls(
    String userId, {
    int limit = 10,
  }) async {
    try {
      return await _supabase
          .from('call_history')
          .select()
          .eq('remote_user_id', userId)
          .order('created_at', ascending: false)
          .limit(limit);
    } catch (e) {
      debugPrint('Error fetching call history: $e');
      return [];
    }
  }
}
```

---

## 📱 Usage Examples

### Example 1: Launch Professional Incoming Call
```dart
// When receiving a call
Future<void> showIncomingCallUI(String senderId, String senderName) async {
  final callService = YourCallService();
  final context = await callService._getCallerContext(senderId);

  navigatorKey.currentState?.pushNamed(
    '/incoming-call-professional',
    arguments: {
      'callerId': senderId,
      'callerName': senderName,
      'isVerified': context['isVerified'],
      'callContext': context,
    },
  );
}
```

### Example 2: Launch Professional Active Call
```dart
// After call is accepted
void launchActiveCallScreen() {
  Navigator.push(
    context,
    MaterialPageRoute(
      builder: (_) => ProfessionalActiveCallScreen(
        remoteUserId: '12345',
        remoteUserName: 'John Doe',
        remoteUserAvatar: 'https://...',
        isVideoCall: true,
      ),
    ),
  );
}
```

### Example 3: Log Call to History
```dart
void _endCall() {
  final callHistoryService = CallHistoryService();
  
  callHistoryService.logCall(
    remoteUserId: remoteUserId,
    remoteUserName: remoteUserName,
    type: isVideoCall ? 'video' : 'audio',
    duration: DateTime.now().difference(_callStartTime),
    wasIncoming: !isOutgoing,
    outcome: 'completed',
    quality: CallQuality.excellent,
  );

  Navigator.pop(context);
}
```

---

## 🎨 Customization

### Colors and Branding
```dart
// Update in lib/theme/app_colors.dart
class AppColors {
  // ... existing colors ...
  
  // Call-specific colors
  static const Color callAcceptGreen = Color(0xFF4CAF50);
  static const Color callRejectRed = Color(0xFFF44336);
  static const Color callHoldAmber = Color(0xFFFFC107);
  static const Color qualityExcellent = Color(0xFF4CAF50);
  static const Color qualityGood = Color(0xFF8BC34A);
  static const Color qualityFair = Color(0xFFFFC107);
  static const Color qualityPoor = Color(0xFFFF5722);
}
```

### Fonts and Typography
```dart
// Update in lib/theme/app_theme.dart
final _callTextTheme = TextTheme(
  displayLarge: GoogleFonts.inter(
    fontSize: 48,
    fontWeight: FontWeight.w300,
    letterSpacing: 1,
  ),
  headlineSmall: GoogleFonts.inter(
    fontSize: 20,
    fontWeight: FontWeight.w600,
  ),
);
```

---

## 🧪 Testing Checklist

Before deploying to production:

- [ ] Test incoming call landscape orientation
- [ ] Test active call with various quality levels
- [ ] Test all control buttons (mute, video, speaker, etc.)
- [ ] Test call duration timer accuracy
- [ ] Test quality indicator updates
- [ ] Test with slow/poor network
- [ ] Test accessibility (screen readers, high contrast)
- [ ] Test RTL layout for Arabic
- [ ] Test on different screen sizes
- [ ] Test notification integration
- [ ] Performance test (memory, CPU during calls)
- [ ] Test call history logging
- [ ] Test error scenarios

---

## 🚀 Deployment Checklist

### Pre-Deployment
- [ ] Code review completed
- [ ] All tests passing
- [ ] Performance benchmarked
- [ ] Accessibility audit passed
- [ ] Design review approved
- [ ] Documentation updated

### Deployment Steps
1. **Beta Release**: Deploy to TestFlight/Google Play beta
2. **Beta Testing**: Collect user feedback for 1-2 weeks
3. **Production Release**: Deploy to production
4. **Monitoring**: Track error rates and user metrics

### Post-Deployment
- [ ] Monitor error logs
- [ ] Track user satisfaction metrics
- [ ] Collect feedback
- [ ] Prepare hotfixes if needed

---

## 📊 Key Metrics to Monitor

- **Call Connect Rate**: Percentage of calls successfully connected
- **Call Quality Score**: Average call quality rating (1-5)
- **Call Completion Rate**: Percentage of calls completed vs. rejected
- **Error Rate**: Percentage of calls with errors
- **User Satisfaction**: NPS/CSAT scores
- **Performance**: Average call setup time, frame rate, latency

---

## 🔐 Security Considerations

### Data Protection
- Encrypt call signals in transit (use TLS/SSL)
- Validate all caller information before display
- Never expose sensitive user data in logs

### Privacy
- Implement GDPR-compliant call recording
- Get explicit user consent for recording
- Implement call history retention policies
- Allow users to delete call history

### Authentication
- Verify caller identity before showing personal info
- Implement call verification badges
- Use TOTP/2FA for sensitive calls

---

## 📚 Documentation Files

The following documentation files provide additional context:

- `PROFESSIONAL_CALL_ENHANCEMENT_GUIDE.md` - Strategy and design
- `CALL_FEATURES_SUMMARY.md` - Feature overview
- `AGORA_INTEGRATION_GUIDE.md` - RTC integration details
- `ENHANCED_CALL_SCREEN_GUIDE.md` - Enhanced screen details

---

## 💡 Tips for Success

1. **Start Small**: Implement one screen first (incoming), test thoroughly
2. **Iterate**: Gather user feedback and improve
3. **Monitor**: Track metrics and respond to issues quickly
4. **Accessibility**: Test with accessibility tools from the start
5. **Performance**: Profile app during heavy calling sessions
6. **Documentation**: Keep code well-commented and updated

---

## ❓ FAQ

**Q: Can I use these screens with both Agora and WebRTC?**
A: Yes, the screens are service-agnostic and work with any call service.

**Q: How do I customize the call quality threshold?**
A: Modify the quality calculation in `call_quality_monitor_service.dart`.

**Q: Can I add custom call actions?**
A: Yes, extend the secondary buttons in `_buildSecondaryButton()` method.

**Q: How do I integrate call history?**
A: Use `CallHistoryService.logCall()` when a call ends.

---

## 🆘 Troubleshooting

### Issue: Screen doesn't show up
- Check navigation routes are properly defined
- Verify arguments are passed correctly
- Check logs for route errors

### Issue: Controls don't respond
- Verify service methods are implemented
- Check for compilation errors
- Confirm tap gestures aren't intercepted

### Issue: Call quality shows as poor
- Check network conditions
- Verify quality monitor is running
- Check service logs for RTC errors

---

**Status:** Ready for Implementation  
**Version:** 1.0  
**Last Updated:** March 2, 2026
