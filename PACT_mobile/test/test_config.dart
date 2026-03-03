import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

// Compatibility shim for older tests expecting isCloseTo matcher.
Matcher isCloseTo(double value, double delta) => closeTo(value, delta);

// Register simple MethodChannel mocks for common platform plugins used in unit tests.
void initPluginMocks() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final Map<String, String> secureStorage = {};

  const MethodChannel pathProvider = MethodChannel(
    'plugins.flutter.io/path_provider',
  );
  pathProvider.setMockMethodCallHandler((MethodCall method) async {
    switch (method.method) {
      case 'getApplicationDocumentsDirectory':
      case 'getApplicationSupportDirectory':
      case 'getTemporaryDirectory':
        return '.';
      default:
        return null;
    }
  });

  const MethodChannel localAuth = MethodChannel(
    'plugins.flutter.io/local_auth',
  );
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

  const MethodChannel connectivityChannel = MethodChannel(
    'dev.fluttercommunity.plus/connectivity',
  );
  connectivityChannel.setMockMethodCallHandler((MethodCall method) async {
    switch (method.method) {
      case 'check':
        return ['none']; // List of strings: 'none' = offline
      case 'onConnectivityChanged':
        return null;
      default:
        return null;
    }
  });

  const MethodChannel secureStorageChannel = MethodChannel(
    'plugins.it_nomads.com/flutter_secure_storage',
  );
  secureStorageChannel.setMockMethodCallHandler((MethodCall method) async {
    final args = method.arguments;
    switch (method.method) {
      case 'read':
        String? key;
        if (args is String) {
          key = args;
        } else if (args is Map)
          key = args['key'] as String?;
        return key == null ? null : secureStorage[key];
      case 'write':
        if (args is Map) {
          final key = args['key'] as String?;
          final value = args['value'] as String?;
          if (key != null && value != null) secureStorage[key] = value;
        }
        return null;
      case 'delete':
        String? key;
        if (args is String) {
          key = args;
        } else if (args is Map)
          key = args['key'] as String?;
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

// Optional testExecutable hook used by flutter test listener. If present, it will be invoked
// with the test main function; ensure mocks are initialized before running tests.
Future<void> testExecutable(Function testMain) async {
  initPluginMocks();
  await testMain();
}

// Ensure mocks are registered immediately when this file is imported by tests.
