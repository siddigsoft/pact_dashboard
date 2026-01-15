// lib/utils/error_handler.dart

import 'package:flutter/material.dart';
import '../widgets/app_widgets.dart';

/// Centralized error handling utilities for consistent user-friendly error messages
class ErrorHandler {
  /// Show a user-friendly error message based on the exception type
  static void showError(BuildContext context, dynamic error, {
    String? customTitle,
    String? customMessage,
    VoidCallback? onRetry,
  }) {
    final errorInfo = _parseError(error);
    
    AppErrorDialog.show(
      context,
      title: customTitle ?? errorInfo.title,
      message: customMessage ?? errorInfo.message,
      actionText: onRetry != null ? 'Retry' : null,
      onAction: onRetry,
    );
  }

  /// Show a success snackbar
  static void showSuccess(BuildContext context, String message) {
    AppSnackBar.show(
      context,
      message: message,
      type: SnackBarType.success,
    );
  }

  /// Show an info snackbar
  static void showInfo(BuildContext context, String message) {
    AppSnackBar.show(
      context,
      message: message,
      type: SnackBarType.info,
    );
  }

  /// Show a warning snackbar
  static void showWarning(BuildContext context, String message) {
    AppSnackBar.show(
      context,
      message: message,
      type: SnackBarType.warning,
    );
  }

  /// Parse error and return user-friendly message
  static ErrorInfo _parseError(dynamic error) {
    final errorString = error.toString().toLowerCase();

    // Network errors
    if (errorString.contains('socket') ||
        errorString.contains('network') ||
        errorString.contains('connection')) {
      return ErrorInfo(
        title: 'Connection Error',
        message: 'Unable to connect to the server. Please check your internet connection and try again.',
      );
    }

    // Authentication errors
    if (errorString.contains('auth') ||
        errorString.contains('unauthorized') ||
        errorString.contains('forbidden')) {
      return ErrorInfo(
        title: 'Authentication Error',
        message: 'Your session has expired. Please log in again.',
      );
    }

    // Validation errors
    if (errorString.contains('invalid') ||
        errorString.contains('validation')) {
      return ErrorInfo(
        title: 'Invalid Data',
        message: 'Please check your input and try again.',
      );
    }

    // Database errors
    if (errorString.contains('database') ||
        errorString.contains('sql') ||
        errorString.contains('query')) {
      return ErrorInfo(
        title: 'Data Error',
        message: 'Unable to process your request. Please try again later.',
      );
    }

    // Permission errors
    if (errorString.contains('permission') ||
        errorString.contains('denied')) {
      return ErrorInfo(
        title: 'Permission Denied',
        message: 'You don\'t have permission to perform this action.',
      );
    }

    // Timeout errors
    if (errorString.contains('timeout') ||
        errorString.contains('timed out')) {
      return ErrorInfo(
        title: 'Request Timeout',
        message: 'The request took too long. Please try again.',
      );
    }

    // Already exists errors
    if (errorString.contains('already') ||
        errorString.contains('duplicate') ||
        errorString.contains('exists')) {
      return ErrorInfo(
        title: 'Already Exists',
        message: 'This record already exists. Please use a different value.',
      );
    }

    // Not found errors
    if (errorString.contains('not found') ||
        errorString.contains('does not exist')) {
      return ErrorInfo(
        title: 'Not Found',
        message: 'The requested resource could not be found.',
      );
    }

    // Generic error
    return ErrorInfo(
      title: 'Something Went Wrong',
      message: 'An unexpected error occurred. Please try again or contact support if the problem persists.',
    );
  }
}

/// Error information container
class ErrorInfo {
  final String title;
  final String message;

  ErrorInfo({required this.title, required this.message});
}

/// Extension for easier error handling in try-catch blocks
extension ErrorHandling on BuildContext {
  void showError(dynamic error, {VoidCallback? onRetry}) {
    ErrorHandler.showError(this, error, onRetry: onRetry);
  }

  void showSuccess(String message) {
    ErrorHandler.showSuccess(this, message);
  }

  void showInfo(String message) {
    ErrorHandler.showInfo(this, message);
  }

  void showWarning(String message) {
    ErrorHandler.showWarning(this, message);
  }
}
