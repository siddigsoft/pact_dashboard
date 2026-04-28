import 'package:flutter/material.dart';
import '../utils/responsive_text_helper.dart';
import 'reusable_app_bar.dart';

/// Base responsive screen for consistent UI/UX across all screens
class ResponsiveBaseScreen extends StatelessWidget {
  final String title;
  final Widget body;
  final List<Widget>? appBarActions;
  final Widget? floatingActionButton;
  final bool hasAppBar;
  final Color? backgroundColor;
  final EdgeInsets? bodyPadding;
  final bool hasBottomSafeArea;
  final PreferredSizeWidget? customAppBar;
  final Widget? bottomNavigationBar;
  final bool scrollable;

  const ResponsiveBaseScreen({
    super.key,
    required this.title,
    required this.body,
    this.appBarActions,
    this.floatingActionButton,
    this.hasAppBar = true,
    this.backgroundColor,
    this.bodyPadding,
    this.hasBottomSafeArea = true,
    this.customAppBar,
    this.bottomNavigationBar,
    this.scrollable = true,
  });

  @override
  Widget build(BuildContext context) {
    final isSmallScreen = context.isSmall;
    final screenPadding = isSmallScreen
        ? const EdgeInsets.all(12)
        : const EdgeInsets.all(16);

    Widget bodyWidget = body;

    if (scrollable) {
      bodyWidget = SingleChildScrollView(
        child: Padding(padding: bodyPadding ?? screenPadding, child: body),
      );
    } else {
      bodyWidget = Padding(padding: bodyPadding ?? screenPadding, child: body);
    }

    return Scaffold(
      backgroundColor: backgroundColor ?? Colors.white,
      appBar:
          customAppBar ??
          (hasAppBar
              ? ReusableAppBar(
                  title: title,
                  actions: appBarActions,
                  centerTitle: false,
                )
              : null),
      body: SafeArea(bottom: hasBottomSafeArea, child: bodyWidget),
      floatingActionButton: floatingActionButton != null
          ? SafeArea(bottom: true, right: true, child: floatingActionButton!)
          : null,
      bottomNavigationBar: bottomNavigationBar,
    );
  }
}

/// Responsive screen with custom layout control
class ResponsiveScaffold extends StatelessWidget {
  final String? title;
  final Widget body;
  final List<Widget>? actions;
  final Widget? floatingActionButton;
  final Color? backgroundColor;
  final bool extendBodyBehindAppBar;
  final bool safeAreaLeft;
  final bool safeAreaRight;
  final bool safeAreaTop;
  final bool safeAreaBottom;

  const ResponsiveScaffold({
    super.key,
    this.title,
    required this.body,
    this.actions,
    this.floatingActionButton,
    this.backgroundColor,
    this.extendBodyBehindAppBar = false,
    this.safeAreaLeft = true,
    this.safeAreaRight = true,
    this.safeAreaTop = true,
    this.safeAreaBottom = true,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: backgroundColor ?? Colors.white,
      extendBodyBehindAppBar: extendBodyBehindAppBar,
      appBar: title != null
          ? ReusableAppBar(
              title: title!,
              actions: actions,
            )
          : null,
      body: SafeArea(
        left: safeAreaLeft,
        right: safeAreaRight,
        top: safeAreaTop,
        bottom: safeAreaBottom,
        child: body,
      ),
      floatingActionButton: floatingActionButton,
    );
  }
}

/// Responsive dialog that adapts to screen size
class ResponsiveDialog extends StatelessWidget {
  final String title;
  final Widget content;
  final List<Widget>? actions;
  final bool barrierDismissible;
  final Color? backgroundColor;

  const ResponsiveDialog({
    super.key,
    required this.title,
    required this.content,
    this.actions,
    this.barrierDismissible = true,
    this.backgroundColor,
  });

  @override
  Widget build(BuildContext context) {
    final isSmallScreen = context.isSmall;

    return Dialog(
      backgroundColor: backgroundColor ?? Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      insetPadding: EdgeInsets.all(isSmallScreen ? 12 : 24),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 16),
            content,
            const SizedBox(height: 16),
            if (actions != null)
              Row(mainAxisAlignment: MainAxisAlignment.end, children: actions!),
          ],
        ),
      ),
    );
  }

  /// Helper to show dialog
  static Future<T?> show<T>(
    BuildContext context, {
    required String title,
    required Widget content,
    List<Widget>? actions,
    bool barrierDismissible = true,
  }) {
    return showDialog<T>(
      context: context,
      barrierDismissible: barrierDismissible,
      builder: (context) => ResponsiveDialog(
        title: title,
        content: content,
        actions: actions,
        barrierDismissible: barrierDismissible,
      ),
    );
  }
}

/// Adaptive blank screen padding
class AdaptiveBlank extends StatelessWidget {
  final double height;

  const AdaptiveBlank({super.key, required this.height});

  @override
  Widget build(BuildContext context) {
    final scaledHeight = height * context.textScale;
    return SizedBox(height: scaledHeight);
  }
}

/// Responsive card widget
class ResponsiveCard extends StatelessWidget {
  final Widget child;
  final Color? color;
  final double? elevation;
  final EdgeInsets? padding;
  final BorderRadius? borderRadius;
  final VoidCallback? onTap;

  const ResponsiveCard({
    super.key,
    required this.child,
    this.color,
    this.elevation,
    this.padding,
    this.borderRadius,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      color: color,
      elevation: elevation ?? 2,
      shape: RoundedRectangleBorder(
        borderRadius: borderRadius ?? BorderRadius.circular(12),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: borderRadius ?? BorderRadius.circular(12),
        child: Padding(
          padding: padding ?? const EdgeInsets.all(16),
          child: child,
        ),
      ),
    );
  }
}
