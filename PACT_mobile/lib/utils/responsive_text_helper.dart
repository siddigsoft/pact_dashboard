import 'package:flutter/material.dart';

/// Helper class for responsive text sizing that adapts to user's font size settings
class ResponsiveTextHelper {
  /// Get responsive font size based on base size and user's scaling settings
  static double getResponsiveSize(
    BuildContext context, {
    required double baseSize,
    double? minSize,
    double? maxSize,
  }) {
    final textScaleFactor = MediaQuery.of(context).textScaleFactor;
    double responsiveSize = baseSize * textScaleFactor;

    // Clamp between min and max if provided
    if (minSize != null && responsiveSize < minSize) {
      responsiveSize = minSize;
    }
    if (maxSize != null && responsiveSize > maxSize) {
      responsiveSize = maxSize;
    }

    return responsiveSize;
  }

  /// Get responsive TextStyle
  static TextStyle getResponsiveStyle(
    BuildContext context, {
    required double baseFontSize,
    required FontWeight fontWeight,
    Color? color,
    double? minFontSize,
    double? maxFontSize,
    double? height,
    double? letterSpacing,
  }) {
    final fontSize = getResponsiveSize(
      context,
      baseSize: baseFontSize,
      minSize: minFontSize,
      maxSize: maxFontSize,
    );

    return TextStyle(
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color ?? Colors.black,
      height: height,
      letterSpacing: letterSpacing,
    );
  }

  /// Get responsive padding based on screen width
  static EdgeInsets getResponsivePadding(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;

    if (screenWidth < 360) {
      return const EdgeInsets.all(8);
    } else if (screenWidth < 600) {
      return const EdgeInsets.all(12);
    } else {
      return const EdgeInsets.all(16);
    }
  }

  /// Check if screen is small (mobile)
  static bool isSmallScreen(BuildContext context) =>
      MediaQuery.of(context).size.width < 600;

  /// Check if screen is medium (tablet)
  static bool isMediumScreen(BuildContext context) =>
      MediaQuery.of(context).size.width >= 600 &&
      MediaQuery.of(context).size.width < 900;

  /// Check if screen is large (large tablet)
  static bool isLargeScreen(BuildContext context) =>
      MediaQuery.of(context).size.width >= 900;

  /// Get responsive button height
  static double getResponsiveButtonHeight(BuildContext context) {
    return isSmallScreen(context) ? 44 : 48;
  }

  /// Get responsive icon size
  static double getResponsiveIconSize(BuildContext context) {
    return isSmallScreen(context) ? 20 : 24;
  }

  /// Get text scale factor multiplier
  static double getTextScaleMultiplier(BuildContext context) {
    final textScaleFactor = MediaQuery.of(context).textScaleFactor;
    // Normalize extreme text scale values
    if (textScaleFactor < 0.8) return 0.8;
    if (textScaleFactor > 1.5) return 1.5;
    return textScaleFactor;
  }
}

/// Extension for easier responsive sizing in widgets
extension ResponsiveContext on BuildContext {
  /// Is small screen (< 600)
  bool get isSmall => MediaQuery.of(this).size.width < 600;

  /// Is medium screen (600 - 900)
  bool get isMedium =>
      MediaQuery.of(this).size.width >= 600 &&
      MediaQuery.of(this).size.width < 900;

  /// Is large screen (>= 900)
  bool get isLarge => MediaQuery.of(this).size.width >= 900;

  /// Screen width
  double get screenWidth => MediaQuery.of(this).size.width;

  /// Screen height
  double get screenHeight => MediaQuery.of(this).size.height;

  /// Responsive font size
  double responsiveSize(double baseSize, {double? minSize, double? maxSize}) =>
      ResponsiveTextHelper.getResponsiveSize(
        this,
        baseSize: baseSize,
        minSize: minSize,
        maxSize: maxSize,
      );

  /// Text scale factor
  double get textScale => MediaQuery.of(this).textScaleFactor;
}
