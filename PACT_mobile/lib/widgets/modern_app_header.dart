// lib/widgets/modern_app_header.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// PACT Command Strip — the unified app header.
///
/// Design language: clean white surface with a 3-px orange gradient
/// underline as the brand anchor. Deep-navy typography. Pill-shaped
/// leading and action buttons with a soft navy tint.
class ModernAppHeader extends StatelessWidget {
  final String title;
  final IconData? leadingIcon;
  final VoidCallback? onLeadingIconPressed;
  final List<Widget>? actions;
  final bool showBackButton;
  final bool centerTitle;
  final Color? backgroundColor;
  final Color? textColor;

  const ModernAppHeader({
    super.key,
    required this.title,
    this.leadingIcon,
    this.onLeadingIconPressed,
    this.actions,
    this.showBackButton = false,
    this.centerTitle = false,
    this.backgroundColor,
    this.textColor,
  });

  // ── colours ────────────────────────────────────────────────────────────
  static const _navy = Color(0xFF0C1A2E);
  static const _navyTint = Color(0x120C1A2E); // 7 % opacity navy pill bg

  bool get _hasLeading => showBackButton || leadingIcon != null;
  bool get _hasActions => actions != null && actions!.isNotEmpty;

  @override
  Widget build(BuildContext context) {
    final bg = backgroundColor ?? Colors.white;
    final fg = textColor ?? _navy;
    final isLight = ThemeData.estimateBrightnessForColor(bg) == Brightness.light;
    final pillBg = isLight ? _navyTint : Colors.white.withOpacity(0.12);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // ── main bar ───────────────────────────────────────────────────
        Container(
          width: double.infinity,
          color: bg,
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  // Leading — back / menu button
                  if (_hasLeading) ...[
                    _PillButton(
                      icon: leadingIcon ?? Icons.arrow_back_ios_rounded,
                      color: fg,
                      background: pillBg,
                      size: 20,
                      onTap: () {
                        HapticFeedback.lightImpact();
                        if (onLeadingIconPressed != null) {
                          onLeadingIconPressed!();
                        } else if (showBackButton) {
                          Navigator.pop(context);
                        }
                      },
                    )
                        .animate()
                        .fadeIn(duration: 350.ms)
                        .slideX(
                          begin: -0.25,
                          end: 0,
                          duration: 350.ms,
                          curve: Curves.easeOutCubic,
                        ),
                    const SizedBox(width: 12),
                  ],

                  // Title
                  Expanded(
                    child: Text(
                      title,
                      textAlign: centerTitle ? TextAlign.center : TextAlign.start,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.outfit(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: fg,
                        letterSpacing: 0.1,
                        height: 1.2,
                      ),
                    )
                        .animate()
                        .fadeIn(duration: 400.ms, delay: 50.ms)
                        .slideY(
                          begin: 0.15,
                          end: 0,
                          duration: 350.ms,
                          curve: Curves.easeOutCubic,
                        ),
                  ),

                  // Actions
                  if (_hasActions) ...[
                    const SizedBox(width: 8),
                    ...actions!.map(
                      (a) => a
                          .animate()
                          .fadeIn(duration: 350.ms, delay: 100.ms)
                          .scale(
                            begin: const Offset(0.85, 0.85),
                            duration: 350.ms,
                            curve: Curves.easeOutBack,
                          ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),

        // ── orange brand underline ─────────────────────────────────────
        Container(
          height: 3,
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [AppColors.primaryOrange, AppColors.lightOrange],
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
            ),
          ),
        ),
      ],
    );
  }
}

// ── Pill-shaped icon button ─────────────────────────────────────────────────
class _PillButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final Color color;
  final Color background;
  final double size;

  const _PillButton({
    required this.icon,
    required this.onTap,
    required this.color,
    required this.background,
    this.size = 20,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: background,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(9),
          child: Icon(icon, color: color, size: size),
        ),
      ),
    );
  }
}

// ── Public action-button helper ─────────────────────────────────────────────
/// Drop-in action button for [ModernAppHeader] and [ReusableAppBar].
class HeaderActionButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onPressed;
  final String? tooltip;
  final Color? color;
  final Color? backgroundColor;

  const HeaderActionButton({
    super.key,
    required this.icon,
    required this.onPressed,
    this.tooltip,
    this.color,
    this.backgroundColor,
  });

  @override
  Widget build(BuildContext context) {
    const pillBg = Color(0x120C1A2E);

    return Tooltip(
      message: tooltip ?? '',
      child: Material(
        color: backgroundColor ?? pillBg,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () {
            HapticFeedback.lightImpact();
            onPressed();
          },
          child: Padding(
            padding: const EdgeInsets.all(9),
            child: Icon(
              icon,
              color: color ?? const Color(0xFF0C1A2E),
              size: 22,
            ),
          ),
        ),
      ),
    );
  }
}
