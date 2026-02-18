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
    // For now, just save the report as-is (media upload can be added later)
    // Save to local database
    await database.insert(tableName, toMap(report));

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
