// Web-specific configuration implementations
import 'package:flutter_web_plugins/flutter_web_plugins.dart';
import 'package:flutter/foundation.dart';

/// Configure app-specific settings for web platform
void configureApp() {
  // Enable better error reporting for web
  if (kDebugMode) {
    FlutterError.onError = (FlutterErrorDetails details) {
      FlutterError.dumpErrorToConsole(details);
    };
  }

  // Use path URL strategy for better OAuth compatibility
  setUrlStrategy(PathUrlStrategy());

  // Log configuration
  debugPrint('🌐 Web platform detected: Path URL strategy configured');
}
