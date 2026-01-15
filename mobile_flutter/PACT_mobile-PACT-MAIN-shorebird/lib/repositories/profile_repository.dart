import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import '../models/pact_user_profile.dart';
import '../services/offline_data_service.dart';

/// Repository for user profile operations
class ProfileRepository {
  final SupabaseClient _supabase;
  final OfflineDataService _offlineDataService = OfflineDataService();

  ProfileRepository(this._supabase);

  /// Check if device is online
  Future<bool> _isOnline() async {
    try {
      final result = await Connectivity().checkConnectivity();
      return !result.contains(ConnectivityResult.none);
    } catch (e) {
      return false;
    }
  }

  /// Get current user's profile
  Future<PACTUserProfile> getCurrentUserProfile() async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) {
      throw Exception('User not authenticated');
    }

    return getUserProfileById(userId);
  }

  /// Get user profile by ID
  Future<PACTUserProfile> getUserProfileById(String userId) async {
    try {
      // Check if online
      if (!(await _isOnline())) {
        final cachedProfile = await _getProfileFromCache(userId);
        if (cachedProfile != null) return cachedProfile;
        throw Exception('No cached profile available offline');
      }

      final response = await _supabase
          .from('profiles')
          .select()
          .eq('id', userId)
          .single();

      final profile = PACTUserProfile.fromJson(response);

      // Cache for offline use
      await _offlineDataService.cacheUserProfile(userId, response);

      return profile;
    } on PostgrestException catch (e) {
      // Try cache on error
      debugPrint('Error loading profile: ${e.message} - trying cache');
      final cachedProfile = await _getProfileFromCache(userId);
      if (cachedProfile != null) return cachedProfile;
      throw Exception('Failed to load profile: ${e.message}');
    } catch (e) {
      // Try cache on error
      debugPrint('Error loading profile: $e - trying cache');
      final cachedProfile = await _getProfileFromCache(userId);
      if (cachedProfile != null) return cachedProfile;
      throw Exception('Failed to load profile: $e');
    }
  }

  Future<PACTUserProfile?> _getProfileFromCache(String userId) async {
    final cachedData = await _offlineDataService.getCachedUserProfile(userId);
    if (cachedData != null) {
      debugPrint('📦 Returning cached user profile');
      return PACTUserProfile.fromJson(cachedData);
    }
    return null;
  }

  /// Update user profile
  /// RLS: Users can update their own profile, admins can update any
  Future<PACTUserProfile> updateProfile({
    required String userId,
    String? fullName,
    String? username,
    String? phone,
    String? avatarUrl,
    UserAvailability? availability,
    bool? locationSharing,
    UserLocation? location,
    BankAccount? bankAccount,
  }) async {
    try {
      final updates = <String, dynamic>{
        'updated_at': DateTime.now().toIso8601String(),
      };

      if (fullName != null) updates['full_name'] = fullName;
      if (username != null) updates['username'] = username;
      if (phone != null) updates['phone'] = phone;
      if (avatarUrl != null) updates['avatar_url'] = avatarUrl;
      if (availability != null) updates['availability'] = availability.name;
      if (locationSharing != null) {
        updates['location_sharing'] = locationSharing;
      }
      if (location != null) updates['location'] = location.toJson();
      if (bankAccount != null) updates['bank_account'] = bankAccount.toJson();

      final response = await _supabase
          .from('profiles')
          .update(updates)
          .eq('id', userId)
          .select()
          .maybeSingle();

      if (response == null) {
        throw Exception('Profile not found or update failed');
      }

      return PACTUserProfile.fromJson(response);
    } on PostgrestException catch (e) {
      throw Exception('Failed to update profile: ${e.message}');
    } catch (e) {
      throw Exception('Failed to update profile: $e');
    }
  }

  /// Upload avatar to Supabase Storage
  Future<String> uploadAvatar({
    required String userId,
    required XFile imageFile,
  }) async {
    try {
      // Read file bytes (works on web and mobile)
      final bytes = await imageFile.readAsBytes();

      // Generate unique filename with timestamp
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final extension = imageFile.name.split('.').last;
      final filename = '$userId-$timestamp.$extension';

      // Upload to avatars bucket using bytes
      await _supabase.storage.from('avatars').uploadBinary(filename, bytes);

      // Get public URL
      final publicUrl = _supabase.storage
          .from('avatars')
          .getPublicUrl(filename);

      return publicUrl;
    } on StorageException catch (e) {
      throw Exception('Failed to upload avatar: ${e.message}');
    } catch (e) {
      throw Exception('Failed to upload avatar: $e');
    }
  }

  /// Delete avatar from Supabase Storage
  Future<void> deleteAvatar(String avatarUrl) async {
    try {
      // Extract filename from URL
      final uri = Uri.parse(avatarUrl);
      final filename = uri.pathSegments.last;

      await _supabase.storage.from('avatars').remove([filename]);
    } on StorageException catch (e) {
      throw Exception('Failed to delete avatar: ${e.message}');
    } catch (e) {
      throw Exception('Failed to delete avatar: $e');
    }
  }

  /// Update user availability status
  Future<void> updateAvailability({
    required String userId,
    required UserAvailability availability,
  }) async {
    try {
      await _supabase
          .from('profiles')
          .update({
            'availability': availability.name,
            'last_active': DateTime.now().toIso8601String(),
          })
          .eq('id', userId);
    } on PostgrestException catch (e) {
      throw Exception('Failed to update availability: ${e.message}');
    } catch (e) {
      throw Exception('Failed to update availability: $e');
    }
  }

  /// Update user location
  Future<void> updateLocation({
    required String userId,
    required UserLocation location,
    bool? isSharing,
  }) async {
    try {
      final updates = <String, dynamic>{
        'location': location.toJson(),
        'updated_at': DateTime.now().toIso8601String(),
      };

      if (isSharing != null) {
        updates['location_sharing'] = isSharing;
      }

      await _supabase.from('profiles').update(updates).eq('id', userId);
    } on PostgrestException catch (e) {
      throw Exception('Failed to update location: ${e.message}');
    } catch (e) {
      throw Exception('Failed to update location: $e');
    }
  }

  /// Subscribe to profile changes (real-time)
  RealtimeChannel subscribeToProfileChanges({
    required String userId,
    required void Function(PACTUserProfile profile) onUpdate,
  }) {
    final channel = _supabase.channel('profile-$userId');

    channel
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'profiles',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'id',
            value: userId,
          ),
          callback: (payload) {
            final profile = PACTUserProfile.fromJson(payload.newRecord);
            onUpdate(profile);
          },
        )
        .subscribe();

    return channel;
  }

  /// Get profiles by role (for admins)
  Future<List<PACTUserProfile>> getProfilesByRole(String role) async {
    try {
      final response = await _supabase
          .from('profiles')
          .select()
          .eq('role', role)
          .order('full_name');

      return (response as List)
          .map((json) => PACTUserProfile.fromJson(json))
          .toList();
    } on PostgrestException catch (e) {
      throw Exception('Failed to load profiles: ${e.message}');
    } catch (e) {
      throw Exception('Failed to load profiles: $e');
    }
  }

  /// Get pending approval profiles (for admins/supervisors)
  Future<List<PACTUserProfile>> getPendingApprovals() async {
    try {
      final response = await _supabase
          .from('profiles')
          .select()
          .eq('status', 'pending')
          .order('created_at');

      return (response as List)
          .map((json) => PACTUserProfile.fromJson(json))
          .toList();
    } on PostgrestException catch (e) {
      throw Exception('Failed to load pending profiles: ${e.message}');
    } catch (e) {
      throw Exception('Failed to load pending profiles: $e');
    }
  }

  /// Approve user profile (for admins)
  Future<PACTUserProfile> approveProfile(String userId) async {
    try {
      final response = await _supabase
          .from('profiles')
          .update({
            'status': 'approved',
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', userId)
          .select()
          .single();

      return PACTUserProfile.fromJson(response);
    } on PostgrestException catch (e) {
      throw Exception('Failed to approve profile: ${e.message}');
    } catch (e) {
      throw Exception('Failed to approve profile: $e');
    }
  }

  /// Reject user profile (for admins)
  Future<PACTUserProfile> rejectProfile(String userId, String reason) async {
    try {
      final response = await _supabase
          .from('profiles')
          .update({
            'status': 'rejected',
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', userId)
          .select()
          .single();

      return PACTUserProfile.fromJson(response);
    } on PostgrestException catch (e) {
      throw Exception('Failed to reject profile: ${e.message}');
    } catch (e) {
      throw Exception('Failed to reject profile: $e');
    }
  }
}
