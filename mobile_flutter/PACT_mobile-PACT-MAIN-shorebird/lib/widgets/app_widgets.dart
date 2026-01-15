// lib/widgets/app_widgets.dart

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../theme/app_colors.dart';
import '../theme/app_design_system.dart';

/// Collection of beautiful, reusable UI widgets for PACT Mobile App

// ============================================
// ENHANCED SNACKBAR / TOAST MESSAGES
// ============================================
class AppSnackBar {
  static void show(
    BuildContext context, {
    required String message,
    SnackBarType type = SnackBarType.info,
    Duration duration = const Duration(seconds: 3),
    String? actionLabel,
    VoidCallback? onAction,
  }) {
    final config = _getConfig(type);
    
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.2),
                borderRadius: BorderRadius.circular(AppDesignSystem.radiusSM),
              ),
              child: Icon(
                config.icon,
                color: Colors.white,
                size: 20,
              ),
            ),
            const SizedBox(width: AppDesignSystem.spaceMD),
            Expanded(
              child: Text(
                message,
                style: AppDesignSystem.bodyMedium.copyWith(
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
        backgroundColor: config.color,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDesignSystem.radiusMD),
        ),
        margin: const EdgeInsets.all(AppDesignSystem.spaceMD),
        duration: duration,
        action: actionLabel != null
            ? SnackBarAction(
                label: actionLabel,
                textColor: Colors.white,
                onPressed: onAction ?? () {},
              )
            : null,
      ),
    );
  }

  static _SnackBarConfig _getConfig(SnackBarType type) {
    switch (type) {
      case SnackBarType.success:
        return _SnackBarConfig(
          color: AppColors.accentGreen,
          icon: Icons.check_circle,
        );
      case SnackBarType.error:
        return _SnackBarConfig(
          color: AppColors.accentRed,
          icon: Icons.error,
        );
      case SnackBarType.warning:
        return _SnackBarConfig(
          color: AppColors.accentYellow,
          icon: Icons.warning_amber_rounded,
        );
      case SnackBarType.info:
        return _SnackBarConfig(
          color: AppColors.primaryBlue,
          icon: Icons.info,
        );
    }
  }
}

class _SnackBarConfig {
  final Color color;
  final IconData icon;

  _SnackBarConfig({required this.color, required this.icon});
}

enum SnackBarType { success, error, warning, info }

// ============================================
// BEAUTIFUL ERROR DIALOG
// ============================================
class AppErrorDialog extends StatelessWidget {
  final String title;
  final String message;
  final String? actionText;
  final VoidCallback? onAction;

  const AppErrorDialog({
    super.key,
    required this.title,
    required this.message,
    this.actionText,
    this.onAction,
  });

  static Future<void> show(
    BuildContext context, {
    required String title,
    required String message,
    String? actionText,
    VoidCallback? onAction,
  }) {
    return showDialog(
      context: context,
      builder: (context) => AppErrorDialog(
        title: title,
        message: message,
        actionText: actionText,
        onAction: onAction,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDesignSystem.radiusXL),
      ),
      child: Container(
        padding: const EdgeInsets.all(AppDesignSystem.spaceLG),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Error Icon
            Container(
              padding: const EdgeInsets.all(AppDesignSystem.spaceLG),
              decoration: BoxDecoration(
                color: AppColors.accentRed.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.error_outline,
                size: 48,
                color: AppColors.accentRed,
              ),
            )
                .animate()
                .scale(duration: 400.ms, curve: Curves.elasticOut)
                .shake(hz: 2, duration: 400.ms),
            
            const SizedBox(height: AppDesignSystem.spaceLG),
            
            // Title
            Text(
              title,
              style: AppDesignSystem.headlineMedium.copyWith(
                color: AppColors.accentRed,
              ),
              textAlign: TextAlign.center,
            ).animate().fadeIn(delay: 200.ms),
            
            const SizedBox(height: AppDesignSystem.spaceSM),
            
            // Message
            Text(
              message,
              style: AppDesignSystem.bodyMedium.copyWith(
                color: AppColors.textLight,
              ),
              textAlign: TextAlign.center,
            ).animate().fadeIn(delay: 300.ms),
            
            const SizedBox(height: AppDesignSystem.spaceLG),
            
            // Actions
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: AppDesignSystem.secondaryButton(),
                    child: const Text('Close'),
                  ),
                ),
                if (actionText != null && onAction != null) ...[
                  const SizedBox(width: AppDesignSystem.spaceSM),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.of(context).pop();
                        onAction?.call();
                      },
                      style: AppDesignSystem.primaryButton(),
                      child: Text(actionText!),
                    ),
                  ),
                ],
              ],
            ).animate().fadeIn(delay: 400.ms).slideY(begin: 0.3, end: 0),
          ],
        ),
      ),
    );
  }
}

// ============================================
// SUCCESS DIALOG
// ============================================
class AppSuccessDialog extends StatelessWidget {
  final String title;
  final String message;
  final String? actionText;
  final VoidCallback? onAction;

  const AppSuccessDialog({
    super.key,
    required this.title,
    required this.message,
    this.actionText,
    this.onAction,
  });

  static Future<void> show(
    BuildContext context, {
    required String title,
    required String message,
    String? actionText,
    VoidCallback? onAction,
  }) {
    return showDialog(
      context: context,
      builder: (context) => AppSuccessDialog(
        title: title,
        message: message,
        actionText: actionText,
        onAction: onAction,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDesignSystem.radiusXL),
      ),
      child: Container(
        padding: const EdgeInsets.all(AppDesignSystem.spaceLG),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Success Icon
            Container(
              padding: const EdgeInsets.all(AppDesignSystem.spaceLG),
              decoration: BoxDecoration(
                color: AppColors.accentGreen.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.check_circle_outline,
                size: 48,
                color: AppColors.accentGreen,
              ),
            )
                .animate()
                .scale(duration: 400.ms, curve: Curves.elasticOut),
            
            const SizedBox(height: AppDesignSystem.spaceLG),
            
            // Title
            Text(
              title,
              style: AppDesignSystem.headlineMedium.copyWith(
                color: AppColors.accentGreen,
              ),
              textAlign: TextAlign.center,
            ).animate().fadeIn(delay: 200.ms),
            
            const SizedBox(height: AppDesignSystem.spaceSM),
            
            // Message
            Text(
              message,
              style: AppDesignSystem.bodyMedium.copyWith(
                color: AppColors.textLight,
              ),
              textAlign: TextAlign.center,
            ).animate().fadeIn(delay: 300.ms),
            
            const SizedBox(height: AppDesignSystem.spaceLG),
            
            // Action
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  Navigator.of(context).pop();
                  onAction?.call();
                },
                style: AppDesignSystem.primaryButton(),
                child: Text(actionText ?? 'Continue'),
              ),
            ).animate().fadeIn(delay: 400.ms).slideY(begin: 0.3, end: 0),
          ],
        ),
      ),
    );
  }
}

// ============================================
// LOADING OVERLAY
// ============================================
class AppLoadingOverlay {
  static void show(BuildContext context, {String? message}) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => _LoadingDialog(message: message),
    );
  }

  static void hide(BuildContext context) {
    Navigator.of(context).pop();
  }
}

class _LoadingDialog extends StatelessWidget {
  final String? message;

  const _LoadingDialog({this.message});

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      elevation: 0,
      child: Container(
        padding: const EdgeInsets.all(AppDesignSystem.spaceLG),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(AppDesignSystem.radiusXL),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(
              valueColor: AlwaysStoppedAnimation<Color>(AppColors.primaryOrange),
            ),
            if (message != null) ...[
              const SizedBox(height: AppDesignSystem.spaceMD),
              Text(
                message!,
                style: AppDesignSystem.bodyMedium,
                textAlign: TextAlign.center,
              ),
            ],
          ],
        ),
      ).animate().fadeIn().scale(begin: const Offset(0.8, 0.8)),
    );
  }
}

// ============================================
// ENHANCED CARD
// ============================================
class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final Color? color;
  final Gradient? gradient;
  final VoidCallback? onTap;
  final List<BoxShadow>? shadows;
  final double? radius;

  const AppCard({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.color,
    this.gradient,
    this.onTap,
    this.shadows,
    this.radius,
  });

  @override
  Widget build(BuildContext context) {
    final content = Container(
      padding: padding ?? const EdgeInsets.all(AppDesignSystem.spaceMD),
      margin: margin,
      decoration: AppDesignSystem.cardDecoration(
        color: color,
        gradient: gradient,
        shadows: shadows,
        radius: radius,
      ),
      child: child,
    );

    if (onTap != null) {
      return InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(radius ?? AppDesignSystem.radiusMD),
        child: content,
      );
    }

    return content;
  }
}

// ============================================
// SECTION HEADER
// ============================================
class SectionHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  const SectionHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppDesignSystem.spaceMD,
          vertical: AppDesignSystem.spaceSM,
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: AppDesignSystem.titleLarge,
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle!,
                      style: AppDesignSystem.bodySmall,
                    ),
                  ],
                ],
              ),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      ),
    );
  }
}

// ============================================
// STATUS BADGE
// ============================================
class StatusBadge extends StatelessWidget {
  final String text;
  final StatusType type;
  // When true, renders a more compact badge suitable for tight layouts.
  final bool compact;

  const StatusBadge({
    super.key,
    required this.text,
    required this.type,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final config = _getStatusConfig(type);
    
  final horizontalPadding = compact ? 6.0 : 12.0;
  final verticalPadding = compact ? 2.0 : 6.0;
  final dotSize = compact ? 5.0 : 8.0;
  final gap = compact ? 4.0 : 8.0;

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: horizontalPadding,
        vertical: verticalPadding,
      ),
      decoration: BoxDecoration(
        color: config.color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(AppDesignSystem.radiusFull),
        border: Border.all(
          color: config.color.withOpacity(0.3),
          width: 1,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: dotSize,
            height: dotSize,
            decoration: BoxDecoration(
              color: config.color,
              shape: BoxShape.circle,
            ),
          ),
          SizedBox(width: gap),
          Text(
            text,
            style: (compact
                    ? AppDesignSystem.labelSmall
                    : AppDesignSystem.labelMedium)
                .copyWith(
              color: config.color,
              fontWeight: FontWeight.w600,
              fontSize: compact ? 10 : null,
            ),
          ),
        ],
      ),
    );
  }

  _StatusConfig _getStatusConfig(StatusType type) {
    switch (type) {
      case StatusType.success:
        return _StatusConfig(color: AppColors.accentGreen);
      case StatusType.error:
        return _StatusConfig(color: AppColors.accentRed);
      case StatusType.warning:
        return _StatusConfig(color: AppColors.accentYellow);
      case StatusType.info:
        return _StatusConfig(color: AppColors.primaryBlue);
      case StatusType.pending:
        return _StatusConfig(color: AppColors.accentOrange);
    }
  }
}

class _StatusConfig {
  final Color color;
  _StatusConfig({required this.color});
}

enum StatusType { success, error, warning, info, pending }

// ============================================
// ICON BUTTON WITH BADGE
// ============================================
class IconButtonWithBadge extends StatelessWidget {
  final IconData icon;
  final VoidCallback onPressed;
  final int? badgeCount;
  final Color? color;

  const IconButtonWithBadge({
    super.key,
    required this.icon,
    required this.onPressed,
    this.badgeCount,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        IconButton(
          onPressed: onPressed,
          icon: Icon(icon),
          color: color ?? AppColors.textDark,
        ),
        if (badgeCount != null && badgeCount! > 0)
          Positioned(
            right: 8,
            top: 8,
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: const BoxDecoration(
                color: AppColors.accentRed,
                shape: BoxShape.circle,
              ),
              constraints: const BoxConstraints(
                minWidth: 16,
                minHeight: 16,
              ),
              child: Text(
                badgeCount! > 99 ? '99+' : badgeCount.toString(),
                style: AppDesignSystem.labelSmall.copyWith(
                  color: Colors.white,
                  fontSize: 10,
                ),
                textAlign: TextAlign.center,
              ),
            ).animate().scale(duration: 300.ms, curve: Curves.elasticOut),
          ),
      ],
    );
  }
}
