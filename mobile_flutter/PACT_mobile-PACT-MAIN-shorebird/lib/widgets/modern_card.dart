// lib/widgets/modern_card.dart

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../theme/app_colors.dart';

class ModernCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final double borderRadius;
  final Color? backgroundColor;
  final List<BoxShadow>? boxShadow;
  final Gradient? gradient;
  final BorderSide? borderSide;
  final Duration? animationDuration;
  final Duration? animationDelay;
  final bool animate;
  final VoidCallback? onTap;
  final double? elevation;
  final Widget? headerLeading;
  final String? headerTitle;
  final Widget? headerTrailing;
  final bool withRipple;

  const ModernCard({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.borderRadius = 24,
    this.backgroundColor,
    this.boxShadow,
    this.gradient,
    this.borderSide,
    this.animationDuration,
    this.animationDelay,
    this.animate = true,
    this.onTap,
    this.elevation,
    this.headerLeading,
    this.headerTitle,
    this.headerTrailing,
    this.withRipple = false,
  });

  @override
  Widget build(BuildContext context) {
    final card = Container(
      margin: margin,
      decoration: BoxDecoration(
        color: backgroundColor ?? Colors.white,
        borderRadius: BorderRadius.circular(borderRadius),
        boxShadow:
            boxShadow ??
            [
              BoxShadow(
                color: AppColors.shadowColor.withOpacity(
                  elevation != null ? 0.08 * elevation! : 0.08,
                ),
                blurRadius: elevation != null ? elevation! * 4 : 16,
                spreadRadius: elevation != null ? elevation! * 0.5 : 0,
                offset: const Offset(0, 6),
              ),
            ],
        gradient: gradient,
        border: borderSide != null ? Border.fromBorderSide(borderSide!) : null,
      ),
      child: _buildCardContent(context),
    );

    if (!animate) {
      return _wrapWithTap(card);
    }

    return card
        .animate()
        .fadeIn(
          duration: animationDuration ?? 500.ms,
          delay: animationDelay ?? 0.ms,
        )
        .slideY(
          begin: 0.2,
          end: 0,
          duration: animationDuration ?? 500.ms,
          delay: animationDelay ?? 0.ms,
          curve: Curves.easeOutQuad,
        );
  }

  Widget _buildCardContent(BuildContext context) {
    final content =
        headerTitle != null || headerLeading != null || headerTrailing != null
        ? LayoutBuilder(
            builder: (context, constraints) {
              // Use a Column with an Expanded + SingleChildScrollView to prevent overflow
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.max,
                children: [
                  _buildHeader(),
                  Expanded(
                    child: Padding(
                      padding: padding ?? const EdgeInsets.all(16),
                      child: SingleChildScrollView(
                        physics: const ClampingScrollPhysics(),
                        child: child,
                      ),
                    ),
                  ),
                ],
              );
            },
          )
        : Padding(padding: padding ?? const EdgeInsets.all(16), child: child);

    return ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: content,
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 6), // Reduced padding
      child: Row(
        children: [
          if (headerLeading != null) ...[
            headerLeading!,
            const SizedBox(width: 12),
          ],
          if (headerTitle != null)
            Expanded(
              child: Text(
                headerTitle!,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textDark,
                ),
              ),
            ),
          if (headerTrailing != null) headerTrailing!,
        ],
      ),
    );
  }

  Widget _wrapWithTap(Widget child) {
    if (onTap == null) return child;

    if (withRipple) {
      return Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(borderRadius),
          child: child,
        ),
      );
    }

    return GestureDetector(onTap: onTap, child: child);
  }
}
