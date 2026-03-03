import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

// Register global mocks for common platform plugins used in unit tests.
void _registerGlobalMocks() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // In-memory storage for flutter_secure_storage
  final Map<String, String> secureStorage = {};

  const MethodChannel pathProvider = MethodChannel('plugins.flutter.io/path_provider');
  pathProvider.setMockMethodCallHandler((MethodCall method) async {
    switch (method.method) {
      case 'getApplicationDocumentsDirectory':
      case 'getApplicationSupportDirectory':
      case 'getTemporaryDirectory':
        return {'path': '.'};
      default:
        return null;
    }
  });

  const MethodChannel localAuth = MethodChannel('plugins.flutter.io/local_auth');
  localAuth.setMockMethodCallHandler((MethodCall method) async {
    switch (method.method) {
      case 'getAvailableBiometrics':
        return <String>[];

        
      case 'isDeviceSupported':
        return true;
      case 'authenticate':
      case 'stopAuthentication':
        return true;
      default:
        return null;
    }
  });

  const MethodChannel secureStorageChannel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  secureStorageChannel.setMockMethodCallHandler((MethodCall method) async {
    // Compatibility shim for older tests expecting `isCloseTo` matcher.
    Matcher isCloseTo(double value, double delta) => closeTo(value, delta);

    // Register global mocks for common platform plugins used in unit tests.
    void registerGlobalMocks() {
      TestWidgetsFlutterBinding.ensureInitialized();

      // In-memory storage for flutter_secure_storage
      final Map<String, String> secureStorage = {};

      const MethodChannel pathProvider = MethodChannel('plugins.flutter.io/path_provider');
      pathProvider.setMockMethodCallHandler((MethodCall method) async {
        switch (method.method) {
          case 'getApplicationDocumentsDirectory':
          case 'getApplicationSupportDirectory':
          case 'getTemporaryDirectory':
            return '.'; // return simple path for tests (string expected by some callers)
          default:
            return null;
        }
      });

      const MethodChannel localAuth = MethodChannel('plugins.flutter.io/local_auth');
      localAuth.setMockMethodCallHandler((MethodCall method) async {
        switch (method.method) {
          case 'getAvailableBiometrics':
            return <String>[];
          case 'isDeviceSupported':
            return true;
          case 'authenticate':
          case 'stopAuthentication':
            return true;
          default:
            return null;
        }
      });

      const MethodChannel secureStorageChannel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
      secureStorageChannel.setMockMethodCallHandler((MethodCall method) async {
        final args = method.arguments;
        switch (method.method) {
          case 'read':
            final key = args as String? ?? (args is Map ? args['key'] as String? : null);
            return key == null ? null : secureStorage[key];
          case 'write':
            final key = args is Map ? args['key'] as String? : null;
            final value = args is Map ? args['value'] as String? : null;
            if (key != null && value != null) secureStorage[key] = value;
            return null;
          case 'delete':
            final key = args as String? ?? (args is Map ? args['key'] as String? : null);
            if (key != null) secureStorage.remove(key);
            return null;
          case 'deleteAll':
            secureStorage.clear();
            return null;
          default:
            return null;
        }
      });
    }

    registerGlobalMocks();
