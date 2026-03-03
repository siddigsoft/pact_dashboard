// lib/config/routes.dart
// Navigation route configuration for professional call screens

import 'package:flutter/material.dart';
import '../models/call_state.dart';
import '../screens/calls/professional_incoming_call_screen.dart';
import '../screens/calls/professional_active_call_screen.dart';

/// Route generator for named routes
class RouteGenerator {
  static Route<dynamic> generateRoute(RouteSettings settings) {
    switch (settings.name) {
      case '/incoming-call-professional':
        return MaterialPageRoute(
          builder: (_) => _buildIncomingCallScreen(settings.arguments),
          settings: settings,
        );

      case '/active-call-professional':
        return MaterialPageRoute(
          builder: (_) => _buildActiveCallScreen(settings.arguments),
          settings: settings,
        );

      default:
        return _errorRoute();
    }
  }

  /// Build incoming call screen with arguments
  static Widget _buildIncomingCallScreen(dynamic arguments) {
    if (arguments is! Map<String, dynamic>) {
      return Scaffold(body: Center(child: Text('Invalid call arguments')));
    }

    return ProfessionalIncomingCallScreen(
      callerId: arguments['callerId'] ?? '',
      callerName: arguments['callerName'] ?? 'Unknown',
      callerAvatar: arguments['callerAvatar'],
      callerDepartment: arguments['callerDepartment'],
      isVerified: arguments['isVerified'] ?? false,
      callType: arguments['callType'] ?? CallType.audio,
      priority: arguments['priority'] ?? CallPriority.normal,
      callReason: arguments['callReason'],
      scheduledTime: arguments['scheduledTime'],
      callContext: arguments['callContext'],
    );
  }

  /// Build active call screen with arguments
  static Widget _buildActiveCallScreen(dynamic arguments) {
    if (arguments is! Map<String, dynamic>) {
      return Scaffold(body: Center(child: Text('Invalid call arguments')));
    }

    return ProfessionalActiveCallScreen(
      remoteUserId: arguments['remoteUserId'] ?? '',
      remoteUserName: arguments['remoteUserName'] ?? 'Unknown',
      remoteUserAvatar: arguments['remoteUserAvatar'],
      isVideoCall: arguments['isVideoCall'] ?? false,
    );
  }

  /// Error route
  static Route<dynamic> _errorRoute() {
    return MaterialPageRoute(
      builder: (_) => Scaffold(
        appBar: AppBar(title: const Text('Error')),
        body: const Center(child: Text('Navigation error: Route not found')),
      ),
    );
  }
}

/// Route names constant class
class RouteNames {
  // Call routes
  static const String incomingCallProfessional = '/incoming-call-professional';
  static const String activeCallProfessional = '/active-call-professional';
}
