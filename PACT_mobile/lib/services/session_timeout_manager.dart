import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Session Timeout Manager for handling idle user sessions
class SessionTimeoutManager {
  static final SessionTimeoutManager _instance =
      SessionTimeoutManager._internal();

  factory SessionTimeoutManager() {
    return _instance;
  }

  SessionTimeoutManager._internal();

  // Configuration
  static const Duration _idleTimeout = Duration(minutes: 30);
  static const Duration _warningDuration = Duration(minutes: 2);

  Timer? _idleTimer;
  Timer? _warningTimer;
  bool _isWarningShown = false;
  BuildContext? _context;

  /// Start monitoring session idle time
  void startMonitoring(BuildContext context) {
    _context = context;
    _resetIdleTimer();
    debugPrint('⏱️ Session timeout monitoring started (30 min idle timeout)');
  }

  /// Stop monitoring session
  void stopMonitoring() {
    _idleTimer?.cancel();
    _warningTimer?.cancel();
    debugPrint('⏱️ Session timeout monitoring stopped');
  }

  /// Reset idle timer (call on user interaction)
  void resetOnUserInteraction() {
    _resetIdleTimer();
  }

  void _resetIdleTimer() {
    _idleTimer?.cancel();
    _warningTimer?.cancel();
    _isWarningShown = false;

    // Start warning 2 minutes before timeout
    _warningTimer = Timer(_idleTimeout - _warningDuration, _showWarningDialog);

    // Auto logout after idle timeout
    _idleTimer = Timer(_idleTimeout, _handleSessionTimeout);
  }

  void _showWarningDialog() {
    if (_isWarningShown || _context == null) return;
    _isWarningShown = true;

    showDialog(
      context: _context!,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('Session Expiring Soon'),
        content: const Text(
          'Your session will expire in 2 minutes due to inactivity. '
          'Would you like to continue your session?',
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              // User wants to logout
              _handleSessionTimeout();
            },
            child: const Text('Logout'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              // Keep session active
              _resetIdleTimer();
            },
            child: const Text('Continue'),
          ),
        ],
      ),
    );
  }

  void _handleSessionTimeout() async {
    debugPrint('🔑 Session timeout triggered - logging out user');
    _idleTimer?.cancel();
    _warningTimer?.cancel();

    try {
      // Sign out user
      await Supabase.instance.client.auth.signOut();

      // Navigate to login screen
      if (_context != null && _context!.mounted) {
        Navigator.of(
          _context!,
        ).pushNamedAndRemoveUntil('/login', (route) => false);

        // Show timeout message
        ScaffoldMessenger.of(_context!).showSnackBar(
          const SnackBar(
            content: Text('Your session has expired. Please log in again.'),
            backgroundColor: Colors.orange,
            duration: Duration(seconds: 3),
          ),
        );
      }
    } catch (e) {
      debugPrint('Error during session timeout logout: $e');
    }
  }
}
