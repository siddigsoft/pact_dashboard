import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Error Handler Service for consistent error UI/UX across the app
class AppErrorHandler {
  static final AppErrorHandler _instance = AppErrorHandler._internal();

  factory AppErrorHandler() {
    return _instance;
  }

  AppErrorHandler._internal();

  /// Show network error dialog
  static Future<void> showNetworkError(
    BuildContext context, {
    String? message,
    VoidCallback? onRetry,
    VoidCallback? onCancel,
  }) async {
    return _showErrorDialog(
      context,
      title: 'Connection Error',
      message:
          message ??
          'Unable to connect. Please check your internet connection.',
      icon: Icons.wifi_off_outlined,
      iconColor: Colors.red,
      onRetry: onRetry,
      onCancel: onCancel,
    );
  }

  /// Show authentication error dialog
  static Future<void> showAuthError(
    BuildContext context, {
    String? message,
    VoidCallback? onRetry,
  }) async {
    return _showErrorDialog(
      context,
      title: 'Authentication Failed',
      message: message ?? 'Invalid email or password. Please try again.',
      icon: Icons.lock_outline,
      iconColor: Colors.orange,
      onRetry: onRetry,
      showCancel: false,
    );
  }

  /// Show session expired dialog
  static Future<void> showSessionExpired(
    BuildContext context, {
    VoidCallback? onLogin,
  }) async {
    return _showErrorDialog(
      context,
      title: 'Session Expired',
      message: 'Your session has expired. Please log in again.',
      icon: Icons.schedule_outlined,
      iconColor: Colors.amber,
      onRetry: onLogin,
      retryLabel: 'Log In Again',
      showCancel: false,
    );
  }

  /// Show server error dialog
  static Future<void> showServerError(
    BuildContext context, {
    String? statusCode,
    String? message,
    VoidCallback? onRetry,
  }) async {
    final displayMessage = message ?? 'Server error. Please try again later.';
    final fullMessage = statusCode != null
        ? '$displayMessage\n\nError Code: $statusCode'
        : displayMessage;

    return _showErrorDialog(
      context,
      title: 'Server Error',
      message: fullMessage,
      icon: Icons.cloud_off_outlined,
      iconColor: Colors.red,
      onRetry: onRetry,
    );
  }

  /// Show validation error dialog
  static Future<void> showValidationError(
    BuildContext context, {
    required List<String> errors,
    VoidCallback? onOk,
  }) async {
    return _showErrorDialog(
      context,
      title: 'Validation Error',
      message: errors.join('\n• '),
      icon: Icons.warning_amber_outlined,
      iconColor: Colors.orange,
      onRetry: onOk,
      retryLabel: 'OK',
      showCancel: false,
    );
  }

  /// Show offline mode alert
  static Future<void> showOfflineAlert(
    BuildContext context, {
    VoidCallback? onDismiss,
  }) async {
    return _showErrorDialog(
      context,
      title: 'Offline Mode',
      message:
          'You are offline. Your data will sync when connection is restored.',
      icon: Icons.cloud_queue_outlined,
      iconColor: AppColors.primaryOrange,
      onRetry: onDismiss,
      retryLabel: 'Got it',
      showCancel: false,
    );
  }

  /// Show generic error dialog
  static Future<void> showGenericError(
    BuildContext context, {
    String? title,
    required String message,
    VoidCallback? onRetry,
    VoidCallback? onCancel,
  }) async {
    return _showErrorDialog(
      context,
      title: title ?? 'Error',
      message: message,
      icon: Icons.error_outline,
      iconColor: Colors.red,
      onRetry: onRetry,
      onCancel: onCancel,
    );
  }

  /// Show timeout error dialog
  static Future<void> showTimeoutError(
    BuildContext context, {
    VoidCallback? onRetry,
  }) async {
    return _showErrorDialog(
      context,
      title: 'Request Timeout',
      message:
          'The request took too long. Please check your connection and try again.',
      icon: Icons.schedule_outlined,
      iconColor: Colors.red,
      onRetry: onRetry,
    );
  }

  /// Internal generic error dialog
  static Future<void> _showErrorDialog(
    BuildContext context, {
    required String title,
    required String message,
    required IconData icon,
    required Color iconColor,
    VoidCallback? onRetry,
    VoidCallback? onCancel,
    String? retryLabel,
    bool showCancel = true,
  }) async {
    return showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.primaryWhite,
        elevation: 8,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Column(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: iconColor.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: iconColor, size: 32),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: AppColors.textDark,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
        content: Text(
          message,
          style: GoogleFonts.poppins(
            fontSize: 14,
            fontWeight: FontWeight.w400,
            color: AppColors.textLight,
            height: 1.5,
          ),
          textAlign: TextAlign.center,
        ),
        actions: [
          if (showCancel)
            TextButton(
              onPressed: () {
                Navigator.pop(context);
                onCancel?.call();
              },
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 8,
                ),
              ),
              child: Text(
                'Cancel',
                style: GoogleFonts.poppins(
                  color: AppColors.textLight,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              onRetry?.call();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryOrange,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            child: Text(
              retryLabel ?? 'Retry',
              style: GoogleFonts.poppins(
                color: Colors.white,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Show error snackbar for quick feedback (less intrusive than dialog)
void showErrorSnackbar(
  BuildContext context, {
  required String message,
  Duration duration = const Duration(seconds: 4),
  VoidCallback? onUndo,
}) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Row(
        children: [
          const Icon(Icons.error_outline, color: Colors.white, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: GoogleFonts.poppins(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
      backgroundColor: Colors.red.shade700,
      duration: duration,
      behavior: SnackBarBehavior.floating,
      margin: const EdgeInsets.all(16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      action: onUndo != null
          ? SnackBarAction(
              label: 'Undo',
              textColor: Colors.white,
              onPressed: onUndo,
            )
          : null,
    ),
  );
}

/// Show success snackbar
void showSuccessSnackbar(
  BuildContext context, {
  required String message,
  Duration duration = const Duration(seconds: 3),
}) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Row(
        children: [
          const Icon(Icons.check_circle_outline, color: Colors.white, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: GoogleFonts.poppins(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
      backgroundColor: Colors.green.shade600,
      duration: duration,
      behavior: SnackBarBehavior.floating,
      margin: const EdgeInsets.all(16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
  );
}

/// Show info snackbar
void showInfoSnackbar(
  BuildContext context, {
  required String message,
  Duration duration = const Duration(seconds: 3),
}) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Row(
        children: [
          const Icon(Icons.info_outline, color: Colors.white, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: GoogleFonts.poppins(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
      backgroundColor: Colors.blue.shade600,
      duration: duration,
      behavior: SnackBarBehavior.floating,
      margin: const EdgeInsets.all(16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
  );
}
