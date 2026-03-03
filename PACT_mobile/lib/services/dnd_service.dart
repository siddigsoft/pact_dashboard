import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class DNDSettings {
  final bool enabled;
  final TimeOfDay? startTime;
  final TimeOfDay? endTime;
  final bool allowStarredContacts;
  final bool allowEmergencyContacts;

  DNDSettings({
    this.enabled = false,
    this.startTime,
    this.endTime,
    this.allowStarredContacts = true,
    this.allowEmergencyContacts = true,
  });

  bool isCurrentlyActive() {
    if (!enabled) return false;
    if (startTime == null || endTime == null) return false;

    final now = DateTime.now();
    final currentMinutes = now.hour * 60 + now.minute;
    final startMinutes = startTime!.hour * 60 + startTime!.minute;
    final endMinutes = endTime!.hour * 60 + endTime!.minute;

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  }

  bool shouldAllowCall(bool isStarred, bool isEmergency) {
    if (!isCurrentlyActive()) return true;
    if (isEmergency && allowEmergencyContacts) return true;
    if (isStarred && allowStarredContacts) return true;
    return false;
  }
}

class TimeOfDay {
  final int hour;
  final int minute;

  TimeOfDay({required this.hour, required this.minute});

  factory TimeOfDay.fromString(String time) {
    final parts = time.split(':');
    return TimeOfDay(hour: int.parse(parts[0]), minute: int.parse(parts[1]));
  }

  String toTimeString() =>
      '${hour.toString().padLeft(2, '0')}:${minute.toString().padLeft(2, '0')}';
}

class DNDService {
  static final DNDService _instance = DNDService._internal();
  factory DNDService() => _instance;
  DNDService._internal();

  final SupabaseClient _supabase = Supabase.instance.client;

  /// Get user's DND settings
  Future<DNDSettings> getDNDSettings(String userId) async {
    try {
      final data = await _supabase
          .from('dnd_settings')
          .select()
          .eq('user_id', userId)
          .single()
          .then((data) => data)
          .catchError((_) => null);

      return DNDSettings(
        enabled: data['enabled'] ?? false,
        startTime: data['start_time'] != null
            ? TimeOfDay.fromString(data['start_time'])
            : null,
        endTime: data['end_time'] != null
            ? TimeOfDay.fromString(data['end_time'])
            : null,
        allowStarredContacts: data['allow_starred_contacts'] ?? true,
        allowEmergencyContacts: data['allow_emergency_contacts'] ?? true,
      );
    } catch (e) {
      print('[DND] Error fetching settings: $e');
      return DNDSettings();
    }
  }

  /// Update DND settings
  Future<bool> updateDNDSettings({
    required String userId,
    required DNDSettings settings,
  }) async {
    try {
      await _supabase.from('dnd_settings').upsert({
        'user_id': userId,
        'enabled': settings.enabled,
        'start_time': settings.startTime?.toTimeString(),
        'end_time': settings.endTime?.toTimeString(),
        'allow_starred_contacts': settings.allowStarredContacts,
        'allow_emergency_contacts': settings.allowEmergencyContacts,
      }, onConflict: 'user_id');

      return true;
    } catch (e) {
      print('[DND] Error updating settings: $e');
      return false;
    }
  }

  /// Toggle DND on/off
  Future<bool> toggleDND(String userId, bool enabled) async {
    try {
      final existing = await getDNDSettings(userId);
      return await updateDNDSettings(
        userId: userId,
        settings: DNDSettings(
          enabled: enabled,
          startTime: existing.startTime,
          endTime: existing.endTime,
          allowStarredContacts: existing.allowStarredContacts,
          allowEmergencyContacts: existing.allowEmergencyContacts,
        ),
      );
    } catch (e) {
      print('[DND] Error toggling: $e');
      return false;
    }
  }

  /// Check if contact is starred
  Future<bool> isStarredContact(String userId, String contactId) async {
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

  /// Check if contact is emergency
  Future<bool> isEmergencyContact(String userId, String contactId) async {
    try {
      final data = await _supabase
          .from('emergency_contacts')
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
}

/// Provider for DND settings
final dndSettingsProvider = FutureProvider.family<DNDSettings, String>((
  ref,
  userId,
) async {
  final service = DNDService();
  return service.getDNDSettings(userId);
});

/// Provider for DND enabled state
final dndEnabledProvider = StateNotifierProvider<DNDNotifier, bool>((ref) {
  return DNDNotifier();
});

class DNDNotifier extends StateNotifier<bool> {
  DNDNotifier() : super(false);

  void toggle() {
    state = !state;
  }
}
