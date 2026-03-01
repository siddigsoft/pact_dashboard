// lib/screens/main_screen.dart

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'dashboard_screen.dart';
import 'field_operations_enhanced_screen.dart';

import 'wallet_screen.dart';
import '../widgets/network_status_indicator.dart';
import '../widgets/agora_incoming_call_dialog.dart';
import '../services/webrtc_service.dart';
import '../services/agora_call_service.dart';
import '../services/presence_service.dart';
import '../models/call_state.dart';
import '../widgets/whats_new_dialog.dart';
import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  int _currentIndex = 0;
  StreamSubscription? _agoraIncomingCallSubscription;
  StreamSubscription? _connectivitySubscription;
  bool _isCoordinator = false;
  bool _isLoadingRole = true;
  bool _servicesInitialized = false;
  Timer? _activityHeartbeatTimer;

  @override
  void initState() {
    super.initState();
    _checkUserRole();
    _initializeWebRTC();
    _showWhatsNewIfNeeded();
    _setupConnectivityListener();
    _startGlobalActivityHeartbeat();

    // Check for active call from notification tap after a short delay
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkForActiveCall();
    });
  }

  /// Listen for connectivity changes to initialize presence when internet becomes available
  void _setupConnectivityListener() {
    _connectivitySubscription?.cancel();
    _connectivitySubscription = Connectivity().onConnectivityChanged.listen((
      results,
    ) async {
      final hasInternet = !results.contains(ConnectivityResult.none);

      if (hasInternet && !_servicesInitialized) {
        debugPrint(
          '🌐 Internet connection restored - initializing WebRTC/Presence',
        );
        await _initializeWebRTC();
      }
    });
  }

  void _checkForActiveCall() {
    // Agora incoming calls are handled via incomingCallStream in _initializeWebRTC
  }

  Future<void> _showWhatsNewIfNeeded() async {
    await Future.delayed(const Duration(milliseconds: 1500));
    if (mounted) {
      await WhatsNewDialog.showIfNeeded(context);
    }
  }

  @override
  void dispose() {
    debugPrint('[MainScreen] dispose() called');
    if (_agoraIncomingCallSubscription != null) {
      debugPrint('[MainScreen] Cancelling incoming call subscription');
      _agoraIncomingCallSubscription?.cancel();
    }
    _connectivitySubscription?.cancel();
    _activityHeartbeatTimer?.cancel();
    super.dispose();
  }

  /// Global presence heartbeat — writes last_activity, device_info, and app_version
  /// to profiles every 5 minutes. Runs for ALL logged-in users regardless of
  /// which screen they're on. This is what makes users visible as "online" in
  /// the web Staff Directory without needing a shared WebSocket channel.
  void _startGlobalActivityHeartbeat() {
    _writeActivityToProfile(); // Immediate write on app open
    _activityHeartbeatTimer?.cancel();
    _activityHeartbeatTimer = Timer.periodic(
      const Duration(minutes: 5),
      (_) => _writeActivityToProfile(),
    );
  }

  Future<void> _writeActivityToProfile() async {
    try {
      final userId = Supabase.instance.client.auth.currentUser?.id;
      if (userId == null) return;

      String deviceLabel = 'Android';
      if (!kIsWeb) {
        if (Platform.isIOS) deviceLabel = 'iOS';
        else if (Platform.isAndroid) deviceLabel = 'Android';
      }

      String? version;
      try {
        final info = await PackageInfo.fromPlatform();
        version = '${info.version}+${info.buildNumber}';
      } catch (_) {}

      await Supabase.instance.client.from('profiles').update({
        'last_activity': DateTime.now().toUtc().toIso8601String(),
        'device_info':   deviceLabel,
        if (version != null) 'app_version': version,
      }).eq('id', userId);

      debugPrint('[MainScreen] last_activity written: $deviceLabel / $version');
    } catch (e) {
      debugPrint('[MainScreen] Activity write failed: $e');
    }
  }

  Future<void> _checkUserRole() async {
    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) {
        setState(() => _isLoadingRole = false);
        return;
      }

      // Try to load cached role first for instant offline support
      await _loadCachedRole();

      // Check connectivity before making network call
      final connectivity = await Connectivity().checkConnectivity();
      final isOnline = !connectivity.contains(ConnectivityResult.none);

      if (!isOnline) {
        debugPrint('📴 Offline mode - using cached role');
        setState(() => _isLoadingRole = false);
        return;
      }

      final response = await Supabase.instance.client
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

      if (response != null && mounted) {
        final role = (response['role'] as String?)?.toLowerCase() ?? '';
        setState(() {
          _isCoordinator =
              role == 'coordinator' ||
              role == 'field_coordinator' ||
              role == 'state_coordinator';
          _isLoadingRole = false;
        });
        // Cache role for offline use
        await _cacheRole(role);
        debugPrint('✅ User role: $role, isCoordinator: $_isCoordinator');
      } else {
        setState(() => _isLoadingRole = false);
      }
    } catch (e) {
      debugPrint('❌ Error checking user role: $e');
      // Fall back to cached role if network fails
      await _loadCachedRole();
      setState(() => _isLoadingRole = false);
    }
  }

  Future<void> _loadCachedRole() async {
    try {
      final box = await Hive.openBox('user_profile_cache');
      final cachedRole = box.get('user_role') as String?;
      if (cachedRole != null && mounted) {
        final role = cachedRole.toLowerCase();
        setState(() {
          _isCoordinator =
              role == 'coordinator' ||
              role == 'field_coordinator' ||
              role == 'state_coordinator';
        });
        debugPrint('📦 Loaded cached role: $role');
      }
    } catch (e) {
      debugPrint('Error loading cached role: $e');
    }
  }

  Future<void> _cacheRole(String role) async {
    try {
      final box = await Hive.openBox('user_profile_cache');
      await box.put('user_role', role);
      debugPrint('💾 Cached role: $role');
    } catch (e) {
      debugPrint('Error caching role: $e');
    }
  }

  Future<void> _initializeWebRTC() async {
    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) {
        debugPrint('❌ Cannot initialize WebRTC: User not authenticated');
        return;
      }

      // Check connectivity
      final connectivity = await Connectivity().checkConnectivity();
      final isOnline = !connectivity.contains(ConnectivityResult.none);

      String userName = user.email?.split('@').first ?? 'User';
      String? userAvatar;
      String? userRole;

      // Try to load cached profile first
      try {
        final box = await Hive.openBox('user_profile_cache');
        userName = box.get('full_name') as String? ?? userName;
        userAvatar = box.get('avatar_url') as String?;
        userRole = box.get('user_role') as String?;
        debugPrint('📦 Loaded cached profile for WebRTC: $userName');
      } catch (e) {
        debugPrint('Error loading cached profile: $e');
      }

      // Fetch fresh data if online
      if (isOnline) {
        try {
          final response = await Supabase.instance.client
              .from('profiles')
              .select('full_name, username, avatar_url, role')
              .eq('id', user.id)
              .maybeSingle();

          if (response != null) {
            userName =
                (response['full_name'] as String?) ??
                (response['username'] as String?) ??
                userName;
            userAvatar = response['avatar_url'] as String?;
            userRole = response['role'] as String?;

            // Cache for offline use
            final box = await Hive.openBox('user_profile_cache');
            await box.put('full_name', userName);
            if (userAvatar != null) await box.put('avatar_url', userAvatar);
            if (userRole != null) await box.put('user_role', userRole);
          }
        } catch (e) {
          debugPrint('⚠️ Error fetching profile from server: $e');
        }
      } else {
        debugPrint('📴 Offline mode - skipping WebRTC/Presence initialization');
        return; // Skip WebRTC when offline - it won't work anyway
      }

      // Initialize WebRTC service (signaling)
      await WebRTCService().initialize(user.id, userName, userAvatar: userAvatar);

      debugPrint('✅ WebRTC service initialized for user: $userName');

      // Initialize Agora call service for native video/audio calls
      try {
        await AgoraCallService().initialize(
          userId: user.id,
          userName: userName,
          userAvatar: userAvatar,
          userEmail: user.email,
        );
        debugPrint('✅ Agora call service initialized for user: $userName');

        // Listen for Agora incoming calls
        debugPrint('[MainScreen] Setting up incoming call subscription...');
        debugPrint('[MainScreen] Stream instance: ${AgoraCallService().incomingCallStream.hashCode}');
        _agoraIncomingCallSubscription =
            AgoraCallService().incomingCallStream.listen((incomingCall) {
          debugPrint('[MainScreen] >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
          debugPrint('[MainScreen] Incoming call event received!');
          debugPrint('[MainScreen] From: ${incomingCall.callerName}');
          debugPrint('[MainScreen] CallId: ${incomingCall.callId}');
          debugPrint('[MainScreen] mounted: $mounted, context.mounted: ${context.mounted}');
          debugPrint('[MainScreen] >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
          if (mounted && context.mounted) {
            try {
              debugPrint('[MainScreen] About to show dialog...');
              showAgoraIncomingCallDialog(context, incomingCall: incomingCall);
              debugPrint('[MainScreen] Dialog show called successfully');
            } catch (e, st) {
              debugPrint('[MainScreen] ERROR showing incoming call dialog: $e');
              debugPrint('[MainScreen] StackTrace: $st');
            }
          } else {
            debugPrint('[MainScreen] Cannot show dialog - not mounted (mounted=$mounted, context.mounted=${context.mounted})');
          }
        }, onError: (e, st) {
          debugPrint('[MainScreen] Incoming call stream ERROR: $e');
          debugPrint('[MainScreen] StackTrace: $st');
        }, onDone: () {
          debugPrint('[MainScreen] Incoming call stream DONE (closed)');
        });
        debugPrint('[MainScreen] Subscription created: ${_agoraIncomingCallSubscription.hashCode}');
      } catch (e) {
        debugPrint('⚠️ Agora init failed (calls may use WebRTC): $e');
      }

      // Initialize Presence service for online status tracking
      await PresenceService().initialize(
        odId: user.id,
        userName: userName,
        userAvatar: userAvatar,
        userRole: userRole,
      );

      debugPrint('✅ Presence service initialized for user: $userName');

      // Mark services as initialized so connectivity listener doesn't re-initialize
      _servicesInitialized = true;
    } catch (e) {
      debugPrint('❌ Error initializing WebRTC: $e');
    }
  }

  void _onItemTapped(int index) {
    // Now only 3 items: Dashboard (0), Sites Management (1), Wallet (2)
    final maxIndex = 2;
    if (index >= 0 && index <= maxIndex) {
      setState(() {
        _currentIndex = index;
      });
    }
  }

  Future<bool> _onWillPop() async {
    final shouldExit = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Exit App'),
        content: const Text(
          'Are you sure you want to exit the app? Your session will remain active. '
          'To sign out completely, please use the menu in the top-left corner.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Stay'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: const Text('Exit'),
          ),
        ],
      ),
    );

    return shouldExit ?? false;
  }

  @override
  Widget build(BuildContext context) {
    // Get safe area padding to position banner below status bar and app bar
    final topPadding = MediaQuery.of(context).padding.top;

    return WillPopScope(
      onWillPop: _onWillPop,
      child: Scaffold(
        body: SafeArea(
          top: false, // Allow content to extend behind status bar
          bottom: false, // Allow bottom navigation to handle its own safe area
          child: Stack(
            children: [
              _buildCurrentScreen(),
              // Offline mode banner - positioned below status bar and app bar area
              Positioned(
                top:
                    topPadding +
                    56, // Below status bar + approximate app bar height
                left: 0,
                right: 0,
                child: const OfflineModeBanner(),
              ),
              // Movable Online/Offline toggle moved to MainLayout
            ],
          ),
        ),
        // bottomNavigationBar: CustomBottomNavigationBar(
        //   currentIndex: _currentIndex,
        //   onTap: _onItemTapped,
        //   isCoordinator: _isCoordinator,
        // ),
      ),
    );
  }

  Widget _buildCurrentScreen() {
    switch (_currentIndex) {
      case 0:
        // Dashboard
        return const DashboardScreen(key: ValueKey('home'));
      case 1:
        // Sites Management
        return FieldOperationsEnhancedScreen(key: const ValueKey('sites'));
      case 2:
        // Wallet
        return const WalletScreen(key: ValueKey('wallet'));
      // Commented out screens - keeping for future use
      // case 1:
      //   return const ReportsScreen(key: ValueKey('reports'));
      // case 2:
      //   return const SafetyHubScreen(key: ValueKey('safety'));
      // case 3:
      //   return const ChatListScreen(key: ValueKey('chat'));
      // case 5:
      //   // Only accessible for coordinators
      //   if (_isCoordinator) {
      //     return const SiteVerificationScreen(key: ValueKey('verification'));
      //   }
      //   return const FieldOperationsEnhancedScreen(key: ValueKey('home'));
      default:
        return const DashboardScreen(key: ValueKey('home'));
    }
  }
}
