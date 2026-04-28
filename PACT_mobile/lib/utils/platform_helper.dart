import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';

/// Helper for platform-specific UI patterns
class PlatformHelper {
  static bool get isIOS => Platform.isIOS;
  static bool get isAndroid => Platform.isAndroid;

  /// Build platform-specific button
  /// Returns CupertinoButton on iOS, ElevatedButton on Android
  static Widget buildPlatformButton({
    required VoidCallback onPressed,
    required String label,
    bool isDestructive = false,
    bool isLoading = false,
  }) {
    if (isIOS) {
      return CupertinoButton(
        onPressed: isLoading ? null : onPressed,
        color: isDestructive
            ? CupertinoColors.systemRed
            : CupertinoColors.systemBlue,
        child: isLoading ? const CupertinoActivityIndicator() : Text(label),
      );
    } else {
      return ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: isDestructive ? Colors.red : Colors.blue,
          foregroundColor: Colors.white,
        ),
        child: isLoading
            ? const SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                ),
              )
            : Text(label),
      );
    }
  }

  /// Build platform-specific dialog/alert
  static void showPlatformDialog({
    required BuildContext context,
    required String title,
    required String message,
    String? cancelButtonText,
    String? confirmButtonText,
    VoidCallback? onCancel,
    VoidCallback? onConfirm,
    bool isDestructive = false,
  }) {
    if (isIOS) {
      showCupertinoDialog(
        context: context,
        builder: (context) => CupertinoAlertDialog(
          title: Text(title),
          content: Text(message),
          actions: [
            if (cancelButtonText != null)
              CupertinoDialogAction(
                onPressed: () {
                  Navigator.pop(context);
                  onCancel?.call();
                },
                child: Text(cancelButtonText),
              ),
            if (confirmButtonText != null)
              CupertinoDialogAction(
                isDestructiveAction: isDestructive,
                onPressed: () {
                  Navigator.pop(context);
                  onConfirm?.call();
                },
                child: Text(confirmButtonText),
              ),
          ],
        ),
      );
    } else {
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(title),
          content: Text(message),
          actions: [
            if (cancelButtonText != null)
              TextButton(
                onPressed: () {
                  Navigator.pop(context);
                  onCancel?.call();
                },
                child: Text(cancelButtonText),
              ),
            if (confirmButtonText != null)
              TextButton(
                onPressed: () {
                  Navigator.pop(context);
                  onConfirm?.call();
                },
                child: Text(
                  confirmButtonText,
                  style: TextStyle(
                    color: isDestructive ? Colors.red : Colors.blue,
                  ),
                ),
              ),
          ],
        ),
      );
    }
  }

  /// Build platform-specific text field
  static Widget buildPlatformTextField({
    required TextEditingController controller,
    required String placeholder,
    TextInputType keyboardType = TextInputType.text,
    int maxLines = 1,
    VoidCallback? onChanged,
  }) {
    if (isIOS) {
      return CupertinoTextField(
        controller: controller,
        placeholder: placeholder,
        keyboardType: keyboardType,
        maxLines: maxLines,
        padding: const EdgeInsets.all(12),
        onChanged: (_) => onChanged?.call(),
      );
    } else {
      return TextField(
        controller: controller,
        decoration: InputDecoration(
          hintText: placeholder,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
          contentPadding: const EdgeInsets.all(12),
        ),
        keyboardType: keyboardType,
        maxLines: maxLines,
        onChanged: (_) => onChanged?.call(),
      );
    }
  }

  /// Get platform-specific icon
  static IconData getIcon(IconData androidIcon, IconData iosIcon) {
    return isIOS ? iosIcon : androidIcon;
  }

  /// Get platform-specific color scheme
  static Color getPrimaryColor(BuildContext context) {
    return isIOS ? CupertinoColors.systemBlue : Theme.of(context).primaryColor;
  }

  /// Show platform-specific snackbar/toast
  static void showSnackBar(BuildContext context, String message) {
    if (isIOS) {
      showCupertinoDialog(
        context: context,
        builder: (context) => CupertinoAlertDialog(
          content: Text(message),
          actions: [
            CupertinoDialogAction(
              onPressed: () => Navigator.pop(context),
              child: const Text('OK'),
            ),
          ],
        ),
      );
    } else {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
    }
  }

  /// Get platform-specific navigation style
  static Duration get animationDuration {
    return isIOS
        ? const Duration(milliseconds: 400)
        : const Duration(milliseconds: 300);
  }

  /// Build platform-specific switch
  static Widget buildPlatformSwitch({
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    if (isIOS) {
      return CupertinoSwitch(value: value, onChanged: onChanged);
    } else {
      return Switch(value: value, onChanged: onChanged);
    }
  }

  /// Check if using iOS-style navigation
  static bool get usesIOSNavigation => isIOS;

  /// Get safe padding based on platform
  static EdgeInsets getPlatformPadding(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    if (isIOS) {
      return EdgeInsets.fromLTRB(
        mediaQuery.padding.left,
        mediaQuery.padding.top,
        mediaQuery.padding.right,
        mediaQuery.padding.bottom,
      );
    }
    return mediaQuery.padding;
  }
}
