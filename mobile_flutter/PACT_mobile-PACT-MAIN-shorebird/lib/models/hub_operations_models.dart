// lib/models/hub_operations_models.dart

import 'package:json_annotation/json_annotation.dart';

part 'hub_operations_models.g.dart';

// ============================================================================
// GPS COORDINATES
// ============================================================================

@JsonSerializable()
class GPSCoordinates {
  final double latitude;
  final double longitude;
  @JsonKey(name: 'accuracy_meters')
  final double? accuracyMeters;

  GPSCoordinates({
    required this.latitude,
    required this.longitude,
    this.accuracyMeters,
  });

  factory GPSCoordinates.fromJson(Map<String, dynamic> json) =>
      _$GPSCoordinatesFromJson(json);
  Map<String, dynamic> toJson() => _$GPSCoordinatesToJson(this);
}

// ============================================================================
// MATCH QUERY
// ============================================================================

@JsonSerializable()
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

  factory MatchQuery.fromJson(Map<String, dynamic> json) =>
      _$MatchQueryFromJson(json);
  Map<String, dynamic> toJson() => _$MatchQueryToJson(this);
}

// ============================================================================
// MATCH INFO
// ============================================================================

@JsonSerializable()
class MatchInfo {
  final String type; // exact_code | name_location | partial | fuzzy | not_found
  final double confidence; // 0-1 numeric score
  @JsonKey(name: 'confidence_level')
  final String confidenceLevel; // high | medium | low | none
  @JsonKey(name: 'rule_applied')
  final String ruleApplied;
  @JsonKey(name: 'candidates_count')
  final int candidatesCount;
  @JsonKey(name: 'auto_accepted')
  final bool autoAccepted;
  @JsonKey(name: 'requires_review')
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

  factory MatchInfo.fromJson(Map<String, dynamic> json) =>
      _$MatchInfoFromJson(json);
  Map<String, dynamic> toJson() => _$MatchInfoToJson(this);
}

// ============================================================================
// MATCH AUDIT
// ============================================================================

@JsonSerializable()
class MatchAudit {
  @JsonKey(name: 'matched_at')
  final String matchedAt;
  @JsonKey(name: 'matched_by')
  final String matchedBy;
  @JsonKey(name: 'source_workflow')
  final String sourceWorkflow; // mmp_upload | dispatch | manual | system
  @JsonKey(name: 'override_reason')
  final String? overrideReason;

  MatchAudit({
    required this.matchedAt,
    required this.matchedBy,
    required this.sourceWorkflow,
    this.overrideReason,
  });

  factory MatchAudit.fromJson(Map<String, dynamic> json) =>
      _$MatchAuditFromJson(json);
  Map<String, dynamic> toJson() => _$MatchAuditToJson(this);
}

// ============================================================================
// UNMATCHED INFO
// ============================================================================

@JsonSerializable()
class UnmatchedInfo {
  final String reason; // no_registry_entry | multiple_matches | low_confidence | missing_data
  final String details;
  @JsonKey(name: 'pending_review')
  final bool pendingReview;
  @JsonKey(name: 'suggested_action')
  final String? suggestedAction;

  UnmatchedInfo({
    required this.reason,
    required this.details,
    required this.pendingReview,
    this.suggestedAction,
  });

  factory UnmatchedInfo.fromJson(Map<String, dynamic> json) =>
      _$UnmatchedInfoFromJson(json);
  Map<String, dynamic> toJson() => _$UnmatchedInfoToJson(this);
}

// ============================================================================
// REGISTRY LINKAGE
// ============================================================================

@JsonSerializable()
class AlternativeCandidate {
  @JsonKey(name: 'registry_site_id')
  final String registrySiteId;
  @JsonKey(name: 'site_code')
  final String siteCode;
  @JsonKey(name: 'site_name')
  final String siteName;
  final double confidence;

  AlternativeCandidate({
    required this.registrySiteId,
    required this.siteCode,
    required this.siteName,
    required this.confidence,
  });

  factory AlternativeCandidate.fromJson(Map<String, dynamic> json) =>
      _$AlternativeCandidateFromJson(json);
  Map<String, dynamic> toJson() => _$AlternativeCandidateToJson(this);
}

@JsonSerializable()
class RegistryLinkage {
  // Registry Reference
  @JsonKey(name: 'registry_site_id')
  final String? registrySiteId;
  @JsonKey(name: 'registry_site_code')
  final String? registrySiteCode;

  // GPS Coordinates (only populated if auto-accepted)
  final GPSCoordinates? gps;

  // Administrative Hierarchy
  @JsonKey(name: 'state_id')
  final String? stateId;
  @JsonKey(name: 'state_name')
  final String? stateName;
  @JsonKey(name: 'locality_id')
  final String? localityId;
  @JsonKey(name: 'locality_name')
  final String? localityName;

  // Query Inputs (what was used to match)
  final MatchQuery query;

  // Match Confidence
  final MatchInfo match;

  // Audit Trail
  final MatchAudit audit;

  // Unmatched Info (if applicable)
  final UnmatchedInfo? unmatched;

  // Alternative candidates (for manual selection)
  @JsonKey(name: 'alternative_candidates')
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
      _$RegistryLinkageFromJson(json);
  Map<String, dynamic> toJson() => _$RegistryLinkageToJson(this);
}

// ============================================================================
// SITE REGISTRY
// ============================================================================

@JsonSerializable()
class SiteRegistry {
  final String id;
  @JsonKey(name: 'site_code')
  final String siteCode;
  @JsonKey(name: 'site_name')
  final String siteName;
  @JsonKey(name: 'state_id')
  final String stateId;
  @JsonKey(name: 'state_name')
  final String stateName;
  @JsonKey(name: 'locality_id')
  final String localityId;
  @JsonKey(name: 'locality_name')
  final String localityName;
  @JsonKey(name: 'hub_id')
  final String? hubId;
  @JsonKey(name: 'hub_name')
  final String? hubName;
  @JsonKey(name: 'gps_latitude')
  final double? gpsLatitude;
  @JsonKey(name: 'gps_longitude')
  final double? gpsLongitude;
  @JsonKey(name: 'gps_captured_by')
  final String? gpsCapturedBy;
  @JsonKey(name: 'gps_captured_at')
  final String? gpsCapturedAt;
  @JsonKey(name: 'activity_type')
  final String? activityType;
  final String status; // registered | active | inactive | archived
  @JsonKey(name: 'mmp_count')
  final int mmpCount;
  @JsonKey(name: 'last_mmp_date')
  final String? lastMmpDate;
  @JsonKey(name: 'created_at')
  final String createdAt;
  @JsonKey(name: 'created_by')
  final String createdBy;
  @JsonKey(name: 'updated_at')
  final String? updatedAt;
  final String? source; // registry | mmp

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

  factory SiteRegistry.fromJson(Map<String, dynamic> json) =>
      _$SiteRegistryFromJson(json);
  Map<String, dynamic> toJson() => _$SiteRegistryToJson(this);

  SiteRegistry copyWith({
    String? gpsLatitude,
    String? gpsLongitude,
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
      gpsLatitude: double.tryParse(gpsLatitude ?? gpsLatitude?.toString() ?? ''),
      gpsLongitude: double.tryParse(gpsLongitude ?? gpsLongitude?.toString() ?? ''),
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

@JsonSerializable()
class ManagedHub {
  final String id;
  final String name;
  final String? description;
  @JsonKey(name: 'project_id')
  final String? projectId;
  final List<String> states;
  final Map<String, dynamic>? coordinates;
  @JsonKey(name: 'created_at')
  final String createdAt;
  @JsonKey(name: 'created_by')
  final String createdBy;
  @JsonKey(name: 'updated_at')
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

  factory ManagedHub.fromJson(Map<String, dynamic> json) =>
      _$ManagedHubFromJson(json);
  Map<String, dynamic> toJson() => _$ManagedHubToJson(this);
}

// ============================================================================
// PROJECT SCOPE
// ============================================================================

@JsonSerializable()
class ProjectScope {
  final String id;
  @JsonKey(name: 'project_id')
  final String projectId;
  @JsonKey(name: 'project_name')
  final String? projectName;
  @JsonKey(name: 'hub_id')
  final String? hubId;
  @JsonKey(name: 'hub_name')
  final String? hubName;
  @JsonKey(name: 'state_ids')
  final List<String>? stateIds;
  @JsonKey(name: 'locality_ids')
  final List<String>? localityIds;
  @JsonKey(name: 'created_at')
  final String createdAt;
  @JsonKey(name: 'updated_at')
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

  factory ProjectScope.fromJson(Map<String, dynamic> json) =>
      _$ProjectScopeFromJson(json);
  Map<String, dynamic> toJson() => _$ProjectScopeToJson(this);
}

// ============================================================================
// SITE CODE COMPONENTS
// ============================================================================

@JsonSerializable()
class SiteCodeComponents {
  @JsonKey(name: 'state_code')
  final String stateCode;
  @JsonKey(name: 'locality_code')
  final String localityCode;
  @JsonKey(name: 'site_name')
  final String siteName;
  @JsonKey(name: 'sequence_number')
  final int sequenceNumber;
  @JsonKey(name: 'activity_type')
  final String activityType;

  SiteCodeComponents({
    required this.stateCode,
    required this.localityCode,
    required this.siteName,
    required this.sequenceNumber,
    required this.activityType,
  });

  factory SiteCodeComponents.fromJson(Map<String, dynamic> json) =>
      _$SiteCodeComponentsFromJson(json);
  Map<String, dynamic> toJson() => _$SiteCodeComponentsToJson(this);
}

// ============================================================================
// SITE MATCH RESULT
// ============================================================================

@JsonSerializable()
class SiteMatchResult {
  @JsonKey(name: 'site_entry_id')
  final String siteEntryId;
  @JsonKey(name: 'site_name')
  final String siteName;
  @JsonKey(name: 'site_code')
  final String? siteCode;
  final String state;
  final String locality;
  @JsonKey(name: 'matched_registry')
  final SiteRegistry? matchedRegistry;
  @JsonKey(name: 'match_type')
  final String matchType; // exact_code | name_location | partial | fuzzy | not_found
  @JsonKey(name: 'match_confidence')
  final double matchConfidence;
  @JsonKey(name: 'match_confidence_level')
  final String matchConfidenceLevel;
  @JsonKey(name: 'auto_accepted')
  final bool autoAccepted;
  @JsonKey(name: 'requires_review')
  final bool requiresReview;
  @JsonKey(name: 'gps_coordinates')
  final GPSCoordinates? gpsCoordinates;
  @JsonKey(name: 'all_candidates')
  final List<AlternativeCandidate> allCandidates;
  @JsonKey(name: 'registry_linkage')
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
      _$SiteMatchResultFromJson(json);
  Map<String, dynamic> toJson() => _$SiteMatchResultToJson(this);
}

// ============================================================================
// REGISTRY VALIDATION RESULT
// ============================================================================

@JsonSerializable()
class RegistryValidationResult {
  final List<SiteMatchResult> matches;
  @JsonKey(name: 'registered_count')
  final int registeredCount;
  @JsonKey(name: 'unregistered_count')
  final int unregisteredCount;
  @JsonKey(name: 'review_required_count')
  final int reviewRequiredCount;
  @JsonKey(name: 'auto_accepted_count')
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
      _$RegistryValidationResultFromJson(json);
  Map<String, dynamic> toJson() => _$RegistryValidationResultToJson(this);
}

// ============================================================================
// GPS SAVE RESULT
// ============================================================================

@JsonSerializable()
class GPSSaveResult {
  final bool success;
  @JsonKey(name: 'registry_site_id')
  final String? registrySiteId;
  final String? error;
  @JsonKey(name: 'previous_gps')
  final GPSCoordinates? previousGps;

  GPSSaveResult({
    required this.success,
    this.registrySiteId,
    this.error,
    this.previousGps,
  });

  factory GPSSaveResult.fromJson(Map<String, dynamic> json) =>
      _$GPSSaveResultFromJson(json);
  Map<String, dynamic> toJson() => _$GPSSaveResultToJson(this);
}
