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

    // If additional data differs (could indicate local modifications)
    if (additionalData != other.additionalData) {
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

    // Merge additionalData
    final mergedAdditionalData = <String, dynamic>{
      ...(additionalData ?? {}),
      ...(other.additionalData ?? {}),
    };

    // Merge notes - combine if different
    final mergedNotes =
        notes.isNotEmpty && other.notes.isNotEmpty && notes != other.notes
        ? '$notes\n${other.notes}'
        : other.notes.isNotEmpty
        ? other.notes
        : notes;

    // Create new instance with merged data
    return SiteVisit(
      id: id,
      userId: other.userId ?? userId,
      siteName: other.siteName,
      siteCode: other.siteCode,
      status: other.status,
      locality: other.locality,
      state: other.state,
      activity: other.activity,
      priority: other.priority,
      dueDate: other.dueDate,
      notes: mergedNotes,
      mainActivity: other.mainActivity,
      location: other.location ?? location,
      fees: other.fees ?? fees,
      visitData: other.visitData ?? visitData,
      assignedTo: other.assignedTo,
      assignedBy: other.assignedBy ?? assignedBy,
      assignedAt: other.assignedAt ?? assignedAt,
      attachments: other.attachments ?? attachments,
      completedAt: other.completedAt ?? completedAt,
      rating: other.rating ?? rating,
      mmpId: other.mmpId ?? mmpId,
      createdAt: createdAt,
      arrivalLatitude: other.arrivalLatitude ?? arrivalLatitude,
      arrivalLongitude: other.arrivalLongitude ?? arrivalLongitude,
      arrivalTimestamp: other.arrivalTimestamp ?? arrivalTimestamp,
      journeyPath: other.journeyPath ?? journeyPath,
      arrivalRecorded: other.arrivalRecorded || arrivalRecorded,
      claimedBy: other.claimedBy ?? claimedBy,
      claimedAt: other.claimedAt ?? claimedAt,
      acceptedBy: other.acceptedBy ?? acceptedBy,
      acceptedAt: other.acceptedAt ?? acceptedAt,
      visitStartedBy: other.visitStartedBy ?? visitStartedBy,
      visitStartedAt: other.visitStartedAt ?? visitStartedAt,
      visitCompletedBy: other.visitCompletedBy ?? visitCompletedBy,
      visitCompletedAt: other.visitCompletedAt ?? visitCompletedAt,
      updatedAt: DateTime.now(),
      enumeratorFee: other.enumeratorFee ?? enumeratorFee,
      transportFee: other.transportFee ?? transportFee,
      cost: other.cost ?? cost,
      additionalData: mergedAdditionalData,
    );
  }

  /// Returns a copy of this SiteVisit with updated fields
  SiteVisit copyWithModification({
    String? status,
    String? assignedTo,
    Map<String, dynamic>? additionalDataUpdates,
    String? notesUpdate,
  }) {
    // Merge additional data if provided
    final mergedAdditionalData = additionalDataUpdates != null
        ? <String, dynamic>{...(additionalData ?? {}), ...additionalDataUpdates}
        : additionalData;

    return SiteVisit(
      id: id,
      userId: userId,
      siteName: siteName,
      siteCode: siteCode,
      status: status ?? this.status,
      locality: locality,
      state: state,
      activity: activity,
      priority: priority,
      dueDate: dueDate,
      notes: notesUpdate ?? notes,
      mainActivity: mainActivity,
      location: location,
      fees: fees,
      visitData: visitData,
      assignedTo: assignedTo ?? this.assignedTo,
      assignedBy: assignedBy,
      assignedAt: assignedAt,
      attachments: attachments,
      completedAt: completedAt,
      rating: rating,
      mmpId: mmpId,
      createdAt: createdAt,
      arrivalLatitude: arrivalLatitude,
      arrivalLongitude: arrivalLongitude,
      arrivalTimestamp: arrivalTimestamp,
      journeyPath: journeyPath,
      arrivalRecorded: arrivalRecorded,
      claimedBy: claimedBy,
      claimedAt: claimedAt,
      acceptedBy: acceptedBy,
      acceptedAt: acceptedAt,
      visitStartedBy: visitStartedBy,
      visitStartedAt: visitStartedAt,
      visitCompletedBy: visitCompletedBy,
      visitCompletedAt: visitCompletedAt,
      updatedAt: DateTime.now(),
      enumeratorFee: enumeratorFee,
      transportFee: transportFee,
      cost: cost,
      additionalData: mergedAdditionalData,
    );
  }
}
