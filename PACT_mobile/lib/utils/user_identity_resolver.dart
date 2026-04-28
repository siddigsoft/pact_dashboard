import 'package:supabase_flutter/supabase_flutter.dart';

class UserIdentityResolver {
  static final RegExp _uuidPattern = RegExp(
    r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
  );

  static bool isLikelyUuid(String value) => _uuidPattern.hasMatch(value.trim());

  static String normalizeLookupKey(String input) {
    return input.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
  }

  static String normalizeLabelKey(String input) {
    return input.toLowerCase().replaceAll(RegExp(r'[\s_:\-]+'), '').trim();
  }

  static bool isLikelyUserReferenceKey(String key) {
    final normalized = normalizeLookupKey(key);
    return normalized.endsWith('verifiedby') ||
        normalized.endsWith('calculatedby') ||
        normalized.endsWith('supervisorid') ||
        normalized.endsWith('coordinatorid') ||
        normalized.endsWith('requestedby') ||
        normalized.endsWith('submittedby') ||
        normalized.endsWith('approvedby') ||
        normalized.endsWith('acceptedby') ||
        normalized.endsWith('dispatchedby') ||
        normalized.endsWith('rejectedby') ||
        normalized.endsWith('claimedby') ||
        normalized.endsWith('startedby') ||
        normalized.endsWith('completedby') ||
        normalized == 'userid';
  }

  static bool labelExpectsUserIdentity(String label) {
    final normalized = normalizeLabelKey(label);
    return normalized.contains('verifiedby') ||
        normalized.contains('calculatedby') ||
        normalized.contains('supervisorid') ||
        normalized.contains('coordinatorid') ||
        normalized.contains('requestedby') ||
        normalized.contains('submittedby') ||
        normalized.contains('approvedby') ||
        normalized.contains('acceptedby') ||
        normalized.contains('dispatchedby') ||
        normalized.contains('rejectedby') ||
        normalized.contains('claimedby') ||
        normalized.contains('startedby') ||
        normalized.contains('completedby') ||
        normalized.contains('userid');
  }

  static void _collectPotentialUserIds(
    dynamic value,
    Set<String> out, {
    String currentKey = '',
  }) {
    if (value == null) return;

    if (value is Map) {
      for (final entry in value.entries) {
        _collectPotentialUserIds(
          entry.value,
          out,
          currentKey: entry.key.toString(),
        );
      }
      return;
    }

    if (value is List) {
      for (final item in value) {
        _collectPotentialUserIds(item, out, currentKey: currentKey);
      }
      return;
    }

    if (value is String) {
      final id = value.trim();
      if (id.isEmpty || !isLikelyUuid(id)) return;
      if (isLikelyUserReferenceKey(currentKey)) {
        out.add(id);
      }
    }
  }

  static Set<String> collectPotentialUserIdsFromData(dynamic data) {
    final ids = <String>{};
    _collectPotentialUserIds(data, ids);
    return ids;
  }

  static Set<String> collectPotentialUserIdsFromList(
    List<Map<String, dynamic>> rows,
  ) {
    final ids = <String>{};
    for (final row in rows) {
      _collectPotentialUserIds(row, ids);
    }
    return ids;
  }

  static Future<Map<String, String>> resolveUserDisplayNames({
    required SupabaseClient client,
    required Iterable<String> userIds,
  }) async {
    final ids = userIds.map((e) => e.trim()).where((e) => e.isNotEmpty).toSet();
    if (ids.isEmpty) return {};

    final rows = await client
        .from('profiles')
        .select('id, full_name, username, email')
        .inFilter('id', ids.toList());

    final resolved = <String, String>{};
    for (final row in (rows as List<dynamic>)) {
      final map = Map<String, dynamic>.from(row as Map);
      final id = (map['id'] as String?)?.trim();
      if (id == null || id.isEmpty) continue;

      final fullName = (map['full_name'] as String?)?.trim() ?? '';
      final username = (map['username'] as String?)?.trim() ?? '';
      final email = (map['email'] as String?)?.trim() ?? '';
      final display = fullName.isNotEmpty
          ? fullName
          : (username.isNotEmpty ? username : email);

      if (display.isNotEmpty) {
        resolved[id] = display;
      }
    }

    return resolved;
  }
}
