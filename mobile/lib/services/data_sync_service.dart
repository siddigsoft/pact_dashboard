import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class DataSyncService {
  final supabase = Supabase.instance.client;
  final Map<String, RealtimeChannel> _activeSubscriptions = {};

  // Singleton pattern
  static final DataSyncService _instance = DataSyncService._internal();
  factory DataSyncService() => _instance;
  DataSyncService._internal();

  // Subscribe to table changes
  Stream<List<Map<String, dynamic>>> subscribeToTable(
    String table, {
    String? filterValue,
    String? filterColumn,
  }) {
    try {
      final stream = supabase.from(table).stream(primaryKey: ['id']);

      if (filterValue != null && filterColumn != null) {
        return stream.map(
          (event) => event
              .where(
                (row) =>
                    row[filterColumn]?.toString() == filterValue.toString(),
              )
              .toList(),
        );
      }

      return stream;
    } catch (e) {
      if (kDebugMode) {
        print('Subscription error: $e');
      }
      rethrow;
    }
  }

  // Insert data
  Future<Map<String, dynamic>> insert(
    String table,
    Map<String, dynamic> data,
  ) async {
    try {
      final response = await supabase
          .from(table)
          .insert(data)
          .select()
          .single();
      return response;
    } catch (e) {
      if (kDebugMode) {
        print('Insert error: $e');
      }
      throw Exception('Failed to insert data');
    }
  }

  // Update data
  Future<Map<String, dynamic>> update(
    String table,
    String id,
    Map<String, dynamic> data,
  ) async {
    try {
      final response = await supabase
          .from(table)
          .update(data)
          .eq('id', id)
          .select()
          .single();
      return response;
    } catch (e) {
      if (kDebugMode) {
        print('Update error: $e');
      }
      throw Exception('Failed to update data');
    }
  }

  // Delete data
  Future<void> delete(String table, String id) async {
    try {
      await supabase.from(table).delete().eq('id', id);
    } catch (e) {
      if (kDebugMode) {
        print('Delete error: $e');
      }
      throw Exception('Failed to delete data');
    }
  }

  // Fetch data with pagination
  Future<List<Map<String, dynamic>>> fetch(
    String table, {
    int page = 1,
    int limit = 20,
    Map<String, dynamic>? filters,
  }) async {
    try {
      final query = supabase
          .from(table)
          .select()
          .range((page - 1) * limit, page * limit - 1);

      if (filters != null) {
        final response = await query;
        return List<Map<String, dynamic>>.from(response)
            .where(
              (row) => filters.entries.every(
                (filter) =>
                    filter.value == null ||
                    row[filter.key]?.toString() == filter.value?.toString(),
              ),
            )
            .toList();
      }

      final response = await query;
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      if (kDebugMode) {
        print('Fetch error: $e');
      }
      throw Exception('Failed to fetch data');
    }
  }

  // Dispose subscriptions
  void dispose(String table) {
    _activeSubscriptions[table]?.unsubscribe();
    _activeSubscriptions.remove(table);
  }

  // Dispose all subscriptions
  void disposeAll() {
    for (final subscription in _activeSubscriptions.values) {
      subscription.unsubscribe();
    }
    _activeSubscriptions.clear();
  }
}
