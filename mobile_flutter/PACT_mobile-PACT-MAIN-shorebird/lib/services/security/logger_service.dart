import 'package:flutter/foundation.dart';

class LoggerService {
  static final RegExp _uuidPattern = RegExp(
    r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
  );
  static final RegExp _emailPattern = RegExp(
    r'([a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6})',
  );

  static String _maskSensitiveData(String text) {
    return text
        .replaceAllMapped(_uuidPattern, (match) => '********-****-****-****-************')
        .replaceAllMapped(_emailPattern, (match) => '****@****.***');
  }

  static void log(String message, {LogLevel level = LogLevel.info}) {
    if (kReleaseMode) {
      // In the future, we can add Sentry or other production logging here
      return;
    }
    
    final maskedMessage = _maskSensitiveData(message);
    switch (level) {
      case LogLevel.info:
        debugPrint('📘 INFO: $maskedMessage');
        break;
      case LogLevel.warning:
        debugPrint('⚠️ WARNING: $maskedMessage');
        break;
      case LogLevel.error:
        debugPrint('🚨 ERROR: $maskedMessage');
        break;
    }
  }
}

enum LogLevel { info, warning, error }