import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/user_model.dart';
import '../../../core/offline/hive_manager.dart';
import '../../permissions/permission_service.dart';

final authServiceProvider = Provider<AuthService>((ref) => AuthService());

final currentUserProvider = StateNotifierProvider<CurrentUserNotifier, UserModel?>((ref) {
  return CurrentUserNotifier();
});

class CurrentUserNotifier extends StateNotifier<UserModel?> {
  CurrentUserNotifier() : super(null) {
    _loadFromCache();
  }

  void _loadFromCache() {
    final cached = HiveManager.getItem(HiveManager.userBox, 'current_user');
    if (cached != null) {
      state = UserModel.fromMap(cached);
    }
  }

  void setUser(UserModel? user) {
    state = user;
    if (user != null) {
      HiveManager.saveItem(HiveManager.userBox, 'current_user', user.toMap());
    } else {
      HiveManager.userBox.delete('current_user');
    }
  }

  Future<void> updateLocation(Map<String, dynamic> location) async {
    if (state != null) {
      final updated = state!.copyWith(
        location: location,
        locationUpdatedAt: DateTime.now().toIso8601String(),
      );
      setUser(updated);
    }
  }
}

class AuthService {
  final _client = Supabase.instance.client;

  Future<UserModel?> signIn({
    required String email,
    required String password,
  }) async {
    final response = await _client.auth.signInWithPassword(
      email: email,
      password: password,
    );

    if (response.user == null) return null;
    final user = await fetchProfile(response.user!.id);
    if (user != null) {
      // Sync permission overrides immediately after login so the route guard
      // has fresh data before the user navigates anywhere.
      await PermissionService.syncForUser(user.id);
    }
    return user;
  }

  Future<UserModel?> fetchProfile(String userId) async {
    try {
      final data = await _client
          .from('profiles')
          .select()
          .eq('id', userId)
          .maybeSingle();

      if (data == null) return null;
      return UserModel.fromMap(data);
    } catch (e) {
      final cached = HiveManager.getItem(HiveManager.userBox, 'current_user');
      if (cached != null) return UserModel.fromMap(cached);
      return null;
    }
  }

  /// Refreshes the permission cache if it is stale.  Call from the splash
  /// screen or after returning from background so offline guards stay current.
  Future<void> refreshPermissionsIfStale(String userId) async {
    if (PermissionService.isStale()) {
      await PermissionService.syncForUser(userId);
    }
  }

  Future<void> signOut() async {
    PermissionService.clear();
    await _client.auth.signOut();
    await HiveManager.clearAll();
  }

  User? get currentAuthUser => _client.auth.currentUser;

  Stream<AuthState> get authChanges => _client.auth.onAuthStateChange;

  bool get isLoggedIn => _client.auth.currentUser != null;
}
