import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:flutter/material.dart';

/// Service for integrating device contacts into the app
class ContactIntegrationService {
  static final ContactIntegrationService _instance =
      ContactIntegrationService._internal();
  factory ContactIntegrationService() => _instance;
  ContactIntegrationService._internal();

  List<Contact> _cachedContacts = [];
  bool _isInitialized = false;

  /// Get all contacts from device
  Future<List<Contact>> getContacts() async {
    try {
      // Check permission first
      if (!await FlutterContacts.requestPermission(readonly: true)) {
        debugPrint('[ContactIntegration] Permission denied');
        return [];
      }

      // Use cached if available
      if (_isInitialized && _cachedContacts.isNotEmpty) {
        return _cachedContacts;
      }

      // Fetch all contacts
      final contacts = await FlutterContacts.getContacts(
        withProperties: true,
        withThumbnail: true,
      );

      _cachedContacts = contacts;
      _isInitialized = true;
      debugPrint('[ContactIntegration] Loaded ${contacts.length} contacts');
      return contacts;
    } catch (e) {
      debugPrint('[ContactIntegration] Error getting contacts: $e');
      return [];
    }
  }

  /// Search contacts by name
  Future<List<Contact>> searchContacts(String query) async {
    try {
      final contacts = await getContacts();
      return contacts
          .where(
            (c) => c.displayName.toLowerCase().contains(query.toLowerCase()),
          )
          .toList();
    } catch (e) {
      debugPrint('[ContactIntegration] Error searching: $e');
      return [];
    }
  }

  /// Search contacts by phone number
  Future<List<Contact>> searchByPhoneNumber(String phoneNumber) async {
    try {
      final contacts = await getContacts();
      return contacts
          .where(
            (c) => c.phones.any(
              (p) =>
                  p.number.replaceAll(RegExp(r'\D'), '').contains(phoneNumber),
            ),
          )
          .toList();
    } catch (e) {
      debugPrint('[ContactIntegration] Error searching by phone: $e');
      return [];
    }
  }

  /// Get contact by phone number
  Future<Contact?> getContactByPhoneNumber(String phoneNumber) async {
    try {
      final results = await searchByPhoneNumber(phoneNumber);
      return results.isNotEmpty ? results.first : null;
    } catch (e) {
      debugPrint('[ContactIntegration] Error getting contact: $e');
      return null;
    }
  }

  /// Get contact by email
  Future<Contact?> getContactByEmail(String email) async {
    try {
      final contacts = await getContacts();
      final result = contacts.firstWhere(
        (c) => c.emails.any((e) => e.address == email),
        orElse: () => Contact(),
      );
      return result.id != null ? result : null;
    } catch (e) {
      debugPrint('[ContactIntegration] Error getting contact by email: $e');
      return null;
    }
  }

  /// Get contact details
  Future<Contact?> getContactDetails(String contactId) async {
    try {
      final contact = await FlutterContacts.getContact(
        contactId,
        withProperties: true,
        withThumbnail: true,
      );
      return contact;
    } catch (e) {
      debugPrint('[ContactIntegration] Error getting details: $e');
      return null;
    }
  }

  /// Format phone number for display
  static String formatPhoneNumber(String phoneNumber) {
    final digits = phoneNumber.replaceAll(RegExp(r'\D'), '');

    if (digits.length >= 10) {
      // US format: (123) 456-7890
      return '(${digits.substring(digits.length - 10, digits.length - 7)}) '
          '${digits.substring(digits.length - 7, digits.length - 4)}-'
          '${digits.substring(digits.length - 4)}';
    } else if (digits.length >= 7) {
      // Short format: 456-7890
      return '${digits.substring(0, digits.length - 4)}-'
          '${digits.substring(digits.length - 4)}';
    }
    return phoneNumber;
  }

  /// Get primary phone number
  static String? getPrimaryPhoneNumber(Contact contact) {
    if (contact.phones.isEmpty) return null;

    // Try to get mobile number first
    final mobile = contact.phones.firstWhere(
      (p) => p.label == 'mobile',
      orElse: () => contact.phones.first,
    );
    return mobile.number;
  }

  /// Get primary email
  static String? getPrimaryEmail(Contact contact) {
    if (contact.emails.isEmpty) return null;

    // Try to get personal email first
    final personal = contact.emails.firstWhere(
      (e) => e.label == 'personal',
      orElse: () => contact.emails.first,
    );
    return personal.address;
  }

  /// Check if contact has phone number
  static bool hasPhoneNumber(Contact contact) => contact.phones.isNotEmpty;

  /// Check if contact has email
  static bool hasEmail(Contact contact) => contact.emails.isNotEmpty;

  /// Get initials from contact name
  static String getInitials(String name) {
    final parts = name.split(' ');
    final initials = parts.map((p) => p[0].toUpperCase()).join();
    return initials.length > 2 ? initials.substring(0, 2) : initials;
  }

  /// Clear cache
  void clearCache() {
    _cachedContacts.clear();
    _isInitialized = false;
  }

  /// Refresh contacts
  Future<void> refreshContacts() async {
    clearCache();
    await getContacts();
  }
}
