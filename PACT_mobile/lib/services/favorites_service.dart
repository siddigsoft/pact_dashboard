import 'package:supabase_flutter/supabase_flutter.dart';

class FavoritesService {
  static final FavoritesService _instance = FavoritesService._internal();
  factory FavoritesService() => _instance;
  FavoritesService._internal();

  final SupabaseClient _supabase = Supabase.instance.client;

  /// Add contact to favorites
  Future<bool> addFavorite({
    required String userId,
    required String contactId,
    required String contactName,
    String? contactAvatar,
  }) async {
    try {
      await _supabase.from('favorite_contacts').insert({
        'user_id': userId,
        'contact_id': contactId,
        'contact_name': contactName,
        'contact_avatar': contactAvatar,
      });
      return true;
    } catch (e) {
      print('[Favorites] Error adding favorite: $e');
      return false;
    }
  }

  /// Remove from favorites
  Future<bool> removeFavorite({
    required String userId,
    required String contactId,
  }) async {
    try {
      await _supabase
          .from('favorite_contacts')
          .delete()
          .eq('user_id', userId)
          .eq('contact_id', contactId);
      return true;
    } catch (e) {
      print('[Favorites] Error removing favorite: $e');
      return false;
    }
  }

  /// Get all favorites
  Future<List<Map<String, dynamic>>> getFavorites(String userId) async {
    try {
      final data = await _supabase
          .from('favorite_contacts')
          .select()
          .eq('user_id', userId)
          .order('position', ascending: true);

      return List<Map<String, dynamic>>.from(data as List);
    } catch (e) {
      print('[Favorites] Error fetching favorites: $e');
      return [];
    }
  }

  /// Check if contact is favorite
  Future<bool> isFavorite(String userId, String contactId) async {
    try {
      final data = await _supabase
          .from('favorite_contacts')
          .select()
          .eq('user_id', userId)
          .eq('contact_id', contactId)
          .then((data) => data)
          .catchError((_) => []);

      return (data as List).isNotEmpty;
    } catch (e) {
      return false;
    }
  }

  /// Update favorite position (for drag-reorder)
  Future<bool> updateFavoritePosition({
    required String userId,
    required String contactId,
    required int newPosition,
  }) async {
    try {
      await _supabase
          .from('favorite_contacts')
          .update({'position': newPosition})
          .eq('user_id', userId)
          .eq('contact_id', contactId);
      return true;
    } catch (e) {
      print('[Favorites] Error updating position: $e');
      return false;
    }
  }
}
