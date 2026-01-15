import 'dart:io';
import '../models/incident_report.dart';
import 'base_repository.dart';

class IncidentRepository extends BaseRepository<IncidentReport> {
  IncidentRepository({required super.database, required super.supabaseService})
    : super(tableName: 'incidents');

  @override
  Map<String, dynamic> toMap(IncidentReport item) => item.toJson();

  @override
  IncidentReport fromMap(Map<String, dynamic> map) =>
      IncidentReport.fromJson(map);

  // Add new incident report with media files
  Future<void> addIncidentReport(
    IncidentReport report,
    List<String>? imagePaths,
  ) async {
    // First, upload any media files to Supabase storage
    List<String>? mediaUrls;
    if (imagePaths != null && imagePaths.isNotEmpty) {
      mediaUrls = [];
      for (final path in imagePaths) {
        final file = File(path);
        final bytes = await file.readAsBytes();
        final fileName = path.split('/').last;
        final storageKey = 'incidents/${report.id}/$fileName';

        // Upload to Supabase storage
        final url = await supabaseService.uploadFile(
          'incident-media',
          storageKey,
          bytes,
        );
        mediaUrls.add(url);
      }
    }

    // Create report with media URLs
    final reportWithMedia = IncidentReport(
      id: report.id,
      date: report.date,
      type: report.type,
      description: report.description,
      location: report.location,
      witnesses: report.witnesses,
      requiresImmediate: report.requiresImmediate,
      actionTaken: report.actionTaken,
      mediaUrls: mediaUrls,
      reportedBy: report.reportedBy,
    );

    // Save to local database
    await database.insert(tableName, toMap(reportWithMedia));

    // Trigger sync with Supabase
    await syncWithSupabase();
  }

  Stream<List<IncidentReport>> subscribeToUpdates() {
    return supabaseService
        .subscribeToTable(tableName)
        .map((events) => events.map((e) => fromMap(e)).toList());
  }

  Future<List<IncidentReport>> getIncidentsByStatus(String status) async {
    final maps = await database.query(
      tableName,
      where: 'status = ?',
      whereArgs: [status],
    );
    return maps.map((map) => fromMap(map)).toList();
  }
}
