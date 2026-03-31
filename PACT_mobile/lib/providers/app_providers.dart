import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../models/project_model.dart';
import '../repositories/project_repository.dart';

class UserProfile {
  final String id;
  final String? fullName;
  final String? email;
  final String role;
  final String? avatarUrl;
  final String? hubName;

  const UserProfile({
    required this.id,
    this.fullName,
    this.email,
    required this.role,
    this.avatarUrl,
    this.hubName,
  });

  bool get isAdmin => role == 'super_admin' || role == 'admin';
  bool get isFom => role == 'fom';
  bool get isCoordinator => role == 'coordinator' || role == 'field_coordinator' || role == 'state_coordinator';
  bool get isSupervisor => role == 'supervisor';
  bool get isDataCollector => role == 'data_collector' || role == 'dataCollector';

  bool get canSeeAdminFeatures => isAdmin || isFom;
  bool get canSeeReports => isAdmin || isFom || isCoordinator || isSupervisor;
  bool get canSeeFinance => isAdmin || isFom || isCoordinator || isSupervisor;
}

class UserProfileNotifier extends AsyncNotifier<UserProfile?> {
  @override
  Future<UserProfile?> build() async {
    final supabase = Supabase.instance.client;
    final authUser = supabase.auth.currentUser;
    if (authUser == null) return null;

    try {
      final data = await supabase
          .from('profiles')
          .select('id, full_name, email, role, avatar_url, hub_name')
          .eq('id', authUser.id)
          .maybeSingle();

      if (data == null) return null;

      final profile = UserProfile(
        id: authUser.id,
        fullName: data['full_name'] as String?,
        email: data['email'] as String? ?? authUser.email,
        role: (data['role'] as String?)?.toLowerCase() ?? 'data_collector',
        avatarUrl: data['avatar_url'] as String?,
        hubName: data['hub_name'] as String?,
      );

      final box = await Hive.openBox('user_profile_cache');
      await box.put('user_role', profile.role);
      await box.put('full_name', profile.fullName ?? '');
      await box.put('avatar_url', profile.avatarUrl ?? '');

      return profile;
    } catch (e) {
      final box = await Hive.openBox('user_profile_cache');
      final cachedRole = (box.get('user_role') as String?)?.toLowerCase() ?? 'data_collector';
      final cachedName = box.get('full_name') as String?;
      return UserProfile(
        id: authUser.id,
        fullName: cachedName,
        email: authUser.email,
        role: cachedRole,
      );
    }
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => build());
  }
}

final userProfileProvider = AsyncNotifierProvider<UserProfileNotifier, UserProfile?>(
  UserProfileNotifier.new,
);

final userRoleProvider = Provider<String>((ref) {
  return ref.watch(userProfileProvider).maybeWhen(
    data: (profile) => profile?.role ?? 'data_collector',
    orElse: () => 'data_collector',
  );
});

final isAdminProvider = Provider<bool>((ref) {
  final role = ref.watch(userRoleProvider);
  return role == 'super_admin' || role == 'admin';
});

final isFomProvider = Provider<bool>((ref) {
  final role = ref.watch(userRoleProvider);
  return role == 'fom' || role == 'super_admin' || role == 'admin';
});

final connectivityProvider = StreamProvider<List<ConnectivityResult>>((ref) {
  return Connectivity().onConnectivityChanged;
});

final isOnlineProvider = Provider<bool>((ref) {
  return ref.watch(connectivityProvider).maybeWhen(
    data: (results) => !results.contains(ConnectivityResult.none),
    orElse: () => true,
  );
});

// ============================================================
// Project Providers
// ============================================================

final projectRepositoryProvider = Provider<ProjectRepository>((ref) {
  return ProjectRepository(Supabase.instance.client);
});

/// Paginated project list for the current user.
/// Params: (page, isAdmin)
final projectsProvider = FutureProvider.family<List<ProjectModel>, (int, bool)>(
  (ref, params) async {
    final (page, isAdmin) = params;
    final supabase = Supabase.instance.client;
    final userId = supabase.auth.currentUser?.id ?? '';
    final repo = ref.watch(projectRepositoryProvider);
    return repo.fetchProjects(userId: userId, isAdmin: isAdmin, page: page);
  },
);

/// Single project detail with flow log.
final projectDetailProvider = FutureProvider.family<ProjectModel?, String>(
  (ref, projectId) async {
    final repo = ref.watch(projectRepositoryProvider);
    return repo.fetchProjectDetail(projectId);
  },
);
