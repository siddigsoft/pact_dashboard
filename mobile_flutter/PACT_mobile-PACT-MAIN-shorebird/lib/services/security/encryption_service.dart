import 'dart:convert';
import 'package:encrypt/encrypt.dart' as encrypt;
import 'logger_service.dart';
import 'secure_storage_service.dart';

class EncryptionService {
  static final EncryptionService _instance = EncryptionService._internal();
  late encrypt.Encrypter _encrypter;
  late encrypt.IV _iv;
  final String _keyStorageKey = 'encryption_key';

  factory EncryptionService() {
    return _instance;
  }

  EncryptionService._internal();

  Future<void> initialize() async {
    try {
      final storage = SecureStorageService();
      String? storedKey = await storage.read(_keyStorageKey);
      
      if (storedKey == null) {
        // Generate a new key if none exists
        final key = encrypt.Key.fromSecureRandom(32);
        await storage.write(_keyStorageKey, base64Encode(key.bytes));
        storedKey = base64Encode(key.bytes);
      }

      final keyBytes = base64Decode(storedKey);
      final key = encrypt.Key(keyBytes);
      _iv = encrypt.IV.fromSecureRandom(16);
      _encrypter = encrypt.Encrypter(encrypt.AES(key));
      
      LoggerService.log('Encryption service initialized');
    } catch (e) {
      LoggerService.log('Error initializing encryption service: $e', level: LogLevel.error);
      rethrow;
    }
  }

  String encryptData(String data) {
    try {
      final encrypted = _encrypter.encrypt(data, iv: _iv);
      return '${base64Encode(_iv.bytes)}:${encrypted.base64}';
    } catch (e) {
      LoggerService.log('Error encrypting data: $e', level: LogLevel.error);
      rethrow;
    }
  }

  String decryptData(String encryptedData) {
    try {
      final parts = encryptedData.split(':');
      if (parts.length != 2) {
        throw FormatException('Invalid encrypted data format');
      }

      final iv = encrypt.IV(base64Decode(parts[0]));
      final encrypted = encrypt.Encrypted.fromBase64(parts[1]);
      return _encrypter.decrypt(encrypted, iv: iv);
    } catch (e) {
      LoggerService.log('Error decrypting data: $e', level: LogLevel.error);
      rethrow;
    }
  }
}