// lib/utils/site_visit_constraints.dart
// Enforces geographic and role-based constraints for data collectors and coordinators
// Based on the comprehensive constraints document

import '../models/site_visit.dart';
import '../models/pact_user_profile.dart';

/// Result of a constraint check
class ConstraintCheckResult {
  final bool allowed;
  final String? reason;
  final String? action; // 'view', 'claim', 'accept', etc.

  ConstraintCheckResult({required this.allowed, this.reason, this.action});

  factory ConstraintCheckResult.allow() => ConstraintCheckResult(allowed: true);

  factory ConstraintCheckResult.deny(String reason, {String? action}) =>
      ConstraintCheckResult(allowed: false, reason: reason, action: action);
}

/// Service for enforcing site visit constraints for data collectors and coordinators
class SiteVisitConstraints {
  /// Check if a user can view dispatched sites (geographic filtering applies)
  static ConstraintCheckResult canViewDispatchedSites(PACTUserProfile user) {
    // Must have stateId assigned
    if (user.stateId == null || user.stateId!.isEmpty) {
      return ConstraintCheckResult.deny(
        'Your profile has no state assigned. Contact your supervisor.',
        action: 'view',
      );
    }

    return ConstraintCheckResult.allow();
  }

  /// Check if a user can view assigned/accepted/ongoing/completed sites
  static ConstraintCheckResult canViewAssignedSites(
    PACTUserProfile user,
    SiteVisit visit,
  ) {
    // User can only see sites assigned to them
    if (visit.assignedTo != user.id) {
      return ConstraintCheckResult.deny(
        'You can only view sites assigned to you.',
        action: 'view',
      );
    }

    return ConstraintCheckResult.allow();
  }

  /// Check if a site matches user's geographic assignment
  static bool siteMatchesUserGeography(SiteVisit visit, PACTUserProfile user) {
    // Must have state assignment
    if (user.stateId == null || user.stateId!.isEmpty) {
      return false;
    }

    final userState = user.stateId!.toLowerCase().trim();
    final visitState = visit.state.toLowerCase().trim();

    // State must match (case-insensitive, substring matching)
    final stateMatches =
        visitState == userState ||
        visitState.contains(userState) ||
        userState.contains(visitState);

    if (!stateMatches) return false;

    // If user has locality assigned, locality must also match
    // If user doesn't have locality assigned, state match is sufficient
    if (user.localityId != null && user.localityId!.isNotEmpty) {
      final userLocality = user.localityId!.toLowerCase().trim();
      final visitLocality = visit.locality.toLowerCase().trim();

      final localityMatches =
          visitLocality == userLocality ||
          visitLocality.contains(userLocality) ||
          userLocality.contains(visitLocality);

      return localityMatches;
    }

    // If no locality assigned, state check is sufficient
    return true;
  }

  /// Check if user can claim a site (comprehensive check)
  static ConstraintCheckResult canClaimSite(
    SiteVisit visit,
    PACTUserProfile user,
  ) {
    // Check 1: Field worker status
    final isFieldWorker =
        user.role == 'dataCollector' ||
        user.role.toLowerCase() == 'datacollector' ||
        user.role == 'coordinator';

    final isSuperAdmin = user.role.toLowerCase() == 'superadmin';

    if (!isFieldWorker && !isSuperAdmin) {
      return ConstraintCheckResult.deny(
        'Only data collectors and coordinators can claim sites.',
        action: 'claim',
      );
    }

    // SuperAdmins bypass all other checks
    if (isSuperAdmin) {
      return ConstraintCheckResult.allow();
    }

    // Check 2: Classification status
    if (user.classification == null) {
      return ConstraintCheckResult.deny(
        'You must have an active classification to claim sites. Contact your supervisor to get classified.',
        action: 'claim',
      );
    }

    // Check classification is active (not expired)
    final now = DateTime.now();
    if (user.classification!.effectiveUntil != null &&
        user.classification!.effectiveUntil!.isBefore(now)) {
      return ConstraintCheckResult.deny(
        'Your classification has expired. Contact your supervisor to renew it.',
        action: 'claim',
      );
    }

    // Check 3: State matching
    if (user.stateId == null || user.stateId!.isEmpty) {
      return ConstraintCheckResult.deny(
        'Your profile has no state assigned. Contact your supervisor.',
        action: 'claim',
      );
    }

    final userState = user.stateId!.toLowerCase().trim();
    final siteState = visit.state.toLowerCase().trim();

    final stateMatches =
        siteState == userState ||
        siteState.contains(userState) ||
        userState.contains(siteState);

    if (!stateMatches) {
      return ConstraintCheckResult.deny(
        'This site is in ${visit.state}, but you are assigned to ${user.stateId}.',
        action: 'claim',
      );
    }

    // Check 4: Locality matching (if applicable)
    if (user.localityId != null && user.localityId!.isNotEmpty) {
      final userLocality = user.localityId!.toLowerCase().trim();
      final visitLocality = visit.locality.toLowerCase().trim();

      final localityMatches =
          visitLocality == userLocality ||
          visitLocality.contains(userLocality) ||
          userLocality.contains(visitLocality);

      if (!localityMatches) {
        return ConstraintCheckResult.deny(
          'This site is in ${visit.locality}, but you are assigned to ${user.localityId}.',
          action: 'claim',
        );
      }
    }

    // Check 5: User status is active
    if (user.status != 'approved' && user.status != 'active') {
      return ConstraintCheckResult.deny(
        'Your account is not active. Contact your supervisor.',
        action: 'claim',
      );
    }

    return ConstraintCheckResult.allow();
  }

  /// Check if user can accept a site (similar to claim but for accepted sites)
  static ConstraintCheckResult canAcceptSite(
    SiteVisit visit,
    PACTUserProfile user,
  ) {
    // Same checks as claiming
    return canClaimSite(visit, user);
  }

  /// Filter site visits based on user constraints
  static List<SiteVisit> filterVisibleSites(
    List<SiteVisit> allSites,
    PACTUserProfile user,
  ) {
    final filtered = <SiteVisit>[];

    for (final visit in allSites) {
      final status = visit.status.toLowerCase();

      if (status == 'dispatched') {
        // Dispatched sites: geographic filtering applies
        final viewCheck = canViewDispatchedSites(user);
        if (viewCheck.allowed && siteMatchesUserGeography(visit, user)) {
          filtered.add(visit);
        }
      } else if (status == 'assigned' ||
          status == 'accepted' ||
          status == 'ongoing' ||
          status == 'completed') {
        // Assigned sites: only if assigned to user
        final viewCheck = canViewAssignedSites(user, visit);
        if (viewCheck.allowed) {
          filtered.add(visit);
        }
      }
      // Other statuses are not shown to data collectors/coordinators
    }

    return filtered;
  }

  /// Get user geographic info for display
  static Map<String, String?> getUserGeographicInfo(PACTUserProfile user) {
    return {
      'stateId': user.stateId,
      'stateName': user.stateId, // Could be enhanced to get actual state name
      'localityId': user.localityId,
      'localityName':
          user.localityId, // Could be enhanced to get actual locality name
      'hubId': user.hubId,
      'hubName': user.hubId, // Could be enhanced to get actual hub name
    };
  }

  /// Check if user has required profile configuration
  static ConstraintCheckResult hasRequiredProfileConfiguration(
    PACTUserProfile user,
  ) {
    if (user.stateId == null || user.stateId!.isEmpty) {
      return ConstraintCheckResult.deny(
        'Your profile does not have a state assigned. You will not be able to see or claim any dispatched sites.',
      );
    }

    return ConstraintCheckResult.allow();
  }

  /// Get all applicable constraints for a user
  static Map<String, dynamic> getUserConstraints(PACTUserProfile user) {
    final geographicInfo = getUserGeographicInfo(user);
    final profileCheck = hasRequiredProfileConfiguration(user);

    return {
      'userId': user.id,
      'role': user.role,
      'status': user.status,
      'hasClassification': user.classification != null,
      'classificationLevel': user.classification?.level,
      'classificationActive':
          user.classification != null &&
          (user.classification!.effectiveUntil == null ||
              user.classification!.effectiveUntil!.isAfter(DateTime.now())),
      'geographicInfo': geographicInfo,
      'profileConfigured': profileCheck.allowed,
      'profileConfigurationMessage': profileCheck.reason,
      'isFieldWorker':
          user.role == 'dataCollector' ||
          user.role.toLowerCase() == 'datacollector' ||
          user.role == 'coordinator',
      'isSuperAdmin': user.role.toLowerCase() == 'superadmin',
      'canClaimSites':
          profileCheck.allowed &&
          (user.classification != null) &&
          (user.role == 'dataCollector' ||
              user.role.toLowerCase() == 'datacollector' ||
              user.role == 'coordinator' ||
              user.role.toLowerCase() == 'superadmin'),
    };
  }
}
