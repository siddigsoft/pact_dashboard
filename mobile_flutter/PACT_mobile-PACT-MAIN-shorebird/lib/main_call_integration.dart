// =============================================================
// INTEGRATION GUIDE: Add WebRTC Calling to Your Flutter App
// =============================================================
//
// Follow these steps to integrate the WebRTC calling system:
//
// 1. ADD DEPENDENCIES
//    Update your pubspec.yaml with dependencies from pubspec_additions.yaml
//
// 2. REMOVE JITSI
//    Remove jitsi_meet_flutter_sdk from pubspec.yaml
//    Delete any Jitsi-related import statements and code
//
// 3. COPY FILES
//    Copy all files from flutter_mobile/lib/ to your local project's lib/ folder
//
// 4. INITIALIZE IN MAIN.DART
//    Add this to your main() function after Supabase initialization:

/*
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'services/webrtc_call_service.dart';
import 'services/background_call_handler.dart';
import 'providers/call_provider.dart';
import 'widgets/calls/call_overlay.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Your existing Supabase init...
  await Supabase.initialize(
    url: 'YOUR_SUPABASE_URL',
    anonKey: 'YOUR_SUPABASE_ANON_KEY',
  );
  
  runApp(
    ProviderScope(
      child: const MyApp(),
    ),
  );
}
*/

// 5. WRAP YOUR APP WITH CALL OVERLAY
//    In your main app widget, wrap MaterialApp with CallOverlay:

/*
class MyApp extends ConsumerStatefulWidget {
  const MyApp({super.key});

  @override
  ConsumerState<MyApp> createState() => _MyAppState();
}

class _MyAppState extends ConsumerState<MyApp> {
  @override
  void initState() {
    super.initState();
    _initializeCallService();
  }

  Future<void> _initializeCallService() async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user != null) {
      // Get user profile from your existing profile service
      final profile = await getProfile(user.id);
      
      await ref.read(callStateProvider.notifier).initialize(
        userId: user.id,
        userName: profile?.fullName ?? user.email ?? 'User',
        userAvatar: profile?.avatarUrl,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      // ... your existing config
      builder: (context, child) {
        return CallOverlay(child: child ?? const SizedBox());
      },
      routes: {
        '/active-call': (context) {
          final args = ModalRoute.of(context)?.settings.arguments as Map<String, dynamic>?;
          return ActiveCallScreen(
            participantId: args?['callerId'] ?? '',
            participantName: args?['callerName'] ?? 'Unknown',
            participantAvatar: args?['callerAvatar'],
            isVideoCall: args?['isVideoCall'] ?? false,
          );
        },
        '/call-contacts': (context) => const CallContactsScreen(),
      },
    );
  }
}
*/

// 6. ADD CALL BUTTON TO YOUR UI
//    Add a call button wherever you want users to initiate calls:

/*
ElevatedButton.icon(
  onPressed: () => Navigator.pushNamed(context, '/call-contacts'),
  icon: const Icon(Icons.phone),
  label: const Text('Make a Call'),
)
*/

// 7. UPDATE ANDROID MANIFEST
//    Add required permissions to android/app/src/main/AndroidManifest.xml
//    See pubspec_additions.yaml for the full list

// 8. UPDATE IOS INFO.PLIST
//    Add required keys to ios/Runner/Info.plist
//    See pubspec_additions.yaml for the full list

// 9. TEST THE INTEGRATION
//    - Build and run the app
//    - Login with two different accounts (web + mobile or two mobile devices)
//    - Make a call from one to the other
//    - Test accepting, rejecting, and ending calls
//    - Test background calls (minimize the app and receive a call)

// =============================================================
// TROUBLESHOOTING
// =============================================================
//
// 1. "No audio" issue:
//    - Make sure microphone permission is granted
//    - Check if audio track is enabled in local stream
//
// 2. "Cannot connect" issue:
//    - Verify both users are logged in and online
//    - Check Supabase realtime channel subscription
//    - Verify TURN server credentials are correct
//
// 3. "Call not received" issue:
//    - Check if signaling channel is properly subscribed
//    - Verify the target user's channel name format
//    - Ensure presence tracking is working
//
// 4. Background calls not working:
//    - Ensure foreground service permissions are granted
//    - Check notification channel setup
//    - Verify wake lock permission
