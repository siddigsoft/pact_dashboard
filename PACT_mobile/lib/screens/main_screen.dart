// lib/screens/main_screen.dart

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'dashboard_screen.dart';
import 'field_operations_enhanced_screen.dart';

import 'wallet_screen.dart';
import 'chat_list_screen.dart';
import 'reports_screen.dart';
import 'safety_hub_screen.dart';
import 'incident_report_screen.dart';
import 'equipment_screen.dart';
import 'documents_screen.dart';
import 'cost_submission_screen.dart';
import 'down_payment_approval_screen.dart';
import 'advance_requests_report_screen.dart';
import 'approval_dashboard_screen.dart';
import 'site_verification_screen.dart';
import 'settings_screen.dart';
import 'digital_signatures_screen.dart';
import 'profile_screen.dart';
import 'help_support_screen.dart';
import 'helpline_screen.dart';
import 'projects_screen.dart';
import 'budget_screen.dart';
import 'exchange_rates_screen.dart';
import 'staff_directory_screen.dart';
import 'transaction_scanner_screen.dart';
import 'reconciliation_dashboard_screen.dart';
import 'hub_management_screen.dart';
import 'coordinator_dashboard_screen.dart';
import 'monitoring_plan_screen.dart';
import 'archive_screen.dart';
import 'retainer_management_screen.dart';
import 'data_export_screen.dart';
import 'global_search_screen.dart';
import 'mmp_management_screen.dart';
import 'comprehensive_monitoring_form_screen.dart';
import '../widgets/network_status_indicator.dart';
import '../widgets/agora_incoming_call_dialog.dart';
import '../services/webrtc_service.dart';
import '../services/agora_call_service.dart';
import '../services/presence_service.dart';
import '../widgets/whats_new_dialog.dart';
import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../services/location_service.dart';

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
      const Duration(minutes: 3),
      (_) => _writeActivityToProfile(),
    );
  }

  Future<void> _writeActivityToProfile() async {
    try {
      final userId = Supabase.instance.client.auth.currentUser?.id;
      if (userId == null) return;

      // ── Device label ────────────────────────────────────────────────────────
      String deviceLabel = 'Android';
      if (!kIsWeb) {
        if (Platform.isIOS) {
          deviceLabel = 'iOS';
        } else if (Platform.isAndroid)
          deviceLabel = 'Android';
      }

      // ── App version ─────────────────────────────────────────────────────────
      String? version;
      try {
        final info = await PackageInfo.fromPlatform();
        version = '${info.version}+${info.buildNumber}';
      } catch (_) {}

      // ── GPS location (best-effort, won't block if unavailable) ───────────────
      Map<String, dynamic>? locationPayload;
      try {
        final position = await LocationService.getCurrentLocation().timeout(
          const Duration(seconds: 8),
        );
        if (position != null) {
          locationPayload = {
            'lat': position.latitude,
            'lng': position.longitude,
            'accuracy': position.accuracy,
            'captured_at': DateTime.now().toUtc().toIso8601String(),
          };
        }
      } catch (_) {
        // GPS unavailable or timed out — skip silently
      }

      // ── Write to Supabase profiles ───────────────────────────────────────────
      final update = <String, dynamic>{
        'last_activity': DateTime.now().toUtc().toIso8601String(),
        'device_info': deviceLabel,
        'app_version': ?version,
        'location': ?locationPayload,
      };

      await Supabase.instance.client
          .from('profiles')
          .update(update)
          .eq('id', userId);

      debugPrint(
        '[MainScreen] Heartbeat ✓ — device=$deviceLabel ver=$version '
        'gps=${locationPayload != null ? "${locationPayload['lat']},${locationPayload['lng']}" : "n/a"}',
      );
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
      await WebRTCService().initialize(
        user.id,
        userName,
        userAvatar: userAvatar,
      );

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
        debugPrint(
          '[MainScreen] Stream instance: ${AgoraCallService().incomingCallStream.hashCode}',
        );
        _agoraIncomingCallSubscription = AgoraCallService().incomingCallStream.listen(
          (incomingCall) {
            debugPrint('[MainScreen] >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
            debugPrint('[MainScreen] Incoming call event received!');
            debugPrint('[MainScreen] From: ${incomingCall.callerName}');
            debugPrint('[MainScreen] CallId: ${incomingCall.callId}');
            debugPrint(
              '[MainScreen] mounted: $mounted, context.mounted: ${context.mounted}',
            );
            debugPrint('[MainScreen] >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
            if (mounted && context.mounted) {
              try {
                debugPrint('[MainScreen] About to show dialog...');
                showAgoraIncomingCallDialog(
                  context,
                  incomingCall: incomingCall,
                );
                debugPrint('[MainScreen] Dialog show called successfully');
              } catch (e, st) {
                debugPrint(
                  '[MainScreen] ERROR showing incoming call dialog: $e',
                );
                debugPrint('[MainScreen] StackTrace: $st');
              }
            } else {
              debugPrint(
                '[MainScreen] Cannot show dialog - not mounted (mounted=$mounted, context.mounted=${context.mounted})',
              );
            }
          },
          onError: (e, st) {
            debugPrint('[MainScreen] Incoming call stream ERROR: $e');
            debugPrint('[MainScreen] StackTrace: $st');
          },
          onDone: () {
            debugPrint('[MainScreen] Incoming call stream DONE (closed)');
          },
        );
        debugPrint(
          '[MainScreen] Subscription created: ${_agoraIncomingCallSubscription.hashCode}',
        );
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
    setState(() {
      _currentIndex = index;
    });
  }

  void _navigateToScreen(Widget screen) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
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
        bottomNavigationBar: BottomNavigationBar(
          currentIndex: _currentIndex > 4 ? 4 : _currentIndex,
          onTap: _onItemTapped,
          type: BottomNavigationBarType.fixed,
          selectedItemColor: const Color(0xFF1D3461),
          unselectedItemColor: Colors.grey,
          selectedLabelStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
          unselectedLabelStyle: const TextStyle(fontSize: 10),
          items: const [
            BottomNavigationBarItem(icon: Icon(Icons.dashboard_outlined), activeIcon: Icon(Icons.dashboard), label: 'Home'),
            BottomNavigationBarItem(icon: Icon(Icons.map_outlined), activeIcon: Icon(Icons.map), label: 'Field Ops'),
            BottomNavigationBarItem(icon: Icon(Icons.chat_bubble_outline), activeIcon: Icon(Icons.chat_bubble), label: 'Chat'),
            BottomNavigationBarItem(icon: Icon(Icons.account_balance_wallet_outlined), activeIcon: Icon(Icons.account_balance_wallet), label: 'Wallet'),
            BottomNavigationBarItem(icon: Icon(Icons.grid_view_outlined), activeIcon: Icon(Icons.grid_view), label: 'More'),
          ],
        ),
      ),
    );
  }

  Widget _buildCurrentScreen() {
    switch (_currentIndex) {
      case 0:
        return const DashboardScreen(key: ValueKey('home'));
      case 1:
        return FieldOperationsEnhancedScreen(key: const ValueKey('sites'));
      case 2:
        return const ChatListScreen(key: ValueKey('chat'));
      case 3:
        return const WalletScreen(key: ValueKey('wallet'));
      case 4:
        return _buildMoreScreen();
      default:
        return const DashboardScreen(key: ValueKey('home'));
    }
  }

  Widget _buildMoreScreen() {
    final items = [
      _MoreItem(Icons.bar_chart, 'Reports', () => _navigateToScreen(const ReportsScreen())),
      _MoreItem(Icons.folder_special, 'Projects', () => _navigateToScreen(const ProjectsScreen())),
      _MoreItem(Icons.account_balance, 'Budget', () => _navigateToScreen(const BudgetScreen())),
      _MoreItem(Icons.currency_exchange, 'Exchange Rates', () => _navigateToScreen(const ExchangeRatesScreen())),
      _MoreItem(Icons.safety_check, 'Safety Hub', () => _navigateToScreen(const SafetyHubScreen())),
      _MoreItem(Icons.warning_amber, 'Incidents', () => _navigateToScreen(const IncidentReportScreen())),
      _MoreItem(Icons.construction, 'Equipment', () => _navigateToScreen(const EquipmentScreen())),
      _MoreItem(Icons.description, 'MMP Management', () => _navigateToScreen(const MmpManagementScreen())),
      _MoreItem(Icons.fact_check, 'Monitoring Form', () => _navigateToScreen(const ComprehensiveMonitoringFormScreen())),
      _MoreItem(Icons.payment, 'Down Payment', () => _navigateToScreen(const DownPaymentApprovalScreen())),
      _MoreItem(Icons.request_quote, 'Advance Reports', () => _navigateToScreen(const AdvanceRequestsReportScreen())),
      _MoreItem(Icons.approval, 'Approvals', () => _navigateToScreen(const ApprovalDashboardScreen())),
      _MoreItem(Icons.attach_money, 'Cost Submission', () => _navigateToScreen(const CostSubmissionScreen())),
      _MoreItem(Icons.receipt_long, 'Retainers', () => _navigateToScreen(const RetainerManagementScreen())),
      _MoreItem(Icons.account_tree, 'Reconciliation', () => _navigateToScreen(const ReconciliationDashboardScreen())),
      _MoreItem(Icons.hub, 'Hub Management', () => _navigateToScreen(const HubManagementScreen())),
      _MoreItem(Icons.manage_accounts, 'Coordinator', () => _navigateToScreen(const CoordinatorDashboardScreen())),
      _MoreItem(Icons.assignment, 'Monitoring Plan', () => _navigateToScreen(const MonitoringPlanScreen())),
      _MoreItem(Icons.archive, 'Archive', () => _navigateToScreen(const ArchiveScreen())),
      _MoreItem(Icons.people, 'Staff Directory', () => _navigateToScreen(const StaffDirectoryScreen())),
      _MoreItem(Icons.document_scanner, 'Scanner', () => _navigateToScreen(const TransactionScannerScreen())),
      _MoreItem(Icons.download, 'Data Export', () => _navigateToScreen(const DataExportScreen())),
      _MoreItem(Icons.search, 'Global Search', () => _navigateToScreen(const GlobalSearchScreen())),
      _MoreItem(Icons.folder_copy, 'Documents', () => _navigateToScreen(const DocumentsScreen())),
      _MoreItem(Icons.draw, 'Signatures', () => _navigateToScreen(const DigitalSignaturesScreen())),
      _MoreItem(Icons.verified_user, 'Verification', () => _navigateToScreen(const SiteVerificationScreen())),
      _MoreItem(Icons.phone, 'Helpline', () => _navigateToScreen(const HelplineScreen())),
      _MoreItem(Icons.help_outline, 'Help & Support', () => _navigateToScreen(const HelpSupportScreen())),
      _MoreItem(Icons.person, 'Profile', () => _navigateToScreen(const ProfileScreen())),
      _MoreItem(Icons.settings, 'Settings', () => _navigateToScreen(const SettingsScreen())),
    ];

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F2041),
        title: const Text('All Features', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: const Icon(Icons.search, color: Colors.white),
            onPressed: () => _navigateToScreen(const GlobalSearchScreen()),
          ),
        ],
      ),
      body: GridView.builder(
        padding: const EdgeInsets.all(12),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 3,
          crossAxisSpacing: 10,
          mainAxisSpacing: 10,
          childAspectRatio: 1.0,
        ),
        itemCount: items.length,
        itemBuilder: (context, index) {
          final item = items[index];
          return InkWell(
            onTap: item.onTap,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey.shade200),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 4, offset: const Offset(0, 2))],
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(item.icon, size: 28, color: const Color(0xFF1D3461)),
                  const SizedBox(height: 6),
                  Text(item.label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500), textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _MoreItem {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  _MoreItem(this.icon, this.label, this.onTap);
}
