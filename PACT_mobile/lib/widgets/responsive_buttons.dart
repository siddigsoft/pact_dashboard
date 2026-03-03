import 'package:flutter/material.dart';
import '../utils/responsive_text_helper.dart';
import 'package:google_fonts/google_fonts.dart';

/// Safe area button wrapper to ensure buttons are always visible and accessible
class SafeAreaButton extends StatefulWidget {
  final Widget child;
  final VoidCallback onPressed;
  final Color? backgroundColor;
  final EdgeInsets? padding;
  final bool hasSafeArea;
  final bool isLoading;
  final double? minHeight;

  const SafeAreaButton({
    super.key,
    required this.child,
    required this.onPressed,
    this.backgroundColor,
    this.padding,
    this.hasSafeArea = true,
    this.isLoading = false,
    this.minHeight,
  });

  @override
  State<SafeAreaButton> createState() => _SafeAreaButtonState();
}

class _SafeAreaButtonState extends State<SafeAreaButton> {
  @override
  Widget build(BuildContext context) {
    final button = Material(
      color: widget.backgroundColor ?? Colors.transparent,
      child: InkWell(
        onTap: widget.isLoading ? null : widget.onPressed,
        child: Container(
          constraints: BoxConstraints(minHeight: widget.minHeight ?? 44),
          padding: widget.padding ?? const EdgeInsets.all(12),
          child: widget.isLoading
              ? SizedBox(
                  height: 24,
                  width: 24,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(
                      Theme.of(context).primaryColor,
                    ),
                  ),
                )
              : widget.child,
        ),
      ),
    );

    if (!widget.hasSafeArea) return button;

    return SafeArea(bottom: true, child: button);
  }
}

/// Responsive button with automatic size adjustment
class ResponsiveButton extends StatelessWidget {
  final String label;
  final VoidCallback onPressed;
  final Color? backgroundColor;
  final Color? textColor;
  final bool isLoading;
  final bool isFullWidth;
  final Icon? icon;
  final double? customHeight;

  const ResponsiveButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.backgroundColor,
    this.textColor,
    this.isLoading = false,
    this.isFullWidth = true,
    this.icon,
    this.customHeight,
  });

  @override
  Widget build(BuildContext context) {
    final buttonHeight =
        customHeight ?? ResponsiveTextHelper.getResponsiveButtonHeight(context);
    const minWidth = 80.0;

    final button = Container(
      height: buttonHeight,
      constraints: BoxConstraints(
        minWidth: isFullWidth ? double.infinity : minWidth,
      ),
      decoration: BoxDecoration(
        color: backgroundColor ?? Theme.of(context).primaryColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: isLoading ? null : onPressed,
          borderRadius: BorderRadius.circular(12),
          child: isLoading
              ? Center(
                  child: SizedBox(
                    height: 24,
                    width: 24,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation<Color>(
                        textColor ?? Colors.white,
                      ),
                    ),
                  ),
                )
              : Center(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (icon != null) ...[icon!, const SizedBox(width: 8)],
                      Flexible(
                        child: Text(
                          label,
                          textAlign: TextAlign.center,
                          style: GoogleFonts.poppins(
                            fontSize: ResponsiveTextHelper.getResponsiveSize(
                              context,
                              baseSize: 16,
                              minSize: 12,
                              maxSize: 18,
                            ),
                            fontWeight: FontWeight.w600,
                            color: textColor ?? Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
        ),
      ),
    );

    return SafeArea(bottom: true, child: button);
  }
}

/// Icon button with safe area and responsive sizing
class ResponsiveIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onPressed;
  final String? tooltip;
  final Color? iconColor;
  final double? iconSize;
  final Color? backgroundColor;
  final bool hasSafeArea;

  const ResponsiveIconButton({
    super.key,
    required this.icon,
    required this.onPressed,
    this.tooltip,
    this.iconColor,
    this.iconSize,
    this.backgroundColor,
    this.hasSafeArea = false,
  });

  @override
  Widget build(BuildContext context) {
    final size =
        iconSize ?? ResponsiveTextHelper.getResponsiveIconSize(context);

    final button = Container(
      decoration: BoxDecoration(color: backgroundColor, shape: BoxShape.circle),
      child: Tooltip(
        message: tooltip ?? '',
        child: IconButton(
          icon: Icon(icon, size: size),
          color: iconColor,
          onPressed: onPressed,
        ),
      ),
    );

    if (!hasSafeArea) return button;

    return SafeArea(child: button);
  }
}

/// Bottom button bar with safe area
class ResponsiveBottomButtonBar extends StatelessWidget {
  final List<Widget> children;
  final MainAxisAlignment mainAxisAlignment;
  final Color? backgroundColor;
  final EdgeInsets? padding;

  const ResponsiveBottomButtonBar({
    super.key,
    required this.children,
    this.mainAxisAlignment = MainAxisAlignment.spaceEvenly,
    this.backgroundColor,
    this.padding,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Container(
        color: backgroundColor ?? Colors.white,
        padding: padding ?? const EdgeInsets.all(16),
        child: Row(mainAxisAlignment: mainAxisAlignment, children: children),
      ),
    );
  }
}

/// Floating action button with safe area
class ResponsiveFloatingActionButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onPressed;
  final String? tooltip;
  final Color? backgroundColor;
  final bool hasSafeArea;

  const ResponsiveFloatingActionButton({
    super.key,
    required this.icon,
    required this.onPressed,
    this.tooltip,
    this.backgroundColor,
    this.hasSafeArea = true,
  });

  @override
  Widget build(BuildContext context) {
    final fab = FloatingActionButton(
      onPressed: onPressed,
      tooltip: tooltip,
      backgroundColor: backgroundColor ?? Theme.of(context).primaryColor,
      child: Icon(icon),
    );

    if (!hasSafeArea) return fab;

    return SafeArea(bottom: true, right: true, child: fab);
  }
}
