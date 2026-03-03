// lib/widgets/safe_scrollable_container.dart
import 'package:flutter/material.dart';

/// A helper widget that wraps [SingleChildScrollView] with [SafeArea]
/// This prevents content from overlapping with system UI elements (status bar, navigation bar)
///
/// Usage:
/// ```dart
/// SafeScrollableContainer(
///   child: Column(
///     children: [...],
///   ),
/// )
/// ```
class SafeScrollableContainer extends StatelessWidget {
  final Widget child;
  final EdgeInsets? padding;
  final EdgeInsets? contentPadding;
  final ScrollPhysics? physics;
  final bool topSafeArea;
  final bool bottomSafeArea;
  final bool leftSafeArea;
  final bool rightSafeArea;

  const SafeScrollableContainer({
    super.key,
    required this.child,
    this.padding,
    this.contentPadding,
    this.physics,
    this.topSafeArea = true,
    this.bottomSafeArea = true,
    this.leftSafeArea = true,
    this.rightSafeArea = true,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: topSafeArea,
      bottom: bottomSafeArea,
      left: leftSafeArea,
      right: rightSafeArea,
      child: SingleChildScrollView(
        padding:
            padding ?? const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        physics: physics ?? const ClampingScrollPhysics(),
        child: child,
      ),
    );
  }
}

/// Alternative: Simple safe area wrapper for fixed-height content
/// Use this when scrolling is not needed
class SafeAreaContainer extends StatelessWidget {
  final Widget child;
  final EdgeInsets? padding;
  final bool topSafeArea;
  final bool bottomSafeArea;
  final bool leftSafeArea;
  final bool rightSafeArea;

  const SafeAreaContainer({
    super.key,
    required this.child,
    this.padding,
    this.topSafeArea = true,
    this.bottomSafeArea = true,
    this.leftSafeArea = true,
    this.rightSafeArea = true,
  });

  @override
  Widget build(BuildContext context) {
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
}

/// A helper to get safe area insets for custom layouts
class SafeAreaInsets {
  static EdgeInsets getInsets(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    return EdgeInsets.fromLTRB(
      mediaQuery.padding.left,
      mediaQuery.padding.top,
      mediaQuery.padding.right,
      mediaQuery.padding.bottom,
    );
  }

  static double getBottomInset(BuildContext context) {
    return MediaQuery.of(context).padding.bottom;
  }

  static double getTopInset(BuildContext context) {
    return MediaQuery.of(context).padding.top;
  }

  static double getLeftInset(BuildContext context) {
    return MediaQuery.of(context).padding.left;
  }

  static double getRightInset(BuildContext context) {
    return MediaQuery.of(context).padding.right;
  }
}
