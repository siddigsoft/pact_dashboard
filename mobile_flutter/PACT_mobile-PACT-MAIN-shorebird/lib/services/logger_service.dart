enum LogLevel {
  info,
  warning,
  error,
  debug
}

class LoggerService {
  static void log(String message, {LogLevel level = LogLevel.info}) {
    final timestamp = DateTime.now().toIso8601String();
    final levelStr = level.toString().split('.').last.toUpperCase();
    print('[$timestamp] $levelStr: $message');
  }
}