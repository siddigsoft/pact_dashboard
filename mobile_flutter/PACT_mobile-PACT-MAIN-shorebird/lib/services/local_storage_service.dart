import 'package:hive/hive.dart';
import '../models/task.dart';
import '../models/equipment.dart';
import '../models/incident_report.dart';
import '../models/safety_checklist.dart';
import '../models/user_profile.dart';

class LocalStorageService {
  static const String tasksBox = 'tasks';
  static const String equipmentsBox = 'equipments';
  static const String incidentReportsBox = 'incidentReports';
  static const String safetyChecklistsBox = 'safetyChecklists';
  static const String userProfilesBox = 'userProfiles';
  static const String appSettingsBox = 'appSettings';
  static const String mapDataBox = 'mapData';

  // Tasks CRUD
  Future<void> saveTask(Task task) async {
    final box = Hive.box(tasksBox);
    await box.put(task.id, task.toJson());
  }

  Task? getTask(String id) {
    final box = Hive.box(tasksBox);
    final json = box.get(id);
    return json != null ? Task.fromJson(json) : null;
  }

  List<Task> getAllTasks() {
    final box = Hive.box(tasksBox);
    return box.values.map((json) => Task.fromJson(json)).toList();
  }

  Future<void> deleteTask(String id) async {
    final box = Hive.box(tasksBox);
    await box.delete(id);
  }

  // Equipments CRUD
  Future<void> saveEquipment(Equipment equipment) async {
    final box = Hive.box(equipmentsBox);
    await box.put(equipment.id, equipment.toJson());
  }

  Equipment? getEquipment(String id) {
    final box = Hive.box(equipmentsBox);
    final json = box.get(id);
    return json != null ? Equipment.fromJson(json) : null;
  }

  List<Equipment> getAllEquipments() {
    final box = Hive.box(equipmentsBox);
    return box.values.map((json) => Equipment.fromJson(json)).toList();
  }

  Future<void> deleteEquipment(String id) async {
    final box = Hive.box(equipmentsBox);
    await box.delete(id);
  }

  // Incident Reports CRUD
  Future<void> saveIncidentReport(IncidentReport report) async {
    final box = Hive.box(incidentReportsBox);
    await box.put(report.id, report.toJson());
  }

  IncidentReport? getIncidentReport(String id) {
    final box = Hive.box(incidentReportsBox);
    final json = box.get(id);
    return json != null ? IncidentReport.fromJson(json) : null;
  }

  List<IncidentReport> getAllIncidentReports() {
    final box = Hive.box(incidentReportsBox);
    return box.values.map((json) => IncidentReport.fromJson(json)).toList();
  }

  Future<void> deleteIncidentReport(String id) async {
    final box = Hive.box(incidentReportsBox);
    await box.delete(id);
  }

  // Safety Checklists CRUD
  Future<void> saveSafetyChecklist(SafetyChecklist checklist) async {
    final box = Hive.box(safetyChecklistsBox);
    await box.put(checklist.id, checklist.toJson());
  }

  SafetyChecklist? getSafetyChecklist(String id) {
    final box = Hive.box(safetyChecklistsBox);
    final json = box.get(id);
    return json != null ? SafetyChecklist.fromJson(json) : null;
  }

  List<SafetyChecklist> getAllSafetyChecklists() {
    final box = Hive.box(safetyChecklistsBox);
    return box.values.map((json) => SafetyChecklist.fromJson(json)).toList();
  }

  Future<void> deleteSafetyChecklist(String id) async {
    final box = Hive.box(safetyChecklistsBox);
    await box.delete(id);
  }

  // User Profile CRUD
  Future<void> saveUserProfile(UserProfile profile) async {
    final box = Hive.box(userProfilesBox);
    await box.put(profile.id, profile.toJson());
  }

  UserProfile? getUserProfile(String id) {
    final box = Hive.box(userProfilesBox);
    final json = box.get(id);
    return json != null ? UserProfile.fromJson(json) : null;
  }

  Future<void> deleteUserProfile(String id) async {
    final box = Hive.box(userProfilesBox);
    await box.delete(id);
  }

  // App Settings
  Future<void> saveAppSetting(String key, dynamic value) async {
    final box = Hive.box(appSettingsBox);
    await box.put(key, value);
  }

  dynamic getAppSetting(String key) {
    final box = Hive.box(appSettingsBox);
    return box.get(key);
  }

  // Map Data (for offline map caching)
  Future<void> saveMapData(String key, dynamic data) async {
    final box = Hive.box(mapDataBox);
    await box.put(key, data);
  }

  dynamic getMapData(String key) {
    final box = Hive.box(mapDataBox);
    return box.get(key);
  }

  // Sync status tracking
  Future<void> markAsSynced(String boxName, String id) async {
    final box = Hive.box('${boxName}_sync');
    await box.put(id, true);
  }

  bool isSynced(String boxName, String id) {
    final box = Hive.box('${boxName}_sync');
    return box.get(id, defaultValue: false);
  }

  // Bulk operations for sync
  Future<void> saveMultipleTasks(List<Task> tasks) async {
    final box = Hive.box(tasksBox);
    final Map<String, Map<String, dynamic>> taskMap = {for (var task in tasks) task.id: task.toJson()};
    await box.putAll(taskMap);
  }

  Future<void> saveMultipleEquipments(List<Equipment> equipments) async {
    final box = Hive.box(equipmentsBox);
    final Map<String, Map<String, dynamic>> equipmentMap = {for (var eq in equipments) eq.id: eq.toJson()};
    await box.putAll(equipmentMap);
  }

  Future<void> saveMultipleIncidentReports(List<IncidentReport> reports) async {
    final box = Hive.box(incidentReportsBox);
    final Map<String, Map<String, dynamic>> reportMap = {for (var report in reports) report.id: report.toJson()};
    await box.putAll(reportMap);
  }

  Future<void> saveMultipleSafetyChecklists(List<SafetyChecklist> checklists) async {
    final box = Hive.box(safetyChecklistsBox);
    final Map<String, Map<String, dynamic>> checklistMap = {for (var checklist in checklists) checklist.id: checklist.toJson()};
    await box.putAll(checklistMap);
  }
}