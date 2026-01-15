import 'package:pact_mobile/models/site_visit.dart';

/// A service to handle conflicts in data synchronization
class ConflictResolutionService {
  /// Resolves conflicts between local and server data using a last-write-wins strategy
  /// based on timestamps
  static T resolveConflict<T>({
    required T localData,
    required T serverData,
    required DateTime localTimestamp,
    required DateTime serverTimestamp,
    MergeStrategy mergeStrategy = MergeStrategy.lastWriteWins,
  }) {
    switch (mergeStrategy) {
      case MergeStrategy.lastWriteWins:
        return serverTimestamp.isAfter(localTimestamp) ? serverData : localData;
      
      case MergeStrategy.serverWins:
        return serverData;
      
      case MergeStrategy.localWins:
        return localData;
      
      case MergeStrategy.custom:
        // Implement custom merge logic if needed
        throw UnimplementedError('Custom merge strategy not implemented');
    }
  }

  /// Resolves conflicts for site visit assignments specifically
  static SiteVisit resolveSiteVisitConflict({
    required SiteVisit localVisit,
    required SiteVisit serverVisit,
  }) {
    // If one is assigned and the other isn't, the assigned one wins
    if (localVisit.status == 'assigned' && serverVisit.status != 'assigned') {
      return localVisit;
    }
    if (serverVisit.status == 'assigned' && localVisit.status != 'assigned') {
      return serverVisit;
    }

    // If both are assigned to different users, server wins (single source of truth)
    if (localVisit.status == 'assigned' && 
        serverVisit.status == 'assigned' &&
        localVisit.assignedTo != serverVisit.assignedTo) {
      return serverVisit;
    }

    // For other cases, use server data as single source of truth
    return serverVisit;
  }

  /// Merge metadata fields that support concurrent modifications
  static Map<String, dynamic> mergeMetadata(
    Map<String, dynamic> local,
    Map<String, dynamic> server,
  ) {
    // Start with server data as base
    final merged = Map<String, dynamic>.from(server);

    // Merge local data where appropriate
    for (final entry in local.entries) {
      if (entry.value != null) {
        // If the field is an array, concatenate and deduplicate
        if (entry.value is List) {
          final serverList = (server[entry.key] as List?) ?? [];
          final localList = entry.value as List;
          merged[entry.key] = {...serverList, ...localList}.toList();
        }
        // If the field is a map, deep merge
        else if (entry.value is Map) {
          final serverMap = (server[entry.key] as Map?) ?? {};
          final localMap = entry.value as Map;
          merged[entry.key] = {...serverMap, ...localMap};
        }
        // For simple values, prefer server unless null
        else {
          merged[entry.key] = server[entry.key] ?? entry.value;
        }
      }
    }

    return merged;
  }
}

/// Strategy to use when resolving conflicts
enum MergeStrategy {
  /// Use the most recently modified version
  lastWriteWins,
  
  /// Always use the server version
  serverWins,
  
  /// Always use the local version
  localWins,
  
  /// Use a custom merge strategy
  custom,
}