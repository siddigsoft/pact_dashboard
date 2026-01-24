// lib/services/battery_saver_service.dart

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:battery_plus/battery_plus.dart';

enum BatterySaverMode {
  off,
  low,
  medium,
  aggressive,
  auto,
}

class BatterySaverSettings {
  final Duration gpsUpdateInterval;
  final Duration syncInterval;
  final bool reduceAnimations;
  final bool dimScreen;
  final bool disableBackgroundSync;
  final bool reducedAccuracy;

  const BatterySaverSettings({
    required this.gpsUpdateInterval,
    required this.syncInterval,
    required this.reduceAnimations,
    required this.dimScreen,
    required this.disableBackgroundSync,
    required this.reducedAccuracy,
  });

  static const normal = BatterySaverSettings(
    gpsUpdateInterval: Duration(seconds: 10),
    syncInterval: Duration(minutes: 5),
    reduceAnimations: false,
    dimScreen: false,
    disableBackgroundSync: false,
    reducedAccuracy: false,
  );

  static const low = BatterySaverSettings(
    gpsUpdateInterval: Duration(seconds: 30),
    syncInterval: Duration(minutes: 10),
    reduceAnimations: false,
    dimScreen: false,
    disableBackgroundSync: false,
    reducedAccuracy: false,
  );

  static const medium = BatterySaverSettings(
    gpsUpdateInterval: Duration(minutes: 1),
    syncInterval: Duration(minutes: 15),
    reduceAnimations: true,
    dimScreen: false,
    disableBackgroundSync: false,
    reducedAccuracy: true,
  );

  static const aggressive = BatterySaverSettings(
    gpsUpdateInterval: Duration(minutes: 5),
    syncInterval: Duration(minutes: 30),
    reduceAnimations: true,
    dimScreen: true,
    disableBackgroundSync: true,
    reducedAccuracy: true,
  );
}

class BatterySaverService {
  static final BatterySaverService _instance = BatterySaverService._internal();
  factory BatterySaverService() => _instance;
  BatterySaverService._internal();

  static const String _settingsBoxName = 'battery_settings';
  static const String _modeKey = 'battery_saver_mode';
  static const String _autoThresholdKey = 'auto_threshold';

  final Battery _battery = Battery();
  
  final _modeController = StreamController<BatterySaverMode>.broadcast();
  Stream<BatterySaverMode> get onModeChanged => _modeController.stream;

  final _settingsController = StreamController<BatterySaverSettings>.broadcast();
  Stream<BatterySaverSettings> get onSettingsChanged => _settingsController.stream;

  StreamSubscription<BatteryState>? _batterySubscription;
  
  BatterySaverMode _currentMode = BatterySaverMode.off;
  BatterySaverSettings _currentSettings = BatterySaverSettings.normal;
  int _currentBatteryLevel = 100;
  int _autoThreshold = 20;
  bool _isInitialized = false;

  BatterySaverMode get currentMode => _currentMode;
  BatterySaverSettings get currentSettings => _currentSettings;
  int get batteryLevel => _currentBatteryLevel;
  int get autoThreshold => _autoThreshold;

  Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      if (!Hive.isBoxOpen(_settingsBoxName)) {
        await Hive.openBox(_settingsBoxName);
      }

      await _loadSettings();
      await _updateBatteryLevel();
      _startBatteryMonitoring();
      
      _isInitialized = true;
      debugPrint('[BatterySaverService] Initialized: mode=${_currentMode.name}, battery=$_currentBatteryLevel%');
    } catch (e) {
      debugPrint('[BatterySaverService] Error initializing: $e');
    }
  }

  Future<void> _loadSettings() async {
    try {
      final box = Hive.box(_settingsBoxName);
      final modeIndex = box.get(_modeKey, defaultValue: 0);
      _currentMode = BatterySaverMode.values[modeIndex];
      _autoThreshold = box.get(_autoThresholdKey, defaultValue: 20);
      _updateSettings();
    } catch (e) {
      debugPrint('[BatterySaverService] Error loading settings: $e');
    }
  }

  Future<void> _updateBatteryLevel() async {
    try {
      _currentBatteryLevel = await _battery.batteryLevel;
      _checkAutoMode();
    } catch (e) {
      debugPrint('[BatterySaverService] Error getting battery level: $e');
    }
  }

  void _startBatteryMonitoring() {
    _batterySubscription?.cancel();
    _batterySubscription = _battery.onBatteryStateChanged.listen((state) async {
      await _updateBatteryLevel();
    });
  }

  void _checkAutoMode() {
    if (_currentMode == BatterySaverMode.auto) {
      if (_currentBatteryLevel <= _autoThreshold) {
        _applySettings(BatterySaverSettings.aggressive);
      } else if (_currentBatteryLevel <= 50) {
        _applySettings(BatterySaverSettings.medium);
      } else if (_currentBatteryLevel <= 75) {
        _applySettings(BatterySaverSettings.low);
      } else {
        _applySettings(BatterySaverSettings.normal);
      }
    }
  }

  void _updateSettings() {
    switch (_currentMode) {
      case BatterySaverMode.off:
        _applySettings(BatterySaverSettings.normal);
        break;
      case BatterySaverMode.low:
        _applySettings(BatterySaverSettings.low);
        break;
      case BatterySaverMode.medium:
        _applySettings(BatterySaverSettings.medium);
        break;
      case BatterySaverMode.aggressive:
        _applySettings(BatterySaverSettings.aggressive);
        break;
      case BatterySaverMode.auto:
        _checkAutoMode();
        break;
    }
  }

  void _applySettings(BatterySaverSettings settings) {
    _currentSettings = settings;
    _settingsController.add(settings);
  }

  Future<void> setMode(BatterySaverMode mode) async {
    try {
      if (!Hive.isBoxOpen(_settingsBoxName)) {
        await Hive.openBox(_settingsBoxName);
      }
      final box = Hive.box(_settingsBoxName);
      await box.put(_modeKey, mode.index);
      
      _currentMode = mode;
      _modeController.add(mode);
      _updateSettings();
      
      debugPrint('[BatterySaverService] Mode set to: ${mode.name}');
    } catch (e) {
      debugPrint('[BatterySaverService] Error setting mode: $e');
    }
  }

  Future<void> setAutoThreshold(int threshold) async {
    try {
      if (!Hive.isBoxOpen(_settingsBoxName)) {
        await Hive.openBox(_settingsBoxName);
      }
      final box = Hive.box(_settingsBoxName);
      await box.put(_autoThresholdKey, threshold);
      _autoThreshold = threshold;
      
      if (_currentMode == BatterySaverMode.auto) {
        _checkAutoMode();
      }
      
      debugPrint('[BatterySaverService] Auto threshold set to: $threshold%');
    } catch (e) {
      debugPrint('[BatterySaverService] Error setting threshold: $e');
    }
  }

  String getModeName(BatterySaverMode mode, {bool isArabic = false}) {
    if (isArabic) {
      switch (mode) {
        case BatterySaverMode.off: return 'إيقاف';
        case BatterySaverMode.low: return 'منخفض';
        case BatterySaverMode.medium: return 'متوسط';
        case BatterySaverMode.aggressive: return 'قوي';
        case BatterySaverMode.auto: return 'تلقائي';
      }
    }
    switch (mode) {
      case BatterySaverMode.off: return 'Off';
      case BatterySaverMode.low: return 'Low';
      case BatterySaverMode.medium: return 'Medium';
      case BatterySaverMode.aggressive: return 'Aggressive';
      case BatterySaverMode.auto: return 'Auto';
    }
  }

  String getModeDescription(BatterySaverMode mode, {bool isArabic = false}) {
    if (isArabic) {
      switch (mode) {
        case BatterySaverMode.off: 
          return 'أداء كامل، لا توفير للبطارية';
        case BatterySaverMode.low: 
          return 'تحديثات GPS كل 30 ثانية';
        case BatterySaverMode.medium: 
          return 'تحديثات GPS كل دقيقة، تقليل الرسوم المتحركة';
        case BatterySaverMode.aggressive: 
          return 'تحديثات GPS كل 5 دقائق، إيقاف المزامنة في الخلفية';
        case BatterySaverMode.auto: 
          return 'ضبط تلقائي بناءً على مستوى البطارية';
      }
    }
    switch (mode) {
      case BatterySaverMode.off: 
        return 'Full performance, no battery saving';
      case BatterySaverMode.low: 
        return 'GPS updates every 30 seconds';
      case BatterySaverMode.medium: 
        return 'GPS updates every minute, reduced animations';
      case BatterySaverMode.aggressive: 
        return 'GPS updates every 5 minutes, background sync disabled';
      case BatterySaverMode.auto: 
        return 'Automatically adjust based on battery level';
    }
  }

  void dispose() {
    _batterySubscription?.cancel();
    _modeController.close();
    _settingsController.close();
  }
}
