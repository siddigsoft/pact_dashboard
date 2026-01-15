// lib/widgets/custom_bottom_navigation_bar.dart

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';
import '../l10n/app_localizations.dart';

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

  const CustomBottomNavigationBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
    this.isCoordinator = false,
  });

  @override
  Widget build(BuildContext context) {
    // Get screen width to calculate positions
    final screenWidth = MediaQuery.of(context).size.width;
    // Get bottom safe area padding (includes system navigation bar)
    final bottomSafeArea = MediaQuery.of(context).padding.bottom;

    // Calculate number of items - now showing only 3 items (Dashboard, Sites Management, Wallet)
    final itemCount = isCoordinator ? 4 : 3;

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
            left: (screenWidth / itemCount) * currentIndex + (screenWidth / (itemCount * 2)) - 24,
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
    final items = <Widget>[
      // Dashboard
      _buildNavItem(0, AppLocalizations.of(context)!.home, Icons.home_outlined),
      // Sites Management
      _buildNavItem(1, 'Sites', Icons.assignment_rounded),
      // Wallet
      _buildNavItem(2, 'Wallet', Icons.wallet_giftcard),
    ];
    
    // Commented out items - keeping for future use
    // _buildNavItem(1, 'Reports', Icons.bar_chart_outlined),
    // _buildNavItem(2, AppLocalizations.of(context)!.safety, Icons.shield_outlined),
    // _buildNavItem(3, AppLocalizations.of(context)!.chat, Icons.chat_bubble_outline),
    
    // Add verification tab for coordinators (commented out)
    // if (isCoordinator) {
    //   items.add(_buildNavItem(5, 'Verify', Icons.verified_user_outlined));
    // }

    if (isCoordinator) {
      items.add(_buildNavItem(3, 'Verify', Icons.verified_user_outlined));
    }
    
    return items;
  }

  /// Returns the active color for a given tab index
  Color _getActiveColor(int index) {
    switch (index) {
      case 0:
        return AppColors.primaryOrange; // Dashboard tab
      case 1:
        return AppColors.primaryOrange; // Sites Management tab
      case 2:
        return AppColors.primaryBlue; // Wallet tab
      case 3:
        return AppColors.primaryOrange; // Verification tab (coordinator only)
      // Commented out colors for hidden tabs
      // case 2:
      //   return AppColors.accentGreen; // Safety tab
      // case 3:
      // case 4:
      //   return AppColors.primaryBlue; // Chat and Wallet tabs
      // case 5:
      //   return AppColors.primaryOrange; // Verification tab (coordinator only)
      default:
        return AppColors.primaryOrange;
    }
  }

  /// Builds a single navigation item
  Widget _buildNavItem(int index, String label, IconData icon) {
    final isActive = currentIndex == index;
    final activeColor = _getActiveColor(index);
    // Width for 3 items
    final itemWidth = 90.0;

    return GestureDetector(
      onTap: () => onTap(index),
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: itemWidth,
        child: Column(
          mainAxisSize: MainAxisSize.min,
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
            const SizedBox(height: 2),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                label,
                style: GoogleFonts.poppins(
                  color: isActive ? activeColor : AppColors.textLight,
                  fontSize: 11,
                  fontWeight: isActive ? FontWeight.w600 : FontWeight.w500,
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
            color: isActive ? activeColor.withOpacity(0.1) : Colors.transparent,
          ),
    );
  }
}

