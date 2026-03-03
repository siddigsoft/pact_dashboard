// lib/models/hub_operations_models.dart

// ============================================================================
// GPS COORDINATES
// ============================================================================

class GPSCoordinates {
  final double latitude;
  final double longitude;
  final double? accuracyMeters;

  GPSCoordinates({
    required this.latitude,
    required this.longitude,
    this.accuracyMeters,
  });

  factory GPSCoordinates.fromJson(Map<String, dynamic> json) =>
      GPSCoordinates(
        latitude: (json['latitude'] as num).toDouble(),
        longitude: (json['longitude'] as num).toDouble(),
        accuracyMeters: (json['accuracy_meters'] as num?)?.toDouble(),
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'latitude': latitude,
        'longitude': longitude,
        'accuracy_meters': accuracyMeters,
      };
}

// ============================================================================
// MATCH QUERY
// ============================================================================

class MatchQuery {
  final String siteCode;
  final String siteName;
  final String state;
  final String locality;

  MatchQuery({
    required this.siteCode,
    required this.siteName,
    required this.state,
    required this.locality,
  });

  factory MatchQuery.fromJson(Map<String, dynamic> json) => MatchQuery(
        siteCode: json['siteCode'] as String,
        siteName: json['siteName'] as String,
        state: json['state'] as String,
        locality: json['locality'] as String,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'siteCode': siteCode,
        'siteName': siteName,
        'state': state,
        'locality': locality,
      };
}

// ============================================================================
// MATCH INFO
// ============================================================================

class MatchInfo {
  final String type;
  final double confidence;
  final String confidenceLevel;
  final String ruleApplied;
  final int candidatesCount;
  final bool autoAccepted;
  final bool requiresReview;

  MatchInfo({
    required this.type,
    required this.confidence,
    required this.confidenceLevel,
    required this.ruleApplied,
    required this.candidatesCount,
    required this.autoAccepted,
    required this.requiresReview,
  });

  factory MatchInfo.fromJson(Map<String, dynamic> json) => MatchInfo(
        type: json['type'] as String,
        confidence: (json['confidence'] as num).toDouble(),
        confidenceLevel: json['confidence_level'] as String,
        ruleApplied: json['rule_applied'] as String,
        candidatesCount: (json['candidates_count'] as num).toInt(),
        autoAccepted: json['auto_accepted'] as bool,
        requiresReview: json['requires_review'] as bool,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'type': type,
        'confidence': confidence,
        'confidence_level': confidenceLevel,
        'rule_applied': ruleApplied,
        'candidates_count': candidatesCount,
        'auto_accepted': autoAccepted,
        'requires_review': requiresReview,
      };
}

// ============================================================================
// MATCH AUDIT
// ============================================================================

class MatchAudit {
  final String matchedAt;
  final String matchedBy;
  final String sourceWorkflow;
  final String? overrideReason;

  MatchAudit({
    required this.matchedAt,
    required this.matchedBy,
    required this.sourceWorkflow,
    this.overrideReason,
  });

  factory MatchAudit.fromJson(Map<String, dynamic> json) => MatchAudit(
        matchedAt: json['matched_at'] as String,
        matchedBy: json['matched_by'] as String,
        sourceWorkflow: json['source_workflow'] as String,
        overrideReason: json['override_reason'] as String?,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'matched_at': matchedAt,
        'matched_by': matchedBy,
        'source_workflow': sourceWorkflow,
        'override_reason': overrideReason,
      };
}

// ============================================================================
// UNMATCHED INFO
// ============================================================================

class UnmatchedInfo {
  final String reason;
  final String details;
  final bool pendingReview;
  final String? suggestedAction;

  UnmatchedInfo({
    required this.reason,
    required this.details,
    required this.pendingReview,
    this.suggestedAction,
  });

  factory UnmatchedInfo.fromJson(Map<String, dynamic> json) =>
      UnmatchedInfo(
        reason: json['reason'] as String,
        details: json['details'] as String,
        pendingReview: json['pending_review'] as bool,
        suggestedAction: json['suggested_action'] as String?,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'reason': reason,
        'details': details,
        'pending_review': pendingReview,
        'suggested_action': suggestedAction,
      };
}

// ============================================================================
// REGISTRY LINKAGE
// ============================================================================

class AlternativeCandidate {
  final String registrySiteId;
  final String siteCode;
  final String siteName;
  final double confidence;

  AlternativeCandidate({
    required this.registrySiteId,
    required this.siteCode,
    required this.siteName,
    required this.confidence,
  });

  factory AlternativeCandidate.fromJson(Map<String, dynamic> json) =>
      AlternativeCandidate(
        registrySiteId: json['registry_site_id'] as String,
        siteCode: json['site_code'] as String,
        siteName: json['site_name'] as String,
        confidence: (json['confidence'] as num).toDouble(),
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'registry_site_id': registrySiteId,
        'site_code': siteCode,
        'site_name': siteName,
        'confidence': confidence,
      };
}

class RegistryLinkage {
  final String? registrySiteId;
  final String? registrySiteCode;
  final GPSCoordinates? gps;
  final String? stateId;
  final String? stateName;
  final String? localityId;
  final String? localityName;
  final MatchQuery query;
  final MatchInfo match;
  final MatchAudit audit;
  final UnmatchedInfo? unmatched;
  final List<AlternativeCandidate>? alternativeCandidates;

  RegistryLinkage({
    this.registrySiteId,
    this.registrySiteCode,
    this.gps,
    this.stateId,
    this.stateName,
    this.localityId,
    this.localityName,
    required this.query,
    required this.match,
    required this.audit,
    this.unmatched,
    this.alternativeCandidates,
  });

  factory RegistryLinkage.fromJson(Map<String, dynamic> json) =>
      RegistryLinkage(
        registrySiteId: json['registry_site_id'] as String?,
        registrySiteCode: json['registry_site_code'] as String?,
        gps: json['gps'] == null
            ? null
            : GPSCoordinates.fromJson(json['gps'] as Map<String, dynamic>),
        stateId: json['state_id'] as String?,
        stateName: json['state_name'] as String?,
        localityId: json['locality_id'] as String?,
        localityName: json['locality_name'] as String?,
        query: MatchQuery.fromJson(json['query'] as Map<String, dynamic>),
        match: MatchInfo.fromJson(json['match'] as Map<String, dynamic>),
        audit: MatchAudit.fromJson(json['audit'] as Map<String, dynamic>),
        unmatched: json['unmatched'] == null
            ? null
            : UnmatchedInfo.fromJson(
                json['unmatched'] as Map<String, dynamic>),
        alternativeCandidates: (json['alternative_candidates'] as List<dynamic>?)
            ?.map((e) =>
                AlternativeCandidate.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'registry_site_id': registrySiteId,
        'registry_site_code': registrySiteCode,
        'gps': gps,
        'state_id': stateId,
        'state_name': stateName,
        'locality_id': localityId,
        'locality_name': localityName,
        'query': query,
        'match': match,
        'audit': audit,
        'unmatched': unmatched,
        'alternative_candidates': alternativeCandidates,
      };
}

// ============================================================================
// SITE REGISTRY
// ============================================================================

class SiteRegistry {
  final String id;
  final String siteCode;
  final String siteName;
  final String stateId;
  final String stateName;
  final String localityId;
  final String localityName;
  final String? hubId;
  final String? hubName;
  final double? gpsLatitude;
  final double? gpsLongitude;
  final String? gpsCapturedBy;
  final String? gpsCapturedAt;
  final String? activityType;
  final String status;
  final int mmpCount;
  final String? lastMmpDate;
  final String createdAt;
  final String createdBy;
  final String? updatedAt;
  final String? source;

  SiteRegistry({
    required this.id,
    required this.siteCode,
    required this.siteName,
    required this.stateId,
    required this.stateName,
    required this.localityId,
    required this.localityName,
    this.hubId,
    this.hubName,
    this.gpsLatitude,
    this.gpsLongitude,
    this.gpsCapturedBy,
    this.gpsCapturedAt,
    this.activityType,
    required this.status,
    required this.mmpCount,
    this.lastMmpDate,
    required this.createdAt,
    required this.createdBy,
    this.updatedAt,
    this.source,
  });

  factory SiteRegistry.fromJson(Map<String, dynamic> json) => SiteRegistry(
        id: json['id'] as String,
        siteCode: json['site_code'] as String,
        siteName: json['site_name'] as String,
        stateId: json['state_id'] as String,
        stateName: json['state_name'] as String,
        localityId: json['locality_id'] as String,
        localityName: json['locality_name'] as String,
        hubId: json['hub_id'] as String?,
        hubName: json['hub_name'] as String?,
        gpsLatitude: (json['gps_latitude'] as num?)?.toDouble(),
        gpsLongitude: (json['gps_longitude'] as num?)?.toDouble(),
        gpsCapturedBy: json['gps_captured_by'] as String?,
        gpsCapturedAt: json['gps_captured_at'] as String?,
        activityType: json['activity_type'] as String?,
        status: json['status'] as String,
        mmpCount: (json['mmp_count'] as num).toInt(),
        lastMmpDate: json['last_mmp_date'] as String?,
        createdAt: json['created_at'] as String,
        createdBy: json['created_by'] as String,
        updatedAt: json['updated_at'] as String?,
        source: json['source'] as String?,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'site_code': siteCode,
        'site_name': siteName,
        'state_id': stateId,
        'state_name': stateName,
        'locality_id': localityId,
        'locality_name': localityName,
        'hub_id': hubId,
        'hub_name': hubName,
        'gps_latitude': gpsLatitude,
        'gps_longitude': gpsLongitude,
        'gps_captured_by': gpsCapturedBy,
        'gps_captured_at': gpsCapturedAt,
        'activity_type': activityType,
        'status': status,
        'mmp_count': mmpCount,
        'last_mmp_date': lastMmpDate,
        'created_at': createdAt,
        'created_by': createdBy,
        'updated_at': updatedAt,
        'source': source,
      };

  SiteRegistry copyWith({
    double? gpsLatitude,
    double? gpsLongitude,
    String? gpsCapturedBy,
    String? gpsCapturedAt,
    int? mmpCount,
    String? lastMmpDate,
    String? status,
  }) {
    return SiteRegistry(
      id: id,
      siteCode: siteCode,
      siteName: siteName,
      stateId: stateId,
      stateName: stateName,
      localityId: localityId,
      localityName: localityName,
      hubId: hubId,
      hubName: hubName,
      gpsLatitude: gpsLatitude ?? this.gpsLatitude,
      gpsLongitude: gpsLongitude ?? this.gpsLongitude,
      gpsCapturedBy: gpsCapturedBy ?? this.gpsCapturedBy,
      gpsCapturedAt: gpsCapturedAt ?? this.gpsCapturedAt,
      activityType: activityType,
      status: status ?? this.status,
      mmpCount: mmpCount ?? this.mmpCount,
      lastMmpDate: lastMmpDate ?? this.lastMmpDate,
      createdAt: createdAt,
      createdBy: createdBy,
      updatedAt: DateTime.now().toIso8601String(),
      source: source,
    );
  }
}

// ============================================================================
// MANAGED HUB
// ============================================================================

class ManagedHub {
  final String id;
  final String name;
  final String? description;
  final String? projectId;
  final List<String> states;
  final Map<String, dynamic>? coordinates;
  final String createdAt;
  final String createdBy;
  final String? updatedAt;

  ManagedHub({
    required this.id,
    required this.name,
    this.description,
    this.projectId,
    required this.states,
    this.coordinates,
    required this.createdAt,
    required this.createdBy,
    this.updatedAt,
  });

  factory ManagedHub.fromJson(Map<String, dynamic> json) => ManagedHub(
        id: json['id'] as String,
        name: json['name'] as String,
        description: json['description'] as String?,
        projectId: json['project_id'] as String?,
        states:
            (json['states'] as List<dynamic>).map((e) => e as String).toList(),
        coordinates: json['coordinates'] as Map<String, dynamic>?,
        createdAt: json['created_at'] as String,
        createdBy: json['created_by'] as String,
        updatedAt: json['updated_at'] as String?,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'name': name,
        'description': description,
        'project_id': projectId,
        'states': states,
        'coordinates': coordinates,
        'created_at': createdAt,
        'created_by': createdBy,
        'updated_at': updatedAt,
      };
}

// ============================================================================
// PROJECT SCOPE
// ============================================================================

class ProjectScope {
  final String id;
  final String projectId;
  final String? projectName;
  final String? hubId;
  final String? hubName;
  final List<String>? stateIds;
  final List<String>? localityIds;
  final String createdAt;
  final String? updatedAt;

  ProjectScope({
    required this.id,
    required this.projectId,
    this.projectName,
    this.hubId,
    this.hubName,
    this.stateIds,
    this.localityIds,
    required this.createdAt,
    this.updatedAt,
  });

  factory ProjectScope.fromJson(Map<String, dynamic> json) => ProjectScope(
        id: json['id'] as String,
        projectId: json['project_id'] as String,
        projectName: json['project_name'] as String?,
        hubId: json['hub_id'] as String?,
        hubName: json['hub_name'] as String?,
        stateIds: (json['state_ids'] as List<dynamic>?)
            ?.map((e) => e as String)
            .toList(),
        localityIds: (json['locality_ids'] as List<dynamic>?)
            ?.map((e) => e as String)
            .toList(),
        createdAt: json['created_at'] as String,
        updatedAt: json['updated_at'] as String?,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'project_id': projectId,
        'project_name': projectName,
        'hub_id': hubId,
        'hub_name': hubName,
        'state_ids': stateIds,
        'locality_ids': localityIds,
        'created_at': createdAt,
        'updated_at': updatedAt,
      };
}

// ============================================================================
// SITE CODE COMPONENTS
// ============================================================================

class SiteCodeComponents {
  final String stateCode;
  final String localityCode;
  final String siteName;
  final int sequenceNumber;
  final String activityType;

  SiteCodeComponents({
    required this.stateCode,
    required this.localityCode,
    required this.siteName,
    required this.sequenceNumber,
    required this.activityType,
  });

  factory SiteCodeComponents.fromJson(Map<String, dynamic> json) =>
      SiteCodeComponents(
        stateCode: json['state_code'] as String,
        localityCode: json['locality_code'] as String,
        siteName: json['site_name'] as String,
        sequenceNumber: (json['sequence_number'] as num).toInt(),
        activityType: json['activity_type'] as String,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'state_code': stateCode,
        'locality_code': localityCode,
        'site_name': siteName,
        'sequence_number': sequenceNumber,
        'activity_type': activityType,
      };
}

// ============================================================================
// SITE MATCH RESULT
// ============================================================================

class SiteMatchResult {
  final String siteEntryId;
  final String siteName;
  final String? siteCode;
  final String state;
  final String locality;
  final SiteRegistry? matchedRegistry;
  final String matchType;
  final double matchConfidence;
  final String matchConfidenceLevel;
  final bool autoAccepted;
  final bool requiresReview;
  final GPSCoordinates? gpsCoordinates;
  final List<AlternativeCandidate> allCandidates;
  final RegistryLinkage registryLinkage;

  SiteMatchResult({
    required this.siteEntryId,
    required this.siteName,
    this.siteCode,
    required this.state,
    required this.locality,
    this.matchedRegistry,
    required this.matchType,
    required this.matchConfidence,
    required this.matchConfidenceLevel,
    required this.autoAccepted,
    required this.requiresReview,
    this.gpsCoordinates,
    required this.allCandidates,
    required this.registryLinkage,
  });

  factory SiteMatchResult.fromJson(Map<String, dynamic> json) =>
      SiteMatchResult(
        siteEntryId: json['site_entry_id'] as String,
        siteName: json['site_name'] as String,
        siteCode: json['site_code'] as String?,
        state: json['state'] as String,
        locality: json['locality'] as String,
        matchedRegistry: json['matched_registry'] == null
            ? null
            : SiteRegistry.fromJson(
                json['matched_registry'] as Map<String, dynamic>),
        matchType: json['match_type'] as String,
        matchConfidence: (json['match_confidence'] as num).toDouble(),
        matchConfidenceLevel: json['match_confidence_level'] as String,
        autoAccepted: json['auto_accepted'] as bool,
        requiresReview: json['requires_review'] as bool,
        gpsCoordinates: json['gps_coordinates'] == null
            ? null
            : GPSCoordinates.fromJson(
                json['gps_coordinates'] as Map<String, dynamic>),
        allCandidates: (json['all_candidates'] as List<dynamic>)
            .map((e) =>
                AlternativeCandidate.fromJson(e as Map<String, dynamic>))
            .toList(),
        registryLinkage: RegistryLinkage.fromJson(
            json['registry_linkage'] as Map<String, dynamic>),
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'site_entry_id': siteEntryId,
        'site_name': siteName,
        'site_code': siteCode,
        'state': state,
        'locality': locality,
        'matched_registry': matchedRegistry,
        'match_type': matchType,
        'match_confidence': matchConfidence,
        'match_confidence_level': matchConfidenceLevel,
        'auto_accepted': autoAccepted,
        'requires_review': requiresReview,
        'gps_coordinates': gpsCoordinates,
        'all_candidates': allCandidates,
        'registry_linkage': registryLinkage,
      };
}

// ============================================================================
// REGISTRY VALIDATION RESULT
// ============================================================================

class RegistryValidationResult {
  final List<SiteMatchResult> matches;
  final int registeredCount;
  final int unregisteredCount;
  final int reviewRequiredCount;
  final int autoAcceptedCount;
  final List<String> warnings;

  RegistryValidationResult({
    required this.matches,
    required this.registeredCount,
    required this.unregisteredCount,
    required this.reviewRequiredCount,
    required this.autoAcceptedCount,
    required this.warnings,
  });

  factory RegistryValidationResult.fromJson(Map<String, dynamic> json) =>
      RegistryValidationResult(
        matches: (json['matches'] as List<dynamic>)
            .map((e) => SiteMatchResult.fromJson(e as Map<String, dynamic>))
            .toList(),
        registeredCount: (json['registered_count'] as num).toInt(),
        unregisteredCount: (json['unregistered_count'] as num).toInt(),
        reviewRequiredCount: (json['review_required_count'] as num).toInt(),
        autoAcceptedCount: (json['auto_accepted_count'] as num).toInt(),
        warnings: (json['warnings'] as List<dynamic>)
            .map((e) => e as String)
            .toList(),
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'matches': matches,
        'registered_count': registeredCount,
        'unregistered_count': unregisteredCount,
        'review_required_count': reviewRequiredCount,
        'auto_accepted_count': autoAcceptedCount,
        'warnings': warnings,
      };
}

// ============================================================================
// GPS SAVE RESULT
// ============================================================================

class GPSSaveResult {
  final bool success;
  final String? registrySiteId;
  final String? error;
  final GPSCoordinates? previousGps;

  GPSSaveResult({
    required this.success,
    this.registrySiteId,
    this.error,
    this.previousGps,
  });

  factory GPSSaveResult.fromJson(Map<String, dynamic> json) => GPSSaveResult(
        success: json['success'] as bool,
        registrySiteId: json['registry_site_id'] as String?,
        error: json['error'] as String?,
        previousGps: json['previous_gps'] == null
            ? null
            : GPSCoordinates.fromJson(
                json['previous_gps'] as Map<String, dynamic>),
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'success': success,
        'registry_site_id': registrySiteId,
        'error': error,
        'previous_gps': previousGps,
      };
}
