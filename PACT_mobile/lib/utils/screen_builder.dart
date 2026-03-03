// lib/utils/screen_builder.dart
import 'package:flutter/material.dart';

/// Utility class for building screens with proper SafeArea and responsive design
/// This ensures all screens have consistent safe area handling
class ScreenBuilder {
  /// Build a scrollable screen content with SafeArea
  /// Use this for screens with vertical scrolling content
  static Widget scrollableContent({
    required BuildContext context,
    required Widget child,
    EdgeInsets? padding,
    ScrollPhysics? physics,
    bool topSafeArea = true,
    bool bottomSafeArea = true,
    bool leftSafeArea = true,
    bool rightSafeArea = true,
  }) {
    return SafeArea(
      top: topSafeArea,
      bottom: bottomSafeArea,
      left: leftSafeArea,
      right: rightSafeArea,
      child: SingleChildScrollView(
        physics: physics ?? const ClampingScrollPhysics(),
        padding:
            padding ?? const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        child: child,
      ),
    );
  }

  /// Build a fixed-height screen content with SafeArea
  /// Use this for screens that don't need scrolling
  static Widget fixedContent({
    required Widget child,
    EdgeInsets? padding,
    bool topSafeArea = true,
    bool bottomSafeArea = true,
    bool leftSafeArea = true,
    bool rightSafeArea = true,
  }) {
    return SafeArea(
      top: topSafeArea,
      bottom: bottomSafeArea,
      left: leftSafeArea,
      right: rightSafeArea,
      child: Padding(
        padding: padding ?? const EdgeInsets.all(16),
        child: child,
      ),
    );
  }

  /// Build content with custom flex layout (Column + Expanded)
  /// Use this for screens with header and expandable content
  static Widget flextContent({
    required Widget Function(BuildContext) builder,
    bool topSafeArea = true,
    bool bottomSafeArea = true,
  }) {
    return Builder(
      builder: (context) {
        final content = builder(context);
        return SafeArea(
          top: topSafeArea,
          bottom: bottomSafeArea,
          child: content,
        );
      },
    );
  }

  /// Get safe area insets for custom layouts
  static EdgeInsets getInsets(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    return EdgeInsets.fromLTRB(
      mediaQuery.padding.left,
      mediaQuery.padding.top,
      mediaQuery.padding.right,
      mediaQuery.padding.bottom,
    );
  }

  static double getBottomSafeArea(BuildContext context) {
    return MediaQuery.of(context).padding.bottom;
  }

  static double getTopSafeArea(BuildContext context) {
    return MediaQuery.of(context).padding.top;
  }
}

/// Extension on BuildContext for easier safe area access
extension SafeAreaExt on BuildContext {
  EdgeInsets get safeAreaInsets => ScreenBuilder.getInsets(this);
  double get bottomSafeArea => ScreenBuilder.getBottomSafeArea(this);
  double get topSafeArea => ScreenBuilder.getTopSafeArea(this);
}
