import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// A reusable dashboard card widget for displaying metrics with gradient backgrounds
/// Matches the React GradientStatCard design
class DashboardCard extends StatelessWidget {
  final String title;
  final String value;
  final String? subtitle;
  final IconData icon;
  final Color color;
  final VoidCallback? onTap;

  const DashboardCard({
    super.key,
    required this.title,
    required this.value,
    this.subtitle,
    required this.icon,
    required this.color,
    this.onTap,
  });

  /// Get gradient colors based on the base color
  List<Color> _getGradientColors() {
    // Match React gradient colors
    if (color == AppColors.primaryBlue || color == Colors.blue) {
      return [const Color(0xFF3B82F6), const Color(0xFF1D4ED8)]; // blue-500 to blue-700
    } else if (color == AppColors.accentGreen || color == Colors.green) {
      return [const Color(0xFF10B981), const Color(0xFF047857)]; // green-500 to emerald-700
    } else if (color == AppColors.primaryOrange || color == Colors.orange) {
      return [const Color(0xFFF97316), const Color(0xFFC2410C)]; // orange-500 to orange-700
    } else if (color == AppColors.accentRed || color == Colors.red) {
      return [const Color(0xFFEF4444), const Color(0xFFB91C1C)]; // red-500 to red-700
    } else if (color == Colors.cyan) {
      return [const Color(0xFF06B6D4), const Color(0xFF0E7490)]; // cyan-500 to cyan-700
    } else if (color == Colors.purple) {
      return [const Color(0xFFA855F7), const Color(0xFF7E22CE)]; // purple-500 to purple-700
    } else {
      // Default gradient
      return [color, color.withOpacity(0.7)];
    }
  }

  @override
  Widget build(BuildContext context) {
    final gradientColors = _getGradientColors();
    
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: gradientColors,
          ),
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: gradientColors[0].withOpacity(0.3),
              blurRadius: 12,
              offset: const Offset(0, 4),
              spreadRadius: 0,
            ),
          ],
        ),
        child: Stack(
          children: [
            // Decorative sparkles pattern (subtle background element)
            Positioned(
              right: -16,
              bottom: -16,
              child: Opacity(
                opacity: 0.1,
                child: Icon(
                  Icons.auto_awesome,
                  size: 80,
                  color: Colors.white,
                ),
              ),
            ),
            // Content
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header with title and icon
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          style: GoogleFonts.poppins(
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                            color: Colors.white.withOpacity(0.9),
                          ),
                        ),
                      ),
                      Icon(
                        icon,
                        color: Colors.white.withOpacity(0.8),
                        size: 20,
                      ),
                      if (onTap != null) ...[
                        const SizedBox(width: 4),
                        Icon(
                          Icons.arrow_forward_ios_rounded,
                          size: 14,
                          color: Colors.white.withOpacity(0.7),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 12),
                  // Value
                  Text(
                    value,
                    style: GoogleFonts.poppins(
                      fontSize: 32,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                      height: 1.2,
                    ),
                  ),
                  // Subtitle
                  if (subtitle != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      subtitle!,
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.white.withOpacity(0.8),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

