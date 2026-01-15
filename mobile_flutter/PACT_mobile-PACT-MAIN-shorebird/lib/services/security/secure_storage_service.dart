import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'logger_service.dart';

class SecureStorageService {
  static final SecureStorageService _instance = SecureStorageService._internal();
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  factory SecureStorageService() {
    return _instance;
  }

  SecureStorageService._internal();

  Future<void> write(String key, String value) async {
    try {
      await _storage.write(key: key, value: value);
      LoggerService.log('Stored secure data for key: $key');
    } catch (e) {
      LoggerService.log('Error storing secure data: $e', level: LogLevel.error);
      rethrow;
    }
  }

  Future<String?> read(String key) async {
    try {
      final value = await _storage.read(key: key);
      LoggerService.log('Retrieved secure data for key: $key');
      return value;
    } catch (e) {
      LoggerService.log('Error reading secure data: $e', level: LogLevel.error);
      rethrow;
    }
  }

  Future<void> delete(String key) async {
    try {
      await _storage.delete(key: key);
      LoggerService.log('Deleted secure data for key: $key');
    } catch (e) {
      LoggerService.log('Error deleting secure data: $e', level: LogLevel.error);
      rethrow;
    }
  }

  Future<void> deleteAll() async {
    try {
      await _storage.deleteAll();
      LoggerService.log('Deleted all secure data');
    } catch (e) {
      LoggerService.log('Error deleting all secure data: $e', level: LogLevel.error);
      rethrow;
    }
  }
}