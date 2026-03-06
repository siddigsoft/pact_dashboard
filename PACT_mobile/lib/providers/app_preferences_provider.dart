import 'package:flutter/foundation.dart';

import '../services/local_storage_service.dart';

class AppPreferencesProvider extends ChangeNotifier {
  static const String darkModeSettingKey = 'appearance_dark_mode';
  static const String fontScaleSettingKey = 'appearance_font_scale';
  static const String compactDisplaySettingKey = 'appearance_compact_display';

  final LocalStorageService _localStorageService;

  bool _darkMode = false;
  double _fontScale = 1.0;
  bool _compactDisplay = false;

  AppPreferencesProvider(this._localStorageService);

  bool get darkMode => _darkMode;
  double get fontScale => _fontScale;
  bool get compactDisplay => _compactDisplay;

  Future<void> load() async {
    _darkMode = _localStorageService.getAppSetting(darkModeSettingKey) == true;

    final storedScale = _localStorageService.getAppSetting(fontScaleSettingKey);
    if (storedScale is num) {
      _fontScale = _normalizeFontScale(storedScale.toDouble());
    } else {
      _fontScale = 1.0;
    }

    _compactDisplay =
        _localStorageService.getAppSetting(compactDisplaySettingKey) == true;

    notifyListeners();
  }

  Future<void> setDarkMode(bool value) async {
    if (_darkMode == value) return;
    _darkMode = value;
    await _localStorageService.saveAppSetting(darkModeSettingKey, value);
    notifyListeners();
  }

  Future<void> setFontScale(double value) async {
    final normalized = _normalizeFontScale(value);
    if ((_fontScale - normalized).abs() < 0.001) return;
    _fontScale = normalized;
    await _localStorageService.saveAppSetting(fontScaleSettingKey, normalized);
    notifyListeners();
  }

  Future<void> setCompactDisplay(bool value) async {
    if (_compactDisplay == value) return;
    _compactDisplay = value;
    await _localStorageService.saveAppSetting(compactDisplaySettingKey, value);
    notifyListeners();
  }

  double _normalizeFontScale(double value) {
    if (value < 0.85) return 0.85;
    if (value > 1.35) return 1.35;
    return value;
  }
}
