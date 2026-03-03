import 'dart:async';
import 'test_config.dart';

FutureOr<void> testExecutable(FutureOr<void> Function() testMain) {
  initPluginMocks();
  return testMain();
}
