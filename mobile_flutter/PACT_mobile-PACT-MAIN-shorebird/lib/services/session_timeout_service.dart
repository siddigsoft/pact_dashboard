// lib/services/session_timeout_service.dart

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';

enum SessionTimeoutDuration {
  minutes5(Duration(minutes: 5), '5 minutes', '5 دقائق'),
  minutes15(Duration(minutes: 15), '15 minutes', '15 دقيقة'),
  minutes30(Duration(minutes: 30), '30 minutes', '30 دقيقة'),
  hour1(Duration(hours: 1), '1 hour', 'ساعة واحدة'),
  hours4(Duration(hours: 4), '4 hours', '4 ساعات'),
  never(Duration.zero, 'Never', 'أبداً');

  final Duration duration;
  final String labelEn;
  final String labelAr;

  const SessionTimeoutDuration(this.duration, this.labelEn, this.labelAr);

  String getLabel(bool isArabic) => isArabic ? labelAr : labelEn;
}

class SessionTimeoutService {
  static final SessionTimeoutService _instance = SessionTimeoutService._internal();
  factory SessionTimeoutService() => _instance;
  SessionTimeoutService._internal();

  static const String _settingsBoxName = 'session_settings';
  static const String _timeoutDurationKey = 'timeout_duration';
  static const String _lastActivityKey = 'last_activity';
  static const String _isEnabledKey = 'timeout_enabled';

  final _timeoutController = StreamController<bool>.broadcast();
  Stream<bool> get onSessionTimeout => _timeoutController.stream;

  Timer? _activityTimer;
  SessionTimeoutDuration _timeoutDuration = SessionTimeoutDuration.minutes30;
  DateTime? _lastActivity;
  bool _isEnabled = true;
  bool _isInitialized = false;

  SessionTimeoutDuration get timeoutDuration => _timeoutDuration;
  bool get isEnabled => _isEnabled;
  DateTime? get lastActivity => _lastActivity;

  Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      if (!Hive.isBoxOpen(_settingsBoxName)) {
        await Hive.openBox(_settingsBoxName);
      }
      
      await _loadSettings();
      _startActivityMonitor();
      _isInitialized = true;
      
      debugPrint('[SessionTimeoutService] Initialized: enabled=$_isEnabled, timeout=${_timeoutDuration.labelEn}');
    } catch (e) {
      debugPrint('[SessionTimeoutService] Error initializing: $e');
    }
  }

  Future<void> _loadSettings() async {
    try {
      final box = Hive.box(_settingsBoxName);
      
      final durationIndex = box.get(_timeoutDurationKey, defaultValue: 2);
      _timeoutDuration = SessionTimeoutDuration.values[durationIndex];
      
      _isEnabled = box.get(_isEnabledKey, defaultValue: true);
      
      final lastActivityStr = box.get(_lastActivityKey) as String?;
      _lastActivity = lastActivityStr != null ? DateTime.tryParse(lastActivityStr) : DateTime.now();
    } catch (e) {
      debugPrint('[SessionTimeoutService] Error loading settings: $e');
    }
  }

  Future<void> setTimeoutDuration(SessionTimeoutDuration duration) async {
    try {
      if (!Hive.isBoxOpen(_settingsBoxName)) {
        await Hive.openBox(_settingsBoxName);
      }
      final box = Hive.box(_settingsBoxName);
      await box.put(_timeoutDurationKey, duration.index);
      _timeoutDuration = duration;
      
      recordActivity();
      debugPrint('[SessionTimeoutService] Timeout set to: ${duration.labelEn}');
    } catch (e) {
      debugPrint('[SessionTimeoutService] Error setting timeout: $e');
    }
  }

  Future<void> setEnabled(bool enabled) async {
    try {
      if (!Hive.isBoxOpen(_settingsBoxName)) {
        await Hive.openBox(_settingsBoxName);
      }
      final box = Hive.box(_settingsBoxName);
      await box.put(_isEnabledKey, enabled);
      _isEnabled = enabled;
      
      if (enabled) {
        recordActivity();
        _startActivityMonitor();
      } else {
        _stopActivityMonitor();
      }
      
      debugPrint('[SessionTimeoutService] Timeout ${enabled ? 'enabled' : 'disabled'}');
    } catch (e) {
      debugPrint('[SessionTimeoutService] Error setting enabled: $e');
    }
  }

  void recordActivity() {
    _lastActivity = DateTime.now();
    _saveLastActivity();
  }

  Future<void> _saveLastActivity() async {
    try {
      if (!Hive.isBoxOpen(_settingsBoxName)) {
        await Hive.openBox(_settingsBoxName);
      }
      final box = Hive.box(_settingsBoxName);
      await box.put(_lastActivityKey, _lastActivity?.toIso8601String());
    } catch (e) {
      debugPrint('[SessionTimeoutService] Error saving last activity: $e');
    }
  }

  void _startActivityMonitor() {
    _stopActivityMonitor();
    
    if (!_isEnabled || _timeoutDuration == SessionTimeoutDuration.never) {
      return;
    }

    _activityTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      _checkTimeout();
    });
  }

  void _stopActivityMonitor() {
    _activityTimer?.cancel();
    _activityTimer = null;
  }

  void _checkTimeout() {
    if (!_isEnabled || _timeoutDuration == SessionTimeoutDuration.never) {
      return;
    }

    if (_lastActivity == null) {
      _lastActivity = DateTime.now();
      return;
    }

    final timeSinceActivity = DateTime.now().difference(_lastActivity!);
    
    if (timeSinceActivity >= _timeoutDuration.duration) {
      debugPrint('[SessionTimeoutService] Session timed out after ${timeSinceActivity.inMinutes} minutes');
      _timeoutController.add(true);
    }
  }

  bool isSessionExpired() {
    if (!_isEnabled || _timeoutDuration == SessionTimeoutDuration.never) {
      return false;
    }

    if (_lastActivity == null) {
      return false;
    }

    final timeSinceActivity = DateTime.now().difference(_lastActivity!);
    return timeSinceActivity >= _timeoutDuration.duration;
  }

  Duration? getRemainingTime() {
    if (!_isEnabled || _timeoutDuration == SessionTimeoutDuration.never || _lastActivity == null) {
      return null;
    }

    final timeSinceActivity = DateTime.now().difference(_lastActivity!);
    final remaining = _timeoutDuration.duration - timeSinceActivity;
    
    return remaining.isNegative ? Duration.zero : remaining;
  }

  void resetSession() {
    recordActivity();
    debugPrint('[SessionTimeoutService] Session reset');
  }

  void dispose() {
    _stopActivityMonitor();
    _timeoutController.close();
  }
}
