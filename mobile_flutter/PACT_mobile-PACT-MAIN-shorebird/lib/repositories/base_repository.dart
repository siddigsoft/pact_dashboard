import 'package:sqflite/sqflite.dart';
import '../services/supabase_service.dart';

abstract class BaseRepository<T> {
  final Database database;
  final SupabaseService supabaseService;
  final String tableName;

  BaseRepository({
    required this.database,
    required this.supabaseService,
    required this.tableName,
  });

  // Convert model to Map
  Map<String, dynamic> toMap(T item);

  // Create model from Map
  T fromMap(Map<String, dynamic> map);

  Future<void> syncWithSupabase() async {
    try {
      // Get local changes
      final localChanges = await database.query(
        tableName,
        where: 'synced = ?',
        whereArgs: [0],
      );

      // Upload local changes
      for (final change in localChanges) {
        try {
          await supabaseService.upsertRecord(tableName, change);
          await database.update(
            tableName,
            {'synced': 1},
            where: 'id = ?',
            whereArgs: [change['id']],
          );
        } catch (e) {
          print('Error syncing record ${change['id']}: $e');
        }
      }

      // Get remote changes
      final remoteChanges = await supabaseService.fetchRecords(tableName);

      // Update local database
      await database.transaction((txn) async {
        for (final change in remoteChanges) {
          await txn.insert(
            tableName,
            {...change, 'synced': 1},
            conflictAlgorithm: ConflictAlgorithm.replace,
          );
        }
      });
    } catch (e) {
      print('Error during sync: $e');
      rethrow;
    }
  }

  // CRUD operations
  Future<int> insert(T item) async {
    final map = toMap(item);
    map['synced'] = 0;
    return await database.insert(tableName, map);
  }

  Future<List<T>> getAll() async {
    final maps = await database.query(tableName);
    return maps.map((map) => fromMap(map)).toList();
  }

  Future<T?> getById(String id) async {
    final maps = await database.query(
      tableName,
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );

    if (maps.isEmpty) return null;
    return fromMap(maps.first);
  }

  Future<int> update(T item) async {
    final map = toMap(item);
    map['synced'] = 0;
    return await database.update(
      tableName,
      map,
      where: 'id = ?',
      whereArgs: [map['id']],
    );
  }

  Future<int> delete(String id) async {
    return await database.delete(
      tableName,
      where: 'id = ?',
      whereArgs: [id],
    );
  }
}
