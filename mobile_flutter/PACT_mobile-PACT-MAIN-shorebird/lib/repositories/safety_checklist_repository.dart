import '../models/safety_checklist.dart';
import 'base_repository.dart';

class SafetyChecklistRepository extends BaseRepository<SafetyChecklist> {
  SafetyChecklistRepository({
    required super.database,
    required super.supabaseService,
  }) : super(tableName: 'safety_checklists');

  @override
  Map<String, dynamic> toMap(SafetyChecklist item) => item.toJson();

  @override
  SafetyChecklist fromMap(Map<String, dynamic> map) =>
      SafetyChecklist.fromJson(map);

  Stream<List<SafetyChecklist>> subscribeToUpdates() {
    return supabaseService
        .subscribeToTable(tableName)
        .map((events) => events.map((e) => fromMap(e)).toList());
  }

  Future<List<SafetyChecklist>> getPendingChecklists() async {
    final maps = await database.query(
      tableName,
      where: 'completed = ?',
      whereArgs: [0],
    );
    return maps.map((map) => fromMap(map)).toList();
  }
}
