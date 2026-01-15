// lib/services/chat_contact_service.dart

import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';
import '../models/chat_contact.dart';

class ChatContactService {
  final SupabaseClient _supabase = Supabase.instance.client;
  final Uuid _uuid = const Uuid();

  /// Generate a consistent chat ID based on two user IDs
  /// This ensures the same chat ID regardless of who initiates
  String generateChatId(String userId1, String userId2) {
    // Sort user IDs alphabetically to ensure consistency
    final sortedIds = [userId1, userId2]..sort();
    return '${sortedIds[0]}_${sortedIds[1]}';
  }

  /// Save or update a chat contact
  Future<ChatContact> saveContact({
    required String userId,
    required String contactUserId,
    String? customName,
    String? defaultName,
  }) async {
    try {
      // Check if contact already exists
      final existing = await getContact(userId, contactUserId);
      
      if (existing != null) {
        // Update existing contact
        return await updateContactName(
          userId: userId,
          contactUserId: contactUserId,
          customName: customName ?? existing.customName,
          defaultName: defaultName ?? existing.defaultName,
        );
      }

      // Create new contact
      final contactId = _uuid.v4();
      final chatId = generateChatId(userId, contactUserId);
      final now = DateTime.now();

      final data = {
        'id': contactId,
        'user_id': userId,
        'contact_user_id': contactUserId,
        'chat_id': chatId,
        'custom_name': customName,
        'default_name': defaultName,
        'created_at': now.toIso8601String(),
        'last_modified': now.toIso8601String(),
      };

      await _supabase.from('chat_contacts').insert(data);

      return ChatContact.fromJson(data);
    } catch (e) {
      print('Error saving contact: $e');
      rethrow;
    }
  }

  /// Update a contact's custom name
  Future<ChatContact> updateContactName({
    required String userId,
    required String contactUserId,
    String? customName,
    String? defaultName,
  }) async {
    try {
      final now = DateTime.now();

      final updateData = {
        'custom_name': customName,
        'default_name': defaultName,
        'last_modified': now.toIso8601String(),
      };

      final response = await _supabase
          .from('chat_contacts')
          .update(updateData)
          .eq('user_id', userId)
          .eq('contact_user_id', contactUserId)
          .select()
          .single();

      return ChatContact.fromJson(response);
    } catch (e) {
      print('Error updating contact name: $e');
      rethrow;
    }
  }

  /// Get a specific contact
  Future<ChatContact?> getContact(String userId, String contactUserId) async {
    try {
      final response = await _supabase
          .from('chat_contacts')
          .select()
          .eq('user_id', userId)
          .eq('contact_user_id', contactUserId)
          .maybeSingle();

      if (response == null) return null;
      return ChatContact.fromJson(response);
    } catch (e) {
      print('Error getting contact: $e');
      return null;
    }
  }

  /// Get all contacts for a user
  Future<List<ChatContact>> getContacts(String userId) async {
    try {
      final response = await _supabase
          .from('chat_contacts')
          .select()
          .eq('user_id', userId)
          .order('last_modified', ascending: false);

      return (response as List)
          .map((json) => ChatContact.fromJson(json))
          .toList();
    } catch (e) {
      print('Error getting contacts: $e');
      return [];
    }
  }

  /// Delete a contact
  Future<void> deleteContact(String userId, String contactUserId) async {
    try {
      await _supabase
          .from('chat_contacts')
          .delete()
          .eq('user_id', userId)
          .eq('contact_user_id', contactUserId);
    } catch (e) {
      print('Error deleting contact: $e');
      rethrow;
    }
  }

  /// Fetch default name from user profile
  Future<String?> fetchUserProfileName(String userId) async {
    try {
      final response = await _supabase
          .from('users')
          .select('name, email')
          .eq('id', userId)
          .maybeSingle();

      if (response == null) return null;
      return response['name'] as String? ?? response['email'] as String?;
    } catch (e) {
      print('Error fetching user profile name: $e');
      return null;
    }
  }
}
