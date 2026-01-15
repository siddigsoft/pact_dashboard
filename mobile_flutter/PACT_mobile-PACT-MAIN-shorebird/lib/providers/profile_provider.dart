import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:image_picker/image_picker.dart';
import '../models/pact_user_profile.dart';
import '../repositories/profile_repository.dart';

/// Provider for ProfileRepository
final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  return ProfileRepository(Supabase.instance.client);
});

/// State for profile management
class ProfileState {
  final PACTUserProfile? profile;
  final bool isLoading;
  final String? error;
  final RealtimeChannel? subscription;

  ProfileState({
    this.profile,
    this.isLoading = false,
    this.error,
    this.subscription,
  });

  ProfileState copyWith({
    PACTUserProfile? profile,
    bool? isLoading,
    String? error,
    RealtimeChannel? subscription,
  }) {
    return ProfileState(
      profile: profile ?? this.profile,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      subscription: subscription ?? this.subscription,
    );
  }
}

/// StateNotifier for managing profile state
class ProfileNotifier extends StateNotifier<ProfileState> {
  final ProfileRepository _repository;

  ProfileNotifier(this._repository) : super(ProfileState());

  /// Load current user's profile
  Future<void> loadProfile() async {
    state = state.copyWith(isLoading: true, error: null);
    
    try {
      final profile = await _repository.getCurrentUserProfile();
      state = state.copyWith(
        profile: profile,
        isLoading: false,
      );

      // Set up real-time subscription
      _setupRealtimeSubscription(profile.id);
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  /// Update profile information
  Future<void> updateProfile({
    String? fullName,
    String? username,
    String? phone,
    String? avatarUrl,
    UserAvailability? availability,
    bool? locationSharing,
    UserLocation? location,
    BankAccount? bankAccount,
  }) async {
    if (state.profile == null) {
      state = state.copyWith(error: 'No profile loaded');
      return;
    }

    state = state.copyWith(isLoading: true, error: null);
    
    try {
      final updatedProfile = await _repository.updateProfile(
        userId: state.profile!.id,
        fullName: fullName,
        username: username,
        phone: phone,
        avatarUrl: avatarUrl,
        availability: availability,
        locationSharing: locationSharing,
        location: location,
        bankAccount: bankAccount,
      );

      state = state.copyWith(
        profile: updatedProfile,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
      rethrow;
    }
  }

  /// Upload and set avatar
  Future<String> uploadAvatar(XFile imageFile) async {
    if (state.profile == null) {
      throw Exception('No profile loaded');
    }

    state = state.copyWith(isLoading: true, error: null);
    
    try {
      // Delete old avatar if exists
      if (state.profile!.avatarUrl != null) {
        try {
          await _repository.deleteAvatar(state.profile!.avatarUrl!);
        } catch (e) {
          debugPrint('Failed to delete old avatar: $e');
        }
      }

      // Upload new avatar
      final avatarUrl = await _repository.uploadAvatar(
        userId: state.profile!.id,
        imageFile: imageFile,
      );

      // Update profile with new avatar URL
      await updateProfile(avatarUrl: avatarUrl);

      state = state.copyWith(isLoading: false);
      return avatarUrl;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
      rethrow;
    }
  }

  /// Update availability status
  Future<void> updateAvailability(UserAvailability availability) async {
    if (state.profile == null) {
      state = state.copyWith(error: 'No profile loaded');
      return;
    }

    try {
      await _repository.updateAvailability(
        userId: state.profile!.id,
        availability: availability,
      );

      // Update local state
      state = state.copyWith(
        profile: state.profile!.copyWith(
          availability: availability,
          lastActive: DateTime.now(),
        ),
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
      rethrow;
    }
  }

  /// Update location
  Future<void> updateLocation({
    required UserLocation location,
    bool? isSharing,
  }) async {
    if (state.profile == null) {
      state = state.copyWith(error: 'No profile loaded');
      return;
    }

    try {
      await _repository.updateLocation(
        userId: state.profile!.id,
        location: location,
        isSharing: isSharing,
      );

      // Update local state
      state = state.copyWith(
        profile: state.profile!.copyWith(
          location: location,
          locationSharing: isSharing ?? state.profile!.locationSharing,
        ),
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
      rethrow;
    }
  }

  /// Set up real-time subscription for profile updates
  void _setupRealtimeSubscription(String userId) {
    // Unsubscribe from previous channel if exists
    if (state.subscription != null) {
      Supabase.instance.client.removeChannel(state.subscription!);
    }

    final channel = _repository.subscribeToProfileChanges(
      userId: userId,
      onUpdate: (updatedProfile) {
        state = state.copyWith(profile: updatedProfile);
      },
    );

    state = state.copyWith(subscription: channel);
  }

  /// Clear error
  void clearError() {
    state = state.copyWith(error: null);
  }

  @override
  void dispose() {
    // Clean up subscription
    if (state.subscription != null) {
      Supabase.instance.client.removeChannel(state.subscription!);
    }
    super.dispose();
  }
}

/// Provider for ProfileNotifier
final profileProvider = StateNotifierProvider<ProfileNotifier, ProfileState>((ref) {
  final repository = ref.watch(profileRepositoryProvider);
  return ProfileNotifier(repository);
});

/// Convenience provider for current user profile
final currentUserProfileProvider = Provider<PACTUserProfile?>((ref) {
  return ref.watch(profileProvider).profile;
});

/// Convenience provider for profile loading state
final profileLoadingProvider = Provider<bool>((ref) {
  return ref.watch(profileProvider).isLoading;
});

/// Convenience provider for profile error
final profileErrorProvider = Provider<String?>((ref) {
  return ref.watch(profileProvider).error;
});
