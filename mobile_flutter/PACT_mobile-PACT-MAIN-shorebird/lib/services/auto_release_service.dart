import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'notification_trigger_service.dart';

/// AutoReleaseService - Monitors and auto-releases sites that are not confirmed within deadline
///
/// Handles the automatic release of assigned sites back to "Dispatched" status if:
/// - Site is assigned to a collector
/// - Autorelease deadline has passed
/// - Site has not been confirmed
class AutoReleaseService {
  static final AutoReleaseService _instance = AutoReleaseService._internal();

  factory AutoReleaseService() => _instance;
  AutoReleaseService._internal();

  final SupabaseClient _supabase = Supabase.instance.client;
  final NotificationTriggerService _notificationService =
      NotificationTriggerService();

  /// Check for sites that need auto-release and process them
  /// Call this periodically (e.g., every 5-10 minutes) via background task
  Future<int> checkAndReleaseSites() async {
    try {
      int releasedCount = 0;

      // Query all claimed sites that haven't been accepted yet
      final response = await _supabase
          .from('mmp_site_entries')
          .select()
          .eq('status', 'claimed')
          .is_('accepted_by', null)
          .order('created_at', ascending: false)
          .limit(500);

      if (response.isEmpty) {
        debugPrint('✓ No sites to check for auto-release');
        return 0;
      }

      final sites = response as List<dynamic>;

      for (final siteJson in sites) {
        final site = _parseSiteEntry(siteJson);

        if (_shouldAutoRelease(site)) {
          await _releaseSite(site);
          releasedCount++;
        }
      }

      if (releasedCount > 0) {
        debugPrint('✅ Auto-released $releasedCount sites');
      }

      return releasedCount;
    } catch (e) {
      debugPrint('❌ Error checking auto-release: $e');
      return 0;
    }
  }

  /// Determine if a site should be auto-released
  bool _shouldAutoRelease(SiteEntryData site) {
    // Check if site has autorelease deadline in additional_data
    final additionalData = site.additionalData;
    if (additionalData == null) {
      return false;
    }

    final confirmationDeadline = additionalData['confirmation_deadline'];
    final autoReleaseAt = additionalData['autorelease_at'];

    if (autoReleaseAt == null) {
      return false;
    }

    try {
      final deadline = DateTime.parse(autoReleaseAt.toString());
      final now = DateTime.now();

      // Release if deadline has passed
      if (now.isAfter(deadline)) {
        debugPrint(
          '🔄 Site ${site.id} past auto-release deadline: $autoReleaseAt',
        );
        return true;
      }
    } catch (e) {
      debugPrint('Error parsing autorelease deadline: $e');
    }

    return false;
  }

  /// Release a site back to "Dispatched" status
  Future<void> _releaseSite(SiteEntryData site) async {
    try {
      debugPrint(
        '🔄 Auto-releasing site: ${site.id} (was claimed by ${site.claimedBy})',
      );

      // Get the former claimant for notification
      final formerClaimant = site.claimedBy;
      final siteName = site.siteName;

      // Update site status back to Dispatched
      final response = await _supabase
          .from('mmp_site_entries')
          .update({
            'status': 'Dispatched',
            'accepted_by': null,
            'accepted_at': null,
            'claimed_by': null,
            'claimed_at': null,
            'enumerator_fee': null,
            'cost': null,
            'additional_data': (site.additionalData ?? {})
              ..addAll({
                'autorelease_triggered': true,
                'autorelease_timestamp': DateTime.now().toIso8601String(),
                'autorelease_from_user': formerClaimant,
                'previous_status': 'claimed',
              }),
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', site.id)
          .select();

      if (response.isEmpty) {
        throw Exception('Failed to update site status');
      }

      // Notify the former claimant that site was auto-released
      if (formerClaimant != null) {
        try {
          await _notificationService.siteAutoReleased(
            formerClaimant,
            siteName,
            site.id,
          );
        } catch (notifError) {
          debugPrint(
            '⚠️ Failed to send auto-release notification: $notifError',
          );
        }
      }

      debugPrint('✅ Site ${site.id} auto-released successfully');
    } catch (e) {
      debugPrint('❌ Error releasing site: $e');
      rethrow;
    }
  }

  /// Parse site entry from JSON response
  SiteEntryData _parseSiteEntry(Map<String, dynamic> json) {
    return SiteEntryData(
      id: json['id'],
      siteName: json['site_name'] ?? 'Unknown Site',
      acceptedBy: json['accepted_by'],
      claimedBy: json['claimed_by'],
      status: json['status'],
      additionalData: json['additional_data'] as Map<String, dynamic>?,
    );
  }
}

/// Helper class to hold site entry data
class SiteEntryData {
  final String id;
  final String siteName;
  final String? acceptedBy;
  final String? claimedBy;
  final String status;
  final Map<String, dynamic>? additionalData;

  SiteEntryData({
    required this.id,
    required this.siteName,
    this.acceptedBy,
    this.claimedBy,
    required this.status,
    this.additionalData,
  });
}
