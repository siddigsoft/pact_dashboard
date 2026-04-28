/// Safe Hive Box Access Helper
/// Prevents "Box not found" errors by ensuring boxes are open before access

import 'package:hive_flutter/hive_flutter.dart';
import 'package:flutter/foundation.dart';

class SafeHiveAccess {
  /// Safely get a box, opening it if needed
  static Future<Box<T>> getBox<T>(String boxName) async {
    try {
      // Check if already open
      if (Hive.isBoxOpen(boxName)) {
        return Hive.box<T>(boxName);
      }

      // Try to open it
      debugPrint('[SafeHiveAccess] Opening box: $boxName');
      final box = await Hive.openBox<T>(boxName);
      debugPrint('[SafeHiveAccess] ✅ Successfully opened box: $boxName');
      return box;
    } catch (e) {
      debugPrint('[SafeHiveAccess] ❌ Error accessing box $boxName: $e');

      // Try to recover by deleting and recreating
      try {
        debugPrint('[SafeHiveAccess] Attempting recovery for box: $boxName');
        await Hive.deleteBoxFromDisk(boxName);
        final box = await Hive.openBox<T>(boxName);
        debugPrint('[SafeHiveAccess] ✅ Recovered box: $boxName');
        return box;
      } catch (e2) {
        debugPrint('[SafeHiveAccess] ❌ Recovery failed for box $boxName: $e2');
        rethrow;
      }
    }
  }

  /// Safely get an already-open box
  static Box<T> getOpenBox<T>(String boxName) {
    try {
      if (!Hive.isBoxOpen(boxName)) {
        throw Exception(
          'Box "$boxName" is not open. Call SafeHiveAccess.getBox() first.',
        );
      }
      return Hive.box<T>(boxName);
    } catch (e) {
      debugPrint('[SafeHiveAccess] ❌ Error getting open box $boxName: $e');
      rethrow;
    }
  }

  /// Check if a box is open
  static bool isBoxOpen(String boxName) {
    return Hive.isBoxOpen(boxName);
  }
}
