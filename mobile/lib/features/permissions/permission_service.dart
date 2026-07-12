import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/offline/hive_manager.dart';

/// Manages page-access permission overrides for the current user.
/// Syncs `page_access_overrides` from Supabase on login and caches them in
/// Hive so route guards still work while the device is offline.
class PermissionService {
  static const _overridesKey = 'page_access_overrides';
  static const _ttl = Duration(hours: 4);

  // ── Route → page_slug mapping ─────────────────────────────────────────────
  // Maps Flutter route prefixes to the web app's page_slug values used in the
  // page_access_overrides table.  Only field-staff routes are listed here;
  // admin-only routes are not reachable from the Flutter app at all.
  static const Map<String, String> _routeToSlug = {
    '/dashboard': 'dashboard',
    '/my-tasks': 'my-tasks',
    '/mmp': 'mmp',
    '/field-ops': 'field-ops',
    '/cost-submission': 'cost-submission',
    '/approvals': 'approvals',
    '/wallet': 'wallet',
    '/notifications': 'notifications',
    '/calendar': 'calendar',
    '/my-expenses': 'my-expenses',
    '/communication': 'communication-hub',
    '/coordinator/sites': 'coordinator',
    '/site-visits': 'field-ops',
    '/finance-hub': 'finance-hub',
    '/programme-hub': 'programme-hub',
    '/crm': 'crm',
    '/analytics': 'analytics-hub',
    '/cycle-close': 'cycle-close',
    '/profile': 'profile',
  };

  // ── Public API ─────────────────────────────────────────────────────────────

  /// Fetches this user's page_access_overrides from Supabase and caches them
  /// in Hive.  Safe to call even when offline — falls back silently to stale
  /// cache on network failure.
  static Future<void> syncForUser(String userId) async {
    try {
      final data = await Supabase.instance.client
          .from('page_access_overrides')
          .select('page_slug, is_blocked')
          .eq('user_id', userId);

      final overrides = (data as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();

      HiveManager.saveList(HiveManager.settingsBox, _overridesKey, overrides);
    } catch (_) {
      // Network unavailable — keep whatever is already cached.
    }
  }

  /// Returns true if the given Flutter route path is explicitly blocked for
  /// the current user according to the cached overrides.
  static bool isRouteBlocked(String routePath) {
    final slug = _slugForRoute(routePath);
    if (slug == null) return false;

    final cached = HiveManager.getList(HiveManager.settingsBox, _overridesKey);
    for (final row in cached) {
      if (row['page_slug'] == slug && row['is_blocked'] == true) {
        return true;
      }
    }
    return false;
  }

  /// True when the cached overrides are older than the TTL and should be
  /// refreshed on the next connectivity opportunity.
  static bool isStale() => HiveManager.isStale(
        HiveManager.settingsBox,
        _overridesKey,
        threshold: _ttl,
      );

  /// Clears the cached overrides.  Call this on sign-out so the next user
  /// starts with a fresh slate.
  static void clear() {
    HiveManager.settingsBox.delete(_overridesKey);
    HiveManager.settingsBox.delete('${_overridesKey}_updated_at');
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  static String? _slugForRoute(String path) {
    // Exact match first.
    if (_routeToSlug.containsKey(path)) return _routeToSlug[path];
    // Prefix match for parameterised routes (e.g. /mmp/:id, /site-visits/:id).
    for (final entry in _routeToSlug.entries) {
      if (path.startsWith('${entry.key}/') || path == entry.key) {
        return entry.value;
      }
    }
    return null;
  }
}
