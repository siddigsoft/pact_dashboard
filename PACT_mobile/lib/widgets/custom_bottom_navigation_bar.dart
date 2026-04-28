// lib/widgets/custom_bottom_navigation_bar.dart

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:pact_mobile/l10n/app_localizations.dart';
import '../theme/app_colors.dart';

class CustomBottomNavigationBar extends StatelessWidget {
  final int currentIndex;
  final Function(int) onTap;
  final bool isCoordinator;
  final bool isSupervisor;
  final int walletBadgeCount;

  const CustomBottomNavigationBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
    this.isCoordinator = false,
    this.isSupervisor = false,
    this.walletBadgeCount = 0,
  });

  int get _itemCount => isSupervisor ? 6 : (isCoordinator ? 6 : 5);

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final bottomSafeArea = MediaQuery.of(context).padding.bottom;
    final itemWidth = (screenWidth / _itemCount).clamp(56.0, 84.0);

    return Container(
      padding: EdgeInsets.only(bottom: bottomSafeArea),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
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
          AnimatedPositioned(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeInOut,
            left:
                (screenWidth / _itemCount) * currentIndex +
                (screenWidth / (_itemCount * 2)) -
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
                    color: _getActiveColor(currentIndex).withValues(alpha: 0.5),
                    blurRadius: 5,
                    offset: const Offset(0, 2),
                    spreadRadius: -1,
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: SizedBox(
              width: double.infinity,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: _buildNavItems(context, itemWidth),
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildNavItems(BuildContext context, double itemWidth) {
    if (isSupervisor) {
      return [
        Expanded(
          child: _buildNavItem(
            context,
            0,
            AppLocalizations.of(context)!.home,
            Icons.home_outlined,
            itemWidth,
          ),
        ),
        Expanded(
          child: _buildNavItem(
            context,
            1,
            'Approvals',
            Icons.approval_rounded,
            itemWidth,
          ),
        ),
        Expanded(
          child: _buildNavItem(
            context,
            2,
            'Cost Submission',
            Icons.receipt_long,
            itemWidth,
          ),
        ),
        Expanded(
          child: _buildNavItem(
            context,
            3,
            'Down-Payment',
            Icons.payments_outlined,
            itemWidth,
          ),
        ),
        Expanded(
          child: _buildNavItem(
            context,
            4,
            'Chat',
            Icons.chat_bubble_outline,
            itemWidth,
          ),
        ),
        Expanded(
          child: _buildNavItem(
            context,
            5,
            'More',
            Icons.grid_view_outlined,
            itemWidth,
          ),
        ),
      ];
    }

    // For all non-supervisors: Home (0), Verify (1), Sites (2), Communications (3), Wallet (4), More (5, if coordinator)
    final items = <Widget>[
      Expanded(
        child: _buildNavItem(
          context,
          0,
          AppLocalizations.of(context)!.home,
          Icons.home_outlined,
          itemWidth,
        ),
      ),
      Expanded(
        child: _buildNavItem(
          context,
          1,
          'Verify',
          Icons.verified_user_outlined,
          itemWidth,
        ),
      ),
      Expanded(
        child: _buildNavItem(
          context,
          2,
          'Sites',
          Icons.assignment_rounded,
          itemWidth,
        ),
      ),
      Expanded(
        child: _buildNavItem(
          context,
          3,
          'Communications',
          Icons.chat_bubble_outline,
          itemWidth,
        ),
      ),
      Expanded(
        child: _buildNavItem(
          context,
          4,
          'Wallet',
          Icons.wallet_giftcard,
          itemWidth,
          badge: walletBadgeCount,
        ),
      ),
    ];

    if (isCoordinator) {
      items.add(
        Expanded(
          child: _buildNavItem(
            context,
            5,
            'More',
            Icons.grid_view_outlined,
            itemWidth,
          ),
        ),
      );
    }

    return items;
  }

  Color _getActiveColor(int index) {
    if (isSupervisor) {
      switch (index) {
        case 0:
        case 1:
        case 2:
          return AppColors.primaryOrange;
        case 3:
        case 4:
          return AppColors.primaryBlue;
        case 5:
          return AppColors.primaryOrange;
        default:
          return AppColors.primaryOrange;
      }
    }

    switch (index) {
      case 0:
      case 1:
        return AppColors.primaryOrange;
      case 2:
      case 3:
        return AppColors.primaryBlue;
      case 4:
      case 5:
        return AppColors.primaryOrange;
      default:
        return AppColors.primaryOrange;
    }
  }

  Widget _buildNavItem(
    BuildContext context,
    int index,
    String label,
    IconData icon,
    double itemWidth, {
    int badge = 0,
  }) {
    final isActive = currentIndex == index;
    final activeColor = _getActiveColor(index);

    // Only for 'Sites' (index 2): show sub-menu
    if (label == 'Sites') {
      return GestureDetector(
        onTap: () {
          showModalBottomSheet<String>(
            context: context,
            isScrollControlled: false,
            isDismissible: true,
            enableDrag: true,
            backgroundColor: Colors.white,
            shape: const RoundedRectangleBorder(
              borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            ),
            builder: (ctx) {
              return Wrap(
                children: [
                  SafeArea(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 40,
                          height: 5,
                          margin: const EdgeInsets.symmetric(vertical: 12),
                          decoration: BoxDecoration(
                            color: AppColors.primaryBlue.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 6,
                          ),
                          child: Text(
                            'Sites Options',
                            style: GoogleFonts.poppins(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: AppColors.textDark,
                            ),
                          ),
                        ),
                        const Divider(height: 1),
                        ListTile(
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 4,
                          ),
                          leading: Icon(
                            Icons.assignment_rounded,
                            color: AppColors.primaryBlue,
                            size: 20,
                          ),
                          title: Text(
                            'All Sites',
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                          trailing: const Icon(
                            Icons.arrow_forward_ios,
                            size: 14,
                          ),
                          onTap: () {
                            Navigator.pop(ctx);
                            onTap(index);
                          },
                        ),
                        ListTile(
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 4,
                          ),
                          leading: Icon(
                            Icons.person,
                            color: AppColors.primaryOrange,
                            size: 20,
                          ),
                          title: Text(
                            'My Sites',
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                          trailing: const Icon(
                            Icons.arrow_forward_ios,
                            size: 14,
                          ),
                          onTap: () {
                            Navigator.pop(ctx);
                            // TODO: Implement navigation to 'My Sites' screen
                          },
                        ),
                        ListTile(
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 4,
                          ),
                          leading: Icon(
                            Icons.star,
                            color: Colors.amber.shade700,
                            size: 20,
                          ),
                          title: Text(
                            'Favorites',
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                          trailing: const Icon(
                            Icons.arrow_forward_ios,
                            size: 14,
                          ),
                          onTap: () {
                            Navigator.pop(ctx);
                            // TODO: Implement navigation to 'Favorites' screen
                          },
                        ),
                        const SizedBox(height: 8),
                      ],
                    ),
                  ),
                ],
              );
            },
          );
        },
        behavior: HitTestBehavior.opaque,
        child: _buildSitesNavItem(label, icon, isActive, activeColor, badge),
      );
    }

    // Default: normal nav item
    return GestureDetector(
      onTap: () => onTap(index),
      behavior: HitTestBehavior.opaque,
      child: _navItemContent(label, icon, isActive, activeColor, badge),
    );
  }

  // Build Sites nav item with dropdown indicator
  Widget _buildSitesNavItem(
    String label,
    IconData icon,
    bool isActive,
    Color activeColor,
    int badge,
  ) {
    return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: isActive
                        ? activeColor.withValues(alpha: 0.1)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: isActive
                        ? [
                            BoxShadow(
                              color: activeColor.withValues(alpha: 0.2),
                              blurRadius: 6,
                              offset: const Offset(0, 3),
                            ),
                          ]
                        : [],
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        icon,
                        size: 20,
                        color: isActive ? activeColor : AppColors.textLight,
                      ),
                      Icon(
                        Icons.expand_more,
                        size: 12,
                        color: isActive ? activeColor : AppColors.textLight,
                      ),
                    ],
                  ),
                ),
                if (badge > 0)
                  Positioned(
                    top: -6,
                    right: -6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 5,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.red.shade600,
                        borderRadius: BorderRadius.circular(10),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.red.withValues(alpha: 0.4),
                            blurRadius: 3,
                            offset: const Offset(0, 1),
                          ),
                        ],
                      ),
                      child: Text(
                        badge.toString(),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 9,
                          fontWeight: FontWeight.bold,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 2),
            SizedBox(
              width: 52,
              child: Text(
                label,
                maxLines: 2,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.poppins(
                  color: isActive ? activeColor : AppColors.textLight,
                  fontSize: 10,
                  fontWeight: isActive ? FontWeight.w600 : FontWeight.w500,
                  height: 1.0,
                ),
              ),
            ),
          ],
        )
        .animate(target: isActive ? 1 : 0)
        .scale(
          begin: const Offset(0.92, 0.92),
          end: const Offset(1, 1),
          curve: Curves.easeOutQuint,
          duration: const Duration(milliseconds: 300),
        )
        .shimmer(
          duration: isActive
              ? const Duration(milliseconds: 1200)
              : Duration.zero,
          color: isActive
              ? activeColor.withValues(alpha: 0.1)
              : Colors.transparent,
        );
  }

  Widget _navItemContent(
    String label,
    IconData icon,
    bool isActive,
    Color activeColor,
    int badge,
  ) {
    return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: isActive
                        ? activeColor.withValues(alpha: 0.1)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: isActive
                        ? [
                            BoxShadow(
                              color: activeColor.withValues(alpha: 0.2),
                              blurRadius: 6,
                              offset: const Offset(0, 3),
                            ),
                          ]
                        : [],
                  ),
                  child: Icon(
                    icon,
                    size: 22,
                    color: isActive ? activeColor : AppColors.textLight,
                  ),
                ),
                if (badge > 0)
                  Positioned(
                    top: -6,
                    right: -6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 5,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.red.shade600,
                        borderRadius: BorderRadius.circular(10),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.red.withValues(alpha: 0.4),
                            blurRadius: 3,
                            offset: const Offset(0, 1),
                          ),
                        ],
                      ),
                      child: Text(
                        badge.toString(),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 9,
                          fontWeight: FontWeight.bold,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 2),
            SizedBox(
              width: 52,
              child: Text(
                label,
                maxLines: 2,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.poppins(
                  color: isActive ? activeColor : AppColors.textLight,
                  fontSize: 10,
                  fontWeight: isActive ? FontWeight.w600 : FontWeight.w500,
                  height: 1.0,
                ),
              ),
            ),
          ],
        )
        .animate(target: isActive ? 1 : 0)
        .scale(
          begin: const Offset(0.92, 0.92),
          end: const Offset(1, 1),
          curve: Curves.easeOutQuint,
          duration: const Duration(milliseconds: 300),
        )
        .shimmer(
          duration: isActive
              ? const Duration(milliseconds: 1200)
              : Duration.zero,
          color: isActive
              ? activeColor.withValues(alpha: 0.1)
              : Colors.transparent,
        );
  }
}
