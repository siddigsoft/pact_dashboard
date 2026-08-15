import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Mirrors the web `useAutoLocationRefresh` hook.
///
/// On each session start the dashboard calls [refreshIfNeeded].  If the user
/// has previously consented to location sharing *and* the one-hour rate-limit
/// has not fired yet, the service silently captures a low-accuracy GPS fix and
/// writes it to `profiles.location` with the same JSON shape used by the web:
///
///   { latitude, longitude, accuracy, lastUpdated, isSharing: true }
///
/// No UI is shown at any point.  Any failure is swallowed and the rate-limit
/// timestamp is rolled back to 0 so the next app launch retries.
class LocationAutoRefreshService {
  LocationAutoRefreshService._();

  static const Duration _refreshInterval = Duration(hours: 1);
  static const String _prefKeyPrefix = 'pact_location_auto_';

  /// Entry point — call once after the authenticated user is known.
  /// Fire-and-forget: call without `await` so it does not block UI.
  static Future<void> refreshIfNeeded(String userId) async {
    try {
      // ── 1. Rate-limit ─────────────────────────────────────────────────────
      final prefs = await SharedPreferences.getInstance();
      final key = '$_prefKeyPrefix$userId';
      final lastRun = prefs.getInt(key) ?? 0;
      final nowMs = DateTime.now().millisecondsSinceEpoch;
      if (nowMs - lastRun < _refreshInterval.inMilliseconds) {
        debugPrint('[AutoLocation] Rate-limit active — skipping refresh');
        return;
      }

      // ── 2. Consent check (fetch location_sharing from profile) ────────────
      final supabase = Supabase.instance.client;
      final profile = await supabase
          .from('profiles')
          .select('location_sharing')
          .eq('id', userId)
          .maybeSingle();

      final locationSharing = profile?['location_sharing'] as bool? ?? false;
      if (!locationSharing) {
        // User has not consented — the web LocationPermissionPrompt handles
        // the initial consent flow; we never prompt here.
        debugPrint('[AutoLocation] location_sharing=false — skipping');
        return;
      }

      // ── 3. Permission check (silent — never request, only check) ──────────
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        debugPrint('[AutoLocation] Permission not granted — skipping');
        return;
      }

      // Mark as attempted before the async GPS call to prevent concurrent runs
      await prefs.setInt(key, nowMs);

      // ── 4. Capture position (low accuracy = fast + battery-efficient) ─────
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.low,
      ).timeout(
        const Duration(seconds: 15),
        onTimeout: () => throw Exception('GPS timed out'),
      );

      // ── 5. Build payload — same JSONB shape as the web ────────────────────
      final locationJson = <String, dynamic>{
        'latitude': position.latitude,
        'longitude': position.longitude,
        'accuracy': position.accuracy,
        'lastUpdated': DateTime.now().toUtc().toIso8601String(),
        'isSharing': true,
      };

      // ── 6. Persist to Supabase (silent) ───────────────────────────────────
      await supabase.from('profiles').update({
        'location': locationJson,
        'location_sharing': true,
      }).eq('id', userId);

      debugPrint(
        '[AutoLocation] GPS refreshed silently on session start '
        '(${position.latitude.toStringAsFixed(4)}, '
        '${position.longitude.toStringAsFixed(4)}, '
        '±${position.accuracy.toStringAsFixed(0)}m)',
      );
    } catch (e) {
      // Non-fatal.  Roll back the timestamp so the next launch retries.
      debugPrint('[AutoLocation] Silent refresh failed (non-fatal): $e');
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setInt('$_prefKeyPrefix$userId', 0);
      } catch (_) {}
    }
  }
}
