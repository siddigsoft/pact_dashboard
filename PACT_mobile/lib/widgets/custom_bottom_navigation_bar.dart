// lib/widgets/custom_bottom_navigation_bar.dart

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';
import 'package:pact_mobile/l10n/app_localizations.dart';

/// A reusable bottom navigation bar widget for the app.
///
/// Features:
/// - Animated indicator for the selected tab
/// - Responsive design based on screen size
/// - Support for coordinator role with additional "Verify" tab
/// - Custom colors per tab
/// - Smooth animations and transitions
///
/// Example usage:
/// ```dart
/// CustomBottomNavigationBar(
///   currentIndex: _currentIndex,
///   onTap: (index) {
///     setState(() => _currentIndex = index);
///   },
///   isCoordinator: _isCoordinator,
/// )
/// ```
class CustomBottomNavigationBar extends StatelessWidget {
  /// The currently selected tab index
  final int currentIndex;

  /// Callback when a tab is tapped
  final Function(int) onTap;

  /// Whether the user is a coordinator (shows extra "Verify" tab)
  final bool isCoordinator;

  /// Whether the user is a supervisor (shows Approval Dashboard, Cost Submission, Down Payment Approvals; no Wallet)
  final bool isSupervisor;

  /// Number of pending fund receipt confirmations (shows badge on Wallet tab)
  final int walletBadgeCount;

  const CustomBottomNavigationBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
    this.isCoordinator = false,
    this.isSupervisor = false,
    this.walletBadgeCount = 0,
  });

  @override
  Widget build(BuildContext context) {
    // Get screen width to calculate positions
    final screenWidth = MediaQuery.of(context).size.width;
    // Get bottom safe area padding (includes system navigation bar)
    final bottomSafeArea = MediaQuery.of(context).padding.bottom;

    // Supervisor: 4 items (Home, Approvals, Cost Submission, Down-Payment). Else: 3 or 4 (coordinator + Verify).
    final itemCount = isSupervisor ? 4 : (isCoordinator ? 4 : 3);

    return Container(
      // Add padding for system navigation bar
      padding: EdgeInsets.only(bottom: bottomSafeArea),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 20,
            offset: const Offset(0, -5),
            spreadRadius: -2,
          ),
        ],
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(28),
          topRight: Radius.circular(28),
        ),
      ),
      child: Stack(
        children: [
          // Animated indicator for selected item
          AnimatedPositioned(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeInOut,
            left:
                (screenWidth / itemCount) * currentIndex +
                (screenWidth / (itemCount * 2)) -
                24,
            top: 8,
            child: Container(
              width: 48,
              height: 3,
              decoration: BoxDecoration(
                color: _getActiveColor(currentIndex),
                borderRadius: BorderRadius.circular(1.5),
                boxShadow: [
                  BoxShadow(
                    color: _getActiveColor(currentIndex).withOpacity(0.5),
                    blurRadius: 5,
                    offset: const Offset(0, 2),
                    spreadRadius: -1,
                  ),
                ],
              ),
            ),
          ),
          // Navigation items
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: SizedBox(
              width: double.infinity,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: _buildNavItems(context),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Builds the list of navigation items based on user role
  List<Widget> _buildNavItems(BuildContext context) {
    if (isSupervisor) {
      return [
        _buildNavItem(0, AppLocalizations.of(context)!.home, Icons.home_outlined),
        _buildNavItem(1, 'Approvals', Icons.approval_rounded),
        _buildNavItem(2, 'Cost Submission', Icons.receipt_long),
        _buildNavItem(3, 'Down-Payment', Icons.payments_outlined),
      ];
    }
    final items = <Widget>[
      _buildNavItem(0, AppLocalizations.of(context)!.home, Icons.home_outlined),
      _buildNavItem(1, 'Sites', Icons.assignment_rounded),
      _buildNavItem(
        2,
        'Wallet',
        Icons.wallet_giftcard,
        badge: walletBadgeCount,
      ),
    ];
    if (isCoordinator) {
      items.add(_buildNavItem(3, 'Verify', Icons.verified_user_outlined));
    }
    return items;
  }

  /// Returns the active color for a given tab index
  Color _getActiveColor(int index) {
    if (isSupervisor) {
      switch (index) {
        case 0:
          return AppColors.primaryOrange; // Home
        case 1:
          return AppColors.primaryOrange; // Approvals
        case 2:
          return AppColors.primaryOrange; // Cost Submission
        case 3:
          return AppColors.primaryBlue; // Down-Payment
        default:
          return AppColors.primaryOrange;
      }
    }
    switch (index) {
      case 0:
        return AppColors.primaryOrange;
      case 1:
        return AppColors.primaryOrange;
      case 2:
        return AppColors.primaryBlue; // Wallet
      case 3:
        return AppColors.primaryOrange; // Verify (coordinator)
      default:
        return AppColors.primaryOrange;
    }
  }

  /// Builds a single navigation item
  Widget _buildNavItem(
    int index,
    String label,
    IconData icon, {
    int badge = 0,
  }) {
    final isActive = currentIndex == index;
    final activeColor = _getActiveColor(index);
    // Width for 3 items
    const itemWidth = 90.0;

    return GestureDetector(
      onTap: () => onTap(index),
      behavior: HitTestBehavior.opaque,
      child:
          SizedBox(
                width: itemWidth,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: isActive
                                ? activeColor.withOpacity(0.1)
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(16),
                            boxShadow: isActive
                                ? [
                                    BoxShadow(
                                      color: activeColor.withOpacity(0.2),
                                      blurRadius: 8,
                                      offset: const Offset(0, 3),
                                      spreadRadius: -2,
                                    ),
                                  ]
                                : null,
                          ),
                          child: Icon(
                            icon,
                            color: isActive ? activeColor : AppColors.textLight,
                            size: isActive ? 24 : 22,
                          ),
                        ),
                        if (badge > 0)
                          Positioned(
                            right: -4,
                            top: -4,
                            child: Container(
                              padding: const EdgeInsets.all(3),
                              decoration: const BoxDecoration(
                                color: Colors.red,
                                shape: BoxShape.circle,
                              ),
                              constraints: const BoxConstraints(
                                minWidth: 18,
                                minHeight: 18,
                              ),
                              child: Text(
                                badge > 9 ? '9+' : '$badge',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                ),
                                textAlign: TextAlign.center,
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        label,
                        style: GoogleFonts.poppins(
                          color: isActive ? activeColor : AppColors.textLight,
                          fontSize: 11,
                          fontWeight: isActive
                              ? FontWeight.w600
                              : FontWeight.w500,
                          height: 1.1,
                        ),
                      ),
                    ),
                  ],
                ),
              )
              .animate(target: isActive ? 1 : 0)
              .scale(
                begin: const Offset(0.92, 0.92),
                end: const Offset(1, 1),
                curve: Curves.easeOutQuint,
                duration: 300.ms,
              )
              .shimmer(
                duration: isActive ? 1200.ms : 0.ms,
                color: isActive
                    ? activeColor.withOpacity(0.1)
                    : Colors.transparent,
              ),
    );
  }
}
