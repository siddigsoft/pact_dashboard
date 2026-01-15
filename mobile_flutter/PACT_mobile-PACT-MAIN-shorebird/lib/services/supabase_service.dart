import 'package:supabase_flutter/supabase_flutter.dart';
import 'dart:typed_data';

class SupabaseService {
  static final SupabaseService _instance = SupabaseService._internal();
  late final SupabaseClient _client;

  factory SupabaseService() {
    return _instance;
  }

  SupabaseService._internal();

  Future<void> initialize({
    required String supabaseUrl,
    required String supabaseAnonKey,
  }) async {
    await Supabase.initialize(
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
    );
    _client = Supabase.instance.client;
  }

  SupabaseClient get client => _client;

  // File upload method
  Future<String> uploadFile(String bucket, String path, List<int> bytes) async {
    try {
      final uint8List = Uint8List.fromList(bytes);
      await _client.storage.from(bucket).uploadBinary(path, uint8List);
      return _client.storage.from(bucket).getPublicUrl(path);
    } catch (e) {
      throw Exception('Failed to upload file: $e');
    }
  }

  // Authentication methods
  Future<AuthResponse> signInWithGoogle() async {
    try {
      final response = await _client.auth.signInWithOAuth(
        OAuthProvider.google,
        redirectTo: 'io.supabase.pactmobile://login-callback/',
      );
      if (!response) throw AuthException('Failed to sign in with Google');

      // Wait for the session to be established
      final session = _client.auth.currentSession;
      if (session == null) throw AuthException('No session established');

      return AuthResponse(
        session: session,
        user: session.user,
      );
    } catch (e) {
      throw AuthException(e.toString());
    }
  }

  Future<void> signOut() async {
    await _client.auth.signOut();
  }

  // Generic CRUD operations
  Future<List<Map<String, dynamic>>> fetchRecords(String table) async {
    final response = await _client
        .from(table)
        .select()
        .eq('user_id', _client.auth.currentUser?.id ?? '');
    return response;
    return response;
  }

  Future<Map<String, dynamic>> upsertRecord(
    String table,
    Map<String, dynamic> data,
  ) async {
    final response = await _client.from(table).upsert(data).select().single();
    return response;
  }

  Future<void> deleteRecord(String table, String id) async {
    await _client.from(table).delete().eq('id', id);
  }

  // Realtime subscription setup
  Stream<List<Map<String, dynamic>>> subscribeToTable(String table) {
    final userId = _client.auth.currentUser?.id ?? '';
    return _client
        .from(table)
        .stream(primaryKey: ['id'])
        .eq('user_id', userId)
        .map((data) => data.map((e) => e).toList());
  }
}
