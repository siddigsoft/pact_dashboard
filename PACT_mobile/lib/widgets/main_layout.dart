// lib/widgets/main_layout.dart

import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import '../models/agora_incoming_call.dart';
import '../services/agora_call_service.dart';
import '../services/bilingual_notification_service.dart';
import '../services/call_diagnostics_store.dart';
import '../services/call_notification_service.dart';
import '../services/debug_log_service.dart';
import 'custom_bottom_navigation_bar.dart';
import '../screens/dashboard_screen.dart';
import '../screens/field_operations_enhanced_screen.dart';
import '../screens/wallet_screen.dart';
import '../screens/site_verification_screen.dart';
import '../screens/approval_dashboard_screen.dart';
import '../screens/cost_submission_screen.dart';
import '../screens/down_payment_approval_screen.dart';
import '../screens/chat_list_screen.dart';
import '../screens/communications_screen.dart';
import '../screens/more_screen.dart';
import 'agora_incoming_call_dialog.dart';
import '../widgets/professional_movable_toggle.dart';
import 'global_sos_overlay.dart' show currentScreenIndex;

/// A reusable layout wrapper that automatically includes bottom navigation bar
/// and handles all navigation logic. Just wrap your screen content with this.
///
/// Usage:
/// ```dart
/// MainLayout(
///   currentIndex: 0, // Dashboard
///   child: YourScreenContent(),
/// )
/// ```
class MainLayout extends StatefulWidget {
  /// The current tab index (0-5)
  final int currentIndex;

  /// The content to display in the body
  final Widget child;

  const MainLayout({
    super.key,
    required this.currentIndex,
    required this.child,
  });

  @override
  State<MainLayout> createState() => _MainLayoutState();
}

class _MainLayoutState extends State<MainLayout> {
  static StreamSubscription<AgoraIncomingCall>? _incomingCallSubscription;
  static bool _globalCallServicesReady = false;
  static bool _initializingGlobalCallServices = false;
  static bool _isIncomingCallDialogOpen = false;

  late int _currentIndex;
  late Widget _currentChild;
  bool _isCoordinator = false;
  bool _isSupervisor = false;
  String _userRole = '';
  bool _isLoadingRole = true;
  int _walletBadgeCount = 0;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.currentIndex;
    _currentChild = widget.child;
    // Notify SOS overlay of initial screen
    currentScreenIndex.value = widget.currentIndex;
    _checkUserRole();
    _fetchWalletBadgeCount();
    // MainLayout is now the /main app shell, so initialize global call handling here.
    _ensureGlobalCallHandling();
  }

  @override
  void didUpdateWidget(covariant MainLayout oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.currentIndex != widget.currentIndex) {
      _currentIndex = widget.currentIndex;
    }
    if (oldWidget.child != widget.child) {
      _currentChild = widget.child;
    }
  }

  Future<void> _ensureGlobalCallHandling() async {
    if (!_globalCallServicesReady && !_initializingGlobalCallServices) {
      _initializingGlobalCallServices = true;
      try {
        final user = Supabase.instance.client.auth.currentUser;
        if (user == null) {
          return;
        }

        final connectivity = await Connectivity().checkConnectivity();
        final isOnline = !connectivity.contains(ConnectivityResult.none);
        if (!isOnline) {
          debugPrint(
            '[MainLayout] Skipping global call initialization while offline',
          );
          return;
        }

        String userName = user.email?.split('@').first ?? 'User';
        String? userAvatar;

        try {
          final box = await Hive.openBox('user_profile_cache');
          userName = box.get('full_name') as String? ?? userName;
          userAvatar = box.get('avatar_url') as String?;
        } catch (e) {
          debugPrint(
            '[MainLayout] Failed loading cached profile for calls: $e',
          );
        }

        try {
          final response = await Supabase.instance.client
              .from('profiles')
              .select('full_name, username, avatar_url')
              .eq('id', user.id)
              .maybeSingle();

          if (response != null) {
            userName =
                (response['full_name'] as String?) ??
                (response['username'] as String?) ??
                userName;
            userAvatar = response['avatar_url'] as String?;

            final box = await Hive.openBox('user_profile_cache');
            await box.put('full_name', userName);
            if (userAvatar != null) {
              await box.put('avatar_url', userAvatar);
            }
          }
        } catch (e) {
          debugPrint('[MainLayout] Failed refreshing profile for calls: $e');
        }

        await AgoraCallService().initialize(
          userId: user.id,
          userName: userName,
          userAvatar: userAvatar,
          userEmail: user.email,
        );

        // Ensure FCM token is saved to profiles now that user is authenticated
        _ensureFcmTokenSaved(user.id);

        _globalCallServicesReady = true;
        debugPrint('[MainLayout] Global incoming call services initialized');
      } catch (e) {
        debugPrint('[MainLayout] Global call initialization failed: $e');
      } finally {
        _initializingGlobalCallServices = false;
      }
    }

    _attachIncomingCallListener();
    _checkPendingIncomingCallFromNotification();
  }

  /// When app was opened from a call notification (FCM or local), show incoming call UI.
  void _checkPendingIncomingCallFromNotification() {
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      final agora = AgoraCallService();
      Map<String, dynamic>? pending = agora.getAndClearPendingFcmCall();
      if (pending == null) {
        try {
          final launchDetails = await FlutterLocalNotificationsPlugin()
              .getNotificationAppLaunchDetails();
          // Only process if the notification actually launched the app (avoids stale data)
          if (launchDetails?.didNotificationLaunchApp == true) {
            final response = launchDetails?.notificationResponse;
            final payload = response?.payload;
            final actionId = response?.actionId;
            if (payload != null && payload.isNotEmpty) {
              try {
                final decoded = jsonDecode(payload) as Map<String, dynamic>?;
                if (decoded != null &&
                    decoded['channel_name'] != null &&
                    decoded['call_id'] != null) {
                  if (actionId == BilingualNotificationService.acceptActionId) {
                    decoded['auto_accept'] = true;
                  }
                  pending = decoded;
                }
              } catch (_) {}
            }

            // Also check for accept/decline action IDs from notification buttons
            if (pending == null && response?.actionId != null) {
              final aid = response!.actionId!;
              if (aid.startsWith('accept_') || aid.startsWith('decline_')) {
                final callId = aid.substring(aid.indexOf('_') + 1);
                final isAccept = aid.startsWith('accept_');
                debugPrint(
                  '[MainLayout] Launch notification action: ${isAccept ? "accept" : "decline"} callId=$callId',
                );
                if (isAccept) {
                  // Recover call data from diagnostics store and push auto-accept
                  final recovered =
                      await CallNotificationService.recoverIncomingCallFromStore(
                        callId,
                        autoAccept: true,
                      );
                  if (recovered != null) {
                    agora.pushAutoAcceptCall(recovered);
                    await CallDiagnosticsStore.clearLastIncomingInvite();
                    return;
                  }
                } else {
                  // Decline: recover and reject
                  final recovered =
                      await CallNotificationService.recoverIncomingCallFromStore(
                        callId,
                      );
                  if (recovered != null) {
                    await agora.rejectCall(recovered);
                    await CallDiagnosticsStore.clearLastIncomingInvite();
                    return;
                  }
                }
              }
            }
          }
        } catch (e) {
          debugPrint('[MainLayout] Error checking launch notification: $e');
        }
      }

      // Also check for pending call actions saved by background notification tap handler
      if (pending == null) {
        try {
          final pendingAction =
              await CallDiagnosticsStore.loadAndClearPendingCallAction();
          if (pendingAction != null) {
            final actionId = pendingAction['actionId'] as String?;
            final callData = pendingAction['callData'] as Map<String, dynamic>?;
            final callId = (callData?['call_id'] ?? '').toString();
            debugPrint(
              '[MainLayout] Found pending call action: $actionId for callId=$callId',
            );

            if (actionId == 'accept' && callId.isNotEmpty) {
              final recovered =
                  await CallNotificationService.recoverIncomingCallFromStore(
                    callId,
                    autoAccept: true,
                  );
              if (recovered != null) {
                agora.pushAutoAcceptCall(recovered);
                await CallDiagnosticsStore.clearLastIncomingInvite();
                return;
              }
            } else if (actionId == 'decline' && callId.isNotEmpty) {
              final recovered =
                  await CallNotificationService.recoverIncomingCallFromStore(
                    callId,
                  );
              if (recovered != null) {
                await agora.rejectCall(recovered);
                await CallDiagnosticsStore.clearLastIncomingInvite();
                return;
              }
            }
          }
        } catch (e) {
          debugPrint('[MainLayout] Error checking pending call action: $e');
        }
      }

      if (pending != null && mounted) {
        debugPrint(
          '[MainLayout] Pushing pending call from notification: ${pending['call_id']}',
        );
        agora.pushIncomingCallFromFcm(pending);
      }
    });
  }

  void _attachIncomingCallListener() {
    // Always keep exactly one global listener, bound to the latest visible MainLayout.
    // This prevents duplicate incoming dialogs/rings when multiple MainLayout instances
    // exist briefly during route transitions.
    _incomingCallSubscription?.cancel();
    _incomingCallSubscription = null;

    if (!mounted) {
      return;
    }

    _incomingCallSubscription = AgoraCallService().incomingCallStream.listen(
      (incomingCall) {
        if (!mounted || !context.mounted) {
          return;
        }
        if (_isIncomingCallDialogOpen) {
          return;
        }

        _isIncomingCallDialogOpen = true;
        showAgoraIncomingCallDialog(
          context,
          incomingCall: incomingCall,
        ).whenComplete(() {
          _isIncomingCallDialogOpen = false;
        });
      },
      onError: (error, stackTrace) {
        debugPrint('[MainLayout] Incoming call stream error: $error');
      },
    );

    debugPrint('[MainLayout] Incoming call listener attached');
  }

  /// Save FCM token to profiles.fcm_tokens + fcm_token. Called after auth is confirmed.
  static bool _fcmTokenSaved = false;
  void _ensureFcmTokenSaved(String userId) {
    if (_fcmTokenSaved || kIsWeb) return;
    Future<void>.microtask(() async {
      try {
        final token = await FirebaseMessaging.instance.getToken();
        if (token == null || token.isEmpty) {
          debugLog('FCM', 'getToken returned null in MainLayout');
          return;
        }
        debugLog(
          'FCM',
          'Got token in MainLayout: ${token.substring(0, 20)}...',
        );

        final supabase = Supabase.instance.client;
        final profileData = await supabase
            .from('profiles')
            .select('fcm_tokens')
            .eq('id', userId)
            .maybeSingle();

        final currentTokens = List<String>.from(
          (profileData?['fcm_tokens'] as List?) ?? [],
        );

        if (!currentTokens.contains(token)) {
          currentTokens.add(token);
          // Keep only the 5 most recent tokens
          final trimmed = currentTokens.length > 5
              ? currentTokens.sublist(currentTokens.length - 5)
              : currentTokens;
          await supabase.from('profiles').update({
            'fcm_tokens': trimmed,
            'fcm_token': token,
            'fcm_token_updated_at': DateTime.now().toIso8601String(),
          }).eq('id', userId);
          debugPrint('[MainLayout] FCM token saved for user $userId');
          debugLog('FCM', 'Token saved to profiles.fcm_tokens + fcm_token');
        } else {
          // Token is already in the array, but ensure the legacy column is also synced
          await supabase.from('profiles').update({
            'fcm_token': token,
            'fcm_token_updated_at': DateTime.now().toIso8601String(),
          }).eq('id', userId);
          debugLog('FCM', 'Token already in array; synced fcm_token column');
        }
        _fcmTokenSaved = true; // Mark success only after completing
      } catch (e) {
        debugPrint('[MainLayout] Error saving FCM token: $e');
        debugLog('FCM', 'Error saving token in MainLayout: $e');
        // _fcmTokenSaved remains false — will retry on next navigation
      }
    });
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
          _userRole = role;
          _isCoordinator =
              role == 'coordinator' ||
              role == 'field_coordinator' ||
              role == 'state_coordinator';
          _isSupervisor =
              role.contains('supervisor') ||
              role.contains('hubsupervisor') ||
              role.contains('fom') ||
              role.contains('admin') ||
              role.contains('country');
          _isLoadingRole = false;
        });
      } else {
        setState(() => _isLoadingRole = false);
      }
    } catch (e) {
      debugPrint('Error checking user role: $e');
      setState(() => _isLoadingRole = false);
    }
  }

  Future<void> _fetchWalletBadgeCount() async {
    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) return;

      int count = 0;

      // Count pending advance confirmations
      try {
        final advanceData = await Supabase.instance.client
            .from('down_payment_requests')
            .select('id, metadata')
            .eq('requested_by', user.id)
            .inFilter('status', ['partially_paid', 'fully_paid', 'paid']);

        for (final row in (advanceData as List<dynamic>? ?? [])) {
          final meta = (row['metadata'] as Map?)?.cast<String, dynamic>() ?? {};
          final rc = meta['receipt_confirmation'] as Map?;
          if (rc == null || rc['confirmed'] != true) {
            count++;
            debugPrint('[MainLayout] Found unconfirmed advance with meta: $rc');
          }
        }
      } catch (e) {
        debugPrint('[MainLayout] Error fetching advances: $e');
      }

      // Count pending cost receipt confirmations
      try {
        // Get all paid cost submissions
        final costData = await Supabase.instance.client
            .from('operational_cost_submissions')
            .select('id, fund_receipt_confirmed')
            .eq('submitted_by', user.id)
            .eq('status', 'paid');

        for (final row in (costData as List<dynamic>? ?? [])) {
          final confirmed = row['fund_receipt_confirmed'] == true;
          if (!confirmed) {
            count++;
            debugPrint(
              '[MainLayout] Found unconfirmed cost: ${row['id']}, confirmed=$confirmed',
            );
          }
        }
      } catch (e) {
        debugPrint('[MainLayout] Error fetching costs: $e');
      }

      debugPrint('[MainLayout] Total wallet badge count: $count');
      if (mounted) setState(() => _walletBadgeCount = count);
    } catch (e) {
      debugPrint('Error fetching wallet badge count: $e');
    }
  }

  void _onItemTapped(int index) {
    // If tapping on the same tab, do nothing
    if (index == _currentIndex) return;

    // Update global screen index for SOS overlay visibility
    currentScreenIndex.value = index;

    Widget? screen;
    if (_isSupervisor) {
      // Supervisor nav: Home (0), Approvals (1), Cost Submission (2), Down-Payment (3), Chat (4), More (5)
      if (index < 0 || index > 5) return;
      switch (index) {
        case 0:
          screen = const DashboardScreen();
          break;
        case 1:
          screen = const ApprovalDashboardScreen();
          break;
        case 2:
          screen = CostSubmissionScreen(userRole: _userRole);
          break;
        case 3:
          screen = const DownPaymentApprovalScreen();
          break;
        case 4:
          screen = const ChatListScreen();
          break;
        case 5:
          screen = MoreScreen(userRole: _userRole);
          break;
      }
    } else {
      // New nav: Home (0), Verify (1), Sites (2), Communications (3), Wallet (4), More (5, if coordinator)
      final isCoordinator = _isCoordinator;
      final maxIndex = isCoordinator ? 5 : 4;
      if (index < 0 || index > maxIndex) return;
      switch (index) {
        case 0:
          screen = const DashboardScreen();
          break;
        case 1:
          screen = const SiteVerificationScreen();
          break;
        case 2:
          screen = const FieldOperationsEnhancedScreen();
          break;
        case 3:
          screen = const CommunicationsScreen();
          break;
        case 4:
          screen = const WalletScreen();
          _fetchWalletBadgeCount();
          break;
        case 5:
          if (isCoordinator) {
            screen = MoreScreen(userRole: _userRole);
          }
          break;
      }
    }

    if (screen != null && mounted) {
      setState(() {
        _currentIndex = index;
        _currentChild = screen!;
      });
    }
  }

  @override
  void dispose() {
    // Keep the subscription alive while another MainLayout may already be attached.
    // It will be safely replaced by the next _attachIncomingCallListener call.
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          _currentChild,
          // Professional movable status toggle - can be moved to corners, minimized, or hidden
          const ProfessionalMovableToggle(),
        ],
      ),
      bottomNavigationBar: _isLoadingRole
          ? null // Hide nav bar while loading role
          : CustomBottomNavigationBar(
              currentIndex: _currentIndex,
              onTap: _onItemTapped,
              isCoordinator: _isCoordinator,
              isSupervisor: _isSupervisor,
              walletBadgeCount: _walletBadgeCount,
            ),
    );
  }
}

/// Extension to easily wrap any widget with MainLayout
extension MainLayoutExtension on Widget {
  /// Wraps this widget with MainLayout and bottom navigation
  ///
  /// Usage:
  /// ```dart
  /// MyScreen().withMainLayout(currentIndex: 0)
  /// ```
  Widget withMainLayout({required int currentIndex}) {
    return MainLayout(currentIndex: currentIndex, child: this);
  }
}
