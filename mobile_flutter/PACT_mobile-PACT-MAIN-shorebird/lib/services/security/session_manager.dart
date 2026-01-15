import 'dart:async';
import 'logger_service.dart';

class SessionManager {
  static final SessionManager _instance = SessionManager._internal();
  Timer? _sessionTimer;
  final _sessionTimeout = const Duration(minutes: 30);
  bool _isActive = false;
  final _onSessionTimeout = StreamController<void>.broadcast();

  factory SessionManager() {
    return _instance;
  }

  SessionManager._internal();

  Stream<void> get onSessionTimeout => _onSessionTimeout.stream;

  bool get isSessionActive => _isActive;

  void startSession() {
    _isActive = true;
    _resetTimer();
    LoggerService.log('Session started');
  }

  void refreshSession() {
    if (_isActive) {
      _resetTimer();
      LoggerService.log('Session refreshed');
    }
  }

  void endSession() {
    _isActive = false;
    _sessionTimer?.cancel();
    LoggerService.log('Session ended');
  }

  void _resetTimer() {
    _sessionTimer?.cancel();
    _sessionTimer = Timer(_sessionTimeout, () {
      _isActive = false;
      _onSessionTimeout.add(null);
      LoggerService.log('Session timed out', level: LogLevel.warning);
    });
  }

  void dispose() {
    _sessionTimer?.cancel();
    _onSessionTimeout.close();
  }
}