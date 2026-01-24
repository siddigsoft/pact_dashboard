// lib/services/biometric_service.dart

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:local_auth/local_auth.dart';

enum BiometricType {
  fingerprint,
  faceId,
  iris,
  none,
}

class BiometricService {
  static final BiometricService _instance = BiometricService._internal();
  factory BiometricService() => _instance;
  BiometricService._internal();

  static const String _settingsBoxName = 'biometric_settings';
  static const String _enabledKey = 'biometric_enabled';
  static const String _typeKey = 'biometric_type';
  static const String _lastAuthKey = 'last_biometric_auth';

  final LocalAuthentication _localAuth = LocalAuthentication();
  
  bool _isAvailable = false;
  bool _isEnabled = false;
  BiometricType _availableType = BiometricType.none;
  List<BiometricType> _availableTypes = [];

  bool get isAvailable => _isAvailable;
  bool get isEnabled => _isEnabled;
  BiometricType get availableType => _availableType;
  List<BiometricType> get availableTypes => _availableTypes;

  Future<void> initialize() async {
    try {
      _isAvailable = await _localAuth.canCheckBiometrics;
      
      if (_isAvailable) {
        final availableBiometrics = await _localAuth.getAvailableBiometrics();
        _availableTypes = availableBiometrics.map((bio) {
          switch (bio) {
            case BiometricType.fingerprint:
              return BiometricType.fingerprint;
            case BiometricType.faceId:
              return BiometricType.faceId;
            case BiometricType.iris:
              return BiometricType.iris;
            default:
              return BiometricType.none;
          }
        }).where((t) => t != BiometricType.none).toList();

        if (_availableTypes.isNotEmpty) {
          _availableType = _availableTypes.first;
        }
      }

      await _loadSettings();
      debugPrint('[BiometricService] Initialized: available=$_isAvailable, enabled=$_isEnabled, type=$_availableType');
    } catch (e) {
      debugPrint('[BiometricService] Error initializing: $e');
      _isAvailable = false;
    }
  }

  Future<void> _loadSettings() async {
    try {
      if (!Hive.isBoxOpen(_settingsBoxName)) {
        await Hive.openBox(_settingsBoxName);
      }
      final box = Hive.box(_settingsBoxName);
      _isEnabled = box.get(_enabledKey, defaultValue: false);
    } catch (e) {
      debugPrint('[BiometricService] Error loading settings: $e');
    }
  }

  Future<void> setEnabled(bool enabled) async {
    try {
      if (enabled && !_isAvailable) {
        throw Exception('Biometric authentication is not available on this device');
      }

      if (!Hive.isBoxOpen(_settingsBoxName)) {
        await Hive.openBox(_settingsBoxName);
      }
      final box = Hive.box(_settingsBoxName);
      await box.put(_enabledKey, enabled);
      _isEnabled = enabled;
      debugPrint('[BiometricService] Biometric ${enabled ? 'enabled' : 'disabled'}');
    } catch (e) {
      debugPrint('[BiometricService] Error setting enabled: $e');
      rethrow;
    }
  }

  Future<bool> authenticate({
    String reason = 'Please authenticate to continue',
    String reasonAr = 'يرجى المصادقة للمتابعة',
    bool isArabic = false,
  }) async {
    if (!_isAvailable) {
      debugPrint('[BiometricService] Biometric not available');
      return false;
    }

    if (!_isEnabled) {
      debugPrint('[BiometricService] Biometric not enabled');
      return true;
    }

    try {
      final authenticated = await _localAuth.authenticate(
        localizedReason: isArabic ? reasonAr : reason,
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: true,
          useErrorDialogs: true,
        ),
      );

      if (authenticated) {
        await _recordLastAuth();
      }

      debugPrint('[BiometricService] Authentication result: $authenticated');
      return authenticated;
    } on PlatformException catch (e) {
      debugPrint('[BiometricService] Platform error: ${e.message}');
      return false;
    } catch (e) {
      debugPrint('[BiometricService] Error authenticating: $e');
      return false;
    }
  }

  Future<void> _recordLastAuth() async {
    try {
      if (!Hive.isBoxOpen(_settingsBoxName)) {
        await Hive.openBox(_settingsBoxName);
      }
      final box = Hive.box(_settingsBoxName);
      await box.put(_lastAuthKey, DateTime.now().toIso8601String());
    } catch (e) {
      debugPrint('[BiometricService] Error recording last auth: $e');
    }
  }

  Future<DateTime?> getLastAuthTime() async {
    try {
      if (!Hive.isBoxOpen(_settingsBoxName)) {
        await Hive.openBox(_settingsBoxName);
      }
      final box = Hive.box(_settingsBoxName);
      final lastAuth = box.get(_lastAuthKey) as String?;
      return lastAuth != null ? DateTime.tryParse(lastAuth) : null;
    } catch (e) {
      return null;
    }
  }

  String getBiometricTypeName({bool isArabic = false}) {
    switch (_availableType) {
      case BiometricType.fingerprint:
        return isArabic ? 'بصمة الإصبع' : 'Fingerprint';
      case BiometricType.faceId:
        return isArabic ? 'التعرف على الوجه' : 'Face ID';
      case BiometricType.iris:
        return isArabic ? 'مسح قزحية العين' : 'Iris Scan';
      case BiometricType.none:
        return isArabic ? 'غير متوفر' : 'Not Available';
    }
  }

  String getBiometricIcon() {
    switch (_availableType) {
      case BiometricType.fingerprint:
        return 'fingerprint';
      case BiometricType.faceId:
        return 'face';
      case BiometricType.iris:
        return 'remove_red_eye';
      case BiometricType.none:
        return 'lock';
    }
  }
}
