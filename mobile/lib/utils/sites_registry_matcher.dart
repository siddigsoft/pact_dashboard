// lib/utils/sites_registry_matcher.dart

import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/hub_operations_models.dart';

class SitesRegistryMatcher {
  final SupabaseClient _supabase = Supabase.instance.client;

  // ============================================================================
  // CONFIDENCE THRESHOLDS & MATCHING CONSTANTS
  // ============================================================================

  static const double CONFIDENCE_AUTO_ACCEPT = 0.90; // >= 90% = auto-accept
  static const double CONFIDENCE_HIGH = 0.85; // >= 85% = high confidence
  static const double CONFIDENCE_MEDIUM = 0.70; // >= 70% = medium confidence
  static const double CONFIDENCE_LOW = 0.50; // >= 50% = low confidence

  static const double MATCH_EXACT_CODE = 1.0; // 100% - exact site code match
  static const double MATCH_NAME_LOCATION =
      0.85; // 85% - name + state + locality
  static const double MATCH_PARTIAL_STATE = 0.70; // 70% - name + state only
  static const double MATCH_FUZZY_NAME = 0.50; // 50% - name only match

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  String _normalizeString(String? str) {
    if (str == null || str.isEmpty) return '';
    return str
        .toLowerCase()
        .trim()
        .replaceAll(RegExp(r'[^a-z0-9\s]'), '')
        .replaceAll(RegExp(r'\s+'), ' ');
  }

  String _getConfidenceLevel(double confidence) {
    if (confidence >= CONFIDENCE_HIGH) return 'high';
    if (confidence >= CONFIDENCE_MEDIUM) return 'medium';
    if (confidence >= CONFIDENCE_LOW) return 'low';
    return 'none';
  }

  // ============================================================================
  // REGISTRY FETCH
  // ============================================================================

  Future<List<SiteRegistry>> fetchAllRegistrySites() async {
    try {
      final response = await _supabase
          .from('sites_registry')
          .select()
          .order('site_name');

      if (response.isEmpty) return [];

      return (response as List)
          .map((item) => SiteRegistry.fromJson(item as Map<String, dynamic>))
          .toList();
    } catch (e) {
      print('❌ Error fetching sites registry: $e');
      return [];
    }
  }

  // ============================================================================
  // CORE MATCHING ALGORITHM
  // ============================================================================

  SiteMatchResult matchSiteToRegistry(
    Map<String, dynamic> siteEntry,
    List<SiteRegistry> registrySites, {
    String? userId,
    String sourceWorkflow = 'mmp_upload',
  }) {
    // Extract site fields (handle camelCase and snake_case variations)
    final siteCode = siteEntry['siteCode'] ?? siteEntry['site_code'] ?? '';
    final siteName =
        siteEntry['siteName'] ??
        siteEntry['site_name'] ??
        siteEntry['activity_at_site'] ??
        '';
    final state = siteEntry['state'] ?? '';
    final locality = siteEntry['locality'] ?? '';
    final siteEntryId = siteEntry['id']?.toString() ?? 'unknown';

    final query = MatchQuery(
      siteCode: siteCode,
      siteName: siteName,
      state: state,
      locality: locality,
    );

    // Normalize input for matching
    final normalizedCode = _normalizeString(siteCode);
    final normalizedName = _normalizeString(siteName);
    final normalizedState = _normalizeString(state);
    final normalizedLocality = _normalizeString(locality);

    // Score candidates by matching rules
    final candidates = <MapEntry<SiteRegistry, double>>[];

    for (final registrySite in registrySites) {
      final regNormalizedCode = _normalizeString(registrySite.siteCode);
      final regNormalizedName = _normalizeString(registrySite.siteName);
      final regNormalizedState = _normalizeString(registrySite.stateName);
      final regNormalizedLocality = _normalizeString(registrySite.localityName);

      double confidence = 0.0;
      String matchType = 'not_found';

      // Rule 1: Exact site_code match (100%)
      if (normalizedCode.isNotEmpty && normalizedCode == regNormalizedCode) {
        confidence = MATCH_EXACT_CODE;
        matchType = 'exact_code';
      }
      // Rule 2: Name + State + Locality match (85%)
      else if (normalizedName.isNotEmpty &&
          normalizedName == regNormalizedName &&
          normalizedState.isNotEmpty &&
          normalizedState == regNormalizedState &&
          normalizedLocality.isNotEmpty &&
          normalizedLocality == regNormalizedLocality) {
        confidence = MATCH_NAME_LOCATION;
        matchType = 'name_location';
      }
      // Rule 3: Name + State match only (70%)
      else if (normalizedName.isNotEmpty &&
          normalizedName == regNormalizedName &&
          normalizedState.isNotEmpty &&
          normalizedState == regNormalizedState) {
        confidence = MATCH_PARTIAL_STATE;
        matchType = 'partial';
      }
      // Rule 4: Name only match (50%)
      else if (normalizedName.isNotEmpty &&
          normalizedName == regNormalizedName) {
        confidence = MATCH_FUZZY_NAME;
        matchType = 'fuzzy';
      }

      if (confidence > 0.0) {
        candidates.add(MapEntry(registrySite, confidence));
      }
    }

    // Sort by confidence descending
    candidates.sort((a, b) => b.value.compareTo(a.value));

    // Determine match result
    final bestMatch = candidates.isNotEmpty ? candidates.first : null;
    final double matchConfidence = bestMatch?.value ?? 0.0;
    final String matchType = _getMatchType(bestMatch?.value ?? 0.0);
    final String confidenceLevel = _getConfidenceLevel(matchConfidence);
    final bool autoAccepted = matchConfidence >= CONFIDENCE_AUTO_ACCEPT;
    final bool requiresReview =
        matchConfidence > 0.0 && matchConfidence < CONFIDENCE_AUTO_ACCEPT;

    // Build registry linkage with audit trail
    final audit = MatchAudit(
      matchedAt: DateTime.now().toIso8601String(),
      matchedBy: userId ?? 'system',
      sourceWorkflow: sourceWorkflow,
    );

    UnmatchedInfo? unmatched;
    if (matchConfidence == 0.0) {
      unmatched = UnmatchedInfo(
        reason: 'no_registry_entry',
        details: 'No matching site found in registry',
        pendingReview: true,
        suggestedAction:
            'Create new site in registry or manually select from alternatives',
      );
    } else if (requiresReview) {
      unmatched = UnmatchedInfo(
        reason: 'low_confidence',
        details:
            'Match confidence: ${(matchConfidence * 100).toStringAsFixed(0)}%',
        pendingReview: true,
        suggestedAction: 'Review and confirm match manually',
      );
    }

    final gpsCoordinates = bestMatch != null && autoAccepted
        ? (bestMatch.key.gpsLatitude != null &&
                  bestMatch.key.gpsLongitude != null
              ? GPSCoordinates(
                  latitude: bestMatch.key.gpsLatitude!,
                  longitude: bestMatch.key.gpsLongitude!,
                )
              : null)
        : null;

    final alternativeCandidates = candidates
        .map(
          (e) => AlternativeCandidate(
            registrySiteId: e.key.id,
            siteCode: e.key.siteCode,
            siteName: e.key.siteName,
            confidence: e.value,
          ),
        )
        .toList();

    final registryLinkage = RegistryLinkage(
      registrySiteId: bestMatch?.key.id,
      registrySiteCode: bestMatch?.key.siteCode,
      gps: gpsCoordinates,
      stateId: bestMatch?.key.stateId,
      stateName: bestMatch?.key.stateName,
      localityId: bestMatch?.key.localityId,
      localityName: bestMatch?.key.localityName,
      query: query,
      match: MatchInfo(
        type: matchType,
        confidence: matchConfidence,
        confidenceLevel: confidenceLevel,
        ruleApplied: _getRuleApplied(matchType),
        candidatesCount: candidates.length,
        autoAccepted: autoAccepted,
        requiresReview: requiresReview,
      ),
      audit: audit,
      unmatched: unmatched,
      alternativeCandidates: alternativeCandidates,
    );

    return SiteMatchResult(
      siteEntryId: siteEntryId,
      siteName: siteName,
      siteCode: siteCode,
      state: state,
      locality: locality,
      matchedRegistry: bestMatch?.key,
      matchType: matchType,
      matchConfidence: matchConfidence,
      matchConfidenceLevel: confidenceLevel,
      autoAccepted: autoAccepted,
      requiresReview: requiresReview,
      gpsCoordinates: gpsCoordinates,
      allCandidates: alternativeCandidates,
      registryLinkage: registryLinkage,
    );
  }

  String _getMatchType(double confidence) {
    if (confidence >= MATCH_EXACT_CODE) return 'exact_code';
    if (confidence >= MATCH_NAME_LOCATION) return 'name_location';
    if (confidence >= MATCH_PARTIAL_STATE) return 'partial';
    if (confidence >= MATCH_FUZZY_NAME) return 'fuzzy';
    return 'not_found';
  }

  String _getRuleApplied(String matchType) {
    switch (matchType) {
      case 'exact_code':
        return 'Exact site code match';
      case 'name_location':
        return 'Name + State + Locality match';
      case 'partial':
        return 'Name + State match';
      case 'fuzzy':
        return 'Name only match (fuzzy)';
      default:
        return 'No match found';
    }
  }

  // ============================================================================
  // BATCH VALIDATION
  // ============================================================================

  Future<RegistryValidationResult> validateSitesAgainstRegistry(
    List<Map<String, dynamic>> siteEntries, {
    String? userId,
    String sourceWorkflow = 'mmp_upload',
  }) async {
    // Fetch all registry sites once
    final registrySites = await fetchAllRegistrySites();

    // Match each entry
    final matches = <SiteMatchResult>[];
    int registeredCount = 0;
    int unregisteredCount = 0;
    int reviewRequiredCount = 0;
    int autoAcceptedCount = 0;
    final warnings = <String>[];

    for (final entry in siteEntries) {
      final match = matchSiteToRegistry(
        entry,
        registrySites,
        userId: userId,
        sourceWorkflow: sourceWorkflow,
      );

      matches.add(match);

      if (match.matchedRegistry != null) {
        registeredCount++;
      } else {
        unregisteredCount++;
      }

      if (match.autoAccepted) {
        autoAcceptedCount++;
      } else if (match.requiresReview) {
        reviewRequiredCount++;
      }

      // Collect warnings
      if (entry['isFlagged'] == true) {
        warnings.add(
          'Site ${entry['siteName'] ?? entry['siteCode']} is flagged: ${entry['flagReason'] ?? 'no reason provided'}',
        );
      }
    }

    return RegistryValidationResult(
      matches: matches,
      registeredCount: registeredCount,
      unregisteredCount: unregisteredCount,
      reviewRequiredCount: reviewRequiredCount,
      autoAcceptedCount: autoAcceptedCount,
      warnings: warnings,
    );
  }

  // ============================================================================
  // GPS SAVE TO REGISTRY
  // ============================================================================

  Future<GPSSaveResult> saveGPSToRegistry(
    String registrySiteId,
    double latitude,
    double longitude, {
    double? accuracy,
    String? userId,
    String sourceType = 'site_visit',
    bool overwriteExisting = false,
  }) async {
    try {
      // Fetch current site
      final currentSite = await _supabase
          .from('sites_registry')
          .select()
          .eq('id', registrySiteId)
          .single();

      final site = SiteRegistry.fromJson(currentSite);

      // Check if GPS already exists
      GPSCoordinates? previousGps;
      if (site.gpsLatitude != null && site.gpsLongitude != null) {
        previousGps = GPSCoordinates(
          latitude: site.gpsLatitude!,
          longitude: site.gpsLongitude!,
        );
        if (!overwriteExisting) {
          return GPSSaveResult(
            success: false,
            registrySiteId: registrySiteId,
            error: 'GPS already exists and overwriteExisting is false',
            previousGps: previousGps,
          );
        }
      }

      // Update sites_registry with new GPS
      await _supabase
          .from('sites_registry')
          .update({
            'gps_latitude': latitude,
            'gps_longitude': longitude,
            'gps_captured_by': userId ?? 'system',
            'gps_captured_at': DateTime.now().toIso8601String(),
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', registrySiteId);

      return GPSSaveResult(
        success: true,
        registrySiteId: registrySiteId,
        previousGps: previousGps,
      );
    } catch (e) {
      print('❌ Error saving GPS to registry: $e');
      return GPSSaveResult(success: false, error: e.toString());
    }
  }

  /// Convenience wrapper: saves GPS using mmp_site_entry ID
  Future<GPSSaveResult> saveGPSToRegistryFromSiteEntry(
    String mmpSiteEntryId,
    double latitude,
    double longitude, {
    double? accuracy,
    String? userId,
    String sourceType = 'site_visit',
    bool overwriteExisting = false,
  }) async {
    try {
      // Look up mmp_site_entries.registry_site_id
      final entry = await _supabase
          .from('mmp_site_entries')
          .select('registry_site_id')
          .eq('id', mmpSiteEntryId)
          .single();

      final registrySiteId = entry['registry_site_id'] as String?;
      if (registrySiteId == null) {
        return GPSSaveResult(
          success: false,
          error: 'No registry_site_id found for this MMP site entry',
        );
      }

      return saveGPSToRegistry(
        registrySiteId,
        latitude,
        longitude,
        accuracy: accuracy,
        userId: userId,
        sourceType: sourceType,
        overwriteExisting: overwriteExisting,
      );
    } catch (e) {
      print('❌ Error looking up registry site ID: $e');
      return GPSSaveResult(success: false, error: e.toString());
    }
  }

  // ============================================================================
  // SITE CODE GENERATION & PARSING
  // ============================================================================

  String generateSiteCode(
    String stateCode,
    String localityName,
    String siteName,
    int sequenceNumber, {
    String activityType = 'TPM',
  }) {
    final localityCode = localityName
        .split(' ')
        .map((word) => word.isNotEmpty ? word[0].toUpperCase() : '')
        .join('')
        .substring(0, 3.clamp(0, localityName.split(' ').length));

    final siteNameCode = siteName
        .replaceAll(RegExp(r'[^a-zA-Z0-9]'), '')
        .substring(0, 6.clamp(0, siteName.length))
        .toUpperCase();

    final paddedSequence = sequenceNumber.toString().padLeft(4, '0');

    return '$stateCode-$localityCode-$siteNameCode-$paddedSequence-$activityType';
  }

  SiteCodeComponents? parseSiteCode(String siteCode) {
    final parts = siteCode.split('-');
    if (parts.length < 5) return null;

    return SiteCodeComponents(
      stateCode: parts[0],
      localityCode: parts[1],
      siteName: parts[2],
      sequenceNumber: int.tryParse(parts[3]) ?? 0,
      activityType: parts[4],
    );
  }
}
