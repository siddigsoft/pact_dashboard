// lib/widgets/main_layout.dart

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'custom_bottom_navigation_bar.dart';
import '../screens/dashboard_screen.dart';
import '../screens/field_operations_enhanced_screen.dart';
import '../screens/wallet_screen.dart';
import '../screens/site_verification_screen.dart';
import '../widgets/movable_online_offline_toggle.dart';
import '../widgets/online_offline_toggle.dart';

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
  bool _isLoadingRole = true;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.currentIndex;
    _checkUserRole();
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
      } else {
        setState(() => _isLoadingRole = false);
      }
    } catch (e) {
      debugPrint('Error checking user role: $e');
      setState(() => _isLoadingRole = false);
    }
  }

  void _onItemTapped(int index) {
    // If tapping on the same tab, do nothing
    if (index == _currentIndex) return;

    // Now only 3 items: Dashboard (0), Sites Management (1), Wallet (2)
    final maxIndex = _isCoordinator ? 3 : 2;
    if (index < 0 || index > maxIndex) return;

    // Navigate to the appropriate screen
    Widget? screen;
    switch (index) {
      case 0:
        // Dashboard
        screen = const DashboardScreen();
        break;
      case 1:
        // Sites Management
        screen = FieldOperationsEnhancedScreen();
        break;
      case 2:
        // Wallet
        screen = const WalletScreen();
        break;
      // Commented out screens - keeping for future use
      // case 1:
      //   screen = const ReportsScreen();
      //   break;
      // case 2:
      //   screen = const SafetyHubScreen();
      //   break;
      // case 3:
      //   screen = const ChatListScreen();
      //   break;
      case 3:
        // Only for coordinators
        if (_isCoordinator) {
          screen = const SiteVerificationScreen().withMainLayout(
            currentIndex: 3,
          );
        }
        break;
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
          // Movable Online/Offline toggle (only for data collectors) - pill variant for smaller size
          MovableOnlineOfflineToggle(variant: ToggleVariant.pill),
        ],
      ),
      bottomNavigationBar: _isLoadingRole
          ? null // Hide nav bar while loading role
          : CustomBottomNavigationBar(
              currentIndex: _currentIndex,
              onTap: _onItemTapped,
              isCoordinator: _isCoordinator,
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
