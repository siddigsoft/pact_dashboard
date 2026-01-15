import 'logger_service.dart';
import 'secure_storage_service.dart';
import 'encryption_service.dart';
import 'session_manager.dart';
import 'network_security_service.dart';

class SecurityService {
  static final SecurityService _instance = SecurityService._internal();
  late final SecureStorageService _secureStorage;
  late final EncryptionService _encryption;
  late final SessionManager _sessionManager;
  late final NetworkSecurityService _networkSecurity;

  factory SecurityService() {
    return _instance;
  }

  SecurityService._internal() {
    _secureStorage = SecureStorageService();
    _encryption = EncryptionService();
    _sessionManager = SessionManager();
    _networkSecurity = NetworkSecurityService();
  }

  Future<void> initialize() async {
    try {
      await _encryption.initialize();
      _sessionManager.startSession();
      _networkSecurity.setBaseUrl('YOUR_API_BASE_URL'); // Replace with actual base URL
      
      // Enable certificate verification in production
      _networkSecurity.setCertificateVerification(verify: true);
      
      LoggerService.log('Security service initialized successfully');
    } catch (e) {
      LoggerService.log('Failed to initialize security service: $e', level: LogLevel.error);
      rethrow;
    }
  }

  // Secure Storage Operations
  Future<void> secureStore(String key, String value) => _secureStorage.write(key, value);
  Future<String?> secureRetrieve(String key) => _secureStorage.read(key);
  Future<void> secureDelete(String key) => _secureStorage.delete(key);
  Future<void> secureClearAll() => _secureStorage.deleteAll();

  // Encryption Operations
  String encrypt(String data) => _encryption.encryptData(data);
  String decrypt(String encryptedData) => _encryption.decryptData(encryptedData);

  // Session Management
  bool get isSessionActive => _sessionManager.isSessionActive;
  void refreshSession() => _sessionManager.refreshSession();
  void endSession() => _sessionManager.endSession();
  Stream<void> get onSessionTimeout => _sessionManager.onSessionTimeout;

  // Network Security Operations
  NetworkSecurityService get networkSecurity => _networkSecurity;

  // Cleanup
  void dispose() {
    _sessionManager.dispose();
  }

  // Secure Logging
  void log(String message, {LogLevel level = LogLevel.info}) {
    LoggerService.log(message, level: level);
  }
}