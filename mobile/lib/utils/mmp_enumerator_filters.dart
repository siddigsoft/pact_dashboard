import '../data/sudan_locations.dart';

/// Pick one hub_states row when the same state_id is mapped to multiple hubs.
/// `.maybeSingle()` throws on those duplicates and empties Claimable.
Map<String, dynamic>? pickHubStateRow(
  List<Map<String, dynamic>> rows, {
  String? preferredHubId,
}) {
  if (rows.isEmpty) return null;

  final hubId = preferredHubId?.trim();
  if (hubId != null && hubId.isNotEmpty) {
    for (final row in rows) {
      if (row['hub_id']?.toString() == hubId) return row;
    }
  }

  return rows.first;
}

/// Collector state display name used to filter claimable sites.
/// Prefers hub_states, then the static Sudan location list so a failed
/// `.maybeSingle()` cannot leave the collector with no state name.
String? resolveCollectorStateName({
  String? hubStateName,
  String? stateId,
}) {
  final fromHub = hubStateName?.trim();
  if (fromHub != null && fromHub.isNotEmpty) return fromHub;

  final id = stateId?.trim();
  if (id == null || id.isEmpty) return null;

  final name = getStateName(id).trim();
  return name.isEmpty ? null : name;
}

String? extractMmpFileId(Map<String, dynamic> site) {
  var id = site['mmp_file_id']?.toString();
  if (id != null && id.isNotEmpty) return id;

  final raw = site['mmp_files'];
  if (raw is Map) {
    id = raw['id']?.toString();
    if (id != null && id.isNotEmpty) return id;
  } else if (raw is List && raw.isNotEmpty && raw.first is Map) {
    id = (raw.first as Map)['id']?.toString();
    if (id != null && id.isNotEmpty) return id;
  }

  return null;
}

List<Map<String, dynamic>> filterSitesBySelectedMmp(
  List<Map<String, dynamic>> sites,
  String? selectedMmpId,
) {
  if (selectedMmpId == null || selectedMmpId.isEmpty) return List.of(sites);
  return sites.where((site) => extractMmpFileId(site) == selectedMmpId).toList();
}
