import '../models/equipment.dart';
import 'base_repository.dart';

class EquipmentRepository extends BaseRepository<Equipment> {
  EquipmentRepository({required super.database, required super.supabaseService})
    : super(tableName: 'equipment');

  @override
  Map<String, dynamic> toMap(Equipment item) => item.toJson();

  @override
  Equipment fromMap(Map<String, dynamic> map) => Equipment.fromJson(map);

  // Subscribe to real-time updates
  Stream<List<Equipment>> subscribeToUpdates() {
    return supabaseService
        .subscribeToTable(tableName)
        .map((events) => events.map((e) => fromMap(e)).toList());
  }

  // Custom queries specific to Equipment
  Future<List<Equipment>> getEquipmentByType(String type) async {
    final maps = await database.query(
      tableName,
      where: 'type = ?',
      whereArgs: [type],
    );
    return maps.map((map) => fromMap(map)).toList();
  }
}
