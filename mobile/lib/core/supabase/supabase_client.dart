import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseService {
  static SupabaseClient get client => Supabase.instance.client;

  static User? get currentUser => client.auth.currentUser;

  static Session? get currentSession => client.auth.currentSession;

  static bool get isAuthenticated => currentUser != null;

  static Stream<AuthState> get authStateChanges =>
      client.auth.onAuthStateChange;

  static Future<AuthResponse> signIn({
    required String email,
    required String password,
  }) async {
    return await client.auth.signInWithPassword(
      email: email,
      password: password,
    );
  }

  static Future<void> signOut() async {
    await client.auth.signOut();
  }

  static Future<Map<String, dynamic>?> getCurrentProfile() async {
    final user = currentUser;
    if (user == null) return null;

    final response = await client
        .from('profiles')
        .select()
        .eq('id', user.id)
        .maybeSingle();

    return response;
  }

  static Future<void> updateUserLocation(
    double latitude,
    double longitude,
    double accuracy,
  ) async {
    final user = currentUser;
    if (user == null) return;

    await client.from('profiles').update({
      'location': {
        'latitude': latitude,
        'longitude': longitude,
        'accuracy': accuracy,
        'lastUpdated': DateTime.now().toIso8601String(),
      },
      'location_updated_at': DateTime.now().toIso8601String(),
    }).eq('id', user.id);
  }
}
