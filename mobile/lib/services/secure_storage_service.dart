// lib/services/secure_storage_service.dart
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:uuid/uuid.dart';
import 'package:crypto/crypto.dart';
import 'package:encrypt/encrypt.dart' as encrypt;

class SecureStorageService {
  static final SecureStorageService _instance =
      SecureStorageService._internal();
  factory SecureStorageService() => _instance;

  SecureStorageService._internal();

  final FlutterSecureStorage _secureStorage = const FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,
      resetOnError: true,
    ),
  );

  static const String _encryptionKeyKey = 'encryption_key';
  static const String _ivKey = 'encryption_iv';

  bool _isInitialized = false;
  late encrypt.Encrypter _encrypter;
  late encrypt.IV _iv;

  // Initialize the secure storage service
  Future<void> initialize() async {
    if (_isInitialized) return;

    await Hive.initFlutter();

    // Generate or retrieve encryption key
    final encryptionKey = await _getOrCreateEncryptionKey();
    final ivString = await _getOrCreateIV();

    // Create encrypter
    final key = encrypt.Key(encryptionKey);
    _iv = encrypt.IV.fromBase64(ivString);
    _encrypter = encrypt.Encrypter(encrypt.AES(key));

    _isInitialized = true;
    debugPrint('SecureStorageService initialized');
  }

  // Get existing or create new encryption key
  Future<Uint8List> _getOrCreateEncryptionKey() async {
    final existingKey = await _secureStorage.read(key: _encryptionKeyKey);

    if (existingKey != null) {
      return base64.decode(existingKey);
    } else {
      // Generate a random key
      final randomKey = Uint8List.fromList(
        List.generate(32, (index) => _getRandomByte()),
      );

      // Store the key securely
      await _secureStorage.write(
        key: _encryptionKeyKey,
        value: base64.encode(randomKey),
      );

      return randomKey;
    }
  }

  // Get existing or create new IV
  Future<String> _getOrCreateIV() async {
    final existingIV = await _secureStorage.read(key: _ivKey);

    if (existingIV != null) {
      return existingIV;
    } else {
      // Generate a random IV
      final randomIV = encrypt.IV.fromSecureRandom(16);

      // Store the IV securely
      await _secureStorage.write(key: _ivKey, value: randomIV.base64);

      return randomIV.base64;
    }
  }

  // Generate a random byte
  int _getRandomByte() =>
      (DateTime.now().microsecondsSinceEpoch + const Uuid().v4().hashCode) %
      256;

  // Encrypt data
  String encryptData(String data) {
    if (!_isInitialized) {
      throw Exception('SecureStorageService not initialized');
    }

    return _encrypter.encrypt(data, iv: _iv).base64;
  }

  // Decrypt data
  String decryptData(String encryptedData) {
    if (!_isInitialized) {
      throw Exception('SecureStorageService not initialized');
    }

    try {
      return _encrypter.decrypt64(encryptedData, iv: _iv);
    } catch (e) {
      debugPrint('Error decrypting data: $e');
      return '';
    }
  }

  // Store an encrypted value
  Future<void> storeEncrypted(String key, String value) async {
    final encrypted = encryptData(value);
    await Hive.box('secure_data').put(key, encrypted);
  }

  // Retrieve and decrypt a value
  Future<String?> getDecrypted(String key) async {
    final encrypted = Hive.box('secure_data').get(key);
    if (encrypted == null) return null;

    return decryptData(encrypted);
  }

  // Check if a key exists
  Future<bool> hasKey(String key) async {
    return Hive.box('secure_data').containsKey(key);
  }

  // Delete a key
  Future<void> deleteKey(String key) async {
    await Hive.box('secure_data').delete(key);
  }

  // Store a secure value directly in FlutterSecureStorage
  Future<void> secureWrite(String key, String value) async {
    await _secureStorage.write(key: key, value: value);
  }

  // Get a secure value directly from FlutterSecureStorage
  Future<String?> secureRead(String key) async {
    return await _secureStorage.read(key: key);
  }

  // Delete a secure value directly from FlutterSecureStorage
  Future<void> secureDelete(String key) async {
    await _secureStorage.delete(key: key);
  }

  // Generate a hash for verification
  String generateHash(String input) {
    final bytes = utf8.encode(input);
    final digest = sha256.convert(bytes);
    return digest.toString();
  }

  // Securely wipe data
  Future<void> secureWipe(List<String> keys) async {
    final box = Hive.box('secure_data');

    for (final key in keys) {
      // Overwrite with random data before deleting
      await box.put(key, _generateRandomString(100));
      await box.delete(key);
    }
  }

  // Generate random string for secure wipe
  String _generateRandomString(int length) {
    const chars =
        'AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890';
    return List.generate(
      length,
      (index) => chars[DateTime.now().microsecondsSinceEpoch % chars.length],
    ).join();
  }

  // Close all open boxes
  Future<void> closeAllBoxes() async {
    await Hive.close();
  }
}
