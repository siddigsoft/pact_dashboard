// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hub_operations_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GPSCoordinates _$GPSCoordinatesFromJson(Map<String, dynamic> json) =>
    GPSCoordinates(
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      accuracyMeters: (json['accuracy_meters'] as num?)?.toDouble(),
    );

Map<String, dynamic> _$GPSCoordinatesToJson(GPSCoordinates instance) =>
    <String, dynamic>{
      'latitude': instance.latitude,
      'longitude': instance.longitude,
      'accuracy_meters': instance.accuracyMeters,
    };

MatchQuery _$MatchQueryFromJson(Map<String, dynamic> json) => MatchQuery(
  siteCode: json['siteCode'] as String,
  siteName: json['siteName'] as String,
  state: json['state'] as String,
  locality: json['locality'] as String,
);

Map<String, dynamic> _$MatchQueryToJson(MatchQuery instance) =>
    <String, dynamic>{
      'siteCode': instance.siteCode,
      'siteName': instance.siteName,
      'state': instance.state,
      'locality': instance.locality,
    };

MatchInfo _$MatchInfoFromJson(Map<String, dynamic> json) => MatchInfo(
  type: json['type'] as String,
  confidence: (json['confidence'] as num).toDouble(),
  confidenceLevel: json['confidence_level'] as String,
  ruleApplied: json['rule_applied'] as String,
  candidatesCount: (json['candidates_count'] as num).toInt(),
  autoAccepted: json['auto_accepted'] as bool,
  requiresReview: json['requires_review'] as bool,
);

Map<String, dynamic> _$MatchInfoToJson(MatchInfo instance) => <String, dynamic>{
  'type': instance.type,
  'confidence': instance.confidence,
  'confidence_level': instance.confidenceLevel,
  'rule_applied': instance.ruleApplied,
  'candidates_count': instance.candidatesCount,
  'auto_accepted': instance.autoAccepted,
  'requires_review': instance.requiresReview,
};

MatchAudit _$MatchAuditFromJson(Map<String, dynamic> json) => MatchAudit(
  matchedAt: json['matched_at'] as String,
  matchedBy: json['matched_by'] as String,
  sourceWorkflow: json['source_workflow'] as String,
  overrideReason: json['override_reason'] as String?,
);

Map<String, dynamic> _$MatchAuditToJson(MatchAudit instance) =>
    <String, dynamic>{
      'matched_at': instance.matchedAt,
      'matched_by': instance.matchedBy,
      'source_workflow': instance.sourceWorkflow,
      'override_reason': instance.overrideReason,
    };

UnmatchedInfo _$UnmatchedInfoFromJson(Map<String, dynamic> json) =>
    UnmatchedInfo(
      reason: json['reason'] as String,
      details: json['details'] as String,
      pendingReview: json['pending_review'] as bool,
      suggestedAction: json['suggested_action'] as String?,
    );

Map<String, dynamic> _$UnmatchedInfoToJson(UnmatchedInfo instance) =>
    <String, dynamic>{
      'reason': instance.reason,
      'details': instance.details,
      'pending_review': instance.pendingReview,
      'suggested_action': instance.suggestedAction,
    };

AlternativeCandidate _$AlternativeCandidateFromJson(
  Map<String, dynamic> json,
) => AlternativeCandidate(
  registrySiteId: json['registry_site_id'] as String,
  siteCode: json['site_code'] as String,
  siteName: json['site_name'] as String,
  confidence: (json['confidence'] as num).toDouble(),
);

Map<String, dynamic> _$AlternativeCandidateToJson(
  AlternativeCandidate instance,
) => <String, dynamic>{
  'registry_site_id': instance.registrySiteId,
  'site_code': instance.siteCode,
  'site_name': instance.siteName,
  'confidence': instance.confidence,
};

RegistryLinkage _$RegistryLinkageFromJson(Map<String, dynamic> json) =>
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
          : UnmatchedInfo.fromJson(json['unmatched'] as Map<String, dynamic>),
      alternativeCandidates: (json['alternative_candidates'] as List<dynamic>?)
          ?.map((e) => AlternativeCandidate.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$RegistryLinkageToJson(RegistryLinkage instance) =>
    <String, dynamic>{
      'registry_site_id': instance.registrySiteId,
      'registry_site_code': instance.registrySiteCode,
      'gps': instance.gps,
      'state_id': instance.stateId,
      'state_name': instance.stateName,
      'locality_id': instance.localityId,
      'locality_name': instance.localityName,
      'query': instance.query,
      'match': instance.match,
      'audit': instance.audit,
      'unmatched': instance.unmatched,
      'alternative_candidates': instance.alternativeCandidates,
    };

SiteRegistry _$SiteRegistryFromJson(Map<String, dynamic> json) => SiteRegistry(
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

Map<String, dynamic> _$SiteRegistryToJson(SiteRegistry instance) =>
    <String, dynamic>{
      'id': instance.id,
      'site_code': instance.siteCode,
      'site_name': instance.siteName,
      'state_id': instance.stateId,
      'state_name': instance.stateName,
      'locality_id': instance.localityId,
      'locality_name': instance.localityName,
      'hub_id': instance.hubId,
      'hub_name': instance.hubName,
      'gps_latitude': instance.gpsLatitude,
      'gps_longitude': instance.gpsLongitude,
      'gps_captured_by': instance.gpsCapturedBy,
      'gps_captured_at': instance.gpsCapturedAt,
      'activity_type': instance.activityType,
      'status': instance.status,
      'mmp_count': instance.mmpCount,
      'last_mmp_date': instance.lastMmpDate,
      'created_at': instance.createdAt,
      'created_by': instance.createdBy,
      'updated_at': instance.updatedAt,
      'source': instance.source,
    };

ManagedHub _$ManagedHubFromJson(Map<String, dynamic> json) => ManagedHub(
  id: json['id'] as String,
  name: json['name'] as String,
  description: json['description'] as String?,
  projectId: json['project_id'] as String?,
  states: (json['states'] as List<dynamic>).map((e) => e as String).toList(),
  coordinates: json['coordinates'] as Map<String, dynamic>?,
  createdAt: json['created_at'] as String,
  createdBy: json['created_by'] as String,
  updatedAt: json['updated_at'] as String?,
);

Map<String, dynamic> _$ManagedHubToJson(ManagedHub instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'description': instance.description,
      'project_id': instance.projectId,
      'states': instance.states,
      'coordinates': instance.coordinates,
      'created_at': instance.createdAt,
      'created_by': instance.createdBy,
      'updated_at': instance.updatedAt,
    };

ProjectScope _$ProjectScopeFromJson(Map<String, dynamic> json) => ProjectScope(
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

Map<String, dynamic> _$ProjectScopeToJson(ProjectScope instance) =>
    <String, dynamic>{
      'id': instance.id,
      'project_id': instance.projectId,
      'project_name': instance.projectName,
      'hub_id': instance.hubId,
      'hub_name': instance.hubName,
      'state_ids': instance.stateIds,
      'locality_ids': instance.localityIds,
      'created_at': instance.createdAt,
      'updated_at': instance.updatedAt,
    };

SiteCodeComponents _$SiteCodeComponentsFromJson(Map<String, dynamic> json) =>
    SiteCodeComponents(
      stateCode: json['state_code'] as String,
      localityCode: json['locality_code'] as String,
      siteName: json['site_name'] as String,
      sequenceNumber: (json['sequence_number'] as num).toInt(),
      activityType: json['activity_type'] as String,
    );

Map<String, dynamic> _$SiteCodeComponentsToJson(SiteCodeComponents instance) =>
    <String, dynamic>{
      'state_code': instance.stateCode,
      'locality_code': instance.localityCode,
      'site_name': instance.siteName,
      'sequence_number': instance.sequenceNumber,
      'activity_type': instance.activityType,
    };

SiteMatchResult _$SiteMatchResultFromJson(Map<String, dynamic> json) =>
    SiteMatchResult(
      siteEntryId: json['site_entry_id'] as String,
      siteName: json['site_name'] as String,
      siteCode: json['site_code'] as String?,
      state: json['state'] as String,
      locality: json['locality'] as String,
      matchedRegistry: json['matched_registry'] == null
          ? null
          : SiteRegistry.fromJson(
              json['matched_registry'] as Map<String, dynamic>,
            ),
      matchType: json['match_type'] as String,
      matchConfidence: (json['match_confidence'] as num).toDouble(),
      matchConfidenceLevel: json['match_confidence_level'] as String,
      autoAccepted: json['auto_accepted'] as bool,
      requiresReview: json['requires_review'] as bool,
      gpsCoordinates: json['gps_coordinates'] == null
          ? null
          : GPSCoordinates.fromJson(
              json['gps_coordinates'] as Map<String, dynamic>,
            ),
      allCandidates: (json['all_candidates'] as List<dynamic>)
          .map((e) => AlternativeCandidate.fromJson(e as Map<String, dynamic>))
          .toList(),
      registryLinkage: RegistryLinkage.fromJson(
        json['registry_linkage'] as Map<String, dynamic>,
      ),
    );

Map<String, dynamic> _$SiteMatchResultToJson(SiteMatchResult instance) =>
    <String, dynamic>{
      'site_entry_id': instance.siteEntryId,
      'site_name': instance.siteName,
      'site_code': instance.siteCode,
      'state': instance.state,
      'locality': instance.locality,
      'matched_registry': instance.matchedRegistry,
      'match_type': instance.matchType,
      'match_confidence': instance.matchConfidence,
      'match_confidence_level': instance.matchConfidenceLevel,
      'auto_accepted': instance.autoAccepted,
      'requires_review': instance.requiresReview,
      'gps_coordinates': instance.gpsCoordinates,
      'all_candidates': instance.allCandidates,
      'registry_linkage': instance.registryLinkage,
    };

RegistryValidationResult _$RegistryValidationResultFromJson(
  Map<String, dynamic> json,
) => RegistryValidationResult(
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

Map<String, dynamic> _$RegistryValidationResultToJson(
  RegistryValidationResult instance,
) => <String, dynamic>{
  'matches': instance.matches,
  'registered_count': instance.registeredCount,
  'unregistered_count': instance.unregisteredCount,
  'review_required_count': instance.reviewRequiredCount,
  'auto_accepted_count': instance.autoAcceptedCount,
  'warnings': instance.warnings,
};

GPSSaveResult _$GPSSaveResultFromJson(Map<String, dynamic> json) =>
    GPSSaveResult(
      success: json['success'] as bool,
      registrySiteId: json['registry_site_id'] as String?,
      error: json['error'] as String?,
      previousGps: json['previous_gps'] == null
          ? null
          : GPSCoordinates.fromJson(
              json['previous_gps'] as Map<String, dynamic>,
            ),
    );

Map<String, dynamic> _$GPSSaveResultToJson(GPSSaveResult instance) =>
    <String, dynamic>{
      'success': instance.success,
      'registry_site_id': instance.registrySiteId,
      'error': instance.error,
      'previous_gps': instance.previousGps,
    };
