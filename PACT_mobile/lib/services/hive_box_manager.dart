// lib/services/hive_box_manager.dart
import 'package:hive_flutter/hive_flutter.dart';
import 'package:flutter/foundation.dart';

/// Manages lazy loading of Hive boxes.
/// Instead of opening all boxes at startup, open them on demand.
class HiveBoxManager {
  static final HiveBoxManager _instance = HiveBoxManager._();

  factory HiveBoxManager() => _instance;

  HiveBoxManager._();

  // Cache opened boxes
  final Map<String, Box> _boxes = {};
  final Set<String> _openingBoxes = {};

  /// Get a box, opening it if not already open
  Future<Box> getBox(String name) async {
    // Return cached box if available
    if (_boxes.containsKey(name)) {
      return _boxes[name]!;
    }

    // Prevent duplicate opening requests
    if (_openingBoxes.contains(name)) {
      // Wait for the other request to complete
      await Future.delayed(const Duration(milliseconds: 100));
      if (_boxes.containsKey(name)) {
        return _boxes[name]!;
      }
    }

    try {
      _openingBoxes.add(name);
      debugPrint('📦 Opening Hive box: $name');

      final box = await Hive.openBox(name);
      _boxes[name] = box;

      debugPrint('✅ Hive box opened: $name');
      return box;
    } catch (e) {
      debugPrint('❌ Error opening Hive box $name: $e');
      rethrow;
    } finally {
      _openingBoxes.remove(name);
    }
  }

  /// Preload multiple boxes at once
  Future<void> preloadBoxes(List<String> names) async {
    debugPrint('📦 Preloading ${names.length} Hive boxes...');

    final futures = names
        .where((name) => !_boxes.containsKey(name))
        .map((name) => getBox(name));

    await Future.wait(futures);

    debugPrint('✅ Preload complete');
  }

  /// Close a specific box
  Future<void> closeBox(String name) async {
    final box = _boxes.remove(name);
    if (box != null) {
      await box.close();
      debugPrint('❌ Closed Hive box: $name');
    }
  }

  /// Close all boxes
  Future<void> closeAll() async {
    final futures = _boxes.values.map((box) => box.close());
    await Future.wait(futures);
    _boxes.clear();
    debugPrint('❌ Closed all Hive boxes');
  }

  /// Get all opened box names
  List<String> get openedBoxes => _boxes.keys.toList();

  /// Check if a box is open
  bool isBoxOpen(String name) => _boxes.containsKey(name);

  /// Get the number of open boxes
  int get openBoxCount => _boxes.length;
}
