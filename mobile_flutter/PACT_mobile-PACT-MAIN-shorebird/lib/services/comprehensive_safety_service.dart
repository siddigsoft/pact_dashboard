// lib/services/comprehensive_safety_service.dart

import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/comprehensive_safety_checklist.dart';
import 'package:uuid/uuid.dart';

class ComprehensiveSafetyService {
  final SupabaseClient _supabase = Supabase.instance.client;
  final Uuid _uuid = const Uuid();

  /// Save a new comprehensive monitoring checklist
  Future<void> saveChecklist(ComprehensiveSafetyChecklist checklist) async {
    try {
      await _supabase.from('comprehensive_monitoring_checklists').insert(checklist.toJson());
    } catch (e) {
      print('Error saving comprehensive monitoring checklist: $e');
      rethrow;
    }
  }

  /// Update an existing comprehensive monitoring checklist
  Future<void> updateChecklist(ComprehensiveSafetyChecklist checklist) async {
    try {
      await _supabase
          .from('comprehensive_monitoring_checklists')
          .update(checklist.toJson())
          .eq('id', checklist.id);
    } catch (e) {
      print('Error updating comprehensive monitoring checklist: $e');
      rethrow;
    }
  }

  /// Get all monitoring checklists for current user
  Future<List<ComprehensiveSafetyChecklist>> getChecklists() async {
    try {
      final userId = _supabase.auth.currentUser?.id;
      if (userId == null) return [];

      final response = await _supabase
          .from('comprehensive_monitoring_checklists')
          .select()
          .eq('user_id', userId)
          .order('created_at', ascending: false);

      return (response as List)
          .map((json) => ComprehensiveSafetyChecklist.fromJson(json))
          .toList();
    } catch (e) {
      print('Error fetching comprehensive monitoring checklists: $e');
      return [];
    }
  }

  /// Get a specific monitoring checklist by ID
  Future<ComprehensiveSafetyChecklist?> getChecklistById(String id) async {
    try {
      final response = await _supabase
          .from('comprehensive_monitoring_checklists')
          .select()
          .eq('id', id)
          .single();

      return ComprehensiveSafetyChecklist.fromJson(response);
    } catch (e) {
      print('Error fetching checklist: $e');
      return null;
    }
  }

  /// Delete a monitoring checklist
  Future<void> deleteChecklist(String id) async {
    try {
      await _supabase.from('comprehensive_monitoring_checklists').delete().eq('id', id);
    } catch (e) {
      print('Error deleting checklist: $e');
      rethrow;
    }
  }

  /// Generate a new checklist ID
  String generateId() {
    return _uuid.v4();
  }
}
