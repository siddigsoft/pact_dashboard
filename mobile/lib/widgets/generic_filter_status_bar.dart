import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_animate/flutter_animate.dart';

/// A professional, wallet-style filter status bar with full-featured controls.
/// Displays the current active filter with useful actions and analytics.
///
/// Features:
/// - Gradient background (wallet-style)
/// - Quick reset button
/// - Percentage of filtered results
/// - Smooth animations
/// - Mobile-friendly touch targets
/// - Bilingual support ready
class FilterStatusBar extends StatelessWidget {
  final String filterLabel; // e.g., "Status", "Role", "Period"
  final String currentFilter; // e.g., "Pending", "Coordinator"
  final int totalCount;
  final int filteredCount;
  final VoidCallback onTap; // Open filter selector
  final VoidCallback onReset; // Reset filter to "All"
  final String? subtitle; // Optional subtitle
  final IconData? icon; // Custom icon (default: filter_list)
  final Color? primaryColor; // Primary gradient color (default: teal)
  final bool showPercentage; // Show % of filtered results
  final bool showResetButton; // Show "Reset" quick action button

  const FilterStatusBar({
    super.key,
    required this.filterLabel,
    required this.currentFilter,
    required this.totalCount,
    required this.filteredCount,
    required this.onTap,
    required this.onReset,
    this.subtitle,
    this.icon,
    this.primaryColor,
    this.showPercentage = true,
    this.showResetButton = true,
  });

  bool get _isFiltered => filteredCount < totalCount;

  String get _percentageLabel {
    if (totalCount == 0) return '0%';
    final pct = ((filteredCount / totalCount) * 100).toStringAsFixed(0);
    return '$pct%';
  }

  @override
  Widget build(BuildContext context) {
    // Only show if actually filtering (not showing all)
    if (!_isFiltered) return const SizedBox.shrink();

    final primaryCol = primaryColor ?? Colors.teal.shade600;
    final primaryDark = primaryColor != null
        ? primaryColor!.withOpacity(0.9)
        : Colors.teal.shade700;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [primaryCol, primaryDark],
          ),
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: primaryCol.withOpacity(0.25),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Column(
            children: [
              // Main filter row
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  16,
                  14,
                  14,
                  subtitle != null ? 10 : 14,
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Icon container
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.18),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(
                        icon ?? Icons.filter_list_rounded,
                        color: Colors.white,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    // Filter details
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            filterLabel,
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              fontWeight: FontWeight.w500,
                              color: Colors.white.withOpacity(0.8),
                              letterSpacing: 0.5,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            currentFilter,
                            style: GoogleFonts.poppins(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    // Result badge
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: Colors.white.withOpacity(0.25),
                          width: 1.5,
                        ),
                      ),
                      child: Column(
                        children: [
                          Text(
                            '$filteredCount',
                            style: GoogleFonts.poppins(
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                            ),
                          ),
                          Text(
                            'shown',
                            style: GoogleFonts.poppins(
                              fontSize: 8,
                              fontWeight: FontWeight.w600,
                              color: Colors.white.withOpacity(0.7),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              // Subtitle + action buttons row
              if (subtitle != null || showPercentage || showResetButton)
                Container(
                  color: Colors.white.withOpacity(0.06),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 10,
                  ),
                  child: Row(
                    children: [
                      // Subtitle or percentage
                      if (subtitle != null)
                        Expanded(
                          child: Text(
                            subtitle!,
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              color: Colors.white.withOpacity(0.75),
                              fontStyle: FontStyle.italic,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        )
                      else if (showPercentage)
                        Expanded(
                          child: Row(
                            children: [
                              Icon(
                                Icons.trending_down,
                                color: Colors.white.withOpacity(0.6),
                                size: 14,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                '${totalCount - filteredCount} hidden · $_percentageLabel visible',
                                style: GoogleFonts.poppins(
                                  fontSize: 10,
                                  color: Colors.white.withOpacity(0.7),
                                ),
                              ),
                            ],
                          ),
                        ),
                      const SizedBox(width: 8),
                      // Quick action buttons
                      if (showPercentage)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.12),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            '${totalCount - filteredCount} hidden',
                            style: GoogleFonts.poppins(
                              fontSize: 9,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                              letterSpacing: 0.3,
                            ),
                          ),
                        ),
                      if (showResetButton) ...[
                        const SizedBox(width: 6),
                        GestureDetector(
                          onTap: onReset,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: Color(0xFFFFA500).withOpacity(0.85),
                              borderRadius: BorderRadius.circular(8),
                              boxShadow: [
                                BoxShadow(
                                  color: Color(0xFFFFA500).withOpacity(0.3),
                                  blurRadius: 4,
                                  offset: const Offset(0, 2),
                                ),
                              ],
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(
                                  Icons.clear_rounded,
                                  color: Colors.white,
                                  size: 13,
                                ),
                                const SizedBox(width: 3),
                                Text(
                                  'Reset',
                                  style: GoogleFonts.poppins(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.white,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ).animate().fadeIn(duration: 300.ms),
                      ],
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    ).animate().fadeIn(duration: 250.ms).slideY(begin: -0.05, duration: 280.ms);
  }
}
