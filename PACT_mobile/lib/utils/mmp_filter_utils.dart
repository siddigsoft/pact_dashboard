/// Utility functions for consistent MMP filtering across all screens
library;

/// Build MMP filter options from a list of site visit or site data
/// Input can be either SiteVisit objects or raw JSON site maps
List<Map<String, dynamic>> buildMmpFilterOptions(dynamic sitesList) {
  if (sitesList == null || (sitesList is List && sitesList.isEmpty)) {
    return [];
  }

  final mmpMap = <String, Map<String, dynamic>>{};

  for (final site in sitesList) {
    String? id;
    String? name;

    // Handle SiteVisit objects
    if (site.runtimeType.toString().contains('SiteVisit')) {
      id = site.mmpFileId?.toString();
      name = site.mmpFileName;

      // DEBUG
      if (id != null) {
        print(
          'DEBUG MMP: ID=$id, Name=$name, mmpFiles=${site.mmpFiles}, visitData=${site.visitData}',
        );
      }

      // Try to extract from raw JSON in visitData
      if ((id == null || id.isEmpty) && site.visitData != null) {
        id = site.visitData!['mmp_file_id']?.toString();
      }
    }
    // Handle raw JSON maps (for site_verification_screen)
    else if (site is Map<String, dynamic>) {
      // Try to get ID from mmp_files relationship first
      final raw = site['mmp_files'];
      if (raw is Map<String, dynamic>) {
        id = raw['id']?.toString();
        name = raw['name']?.toString();
      } else if (raw is List && raw.isNotEmpty) {
        final firstItem = raw.first;
        if (firstItem is Map<String, dynamic>) {
          id = firstItem['id']?.toString();
          name = firstItem['name']?.toString();
        }
      }

      // Fallback: Try site's mmp_id field
      if ((id == null || id.isEmpty)) {
        id = site['mmp_id']?.toString();
      }

      // Fallback: Try to use project name if available
      if ((name == null || name.isEmpty)) {
        final projectId =
            (raw is Map
                    ? raw['project_id']
                    : (raw is List && raw.isNotEmpty && raw.first is Map
                          ? raw.first['project_id']
                          : null))
                ?.toString();
        if (projectId != null && projectId.isNotEmpty) {
          name = 'Project ${projectId.substring(0, 6)}';
        }
      }
    }

    if (id == null || id.isEmpty) continue;

    // Fallback if no name available
    if (name == null || name.isEmpty) {
      name = 'MMP ${id.substring(0, 6)}';
    }

    if (!mmpMap.containsKey(id)) {
      mmpMap[id] = {'id': id, 'name': name, 'count': 0};
    }
    mmpMap[id]!['count'] = (mmpMap[id]!['count'] as int) + 1;
  }

  // Sort by name for consistency
  final result = mmpMap.values.toList()
    ..sort((a, b) => (a['name'] as String).compareTo(b['name'] as String));

  print(
    'DEBUG: Built ${result.length} MMPs: ${result.map((m) => "${m['name']} (${m['count']})").join(", ")}',
  );
  return result;
}

/// Extract MMP info from a single site object for display
Map<String, String>? extractMmpInfo(dynamic site) {
  String? id;
  String? name;

  // Handle SiteVisit objects
  if (site.runtimeType.toString().contains('SiteVisit')) {
    id = site.mmpFileId?.toString();
    name = site.mmpFileName;
  }
  // Handle raw JSON maps
  else if (site is Map<String, dynamic>) {
    id = site['mmp_file_id']?.toString();
    final raw = site['mmp_files'];
    if (raw is Map<String, dynamic>) {
      name = raw['name']?.toString();
    } else if (raw is List && raw.isNotEmpty && raw.first is Map) {
      name = (raw.first as Map)['name']?.toString();
    }
  }

  if (id == null || id.isEmpty) return null;

  if (name == null || name.isEmpty) {
    name = 'MMP ${id.substring(0, 6)}';
  }

  return {'id': id, 'name': name};
}
