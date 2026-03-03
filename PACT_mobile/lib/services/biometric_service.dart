// import 'package:local_auth/local_auth.dart';
// import 'package:flutter_secure_storage/flutter_secure_storage.dart';
// import 'package:flutter/foundation.dart';
// import 'package:flutter/services.dart';
// import 'package:local_auth/error_codes.dart' as auth_error;

// /// Service for managing biometric authentication (fingerprint, face recognition)
// class BiometricService {
//   static final BiometricService _instance = BiometricService._internal();

//   factory BiometricService() => _instance;
//   BiometricService._internal();

//   final LocalAuthentication _localAuth = LocalAuthentication();
//   final FlutterSecureStorage _secureStorage = const FlutterSecureStorage();

//   bool _isBiometricsAvailable = false;
//   List<BiometricType> _availableBiometrics = [];

//   // Secure storage keys
//   static const String _biometricEnabledKey = 'biometric_enabled';
//   static const String _biometricEmailKey = 'biometric_email';
//   static const String _biometricPasswordKey = 'biometric_password';

//   /// Initialize biometrics service
//   Future<void> initialize() async {
//     try {
//       // Check if device supports biometrics
//       final canCheckBiometrics = await _localAuth.canCheckBiometrics;
//       final isDeviceSupported = await _localAuth.isDeviceSupported();

//       // Device can support biometrics OR device credentials (PIN/pattern)
//       _isBiometricsAvailable = canCheckBiometrics || isDeviceSupported;

//       if (canCheckBiometrics) {
//         _availableBiometrics = await _localAuth.getAvailableBiometrics();
//         debugPrint('[Biometric] Available biometrics: $_availableBiometrics');
//       } else {
//         debugPrint(
//           '[Biometric] Biometrics not available, device credentials may be available',
//         );
//       }
//     } catch (e) {
//       debugPrint('[Biometric] Error initializing: $e');
//       _isBiometricsAvailable = false;
//     }
//   }

//   /// Authenticate user with biometrics or device credentials
//   /// Falls back to device PIN/pattern if biometric enrollment not available
//   Future<bool> authenticate({
//     String reason = 'Authenticate to access PACT',
//   }) async {
//     if (!_isBiometricsAvailable) {
//       debugPrint('[Biometric] Authentication not available on this device');
//       return false;
//     }

//     try {
//       final canUseBiometrics = await _localAuth.canCheckBiometrics;

//       // Try biometric if available, otherwise fall back to device credentials
//       final biometricOnly = canUseBiometrics && _availableBiometrics.isNotEmpty;

//       final authenticated = await _localAuth.authenticate(
//         localizedReason: reason,
//         options: AuthenticationOptions(
//           stickyAuth: true,
//           biometricOnly: biometricOnly,
//           useErrorDialogs: true,
//         ),
//       );

//       debugPrint(
//         '[Biometric] Authentication result: $authenticated (biometricOnly: $biometricOnly)',
//       );
//       return authenticated;
//     } on PlatformException catch (e) {
//       debugPrint('[Biometric] Platform error: ${e.code} - ${e.message}');
//       // Return false for specific errors that shouldn't retry
//       if (e.code == auth_error.notEnrolled ||
//           e.code == auth_error.passcodeNotSet) {
//         return false;
//       }
//       return false;
//     } catch (e) {
//       debugPrint('[Biometric] Authentication error: $e');
//       return false;
//     }
//   }

//   /// Check if biometric authentication is enabled
//   Future<bool> isBiometricEnabled() async {
//     try {
//       final value = await _secureStorage.read(key: _biometricEnabledKey);
//       return value == 'true';
//     } catch (e) {
//       debugPrint('[Biometric] Error reading preference: $e');
//       return false;
//     }
//   }

//   /// Enable biometric authentication AND store credentials
//   Future<void> enableBiometric({
//     required String email,
//     required String password,
//   }) async {
//     try {
//       if (!_isBiometricsAvailable) {
//         throw Exception(
//           'Biometrics/Device authentication not available on this device',
//         );
//       }

//       // Store credentials securely for auto-login
//       await _secureStorage.write(key: _biometricEmailKey, value: email);
//       await _secureStorage.write(key: _biometricPasswordKey, value: password);
//       await _secureStorage.write(key: _biometricEnabledKey, value: 'true');

//       debugPrint(
//         '[Biometric] Biometric authentication enabled with stored credentials',
//       );
//     } catch (e) {
//       debugPrint('[Biometric] Error enabling biometric: $e');
//       rethrow;
//     }
//   }

//   /// Disable biometric authentication AND clear stored credentials
//   Future<void> disableBiometric() async {
//     try {
//       await _secureStorage.delete(key: _biometricEnabledKey);
//       await _secureStorage.delete(key: _biometricEmailKey);
//       await _secureStorage.delete(key: _biometricPasswordKey);

//       debugPrint(
//         '[Biometric] Biometric authentication disabled and credentials cleared',
//       );
//     } catch (e) {
//       debugPrint('[Biometric] Error disabling biometric: $e');
//       rethrow;
//     }
//   }

//   /// Store user email and password for biometric login
//   Future<void> storeCredentials({
//     required String email,
//     required String password,
//   }) async {
//     try {
//       await _secureStorage.write(key: _biometricEmailKey, value: email);
//       await _secureStorage.write(key: _biometricPasswordKey, value: password);
//       debugPrint('[Biometric] Credentials stored securely');
//     } catch (e) {
//       debugPrint('[Biometric] Error storing credentials: $e');
//       rethrow;
//     }
//   }

//   /// Retrieve stored credentials for auto-login
//   Future<Map<String, String?>> getStoredCredentials() async {
//     try {
//       final email = await _secureStorage.read(key: _biometricEmailKey);
//       final password = await _secureStorage.read(key: _biometricPasswordKey);
//       debugPrint(
//         '[Biometric] Credentials retrieved (email present: ${email != null})',
//       );
//       return {'email': email, 'password': password};
//     } catch (e) {
//       debugPrint('[Biometric] Error retrieving credentials: $e');
//       return {'email': null, 'password': null};
//     }
//   }

//   /// Clear stored credentials
//   Future<void> clearStoredCredentials() async {
//     try {
//       await _secureStorage.delete(key: _biometricEmailKey);
//       await _secureStorage.delete(key: _biometricPasswordKey);
//       debugPrint('[Biometric] Stored credentials cleared');
//     } catch (e) {
//       debugPrint('[Biometric] Error clearing credentials: $e');
//       rethrow;
//     }
//   }

//   /// Save sensitive data securely (generic)
//   Future<void> saveSecureData(String key, String value) async {
//     try {
//       await _secureStorage.write(key: key, value: value);
//       debugPrint('[Biometric] Secure data saved: $key');
//     } catch (e) {
//       debugPrint('[Biometric] Error saving secure data: $e');
//       rethrow;
//     }
//   }

//   /// Read secure data (generic)
//   Future<String?> readSecureData(String key) async {
//     try {
//       return await _secureStorage.read(key: key);
//     } catch (e) {
//       debugPrint('[Biometric] Error reading secure data: $e');
//       return null;
//     }
//   }

//   /// Delete secure data (generic)
//   Future<void> deleteSecureData(String key) async {
//     try {
//       await _secureStorage.delete(key: key);
//       debugPrint('[Biometric] Secure data deleted: $key');
//     } catch (e) {
//       debugPrint('[Biometric] Error deleting secure data: $e');
//       rethrow;
//     }
//   }

//   // ===== Getters =====

//   bool get isBiometricsAvailable => _isBiometricsAvailable;
//   List<BiometricType> get availableBiometrics => _availableBiometrics;

//   String get biometricTypeName {
//     if (_availableBiometrics.contains(BiometricType.face)) {
//       return 'Face Recognition';
//     } else if (_availableBiometrics.contains(BiometricType.fingerprint)) {
//       return 'Fingerprint';
//     } else if (_availableBiometrics.contains(BiometricType.iris)) {
//       return 'Iris Recognition';
//     }
//     return 'Biometric';
//   }

//   bool get hasFaceRecognition =>
//       _availableBiometrics.contains(BiometricType.face);
//   bool get hasFingerprint =>
//       _availableBiometrics.contains(BiometricType.fingerprint);
//   bool get hasIris => _availableBiometrics.contains(BiometricType.iris);
// }
