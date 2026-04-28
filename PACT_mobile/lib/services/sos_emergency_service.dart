import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter/foundation.dart'
    show kIsWeb, defaultTargetPlatform, TargetPlatform;

import '../models/incident_report.dart';
import '../services/help_enhancements_service.dart';
import '../services/local_storage_service.dart';
import '../services/location_service.dart';

class QuickSosResult {
  final bool callLaunched;
  final bool incidentDraftSaved;
  final bool locationCaptured;
  final bool shouldOpenSafetyHub;
  final String message;
  final String? contactName;
  final String? contactSourceLabel;

  const QuickSosResult({
    required this.callLaunched,
    required this.incidentDraftSaved,
    required this.locationCaptured,
    required this.shouldOpenSafetyHub,
    required this.message,
    this.contactName,
    this.contactSourceLabel,
  });
}

class SosEmergencyService {
  static const String sosCountdownSecondsSettingKey = 'sos_countdown_seconds';
  static const int defaultSosCountdownSeconds = 3;
  static const String sosHapticWarningEnabledSettingKey =
      'sos_haptic_warning_enabled';
  static const bool defaultSosHapticWarningEnabled = true;
  static const String sosRequireLongPressSettingKey = 'sos_require_long_press';
  static const bool defaultSosRequireLongPress = true;
  static const String sosVolumeUpHoldEnabledSettingKey =
      'sos_volume_up_hold_enabled';
  static const bool defaultSosVolumeUpHoldEnabled = true;
  static const String sosTestModeEnabledSettingKey = 'sos_test_mode_enabled';
  static const bool defaultSosTestModeEnabled = false;

  final SupabaseClient _supabase = Supabase.instance.client;
  final HelpEnhancementsService _helpEnhancementsService =
      HelpEnhancementsService();
  final LocalStorageService _localStorageService = LocalStorageService();

  int getSosCountdownSeconds() {
    try {
      final configured = _localStorageService.getAppSetting(
        sosCountdownSecondsSettingKey,
      );

      if (configured is int) {
        return configured.clamp(1, 10);
      }

      if (configured is String) {
        final parsed = int.tryParse(configured);
        if (parsed != null) {
          return parsed.clamp(1, 10);
        }
      }
    } catch (_) {}

    return defaultSosCountdownSeconds;
  }

  bool isSosHapticWarningEnabled() {
    try {
      final configured = _localStorageService.getAppSetting(
        sosHapticWarningEnabledSettingKey,
      );

      if (configured is bool) {
        return configured;
      }

      if (configured is String) {
        final normalized = configured.toLowerCase().trim();
        if (normalized == 'true' || normalized == '1') return true;
        if (normalized == 'false' || normalized == '0') return false;
      }
    } catch (_) {}

    return defaultSosHapticWarningEnabled;
  }

  bool isSosLongPressRequired() {
    try {
      final configured = _localStorageService.getAppSetting(
        sosRequireLongPressSettingKey,
      );

      if (configured is bool) {
        return configured;
      }

      if (configured is String) {
        final normalized = configured.toLowerCase().trim();
        if (normalized == 'true' || normalized == '1') return true;
        if (normalized == 'false' || normalized == '0') return false;
      }
    } catch (_) {}

    return defaultSosRequireLongPress;
  }

  bool isSosVolumeUpHoldEnabled() {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) {
      return false;
    }

    try {
      final configured = _localStorageService.getAppSetting(
        sosVolumeUpHoldEnabledSettingKey,
      );

      if (configured is bool) {
        return configured;
      }

      if (configured is String) {
        final normalized = configured.toLowerCase().trim();
        if (normalized == 'true' || normalized == '1') return true;
        if (normalized == 'false' || normalized == '0') return false;
      }
    } catch (_) {}

    return defaultSosVolumeUpHoldEnabled;
  }

  bool isSosTestModeEnabled() {
    try {
      final configured = _localStorageService.getAppSetting(
        sosTestModeEnabledSettingKey,
      );

      if (configured is bool) {
        return configured;
      }

      if (configured is String) {
        final normalized = configured.toLowerCase().trim();
        if (normalized == 'true' || normalized == '1') return true;
        if (normalized == 'false' || normalized == '0') return false;
      }
    } catch (_) {}

    return defaultSosTestModeEnabled;
  }

  Future<Map<String, String>?> getNextQuickSosContactPreview() async {
    return _resolvePreferredContact();
  }

  Future<Map<String, String>?> getEmergencyFallbackContactPreview() async {
    return _getPrimaryEmergencyContact();
  }

  Future<QuickSosResult> triggerQuickSosCall({
    Map<String, String>? preferredContact,
  }) async {
    try {
      final contact =
          _normalizePreferredContact(preferredContact) ??
          await _resolvePreferredContact();
      if (contact == null) {
        return const QuickSosResult(
          callLaunched: false,
          incidentDraftSaved: false,
          locationCaptured: false,
          shouldOpenSafetyHub: true,
          message: 'No emergency contact found. Opening Safety Hub.',
        );
      }

      final position = await LocationService.getCurrentLocation();
      final locationCaptured = position != null;
      final locationText = locationCaptured
          ? '${position.latitude.toStringAsFixed(6)}, '
                '${position.longitude.toStringAsFixed(6)} '
                '(±${position.accuracy.toStringAsFixed(0)}m)'
          : 'Location unavailable';

      final incidentSaved = await _saveSosIncidentDraft(
        contactName: contact['name']!,
        contactNumber: contact['number']!,
        contactSourceLabel:
            (contact['source_label']?.toString() ??
            _sourceLabelForKey(contact['source_key'])),
        locationText: locationText,
      );

      final contactId = contact['id'];
      final source = contact['source'] ?? 'support_contact';
      if (source == 'support_contact' &&
          contactId != null &&
          contactId.isNotEmpty) {
        final action = locationCaptured
            ? 'quick_call_with_location'
            : 'quick_call_no_location';
        await _helpEnhancementsService.logEmergencyContact(contactId, action);
      }

      final launched = await _launchPhoneCall(contact['number']!);
      if (!launched) {
        return QuickSosResult(
          callLaunched: false,
          incidentDraftSaved: incidentSaved,
          locationCaptured: locationCaptured,
          shouldOpenSafetyHub: true,
          message: 'Could not start phone call. Opening Safety Hub.',
        );
      }

      return QuickSosResult(
        callLaunched: true,
        incidentDraftSaved: incidentSaved,
        locationCaptured: locationCaptured,
        shouldOpenSafetyHub: false,
        contactName: contact['name'],
        contactSourceLabel: contact['source_label'],
        message: incidentSaved
            ? 'SOS call started to ${contact['name']} (${contact['source_label'] ?? 'Emergency Contact'}). Incident draft saved.'
            : 'SOS call started to ${contact['name']} (${contact['source_label'] ?? 'Emergency Contact'}).',
      );
    } catch (_) {
      return const QuickSosResult(
        callLaunched: false,
        incidentDraftSaved: false,
        locationCaptured: false,
        shouldOpenSafetyHub: true,
        message: 'SOS quick action failed. Opening Safety Hub.',
      );
    }
  }

  Map<String, String>? _normalizePreferredContact(
    Map<String, String>? preferredContact,
  ) {
    if (preferredContact == null) return null;
    final number = (preferredContact['number'] ?? '').trim();
    if (number.isEmpty) return null;

    final sourceKey =
        (preferredContact['source_key'] ??
                preferredContact['source'] ??
                'support_contact')
            .trim();

    return {
      'id': (preferredContact['id'] ?? '').trim(),
      'name': (preferredContact['name'] ?? 'Emergency').trim(),
      'number': number,
      'source': (preferredContact['source'] ?? 'support_contact').trim(),
      'source_key': sourceKey,
      'source_label':
          (preferredContact['source_label'] ?? _sourceLabelForKey(sourceKey))
              .trim(),
    };
  }

  String _sourceLabelForKey(String? sourceKey) {
    switch ((sourceKey ?? '').toLowerCase().trim()) {
      case 'supervisor':
        return 'Supervisor';
      case 'coordinator':
        return 'Coordinator';
      case 'support_contact':
      default:
        return 'Emergency Contact';
    }
  }

  Future<Map<String, String>?> _resolvePreferredContact() async {
    final relatedContact = await _getRelatedSupervisorOrCoordinatorContact();
    if (relatedContact != null) {
      return relatedContact;
    }
    return _getPrimaryEmergencyContact();
  }

  Future<Map<String, String>?> _getPrimaryEmergencyContact() async {
    try {
      final response = await _supabase
          .from('support_contacts')
          .select('id, name, phone, whatsapp')
          .eq('is_emergency', true)
          .eq('is_active', true)
          .order('sort_order', ascending: true)
          .limit(10);

      final contacts = List<Map<String, dynamic>>.from(response);
      for (final contact in contacts) {
        final phone = (contact['phone']?.toString() ?? '').trim();
        final whatsapp = (contact['whatsapp']?.toString() ?? '').trim();
        final number = phone.isNotEmpty ? phone : whatsapp;
        if (number.isEmpty) continue;

        return {
          'id': contact['id']?.toString() ?? '',
          'name': (contact['name']?.toString() ?? 'Emergency').trim(),
          'number': number,
          'source': 'support_contact',
          'source_key': 'support_contact',
          'source_label': 'Emergency Contact',
        };
      }
    } catch (_) {
      return null;
    }

    return null;
  }

  Future<Map<String, String>?>
  _getRelatedSupervisorOrCoordinatorContact() async {
    try {
      final currentUserId = _supabase.auth.currentUser?.id;
      if (currentUserId == null || currentUserId.isEmpty) return null;

      final myProfile = await _supabase
          .from('profiles')
          .select('state_id, hub_id, locality_id')
          .eq('id', currentUserId)
          .maybeSingle();

      final myState = (myProfile?['state_id']?.toString() ?? '').trim();
      final myHub = (myProfile?['hub_id']?.toString() ?? '').trim();
      final myLocality = (myProfile?['locality_id']?.toString() ?? '').trim();

      final response = await _supabase
          .from('profiles')
          .select('id, full_name, phone, role, state_id, hub_id, locality_id')
          .inFilter('role', [
            'supervisor',
            'coordinator',
            'field_coordinator',
            'state_coordinator',
          ]);

      final candidates = List<Map<String, dynamic>>.from(response).where((p) {
        final id = (p['id']?.toString() ?? '').trim();
        final phone = (p['phone']?.toString() ?? '').trim();
        return id.isNotEmpty && id != currentUserId && phone.isNotEmpty;
      }).toList();

      if (candidates.isEmpty) {
        return null;
      }

      int rolePriority(String role) {
        final normalized = role.toLowerCase().trim();
        if (normalized == 'supervisor') return 0;
        if (normalized == 'coordinator' ||
            normalized == 'field_coordinator' ||
            normalized == 'state_coordinator') {
          return 1;
        }
        return 2;
      }

      int proximityScore(Map<String, dynamic> profile) {
        final state = (profile['state_id']?.toString() ?? '').trim();
        final hub = (profile['hub_id']?.toString() ?? '').trim();
        final locality = (profile['locality_id']?.toString() ?? '').trim();

        int score = 0;
        if (myState.isNotEmpty && state.isNotEmpty && myState == state) {
          score += 1;
        }
        if (myHub.isNotEmpty && hub.isNotEmpty && myHub == hub) {
          score += 2;
        }
        if (myLocality.isNotEmpty &&
            locality.isNotEmpty &&
            myLocality == locality) {
          score += 3;
        }
        return score;
      }

      candidates.sort((a, b) {
        final proximityComparison = proximityScore(
          b,
        ).compareTo(proximityScore(a));
        if (proximityComparison != 0) return proximityComparison;

        final roleComparison = rolePriority(
          a['role']?.toString() ?? '',
        ).compareTo(rolePriority(b['role']?.toString() ?? ''));
        if (roleComparison != 0) return roleComparison;

        final aName = (a['full_name']?.toString() ?? '').toLowerCase();
        final bName = (b['full_name']?.toString() ?? '').toLowerCase();
        return aName.compareTo(bName);
      });

      final selected = candidates.first;
      final selectedRole = (selected['role']?.toString() ?? '').toLowerCase();
      final sourceLabel = selectedRole == 'supervisor'
          ? 'Supervisor'
          : 'Coordinator';
      final sourceKey = selectedRole == 'supervisor'
          ? 'supervisor'
          : 'coordinator';

      return {
        'id': selected['id']?.toString() ?? '',
        'name': (selected['full_name']?.toString() ?? 'Supervisor').trim(),
        'number': (selected['phone']?.toString() ?? '').trim(),
        'source': 'related_profile',
        'source_key': sourceKey,
        'source_label': sourceLabel,
      };
    } catch (_) {
      return null;
    }
  }

  Future<bool> _launchPhoneCall(String number) async {
    final uri = Uri.parse('tel:${number.trim()}');
    if (!await canLaunchUrl(uri)) return false;
    return launchUrl(uri);
  }

  Future<bool> _saveSosIncidentDraft({
    required String contactName,
    required String contactNumber,
    required String contactSourceLabel,
    required String locationText,
  }) async {
    try {
      final userId = _supabase.auth.currentUser?.id ?? '';
      final now = DateTime.now();

      final report = IncidentReport(
        id: 'sos_${now.millisecondsSinceEpoch}',
        userId: userId,
        incidentType: 'sos_emergency',
        description:
            'Auto-draft created from SOS quick action. Contacted: '
            '$contactName ($contactNumber) [$contactSourceLabel].',
        severity: 'critical',
        location: locationText,
        incidentDate: now,
        immediateActionTaken: 'Quick SOS initiated from floating button',
        requiresFollowUp: true,
        createdAt: now,
        updatedAt: now,
      );

      await _localStorageService.saveIncidentReport(report);
      return true;
    } catch (_) {
      return false;
    }
  }
}
