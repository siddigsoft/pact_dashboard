import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'connectivity_service.dart';
import 'local_storage_service.dart';
import '../models/task.dart';
import '../models/site_visit.dart';
import '../models/equipment.dart';
import '../models/incident_report.dart';
import '../models/safety_checklist.dart';
import '../models/user_profile.dart';

enum SyncStatus {
  idle,
  syncing,
  success,
  error,
}

class SyncResult {
  final bool success;
  final String? error;
  final int uploadedCount;
  final int downloadedCount;

  SyncResult({
    required this.success,
    this.error,
    this.uploadedCount = 0,
    this.downloadedCount = 0,
  });
}

class OfflineSyncService {
  final SupabaseClient _supabase;
  final LocalStorageService _localStorage;
  final ConnectivityService _connectivity;

  final StreamController<SyncStatus> _syncStatusController =
      StreamController<SyncStatus>.broadcast();
  final StreamController<String> _syncMessageController =
      StreamController<String>.broadcast();

  Timer? _syncTimer;
  SyncStatus _currentStatus = SyncStatus.idle;

  OfflineSyncService(this._supabase, this._localStorage, this._connectivity) {
    // Start periodic sync when online
    _startPeriodicSync();
  }

  Stream<SyncStatus> get syncStatus => _syncStatusController.stream;
  Stream<String> get syncMessages => _syncMessageController.stream;
  SyncStatus get currentStatus => _currentStatus;

  void _updateStatus(SyncStatus status, [String? message]) {
    _currentStatus = status;
    _syncStatusController.add(status);
    if (message != null) {
      _syncMessageController.add(message);
    }
  }

  void _startPeriodicSync() {
    // Sync every 5 minutes when online
    _syncTimer = Timer.periodic(const Duration(minutes: 5), (timer) async {
      if (_connectivity.isOnline) {
        await performFullSync();
      }
    });
  }

  Future<SyncResult> performFullSync() async {
    if (!_connectivity.isOnline) {
      return SyncResult(success: false, error: 'No internet connection');
    }

    _updateStatus(SyncStatus.syncing, 'Starting sync...');

    try {
      int totalUploaded = 0;
      int totalDownloaded = 0;

      // Sync tasks
      final taskResult = await _syncTasks();
      totalUploaded += taskResult.uploaded;
      totalDownloaded += taskResult.downloaded;

      // Sync equipment
      final equipmentResult = await _syncEquipment();
      totalUploaded += equipmentResult.uploaded;
      totalDownloaded += equipmentResult.downloaded;

      // Sync safety reports (incident reports and safety checklists)
      final incidentResult = await _syncIncidentReports();
      totalUploaded += incidentResult.uploaded;
      totalDownloaded += incidentResult.downloaded;

      final checklistResult = await _syncSafetyChecklists();
      totalUploaded += checklistResult.uploaded;
      totalDownloaded += checklistResult.downloaded;

      // Sync comprehensive safety checklists
      final comprehensiveChecklistResult =
          await _syncComprehensiveSafetyChecklists();
      totalUploaded += comprehensiveChecklistResult.uploaded;
      totalDownloaded += comprehensiveChecklistResult.downloaded;

      // Sync user profiles
      final profileResult = await _syncUserProfiles();
      totalUploaded += profileResult.uploaded;
      totalDownloaded += profileResult.downloaded;

      _updateStatus(SyncStatus.success, 'Sync completed successfully');
      return SyncResult(
        success: true,
        uploadedCount: totalUploaded,
        downloadedCount: totalDownloaded,
      );
    } catch (e) {
      _updateStatus(SyncStatus.error, 'Sync failed: $e');
      return SyncResult(success: false, error: e.toString());
    }
  }

  Future<_SyncCounts> _syncTasks() async {
    _updateStatus(SyncStatus.syncing, 'Syncing tasks...');

    // Get local tasks that need syncing
    final localTasks = _localStorage.getAllTasks();
    final unsyncedTasks = localTasks
        .where((task) => !_localStorage.isSynced('tasks', task.id))
        .toList();

    int uploaded = 0;
    int downloaded = 0;

    // Upload unsynced tasks -> map to mmp_site_entries schema safely
    for (final task in unsyncedTasks) {
      try {
        final data = <String, dynamic>{
          'id': task.id,
          // Ensure RLS passes
          'user_id': _supabase.auth.currentUser?.id ?? task.userId,
          'site_name': task.siteName,
          // Map visit_status -> status
          'status': task.visitStatus,
          // Optional fields (only include when present to avoid schema errors)
          if (task.notes != null) 'notes': task.notes,
          if (task.journeyPath != null) 'journey_path': task.journeyPath,
          if (task.arrivalTime != null)
            'arrival_timestamp': task.arrivalTime!.toIso8601String(),
          if (task.departureTime != null)
            'completed_at': task.departureTime!.toIso8601String(),
        };

        await _supabase.from('mmp_site_entries').upsert(data);
        _localStorage.markAsSynced('tasks', task.id);
        uploaded++;
      } catch (e) {
        debugPrint('Failed to upload site visit ${task.id}: $e');
        // Continue with other tasks
      }
    }

    // Download latest tasks from server
    try {
      final response = await _supabase.from('mmp_site_entries').select('*');
      final serverTasks = (response as List).map((json) {
        // Convert site_visits row to Task model for local storage
        final sv = SiteVisit.fromJson(json as Map<String, dynamic>);
        return Task(
          id: sv.id,
          userId: sv.userId ?? (_supabase.auth.currentUser?.id ?? ''),
          siteName: sv.siteName,
          siteAddress: sv.locationString,
          arrivalTime: sv.arrivalTimestamp,
          departureTime: sv.completedAt,
          visitStatus: sv.status,
          notes: sv.notes.isEmpty ? null : sv.notes,
          // If journeyPath is not a List, omit to keep local type safety
          journeyPath: (sv.journeyPath is List)
              ? List<Map<String, dynamic>>.from(sv.journeyPath as List)
              : null,
          createdAt: sv.createdAt,
          updatedAt: sv.createdAt,
        );
      }).toList();

      // Merge with local data (server takes precedence for conflicts)
      await _localStorage.saveMultipleTasks(serverTasks);
      downloaded = serverTasks.length;
    } catch (e) {
      debugPrint('Failed to download site visits: $e');
    }

    return _SyncCounts(uploaded: uploaded, downloaded: downloaded);
  }

  Future<_SyncCounts> _syncEquipment() async {
    _updateStatus(SyncStatus.syncing, 'Syncing equipment...');

    print('🔄 Starting equipment sync...');

    // Similar logic for equipment
    final localEquipment = _localStorage.getAllEquipments();
    final unsyncedEquipment = localEquipment
        .where((eq) => !_localStorage.isSynced('equipments', eq.id))
        .toList();

    print('📦 Found ${unsyncedEquipment.length} unsynced equipment items');

    int uploaded = 0;
    int downloaded = 0;

    // Upload unsynced equipment
    for (final equipment in unsyncedEquipment) {
      try {
        print('⬆️ Uploading equipment: ${equipment.id} - ${equipment.name}');

        final equipmentData = equipment.toJson();
        equipmentData['user_id'] = _supabase.auth.currentUser?.id;
        equipmentData['last_modified'] = DateTime.now().toIso8601String();

        await _supabase.from('equipment').upsert(equipmentData);
        _localStorage.markAsSynced('equipments', equipment.id);
        uploaded++;

        print('✅ Equipment uploaded: ${equipment.id}');
      } catch (e) {
        print('❌ Failed to upload equipment ${equipment.id}: $e');
      }
    }

    // Download equipment
    try {
      print('⬇️ Downloading equipment from Supabase...');
      final response = await _supabase.from('equipment').select('*');
      final serverEquipment =
          (response as List).map((json) => Equipment.fromJson(json)).toList();

      await _localStorage.saveMultipleEquipments(serverEquipment);
      downloaded = serverEquipment.length;

      print('✅ Downloaded $downloaded equipment items');
    } catch (e) {
      print('❌ Failed to download equipment: $e');
    }

    print(
        '🎉 Equipment sync complete: $uploaded uploaded, $downloaded downloaded');
    return _SyncCounts(uploaded: uploaded, downloaded: downloaded);
  }

  Future<_SyncCounts> _syncIncidentReports() async {
    _updateStatus(SyncStatus.syncing, 'Syncing incident reports...');

    // Get local incident reports that need syncing
    final localReports = _localStorage.getAllIncidentReports();
    final unsyncedReports = localReports
        .where(
            (report) => !_localStorage.isSynced('incidentReports', report.id))
        .toList();

    int uploaded = 0;
    int downloaded = 0;

    // Upload unsynced reports
    for (final report in unsyncedReports) {
      try {
        await _supabase.from('incident_reports').upsert(report.toJson());
        _localStorage.markAsSynced('incidentReports', report.id);
        uploaded++;
      } catch (e) {
        debugPrint('Failed to upload incident report ${report.id}: $e');
      }
    }

    // Download reports
    try {
      final response = await _supabase.from('incident_reports').select('*');
      final serverReports = (response as List)
          .map((json) => IncidentReport.fromJson(json))
          .toList();

      await _localStorage.saveMultipleIncidentReports(serverReports);
      downloaded = serverReports.length;
    } catch (e) {
      debugPrint('Failed to download incident reports: $e');
    }

    return _SyncCounts(uploaded: uploaded, downloaded: downloaded);
  }

  Future<_SyncCounts> _syncSafetyChecklists() async {
    _updateStatus(SyncStatus.syncing, 'Syncing safety checklists...');

    // Get local safety checklists that need syncing
    final localChecklists = _localStorage.getAllSafetyChecklists();
    final unsyncedChecklists = localChecklists
        .where((checklist) =>
            !_localStorage.isSynced('safetyChecklists', checklist.id))
        .toList();

    int uploaded = 0;
    int downloaded = 0;

    // Upload unsynced checklists
    for (final checklist in unsyncedChecklists) {
      try {
        await _supabase.from('safety_checklists').upsert(checklist.toJson());
        _localStorage.markAsSynced('safetyChecklists', checklist.id);
        uploaded++;
      } catch (e) {
        debugPrint('Failed to upload safety checklist ${checklist.id}: $e');
      }
    }

    // Download checklists
    try {
      final response = await _supabase.from('safety_checklists').select('*');
      final serverChecklists = (response as List)
          .map((json) => SafetyChecklist.fromJson(json))
          .toList();

      await _localStorage.saveMultipleSafetyChecklists(serverChecklists);
      downloaded = serverChecklists.length;
    } catch (e) {
      debugPrint('Failed to download safety checklists: $e');
    }

    return _SyncCounts(uploaded: uploaded, downloaded: downloaded);
  }

  Future<_SyncCounts> _syncComprehensiveSafetyChecklists() async {
    _updateStatus(
        SyncStatus.syncing, 'Syncing comprehensive safety checklists...');

    int uploaded = 0;
    int downloaded = 0;

    try {
      final currentUserId = _supabase.auth.currentUser?.id;
      if (currentUserId == null) {
        return _SyncCounts(uploaded: 0, downloaded: 0);
      }

      // Attempt primary table; if missing, fallback to alternate naming.
      Future<List> fetch(String table) async {
        return await _supabase
            .from(table)
            .select('*')
            .eq('user_id', currentUserId)
            .order('created_at', ascending: false) as List;
      }

      List data = [];
      try {
        // Primary: monitoring table per confirmed naming
        data = await fetch('comprehensive_monitoring_checklists');
      } catch (e) {
        debugPrint(
            'Primary table comprehensive_monitoring_checklists failed ($e), trying comprehensive_safety_checklists');
        try {
          data = await fetch('comprehensive_safety_checklists');
        } catch (e2) {
          debugPrint(
              'Fallback table comprehensive_safety_checklists also failed: $e2');
          data = [];
        }
      }

      downloaded = data.length;
      // If we later add local caching, hook in here.
    } catch (e) {
      debugPrint('Failed to sync comprehensive safety checklists: $e');
    }

    return _SyncCounts(uploaded: uploaded, downloaded: downloaded);
  }

  Future<_SyncCounts> _syncUserProfiles() async {
    _updateStatus(SyncStatus.syncing, 'Syncing user profiles...');

    // User profiles are typically downloaded, not uploaded
    int downloaded = 0;

    try {
      final currentUser = _supabase.auth.currentUser;
      if (currentUser != null) {
        final response = await _supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        final profile = UserProfile.fromJson(response);
        await _localStorage.saveUserProfile(profile);
        downloaded = 1;
      }
    } catch (e) {
      debugPrint('Failed to sync user profile: $e');
    }

    return _SyncCounts(uploaded: 0, downloaded: downloaded);
  }

  // Manual sync methods for specific data types
  Future<void> syncTasks() async => await _syncTasks();
  Future<void> syncEquipment() async => await _syncEquipment();
  Future<void> syncIncidentReports() async => await _syncIncidentReports();
  Future<void> syncSafetyChecklists() async => await _syncSafetyChecklists();
  Future<void> syncComprehensiveSafetyChecklists() async =>
      await _syncComprehensiveSafetyChecklists();
  Future<void> syncUserProfile() async => await _syncUserProfiles();

  // Force sync (ignores sync status flags)
  Future<SyncResult> forceSync() async {
    // Reset all sync flags and perform full sync
    // Implementation would clear sync status and force re-sync
    return await performFullSync();
  }

  void dispose() {
    _syncTimer?.cancel();
    _syncStatusController.close();
    _syncMessageController.close();
  }
}

class _SyncCounts {
  final int uploaded;
  final int downloaded;

  _SyncCounts({required this.uploaded, required this.downloaded});
}
