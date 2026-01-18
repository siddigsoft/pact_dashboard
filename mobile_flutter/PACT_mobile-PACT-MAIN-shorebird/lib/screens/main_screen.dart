// lib/screens/main_screen.dart

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'dashboard_screen.dart';
import 'field_operations_enhanced_screen.dart';
// import 'forms_screen.dart'; // Removed forms screen
// import 'equipment_screen.dart'; // Removed equipment screen
import 'wallet_screen.dart';
import '../widgets/network_status_indicator.dart';
import '../widgets/incoming_call_dialog.dart';
import '../services/webrtc_service.dart';
import '../services/presence_service.dart';
import '../models/call_state.dart';
import 'dart:async';

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  int _currentIndex = 0;
  StreamSubscription<CallState>? _callStateSubscription;
  bool _isCoordinator = false;
  bool _isLoadingRole = true;

  @override
  void initState() {
    super.initState();
    _checkUserRole();
    _initializeWebRTC();
  }

  @override
  void dispose() {
    _callStateSubscription?.cancel();
    super.dispose();
  }

  Future<void> _checkUserRole() async {
    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) {
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
        debugPrint('✅ User role: $role, isCoordinator: $_isCoordinator');
      } else {
        setState(() => _isLoadingRole = false);
      }
    } catch (e) {
      debugPrint('❌ Error checking user role: $e');
      setState(() => _isLoadingRole = false);
    }
  }

  Future<void> _initializeWebRTC() async {
    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) {
        debugPrint('❌ Cannot initialize WebRTC: User not authenticated');
        return;
      }

      // Get user profile for name, avatar, and role
      final response = await Supabase.instance.client
          .from('profiles')
          .select('full_name, username, avatar_url, role')
          .eq('id', user.id)
          .maybeSingle();

      String userName = 'User';
      String? userAvatar;

      if (response != null) {
        userName =
            (response['full_name'] as String?) ??
            (response['username'] as String?) ??
            user.email?.split('@').first ??
            'User';
        userAvatar = response['avatar_url'] as String?;
      }

      // Initialize WebRTC service
      await WebRTCService().initialize(
        user.id,
        userName,
        userAvatar: userAvatar,
      );

      debugPrint('✅ WebRTC service initialized for user: $userName');

      // Initialize Presence service for online status tracking
      await PresenceService().initialize(
        odId: user.id,
        userName: userName,
        userAvatar: userAvatar,
        userRole: response?['role'] as String?,
      );

      debugPrint('✅ Presence service initialized for user: $userName');

      // Listen for incoming calls
      _callStateSubscription = WebRTCService().callStateStream.listen((state) {
        if (state.status == CallStatus.ringing &&
            state.remoteUserId != null &&
            mounted) {
          // Show incoming call dialog
          showIncomingCallDialog(
            context,
            callerId: state.remoteUserId!,
            callerName: state.remoteUserName ?? 'Unknown',
            callerAvatar: null,
            callId: state.callId!,
            callToken: state.callToken!,
            isAudioOnly: state.isAudioOnly,
          );
        }
      });
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
