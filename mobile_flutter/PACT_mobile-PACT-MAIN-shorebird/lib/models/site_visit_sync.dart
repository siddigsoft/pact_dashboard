import '../models/site_visit.dart';

/// Extension on SiteVisit to add sync-related functionality
extension SiteVisitSync on SiteVisit {
  /// Check if this visit is in conflict with another version
  bool hasConflictWith(SiteVisit other) {
    // Different status indicates potential conflict
    if (status != other.status) return true;

    // If both assigned but to different users
    if (status == 'assigned' &&
        other.status == 'assigned' &&
        assignedTo != other.assignedTo) {
      return true;
    }

    // If local modifications exist that haven't been synced
    if (localModifications != other.localModifications) {
      return true;
    }

    return false;
  }

  /// Creates a new SiteVisit with merged data from another version
  /// Handles various conflict scenarios based on business rules
  SiteVisit mergeWith(SiteVisit other) {
    // If one is assigned and the other isn't, prefer the assigned state
    if (status == 'assigned' && other.status != 'assigned') {
      return this;
    }
    if (other.status == 'assigned' && status != 'assigned') {
      return other;
    }

    // If both are assigned to different users, use server version
    if (status == 'assigned' &&
        other.status == 'assigned' &&
        assignedTo != other.assignedTo) {
      return other;
    }

    // Merge metadata and notes
    final mergedMetadata = {...(metadata ?? {}), ...(other.metadata ?? {})};
    final mergedNotes =
        <dynamic>{...(notes ?? []), ...(other.notes ?? [])}.toList();

    // Create new instance with merged data
    return SiteVisit(
      id: id,
      siteName: other.siteName, // Prefer server data for basic fields
      siteCode: other.siteCode,
      status: other.status, // Prefer server status unless handled above
      locality: other.locality,
      state: other.state,
      activity: other.activity,
      priority: other.priority,
      dueDate: other.dueDate,
      assignedTo: other.assignedTo,
      latitude: other.latitude,
      longitude: other.longitude,
      metadata: mergedMetadata, // Use merged metadata
      notes: mergedNotes, // Use merged notes
      lastModified: DateTime.now(),
      localModifications: false, // Reset local modifications flag
    );
  }

  /// Returns a copy of this SiteVisit with updated fields and localModifications flag set
  SiteVisit copyWithModification({
    String? status,
    String? assignedTo,
    Map<String, dynamic>? metadata,
    List<String>? notes,
  }) {
    return SiteVisit(
      id: id,
      siteName: siteName,
      siteCode: siteCode,
      status: status ?? this.status,
      locality: locality,
      state: state,
      activity: activity,
      priority: priority,
      dueDate: dueDate,
      assignedTo: assignedTo ?? this.assignedTo,
      latitude: latitude,
      longitude: longitude,
      metadata: metadata ?? this.metadata,
      notes: notes ?? this.notes,
      lastModified: DateTime.now(),
      localModifications: true, // Mark as locally modified
    );
  }
}
