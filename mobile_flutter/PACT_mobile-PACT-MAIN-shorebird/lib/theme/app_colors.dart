// lib/theme/app_colors.dart

import 'package:flutter/material.dart';

class AppColors {
  // Primary Colors - These are your company's brand colors
  static const Color primaryOrange = Color(
    0xFFFF6B35,
  ); // Accented orange - vibrant and energetic
  static const Color primaryBlue = Color(
    0xFF4A90E2,
  ); // Accented blue - professional and trustworthy
  static const Color primaryWhite = Color(
    0xFFFFFFFF,
  ); // Pure white for clean backgrounds

  // Secondary Colors - Supporting colors for better UI
  static const Color lightOrange = Color(
    0xFFFFA574,
  ); // Lighter shade of orange for hover states
  static const Color darkOrange = Color(
    0xFFE55100,
  ); // Darker shade for pressed states
  static const Color lightBlue = Color(
    0xFF7BB3F0,
  ); // Lighter blue for secondary elements
  static const Color darkBlue = Color(0xFF2E5C8A); // Darker blue for emphasis

  // Neutral Colors - For text and backgrounds
  static const Color textDark = Color(0xFF2C3E50); // Dark gray for primary text
  static const Color textLight = Color(
    0xFF7F8C8D,
  ); // Light gray for secondary text
  static const Color backgroundGray = Color(
    0xFFF9FAFB,
  ); // Ultra light gray for backgrounds - slightly lighter for modern look
  static const Color borderColor = Color(
    0xFFEDF2F7,
  ); // Subtle border color for modern design

  // New Accent Colors - For modern UI elements
  static const Color accentGreen = Color(0xFF2ECC71); // Success color
  static const Color accentRed = Color(0xFFE74C3C); // Error color
  static const Color errorRed = Color(0xFFE74C3C); // Error color
  static const Color accentYellow = Color(0xFFF39C12); // Warning color
  static const Color accentBlue = Color(0xFF3498DB); // Info color
  static const Color accentOrange = Color(0xFFE67E22); // Progress color
  static const Color cardBackground = Color(
    0xFFFEFEFE,
  ); // Slightly off-white for card backgrounds
  
  // Aliases for common use cases
  static const Color primary = primaryOrange;
  static const Color success = accentGreen;
  static const Color error = accentRed;
  static const Color shadowColor = Color(
    0x14000000,
  ); // Subtle shadow color (8% opacity)

  // Additional color aliases for consistency
  static const Color surface = primaryWhite;
  static const Color shadow = shadowColor;
  static const Color textPrimary = textDark;
  static const Color textSecondary = textLight;
  static const Color textTertiary = Color(0xFFB0B7BF); // Even lighter gray
  static const Color secondary = primaryBlue;

  // Gradient definitions - For beautiful backgrounds
  static const LinearGradient primaryGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [primaryOrange, lightOrange],
  );

  // Modern frosted glass effect
  static Color get frostedGlass => Colors.white.withOpacity(0.75);

  // Modern card decoration
  static BoxDecoration get modernCardDecoration => BoxDecoration(
    color: cardBackground,
    borderRadius: BorderRadius.circular(24),
    boxShadow: [
      BoxShadow(
        color: shadowColor,
        blurRadius: 20,
        spreadRadius: 0,
        offset: const Offset(0, 4),
      ),
    ],
  );

  // Modern button decoration
  static BoxDecoration get modernButtonDecoration => BoxDecoration(
    gradient: primaryGradient,
    borderRadius: BorderRadius.circular(16),
    boxShadow: [
      BoxShadow(
        color: primaryOrange.withOpacity(0.25),
        blurRadius: 12,
        spreadRadius: 0,
        offset: const Offset(0, 4),
      ),
    ],
  );

  static const LinearGradient blueGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [primaryBlue, lightBlue],
  );

  // App Theme Definitions - Moved from main.dart

  // Define the app's color scheme
  static ColorScheme get colorScheme => ColorScheme.fromSeed(
    seedColor: primaryOrange,
    primary: primaryOrange,
    secondary: primaryBlue,
    surface: primaryWhite,
    background: backgroundGray,
    brightness: Brightness.light,
  );

  // App Bar Theme
  static AppBarTheme get appBarTheme => const AppBarTheme(
    backgroundColor: Colors.transparent,
    elevation: 0, // Removes shadow
    centerTitle: true,
    iconTheme: IconThemeData(color: textDark),
    titleTextStyle: TextStyle(
      color: textDark,
      fontSize: 22,
      fontWeight: FontWeight.w600,
      letterSpacing: 0.5,
    ),
  );

  // Elevated Button Theme
  static ButtonStyle get elevatedButtonStyle => ElevatedButton.styleFrom(
    backgroundColor: primaryOrange,
    foregroundColor: Colors.white,
    elevation: 0,
    shadowColor: Colors.transparent,
    padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 18),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    textStyle: const TextStyle(
      fontSize: 16,
      fontWeight: FontWeight.w600,
      letterSpacing: 0.8,
    ),
  );

  // Text Button Theme
  static ButtonStyle get textButtonStyle => TextButton.styleFrom(
    foregroundColor: primaryOrange,
    textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
  );

  // Input Decoration Theme
  static InputDecorationTheme get inputDecorationTheme => InputDecorationTheme(
    filled: true,
    fillColor: Colors.white,
    contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(16),
      borderSide: BorderSide.none,
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(16),
      borderSide: BorderSide.none,
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(16),
      borderSide: const BorderSide(color: primaryOrange, width: 2),
    ),
    errorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(16),
      borderSide: const BorderSide(color: Colors.red),
    ),
    focusedErrorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(16),
      borderSide: const BorderSide(color: Colors.red, width: 2),
    ),
    // Modern styling for labels and hints
    labelStyle: const TextStyle(color: textLight, fontWeight: FontWeight.w500),
    hintStyle: const TextStyle(color: textLight, fontWeight: FontWeight.w400),
    floatingLabelStyle: const TextStyle(
      color: primaryOrange,
      fontWeight: FontWeight.w600,
    ),
  );

  // Get complete theme data
  static ThemeData get themeData => ThemeData(
    primaryColor: primaryOrange,
    useMaterial3: true,
    colorScheme: colorScheme,
    appBarTheme: appBarTheme,
    elevatedButtonTheme: ElevatedButtonThemeData(style: elevatedButtonStyle),
    textButtonTheme: TextButtonThemeData(style: textButtonStyle),
    inputDecorationTheme: inputDecorationTheme,
  );
}
