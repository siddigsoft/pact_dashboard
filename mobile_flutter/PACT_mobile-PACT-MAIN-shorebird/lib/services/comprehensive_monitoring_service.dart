import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/comprehensive_safety_checklist.dart';
import 'dart:io';

class ComprehensiveMonitoringService {
  final SupabaseClient _supabase = Supabase.instance.client;

  /// Submit comprehensive monitoring checklist to Supabase
  Future<void> submitChecklist(ComprehensiveSafetyChecklist checklist) async {
    try {
      // Upload all photos first and get their URLs
      final activityPhotoUrls = await _uploadPhotos(
        checklist.activityPhotos,
        'activity_monitoring',
      );
      final distributionPhotoUrls = await _uploadPhotos(
        checklist.distributionPhotos,
        'distribution_monitoring',
      );
      final postDistributionPhotoUrls = await _uploadPhotos(
        checklist.postDistributionPhotos,
        'post_distribution_monitoring',
      );
      final postHarvestPhotoUrls = await _uploadPhotos(
        checklist.postHarvestPhotos,
        'post_harvest_loss',
      );
      final marketDiversionPhotoUrls = await _uploadPhotos(
        checklist.marketDiversionPhotos,
        'market_diversion_monitoring',
      );

      // Insert the checklist data into Supabase
      await _supabase.from('comprehensive_monitoring_checklists').insert({
        'id': checklist.id,
        'created_at': checklist.createdAt.toIso8601String(),
        'user_id': _supabase.auth.currentUser?.id,
        'enumerator_name': checklist.enumeratorName,
        'enumerator_contact': checklist.enumeratorContact,
        'team_leader': checklist.teamLeader,
        'location_hub': checklist.locationHub,
        'site_name_id': checklist.siteNameId,
        'visit_date': checklist.visitDate.toIso8601String(),
        'visit_time': checklist.visitTime,
        'activities_monitored': checklist.activitiesMonitored,
        'activity_monitoring': checklist.activityMonitoring,
        'activity_priorities': checklist.activityPriorities,
        'activity_photos': activityPhotoUrls,
        'distribution_monitoring': checklist.distributionMonitoring,
        'distribution_photos': distributionPhotoUrls,
        'post_distribution_monitoring': checklist.postDistributionMonitoring,
        'post_distribution_photos': postDistributionPhotoUrls,
        'post_harvest_loss': checklist.postHarvestLoss,
        'post_harvest_photos': postHarvestPhotoUrls,
        'market_diversion_monitoring': checklist.marketDiversionMonitoring,
        'market_diversion_photos': marketDiversionPhotoUrls,
        'additional_notes': checklist.additionalNotes,
        'is_synced': true,
        'last_modified': checklist.lastModified.toIso8601String(),
      });

      print('Comprehensive monitoring checklist submitted successfully');
    } catch (e) {
      print('Error submitting comprehensive monitoring checklist: $e');
      rethrow;
    }
  }

  /// Upload photos to Supabase Storage
  Future<List<String>> _uploadPhotos(
    List<String> photoPaths,
    String category,
  ) async {
    final List<String> photoUrls = [];

    for (final path in photoPaths) {
      try {
        final file = File(path);
        final fileName =
            '${_supabase.auth.currentUser?.id}/${category}_${DateTime.now().millisecondsSinceEpoch}.jpg';

        // Upload to Supabase Storage
        await _supabase.storage
            .from('monitoring_photos')
            .upload(fileName, file);

        // Get public URL
        final url = _supabase.storage
            .from('monitoring_photos')
            .getPublicUrl(fileName);

        photoUrls.add(url);
      } catch (e) {
        print('Error uploading photo: $e');
        // Continue with other photos even if one fails
      }
    }

    return photoUrls;
  }

  /// Fetch all checklists for current user
  Future<List<ComprehensiveSafetyChecklist>> getChecklists() async {
    try {
      final response = await _supabase
          .from('comprehensive_monitoring_checklists')
          .select()
          .eq('user_id', _supabase.auth.currentUser?.id ?? '')
          .order('created_at', ascending: false);

      return (response as List)
          .map((json) => ComprehensiveSafetyChecklist.fromJson(json))
          .toList();
    } catch (e) {
      print('Error fetching checklists: $e');
      return [];
    }
  }

  /// Get checklist by ID
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

  /// Delete checklist
  Future<void> deleteChecklist(String id) async {
    try {
      await _supabase
          .from('comprehensive_monitoring_checklists')
          .delete()
          .eq('id', id);

      print('Checklist deleted successfully');
    } catch (e) {
      print('Error deleting checklist: $e');
      rethrow;
    }
  }
}
