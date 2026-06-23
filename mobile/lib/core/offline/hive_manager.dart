import 'package:hive_flutter/hive_flutter.dart';
import '../constants/app_constants.dart';

class HiveManager {
  static Future<void> init() async {
    await Hive.initFlutter();
    await _openBoxes();
  }

  static Future<void> _openBoxes() async {
    await Future.wait([
      Hive.openBox(AppConstants.userBox),
      Hive.openBox(AppConstants.siteVisitsBox),
      Hive.openBox(AppConstants.mmpBox),
      Hive.openBox(AppConstants.tasksBox),
      Hive.openBox(AppConstants.notificationsBox),
      Hive.openBox(AppConstants.walletBox),
      Hive.openBox(AppConstants.costSubmissionsBox),
      Hive.openBox(AppConstants.settingsBox),
      Hive.openBox(AppConstants.syncQueueBox),
      Hive.openBox(AppConstants.offlineActionsBox),
    ]);
  }

  static Box get userBox => Hive.box(AppConstants.userBox);
  static Box get siteVisitsBox => Hive.box(AppConstants.siteVisitsBox);
  static Box get mmpBox => Hive.box(AppConstants.mmpBox);
  static Box get tasksBox => Hive.box(AppConstants.tasksBox);
  static Box get notificationsBox => Hive.box(AppConstants.notificationsBox);
  static Box get walletBox => Hive.box(AppConstants.walletBox);
  static Box get costSubmissionsBox => Hive.box(AppConstants.costSubmissionsBox);
  static Box get settingsBox => Hive.box(AppConstants.settingsBox);
  static Box get syncQueueBox => Hive.box(AppConstants.syncQueueBox);
  static Box get offlineActionsBox => Hive.box(AppConstants.offlineActionsBox);

  static void saveList(Box box, String key, List<Map<String, dynamic>> items) {
    box.put(key, items);
    box.put('${key}_updated_at', DateTime.now().toIso8601String());
  }

  static List<Map<String, dynamic>> getList(Box box, String key) {
    final raw = box.get(key);
    if (raw == null) return [];
    return (raw as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  static void saveItem(Box box, String key, Map<String, dynamic> item) {
    box.put(key, item);
  }

  static Map<String, dynamic>? getItem(Box box, String key) {
    final raw = box.get(key);
    if (raw == null) return null;
    return Map<String, dynamic>.from(raw as Map);
  }

  static bool isStale(Box box, String key, {Duration threshold = const Duration(minutes: 5)}) {
    final updatedAt = box.get('${key}_updated_at') as String?;
    if (updatedAt == null) return true;
    final lastUpdate = DateTime.tryParse(updatedAt);
    if (lastUpdate == null) return true;
    return DateTime.now().difference(lastUpdate) > threshold;
  }

  static Future<void> clearAll() async {
    for (final box in Hive.boxes.values) {
      await box.clear();
    }
  }

  static Future<void> close() async {
    await Hive.close();
  }
}
