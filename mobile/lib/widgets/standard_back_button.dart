import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// StandardBackButton provides a single, consistent back button
/// implementation used across all screens for strict visual consistency.
///
/// Usage:
/// ```dart
/// AppBar(
///   leading: const StandardBackButton(),
///   // ... rest of AppBar config
/// )
/// ```
///
/// Customization available:
/// ```dart
/// StandardBackButton(
///   color: Colors.black,
///   size: 24,
///   enableHaptics: false,
///   onPressed: () => Navigator.pop(context),
/// )
/// ```
class StandardBackButton extends StatelessWidget {
  /// Icon color - defaults to white for use on colored AppBars
  final Color color;

  /// Icon size - defaults to 20
  final double size;

  /// Enable haptic feedback on press - defaults to true
  final bool enableHaptics;

  /// Custom callback - if not provided, will pop Navigator
  /// This should only be used in exceptional cases. Standard behavior
  /// is Navigator.pop(context).
  final VoidCallback? onPressed;

  /// Optional tooltip text
  final String? tooltip;

  const StandardBackButton({
    super.key,
    this.color = Colors.white,
    this.size = 20,
    this.enableHaptics = true,
    this.onPressed,
    this.tooltip,
  });

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: Icon(Icons.arrow_back, color: color, size: size),
      tooltip: tooltip ?? MaterialLocalizations.of(context).backButtonTooltip,
      onPressed: () {
        if (enableHaptics) {
          HapticFeedback.lightImpact();
        }
        if (onPressed != null) {
          onPressed!.call();
        } else {
          Navigator.pop(context);
        }
      },
    );
  }
}

/// StandardBackButtonBar is an extended version that provides the complete
/// leading back button behavior (padding, tooltip, etc.) and should be used
/// for AppBar.leading when you want to ensure consistent styling and spacing.
class StandardBackButtonBar extends StatelessWidget {
  /// Icon color - defaults to white
  final Color color;

  /// Icon size - defaults to 20
  final double size;

  /// Enable haptic feedback - defaults to true
  final bool enableHaptics;

  /// Custom callback
  final VoidCallback? onPressed;

  const StandardBackButtonBar({
    super.key,
    this.color = Colors.white,
    this.size = 20,
    this.enableHaptics = true,
    this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.only(left: 4),
        child: StandardBackButton(
          color: color,
          size: size,
          enableHaptics: enableHaptics,
          onPressed: onPressed,
        ),
      ),
    );
  }
}
