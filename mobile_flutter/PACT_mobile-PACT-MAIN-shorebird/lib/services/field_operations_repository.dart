// lib/services/field_operations_repository.dart
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../models/visit_model.dart';
import '../models/location_log_model.dart';
import '../models/report_model.dart';
import 'secure_storage_service.dart';

class FieldOperationsRepository {
  static final FieldOperationsRepository _instance =
      FieldOperationsRepository._internal();
  factory FieldOperationsRepository() => _instance;

  FieldOperationsRepository._internal();

  final SecureStorageService _secureStorage = SecureStorageService();
  bool _isInitialized = false;

  // Box names for different data types
  static const String _visitsBoxName = 'visits';
  static const String _locationLogsBoxName = 'location_logs';
  static const String _reportsBoxName = 'reports';
  static const String _settingsBoxName = 'field_settings';

  // Initialize repository
  Future<void> initialize() async {
    if (_isInitialized) return;

    // Initialize secure storage
    await _secureStorage.initialize();

    // Register adapters if needed (we're using JSON serialization for simplicity)
    await Hive.openBox(_visitsBoxName);
    await Hive.openBox(_locationLogsBoxName);
    await Hive.openBox(_reportsBoxName);
    await Hive.openBox(_settingsBoxName);

    _isInitialized = true;
    debugPrint('FieldOperationsRepository initialized');
  }

  // VISITS CRUD OPERATIONS

  // Save a visit
  Future<void> saveVisit(Visit visit) async {
    _ensureInitialized();
    final visitBox = Hive.box(_visitsBoxName);
    final visitJson = jsonEncode(visit.toMap());
    final encrypted = _secureStorage.encryptData(visitJson);
    await visitBox.put(visit.id, encrypted);
  }

  // Get a visit by ID
  Future<Visit?> getVisit(String id) async {
    _ensureInitialized();
    final visitBox = Hive.box(_visitsBoxName);
    final encrypted = visitBox.get(id);
    if (encrypted == null) return null;

    try {
      final visitJson = _secureStorage.decryptData(encrypted);
      return Visit.fromMap(jsonDecode(visitJson));
    } catch (e) {
      debugPrint('Error decoding visit: $e');
      return null;
    }
  }

  // Get all visits
  Future<List<Visit>> getAllVisits() async {
    _ensureInitialized();
    final visitBox = Hive.box(_visitsBoxName);
    final visits = <Visit>[];

    for (final key in visitBox.keys) {
      final encrypted = visitBox.get(key);
      if (encrypted != null) {
        try {
          final visitJson = _secureStorage.decryptData(encrypted);
          visits.add(Visit.fromMap(jsonDecode(visitJson)));
        } catch (e) {
          debugPrint('Error decoding visit: $e');
        }
      }
    }

    return visits;
  }

  // Get visits by status
  Future<List<Visit>> getVisitsByStatus(VisitStatus status) async {
    final allVisits = await getAllVisits();
    return allVisits.where((v) => v.status == status).toList();
  }

  // Get visits assigned to current user
  Future<List<Visit>> getMyVisits() async {
    final allVisits = await getAllVisits();
    final userId = await _secureStorage.secureRead('current_user_id');

    if (userId == null) return [];
    return allVisits.where((v) => v.assignedUserId == userId).toList();
  }

  // Delete a visit
  Future<void> deleteVisit(String id) async {
    _ensureInitialized();
    await Hive.box(_visitsBoxName).delete(id);
  }

  // LOCATION LOGS CRUD OPERATIONS

  // Save a location log
  Future<void> saveLocationLog(LocationLog log) async {
    _ensureInitialized();
    final logsBox = Hive.box(_locationLogsBoxName);
    final logJson = jsonEncode(log.toMap());
    final encrypted = _secureStorage.encryptData(logJson);
    await logsBox.put(log.id, encrypted);
  }

  // Get all location logs for a visit
  Future<List<LocationLog>> getLocationLogs(String visitId) async {
    _ensureInitialized();
    final logsBox = Hive.box(_locationLogsBoxName);
    final logs = <LocationLog>[];

    for (final key in logsBox.keys) {
      final encrypted = logsBox.get(key);
      if (encrypted != null) {
        try {
          final logJson = _secureStorage.decryptData(encrypted);
          final log = LocationLog.fromMap(jsonDecode(logJson));
          if (log.visitId == visitId) {
            logs.add(log);
          }
        } catch (e) {
          debugPrint('Error decoding location log: $e');
        }
      }
    }

    // Sort by timestamp
    logs.sort((a, b) => a.timestamp.compareTo(b.timestamp));
    return logs;
  }

  // Delete all location logs for a visit
  Future<void> deleteLocationLogs(String visitId) async {
    _ensureInitialized();
    final logsBox = Hive.box(_locationLogsBoxName);
    final logs = await getLocationLogs(visitId);

    for (final log in logs) {
      await logsBox.delete(log.id);
    }
  }

  // REPORTS CRUD OPERATIONS

  // Save a report
  Future<void> saveReport(Report report) async {
    _ensureInitialized();
    final reportsBox = Hive.box(_reportsBoxName);
    final reportJson = jsonEncode(report.toMap());
    final encrypted = _secureStorage.encryptData(reportJson);
    await reportsBox.put(report.id, encrypted);
  }

  // Get a report by ID
  Future<Report?> getReport(String id) async {
    _ensureInitialized();
    final reportsBox = Hive.box(_reportsBoxName);
    final encrypted = reportsBox.get(id);
    if (encrypted == null) return null;

    try {
      final reportJson = _secureStorage.decryptData(encrypted);
      return Report.fromMap(jsonDecode(reportJson));
    } catch (e) {
      debugPrint('Error decoding report: $e');
      return null;
    }
  }

  // Get report for a visit
  Future<Report?> getVisitReport(String visitId) async {
    _ensureInitialized();
    final reportsBox = Hive.box(_reportsBoxName);
    final reports = <Report>[];

    for (final key in reportsBox.keys) {
      final encrypted = reportsBox.get(key);
      if (encrypted != null) {
        try {
          final reportJson = _secureStorage.decryptData(encrypted);
          final report = Report.fromMap(jsonDecode(reportJson));
          if (report.visitId == visitId) {
            reports.add(report);
          }
        } catch (e) {
          debugPrint('Error decoding report: $e');
        }
      }
    }

    // Return the most recent report if there are multiple
    if (reports.isEmpty) return null;

    reports.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return reports.first;
  }

  // Delete a report
  Future<void> deleteReport(String id) async {
    _ensureInitialized();
    await Hive.box(_reportsBoxName).delete(id);
  }

  // SYNC OPERATIONS

  // Get all unsynced visits
  Future<List<Visit>> getUnsyncedVisits() async {
    final allVisits = await getAllVisits();
    return allVisits.where((v) => !v.isSynced).toList();
  }

  // Get all unsynced location logs
  Future<List<LocationLog>> getUnsyncedLocationLogs() async {
    _ensureInitialized();
    final logsBox = Hive.box(_locationLogsBoxName);
    final logs = <LocationLog>[];

    for (final key in logsBox.keys) {
      final encrypted = logsBox.get(key);
      if (encrypted != null) {
        try {
          final logJson = _secureStorage.decryptData(encrypted);
          final log = LocationLog.fromMap(jsonDecode(logJson));
          if (!log.isSynced) {
            logs.add(log);
          }
        } catch (e) {
          debugPrint('Error decoding location log: $e');
        }
      }
    }

    return logs;
  }

  // Get all unsynced reports
  Future<List<Report>> getUnsyncedReports() async {
    _ensureInitialized();
    final reportsBox = Hive.box(_reportsBoxName);
    final reports = <Report>[];

    for (final key in reportsBox.keys) {
      final encrypted = reportsBox.get(key);
      if (encrypted != null) {
        try {
          final reportJson = _secureStorage.decryptData(encrypted);
          final report = Report.fromMap(jsonDecode(reportJson));
          if (!report.isSynced) {
            reports.add(report);
          }
        } catch (e) {
          debugPrint('Error decoding report: $e');
        }
      }
    }

    return reports;
  }

  // Mark a visit as synced
  Future<void> markVisitSynced(String id, {bool synced = true}) async {
    final visit = await getVisit(id);
    if (visit != null) {
      final updatedVisit = visit.copyWith(isSynced: synced);
      await saveVisit(updatedVisit);
    }
  }

  // Mark a location log as synced
  Future<void> markLocationLogSynced(String id, {bool synced = true}) async {
    _ensureInitialized();
    final logsBox = Hive.box(_locationLogsBoxName);
    final encrypted = logsBox.get(id);
    if (encrypted != null) {
      try {
        final logJson = _secureStorage.decryptData(encrypted);
        final log = LocationLog.fromMap(jsonDecode(logJson));
        final updatedLog = log.copyWith(isSynced: synced);

        final updatedLogJson = jsonEncode(updatedLog.toMap());
        final updatedEncrypted = _secureStorage.encryptData(updatedLogJson);
        await logsBox.put(id, updatedEncrypted);
      } catch (e) {
        debugPrint('Error updating location log: $e');
      }
    }
  }

  // Mark a report as synced
  Future<void> markReportSynced(String id, {bool synced = true}) async {
    final report = await getReport(id);
    if (report != null) {
      final updatedReport = report.copyWith(isSynced: synced);
      await saveReport(updatedReport);
    }
  }

  // CLEANUP OPERATIONS

  // Securely wipe old synced data
  Future<void> wipeOldSyncedData(int olderThanDays) async {
    _ensureInitialized();
    final cutoffDate = DateTime.now().subtract(Duration(days: olderThanDays));

    // Wipe old visits and associated data
    final allVisits = await getAllVisits();
    for (final visit in allVisits) {
      if (visit.isSynced &&
          visit.lastModified != null &&
          visit.lastModified!.isBefore(cutoffDate)) {
        // Wipe associated location logs
        await deleteLocationLogs(visit.id);

        // Wipe associated report
        final report = await getVisitReport(visit.id);
        if (report != null) {
          await deleteReport(report.id);
        }

        // Wipe visit
        await deleteVisit(visit.id);
      }
    }
  }

  // Ensure repository is initialized
  void _ensureInitialized() {
    if (!_isInitialized) {
      throw Exception('FieldOperationsRepository not initialized');
    }
  }

  // Save collector online status
  Future<void> saveCollectorStatus(bool isOnline) async {
    _ensureInitialized();
    final settingsBox = Hive.box(_settingsBoxName);
    await settingsBox.put('collector_online', isOnline);
  }

  // Get collector online status
  Future<bool> getCollectorStatus() async {
    _ensureInitialized();
    final settingsBox = Hive.box(_settingsBoxName);
    return settingsBox.get('collector_online', defaultValue: false);
  }

  // Close all open boxes
  Future<void> closeBoxes() async {
    await Hive.box(_visitsBoxName).close();
    await Hive.box(_locationLogsBoxName).close();
    await Hive.box(_reportsBoxName).close();
    await Hive.box(_settingsBoxName).close();
  }
}
