// lib/widgets/main_layout.dart

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'custom_bottom_navigation_bar.dart';
import '../screens/dashboard_screen.dart';
import '../screens/field_operations_enhanced_screen.dart';
import '../screens/wallet_screen.dart';
import '../screens/site_verification_screen.dart';
import '../screens/approval_dashboard_screen.dart';
import '../screens/cost_submission_screen.dart';
import '../screens/down_payment_approval_screen.dart';
import '../widgets/professional_movable_toggle.dart';

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
  late int _currentIndex;
  bool _isCoordinator = false;
  bool _isSupervisor = false;
  String _userRole = '';
  bool _isLoadingRole = true;
  int _walletBadgeCount = 0;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.currentIndex;
    _checkUserRole();
    _fetchWalletBadgeCount();
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
          _isCoordinator = role == 'coordinator' ||
              role == 'field_coordinator' ||
              role == 'state_coordinator';
          _isSupervisor = role.contains('supervisor') ||
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

      final data = await Supabase.instance.client
          .from('down_payment_requests')
          .select('id, metadata')
          .eq('requested_by', user.id)
          .inFilter('status', ['partially_paid', 'fully_paid']);

      int count = 0;
      for (final row in (data as List<dynamic>? ?? [])) {
        final meta = (row['metadata'] as Map?)?.cast<String, dynamic>() ?? {};
        final rc = meta['receipt_confirmation'] as Map?;
        if (rc == null || rc['confirmed'] != true) count++;
      }

      if (mounted) setState(() => _walletBadgeCount = count);
    } catch (e) {
      debugPrint('Error fetching wallet badge count: $e');
    }
  }

  void _onItemTapped(int index) {
    // If tapping on the same tab, do nothing
    if (index == _currentIndex) return;

    Widget? screen;
    if (_isSupervisor) {
      // Supervisor nav: Home (0), Approvals (1), Cost Submission (2), Down Payment Approvals (3)
      if (index < 0 || index > 3) return;
      switch (index) {
        case 0:
          screen = const DashboardScreen();
          break;
        case 1:
          screen = const ApprovalDashboardScreen().withMainLayout(currentIndex: 1);
          break;
        case 2:
          screen = CostSubmissionScreen(userRole: _userRole).withMainLayout(currentIndex: 2);
          break;
        case 3:
          screen = const DownPaymentApprovalScreen().withMainLayout(currentIndex: 3);
          break;
      }
    } else {
      // Default nav: Dashboard (0), Sites Management (1), Wallet (2), [Verify (3) for coordinator]
      final maxIndex = _isCoordinator ? 3 : 2;
      if (index < 0 || index > maxIndex) return;
      switch (index) {
        case 0:
          screen = const DashboardScreen();
          break;
        case 1:
          screen = const FieldOperationsEnhancedScreen();
          break;
        case 2:
          screen = const WalletScreen();
          break;
        case 3:
          if (_isCoordinator) {
            screen = const SiteVerificationScreen().withMainLayout(currentIndex: 3);
          }
          break;
      }
    }

    if (screen != null && mounted) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (context) => screen!),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          widget.child,
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
