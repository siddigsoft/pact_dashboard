// lib/screens/site_verification_screen.dart

import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import '../theme/app_colors.dart';
import '../services/site_visit_service.dart';
import '../l10n/app_localizations.dart';
import '../widgets/custom_drawer_menu.dart';
import '../widgets/reusable_app_bar.dart';
import '../widgets/modern_app_header.dart';
import '../widgets/mmp_filter_bar.dart';
import '../utils/mmp_filter_utils.dart';

part '../widgets/site_verification/site_verification_tab_content.dart';
part '../widgets/site_verification/site_verification_card_widgets.dart';
part '../widgets/site_verification/site_verification_action_widgets.dart';
part '../widgets/site_verification/site_details_sheet.dart';
part '../widgets/site_verification/permit_verification_dialog.dart';
part '../widgets/site_verification/locality_permit_dialog.dart';
part '../widgets/site_verification/verification_dialog.dart';
part '../widgets/site_verification/bulk_permit_dialogs.dart';

String _bi(String en, String ar) =>
    '\u2066$en\u2069 \u200B|\u200B \u2067$ar\u2069';

/// Permit decision structure for state and locality permits
class PermitDecision {
  final PermitStatus statePermit;
  final PermitStatus localityPermit;

  PermitDecision({required this.statePermit, required this.localityPermit});

  Map<String, dynamic> toJson() => {
    'statePermit': statePermit.toJson(),
    'localityPermit': localityPermit.toJson(),
  };

  factory PermitDecision.fromJson(Map<String, dynamic> json) {
    return PermitDecision(
      statePermit: PermitStatus.fromJson(json['statePermit'] ?? {}),
      localityPermit: PermitStatus.fromJson(json['localityPermit'] ?? {}),
    );
  }
}

class PermitStatus {
  final String?
  requirement; // 'required_have_it', 'required_dont_have_it', 'not_required'
  final String? canWorkWithout; // 'yes', 'no'
  final bool uploaded;
  final String? issueDate; // YYYY-MM-DD
  final String? expiryDate; // YYYY-MM-DD

  PermitStatus({
    this.requirement,
    this.canWorkWithout,
    this.uploaded = false,
    this.issueDate,
    this.expiryDate,
  });

  Map<String, dynamic> toJson() => {
    'requirement': requirement,
    'canWorkWithout': canWorkWithout,
    'uploaded': uploaded,
    'issueDate': issueDate,
    'expiryDate': expiryDate,
  };

  factory PermitStatus.fromJson(Map<String, dynamic> json) {
    return PermitStatus(
      requirement: json['requirement'],
      canWorkWithout: json['canWorkWithout'],
      uploaded: json['uploaded'] ?? false,
      issueDate: json['issueDate'],
      expiryDate: json['expiryDate'],
    );
  }
}

/// Helper to safely extract statePermits from a site's mmp_files join data.
/// Handles both object and array responses from Supabase joins.
List<dynamic> _extractStatePermits(Map<String, dynamic> site) {
  final raw = site['mmp_files'];
  Map<String, dynamic> mmpFile = {};
  if (raw is Map<String, dynamic>) {
    mmpFile = raw;
  } else if (raw is List &&
      raw.isNotEmpty &&
      raw.first is Map<String, dynamic>) {
    mmpFile = raw.first as Map<String, dynamic>;
  }
  final permits = mmpFile['permits'] as Map<String, dynamic>? ?? {};
  return permits['statePermits'] as List<dynamic>? ?? [];
}

/// Check if a site's state has a state permit via MMP file-level permits.
bool _hasStatePermitFromMmpFile(Map<String, dynamic> site) {
  final stateName = site['state']?.toString() ?? '';
  final statePermits = _extractStatePermits(site);
  for (final sp in statePermits) {
    if (sp is Map<String, dynamic> && sp['state']?.toString() == stateName) {
      return true;
    }
  }
  return false;
}

/// Site Verification Screen for Coordinators
/// Allows coordinators to verify sites, manage permits, and approve site visits
class SiteVerificationScreen extends StatefulWidget {
  const SiteVerificationScreen({super.key});

  @override
  State<SiteVerificationScreen> createState() => _SiteVerificationScreenState();
}

class _SiteVerificationScreenState extends State<SiteVerificationScreen> {
  final SiteVisitService _siteVisitService = SiteVisitService();
  final SupabaseClient _supabase = Supabase.instance.client;
  // Key to control the Scaffold for opening/closing drawer
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();

  String _activeTab = 'new';
  bool _isLoading = true;
  String? _userId;
  String? _userState;
  String? _userHub;
  String? _userLocality; // For locality-specific coordinators
  String? _userRole; // User's role (admin, coordinator, dataCollector, etc.)
  List<String> _userProjectIds = []; // Projects the user is a member of
  bool _isAdminOrSuperUser =
      false; // Whether user is admin/supervisor (can see all projects)

  // DM Activities that require date range (distribution start, end, expected visit)
  // Based on CoordinatorSites.tsx - only GFA, CBT, EBSFP
  static const List<String> _dmActivities = ['GFA', 'CBT', 'EBSFP'];

  // Activities that require multiple visits (assessment, monitoring, evaluation)
  static const List<String> _multiVisitActivities = [
    'Assessment',
    'Monitoring',
    'Evaluation',
    'Supervision',
    'Oversight',
    'Capacity Building',
    'Training',
    'Survey',
    'Baseline',
    'Endline',
    'Midline',
  ];

  // Activities that require immediate/same-day visits
  static const List<String> _urgentActivities = [
    'Emergency',
    'Rapid Assessment',
    'Crisis Response',
    'Incident Response',
  ];

  // Sites categorized by verification status (matching web app tabs)
  List<Map<String, dynamic>> _newSites =
      []; // Tab 1: New (Only Pending status sites)
  List<Map<String, dynamic>> _cpVerificationSites =
      []; // Tab 2: CP Verification (permits attached)
  List<Map<String, dynamic>> _verifiedSites = []; // Tab 3: Verified
  List<Map<String, dynamic>> _approvedSites = []; // Tab 4: Approved
  List<Map<String, dynamic>> _completedSites = []; // Tab 5: Completed
  List<Map<String, dynamic>> _rejectedSites = []; // Tab 6: Rejected

  // Sub-tab for New tab (State Permit vs Locality Permit)
  int _newSubTabIndex = 0; // 0 = State Permit, 1 = Locality Permit
  String _searchQuery = '';
  String? _selectedMmpId; // null = All MMPs
  List<Map<String, dynamic>> _availableMmps = []; // [{id, name, count}]

  // Activity filter: 'all' | 'dm' | 'non_dm' (DM = 3 dates, Non-DM = 1 date)
  String _activityFilter = 'all';

  // Selected site IDs for bulk verify (CP Verification tab); cleared when switching tabs
  final Set<String> _selectedSiteIds = {};
  // Selected site IDs for bulk return actions (State/Locality/CP groups)
  final Set<String> _selectedReturnSiteIds = {};

  bool get _isArabic => Localizations.localeOf(context).languageCode == 'ar';

  String _bi(String en, String ar) =>
      '\u2066$en\u2069 \u200B|\u200B \u2067$ar\u2069';

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  void dispose() {
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);

    try {
      final user = _supabase.auth.currentUser;
      if (user == null) {
        throw Exception('User not authenticated');
      }
      _userId = user.id;

      // Get coordinator's regional assignment (CONSTRAINT 1: Regional)
      final profile = await _supabase
          .from('profiles')
          .select('state_id, hub_id, locality_id, role')
          .eq('id', user.id)
          .maybeSingle();

      _userState = profile?['state_id'];
      _userHub = profile?['hub_id'];
      _userLocality =
          profile?['locality_id']; // Can be null for state-wide access
      _userRole = profile?['role']?.toString().toLowerCase();

      // Check if user is admin or supervisor (can see all projects)
      _isAdminOrSuperUser =
          _userRole == 'admin' ||
          _userRole == 'super_admin' ||
          _userRole == 'supervisor' ||
          _userRole == 'fom';

      // Fetch user's project memberships (for non-admin users)
      if (!_isAdminOrSuperUser) {
        await _fetchUserProjectMemberships();
      }

      // Fetch sites forwarded to this coordinator for verification
      await _fetchSitesForVerification();
    } catch (e) {
      debugPrint('Error loading verification data: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error loading sites: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  /// Fetch user's project memberships from team_members table and projects table
  Future<void> _fetchUserProjectMemberships() async {
    try {
      _userProjectIds = [];

      debugPrint(
        '[_fetchUserProjectMemberships] Fetching projects for user: $_userId',
      );

      // Try to fetch from team_members table first (if it exists)
      try {
        final response = await _supabase
            .from('team_members')
            .select('project_id')
            .eq('user_id', _userId!);

        if ((response as List).isNotEmpty) {
          _userProjectIds = (response)
              .map((m) => m['project_id']?.toString())
              .where((id) => id != null && id.isNotEmpty)
              .cast<String>()
              .toList();
          debugPrint(
            'User project IDs from team_members: ${_userProjectIds.length}',
          );
        } else {
          debugPrint(
            'team_members table returned empty or doesn\'t exist, checking projects table',
          );
        }
      } catch (e) {
        debugPrint(
          'Error fetching from team_members table (may not exist): $e',
        );
      }

      // ALWAYS check projects table for team composition (primary source)
      // This matches the web app's useUserProjects hook
      try {
        final projectsResponse = await _supabase
            .from('projects')
            .select('id, team');

        debugPrint(
          'Checking ${(projectsResponse as List).length} projects for user membership',
        );
        int foundCount = 0;

        for (final project in projectsResponse) {
          final projectId = project['id']?.toString();
          if (projectId == null) continue;

          final team = project['team'] as Map<String, dynamic>?;
          if (team == null) continue;

          bool isMember = false;

          // Check if user is project manager (can be UUID or name)
          final projectManager = team['projectManager'];
          if (projectManager != null) {
            // Check both UUID and name (in case it's stored as name)
            if (projectManager == _userId ||
                (projectManager is String &&
                    projectManager.contains(_userId!))) {
              isMember = true;
              debugPrint(
                'Found user as project manager in project: $projectId',
              );
            }
          }

          // Check if user is in members array
          if (!isMember) {
            final members = team['members'] as List?;
            if (members != null && members.contains(_userId)) {
              isMember = true;
              debugPrint('Found user in members array for project: $projectId');
            }
          }

          // Check if user is in teamComposition (primary method)
          if (!isMember) {
            final teamComposition = team['teamComposition'] as List?;
            if (teamComposition != null) {
              for (final member in teamComposition) {
                if (member is Map) {
                  final memberUserId = member['userId']?.toString();
                  if (memberUserId == _userId) {
                    isMember = true;
                    debugPrint(
                      'Found user in teamComposition for project: $projectId (role: ${member['role']})',
                    );
                    break;
                  }
                }
              }
            }
          }

          if (isMember && !_userProjectIds.contains(projectId)) {
            _userProjectIds.add(projectId);
            foundCount++;
          }
        }

        debugPrint(
          'User project IDs from projects table: $foundCount (total: ${_userProjectIds.length})',
        );
      } catch (e2) {
        debugPrint('Error fetching from projects table: $e2');
      }

      debugPrint(
        'User is member of ${_userProjectIds.length} projects: $_userProjectIds',
      );
    } catch (e) {
      debugPrint('Error fetching user project memberships: $e');
    }
  }

  Future<void> _fetchSitesForVerification() async {
    try {
      // Fetch sites assigned to this coordinator
      // Primary method: forwarded_to_user_id (same as dashboard)

      debugPrint('=== FETCHING SITES FOR VERIFICATION ===');
      debugPrint('User ID: $_userId');
      debugPrint('User State: $_userState');
      debugPrint('User Hub: $_userHub');
      debugPrint('User Locality: $_userLocality');

      // Fetch by forwarded_to_user_id
      List<Map<String, dynamic>> sites = [];

      try {
        final response = await _supabase
            .from('mmp_site_entries')
            .select('*, mmp_files(id, name, workflow, project_id, permits)')
            .eq('forwarded_to_user_id', _userId!)
            .order('created_at', ascending: false)
            .limit(1000);

        sites.addAll(List<Map<String, dynamic>>.from(response));
        debugPrint('Sites found by forwarded_to_user_id: ${sites.length}');
      } catch (e) {
        debugPrint('Error fetching by forwarded_to_user_id: $e');
      }

      // Filter by project membership (for non-admin users)
      if (!_isAdminOrSuperUser) {
        final beforeCount = sites.length;
        sites = sites.where((site) {
          final mmpFile = site['mmp_files'] as Map<String, dynamic>? ?? {};
          final projectId = mmpFile['project_id']?.toString();

          // If site has no project ID, exclude it (user must be in project to see sites)
          if (projectId == null || projectId.isEmpty) {
            return false;
          }

          // Site must be in one of user's projects
          return _userProjectIds.contains(projectId);
        }).toList();

        debugPrint(
          'Filtered sites by project membership: ${sites.length} of $beforeCount',
        );
      }

      // SECONDARY APPROACH: Also check additional_data for assigned_to
      // Fetch all sites and filter in memory (more reliable than JSONB query)
      if (sites.length < 50) {
        // Only do this if we got few results, to avoid performance issues
        try {
          final response2 = await _supabase
              .from('mmp_site_entries')
              .select('*, mmp_files(id, name, workflow, project_id, permits)')
              .order('created_at', ascending: false)
              .limit(500);

          // Filter in memory for sites where additional_data contains assigned_to
          final additionalSites = (response2 as List).where((site) {
            final additionalData =
                site['additional_data'] as Map<String, dynamic>?;
            if (additionalData == null) return false;
            final assignedTo = additionalData['assigned_to']?.toString();
            if (assignedTo != _userId) return false;

            // Also filter by project membership (for non-admin users)
            if (!_isAdminOrSuperUser) {
              final mmpFile = site['mmp_files'] as Map<String, dynamic>? ?? {};
              final projectId = mmpFile['project_id']?.toString();
              if (projectId == null || projectId.isEmpty) return false;
              if (!_userProjectIds.contains(projectId)) return false;
            }

            return true;
          }).toList();

          // Add sites not already in list (avoid duplicates)
          for (final site in additionalSites) {
            final exists = sites.any((s) => s['id'] == site['id']);
            if (!exists) {
              sites.add(Map<String, dynamic>.from(site));
            }
          }
          debugPrint(
            'Sites added from additional_data assigned_to: ${additionalSites.length}',
          );
          debugPrint('Total sites after both queries: ${sites.length}');
        } catch (e) {
          debugPrint('Error fetching by additional_data assigned_to: $e');
        }
      }

      // FALLBACK: If still no sites and user has state, try by state/hub
      if (sites.isEmpty && _userState != null && _userState!.isNotEmpty) {
        try {
          debugPrint(
            'No sites found by user assignment, trying by state/hub...',
          );
          var query = _supabase
              .from('mmp_site_entries')
              .select('*, mmp_files(id, name, workflow, permits)')
              .eq('state', _userState!);

          if (_userHub != null && _userHub!.isNotEmpty) {
            query = query.eq('hub_office', _userHub!);
          }

          final response3 = await query
              .order('created_at', ascending: false)
              .limit(1000);
          sites.addAll(List<Map<String, dynamic>>.from(response3));
          debugPrint('Sites found by state/hub: ${sites.length}');
        } catch (e) {
          debugPrint('Error fetching by state/hub: $e');
        }
      }

      debugPrint('Total sites fetched before filtering: ${sites.length}');

      // Do not filter by locality; show all sites forwarded/assigned to the coordinator.
      // This matches the dashboard behavior and avoids hiding sites when locality differs.

      // Log site statuses for debugging
      final statusCounts = <String, int>{};
      for (final site in sites) {
        final status = site['status']?.toString() ?? 'null';
        statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      }
      debugPrint('Site status breakdown: $statusCounts');
      debugPrint(
        'Sample site IDs: ${sites.take(5).map((s) => s['id']).toList()}',
      );

      // ============================================================================
      // CATEGORIZE SITES INTO 6 TABS (matching web app CoordinatorSites.tsx)
      // ============================================================================

      // Tab 1: NEW - Strict coordinator inbox rule:
      // only sites explicitly forwarded to the current user and still pending.
      _newSites = sites.where((s) {
        final forwardedToUserId = s['forwarded_to_user_id']?.toString();
        final rawStatus = s['status']?.toString() ?? '';
        final normalizedStatus = rawStatus.toLowerCase().trim().replaceAll(
          RegExp(r'\s+'),
          '_',
        );
        return forwardedToUserId == _userId && normalizedStatus == 'pending';
      }).toList();

      debugPrint('New sites count: ${_newSites.length}');

      // Tab 2: CP VERIFICATION - Sites with permits attached (matching web app)
      _cpVerificationSites = sites.where((s) {
        final status =
            s['status']?.toString().toLowerCase().trim().replaceAll(
              RegExp(r'\s+'),
              '_',
            ) ??
            '';
        return status == 'permits_attached' ||
            status == 'cp_verified' ||
            status == 'cp_verification';
      }).toList();

      // Tab 3: VERIFIED - Sites verified by coordinator, waiting for approval
      _verifiedSites = sites.where((s) {
        final status = s['status']?.toString().toLowerCase() ?? '';
        return status == 'verified';
      }).toList();

      // Tab 4: APPROVED - Sites approved by hub supervisor (matching web app)
      _approvedSites = sites.where((s) {
        final status =
            s['status']?.toString().toLowerCase().trim().replaceAll(
              RegExp(r'\s+'),
              '_',
            ) ??
            '';
        return status == 'approved' ||
            status == 'costed' ||
            status == 'approved_and_costed';
      }).toList();

      // Tab 5: COMPLETED - Sites with completed visits
      _completedSites = sites.where((s) {
        final status = s['status']?.toString().toLowerCase() ?? '';
        return status == 'completed';
      }).toList();

      // Tab 6: REJECTED - Sites rejected during verification or returned from FOM
      _rejectedSites = sites.where((s) {
        final status = s['status']?.toString().toLowerCase() ?? '';
        // Include both rejected and returned_to_fom statuses
        return status == 'rejected' || status == 'returned_to_fom';
      }).toList();

      debugPrint(
        'Tab counts - New: ${_newSites.length}, CP Verification: ${_cpVerificationSites.length}, Verified: ${_verifiedSites.length}, Approved: ${_approvedSites.length}, Completed: ${_completedSites.length}, Rejected: ${_rejectedSites.length}',
      );

      // FALLBACK: If we have sites but they're not categorized, we log them only.
      // Unlike the previous behavior, we DO NOT force them into the New tab.
      // This matches the web app where unknown statuses (including returned_to_fom)
      // are not shown in coordinator tabs.
      if (sites.isNotEmpty) {
        final categorizedCount =
            _newSites.length +
            _cpVerificationSites.length +
            _verifiedSites.length +
            _approvedSites.length +
            _completedSites.length +
            _rejectedSites.length;
        if (categorizedCount < sites.length) {
          final uncategorized = sites.where((s) {
            final id = s['id'];
            return !_newSites.any((ns) => ns['id'] == id) &&
                !_cpVerificationSites.any((cps) => cps['id'] == id) &&
                !_verifiedSites.any((vs) => vs['id'] == id) &&
                !_approvedSites.any((as) => as['id'] == id) &&
                !_completedSites.any((cs) => cs['id'] == id) &&
                !_rejectedSites.any((rs) => rs['id'] == id);
          }).toList();

          debugPrint(
            'WARNING: ${uncategorized.length} sites were not categorized (they will not be shown in tabs).',
          );
          debugPrint(
            'Uncategorized sites: ${uncategorized.map((s) => '${s['id']}: status="${s['status']}"').join(', ')}',
          );
        }
      }

      // Build MMP filter options from all loaded sites
      _availableMmps = buildMmpFilterOptions(sites);

      if (mounted) {
        setState(() {
          // MMP list is already sorted by buildMmpFilterOptions
          // Reset MMP filter if the previously selected MMP is no longer present
          if (_selectedMmpId != null &&
              !_availableMmps.any((m) => m['id'] == _selectedMmpId)) {
            _selectedMmpId = null;
          }
        });
      }
    } catch (e) {
      debugPrint('Error fetching sites for verification: $e');
      rethrow;
    }
  }

  // ============================================================================
  // CONSTRAINT VALIDATION METHODS
  // ============================================================================

  /// CONSTRAINT 1: Validate Regional Access
  /// Returns error message if access denied, null if allowed
  String? _validateRegionalAccess(Map<String, dynamic> site) {
    final siteState = site['state']?.toString();
    final siteHub = site['hub_office']?.toString();
    final siteLocality = site['locality']?.toString();
    final forwardedTo = site['forwarded_to_user_id']?.toString();

    // Debug logging
    debugPrint('=== REGIONAL ACCESS VALIDATION ===');
    debugPrint('Site ID: ${site['id']}');
    debugPrint('Site State: $siteState');
    debugPrint('Site Hub: $siteHub');
    debugPrint('Site Locality: $siteLocality');
    debugPrint('Forwarded To: $forwardedTo');
    debugPrint('User ID: $_userId');
    debugPrint('User State: $_userState');
    debugPrint('User Hub: $_userHub');
    debugPrint('User Locality: $_userLocality');

    // Check if site is explicitly forwarded or assigned to this user
    // If so, bypass hub/state checks - the assignment is the authorization
    final additionalData =
        site['additional_data'] as Map<String, dynamic>? ?? {};
    final assignedTo = additionalData['assigned_to']?.toString();
    final isExplicitlyAssigned =
        forwardedTo == _userId || assignedTo == _userId;

    if (isExplicitlyAssigned) {
      debugPrint(
        'Site is explicitly forwarded/assigned to user - bypassing regional checks',
      );
      return null; // Explicitly assigned sites can always be verified
    }

    // FALLBACK: Regional authorization for coordinators without explicit assignment
    // Check if user has access through state/hub membership

    // Check state match (normalized comparison)
    if (_userState != null && _userState!.isNotEmpty) {
      final userStateNorm = _userState!.toLowerCase().replaceAll(
        RegExp(r'[-_\s]'),
        '',
      );
      final siteStateNorm = (siteState ?? '').toLowerCase().replaceAll(
        RegExp(r'[-_\s]'),
        '',
      );
      if (userStateNorm != siteStateNorm &&
          !siteStateNorm.contains(userStateNorm) &&
          !userStateNorm.contains(siteStateNorm)) {
        debugPrint(
          'State mismatch: user state "$_userState" ($userStateNorm) vs site state "$siteState" ($siteStateNorm)',
        );
        return 'This site is not in your assigned state ($_userState)';
      }
    }

    // NOTE: Hub check is now bypassed to avoid false negatives from spelling mismatches
    // (e.g., "forchana-hub" vs "Farchana Hub"). State-level access is sufficient
    // for coordinators, and explicit forwarding covers specific assignments.

    debugPrint('Regional access validation passed (via state membership)');
    return null; // All checks passed
  }

  /// CONSTRAINT 2: Validate Permit Requirements
  /// Returns error message if permits missing, null if valid
  String? _validatePermitRequirements(Map<String, dynamic> site) {
    final status = site['status']?.toString().toLowerCase() ?? '';

    // If site already has permits_attached status, skip permit validation
    if (status == 'permits_attached') {
      return null; // Already has permits
    }

    final additionalData =
        site['additional_data'] as Map<String, dynamic>? ?? {};

    // Check state permit - check both site-level flags AND MMP file-level state permits
    var hasStatePermit = additionalData['state_permit_attached'] == true;
    final stateNotRequired =
        additionalData['state_permit_not_required'] == true;

    // Also check MMP file-level state permits (matching web logic)
    if (!hasStatePermit && !stateNotRequired) {
      hasStatePermit = _hasStatePermitFromMmpFile(site);
    }

    if (!hasStatePermit && !stateNotRequired) {
      return 'State permit must be verified before site verification';
    }

    // Check locality permit
    final hasLocalityPermit =
        additionalData['locality_permit_attached'] == true;

    if (!hasLocalityPermit) {
      return 'Locality permit must be attached before site verification';
    }

    return null; // Permits valid
  }

  /// CONSTRAINT 3: Validate Status (can this site be verified?)
  /// Returns error message if status invalid, null if verifiable
  String? _validateStatus(Map<String, dynamic> site) {
    final status = site['status']?.toString().toLowerCase() ?? '';

    // Verifiable statuses
    const verifiableStatuses = [
      'pending',
      'dispatched',
      'assigned',
      'inprogress',
      'permits_attached',
      'rejected', // Can re-verify after fix
    ];

    if (!verifiableStatuses.contains(status)) {
      if (status == 'verified') {
        return 'This site is already verified';
      } else if (status == 'approved') {
        return 'This site is approved and cannot be modified';
      } else if (status == 'completed') {
        return 'This site is completed and cannot be modified';
      } else if (status == 'returned_to_fom') {
        return 'This site has been returned to FOM';
      }
      return 'Site status "$status" cannot be verified';
    }

    return null; // Status is verifiable
  }

  /// CONSTRAINT 4: Validate Activity Type and Expected Dates
  /// Returns error message if dates invalid, null if valid
  String? _validateActivityDates(Map<String, dynamic> site) {
    final additionalData =
        site['additional_data'] as Map<String, dynamic>? ?? {};
    final expectedVisit =
        additionalData['expected_visit'] as Map<String, dynamic>? ?? {};

    // Determine if this is a DM activity
    final isDmActivity = _isDmActivity(site);

    if (isDmActivity) {
      // DM Activity: Requires date range
      final type = expectedVisit['type']?.toString();
      final startDate = expectedVisit['start_date']?.toString();
      final endDate = expectedVisit['end_date']?.toString();
      final expectedDate = expectedVisit['expected_date']?.toString();

      if (type != 'range') {
        return 'DM activity requires date range (start_date and end_date)';
      }

      if (startDate == null || startDate.isEmpty) {
        return 'Start date is required for DM activities';
      }

      if (endDate == null || endDate.isEmpty) {
        return 'End date is required for DM activities';
      }

      if (expectedDate == null || expectedDate.isEmpty) {
        return 'Expected visit date is required';
      }

      // Validate date range
      try {
        final start = DateTime.parse(startDate);
        final end = DateTime.parse(endDate);
        final expected = DateTime.parse(expectedDate);

        if (expected.isBefore(start) || expected.isAfter(end)) {
          return 'Expected date must be between $startDate and $endDate';
        }

        if (end.isBefore(start)) {
          return 'End date cannot be before start date';
        }
      } catch (e) {
        return 'Invalid date format';
      }
    } else {
      // Non-DM Activity: Requires single date
      final expectedDate = expectedVisit['expected_date']?.toString();

      if (expectedDate == null || expectedDate.isEmpty) {
        return 'Expected visit date is required';
      }

      // Validate date format
      try {
        DateTime.parse(expectedDate);
      } catch (e) {
        return 'Invalid date format for expected date';
      }
    }

    return null; // Dates valid
  }

  /// CONSTRAINT 5: PRE-VERIFICATION CHECKS (TIER 1 - BLOCKING)
  /// Returns Map with 'success' boolean and 'error' message
  Map<String, dynamic> _performPreVerificationChecks(
    Map<String, dynamic> site,
  ) {
    // Check 1: Regional Access
    final regionalError = _validateRegionalAccess(site);
    if (regionalError != null) {
      return {'success': false, 'error': regionalError, 'tier': 1};
    }

    // Check 2: Permit Status
    final permitError = _validatePermitRequirements(site);
    if (permitError != null) {
      return {'success': false, 'error': permitError, 'tier': 1};
    }

    // Check 3: Status Valid
    final statusError = _validateStatus(site);
    if (statusError != null) {
      return {'success': false, 'error': statusError, 'tier': 1};
    }

    // Note: Date validation is handled in the verification dialog
    // where the user will be prompted to enter dates

    return {'success': true}; // All checks passed
  }

  /// Helper: Check if activity is DM type (requires 3 dates: distribution start, end, expected visit).
  /// DM = 3 dates; anything else = 1 date.
  /// Based on: (1) survey_tool/tool_to_be_used == 'DM', or (2) activity text GFA/CBT/EBSFP.
  bool _isDmActivity(Map<String, dynamic> site) {
    // Database: survey_tool or tool_to_be_used = 'DM' means distribution monitoring → 3 dates
    final surveyTool = (site['survey_tool'] ?? site['tool_to_be_used'] ?? '')
        .toString()
        .trim()
        .toUpperCase();
    final ad = site['additional_data'] as Map<String, dynamic>?;
    final fromAdditional = (ad != null)
        ? ((ad['survey_tool'] ?? ad['tool_to_be_used'] ?? '')
              .toString()
              .trim()
              .toUpperCase())
        : '';
    if (surveyTool == 'DM' || fromAdditional == 'DM') return true;

    // Activity labels: GFA, CBT, EBSFP require distribution period
    final main = (site['main_activity'] ?? '').toString();
    final activity = (site['activity'] ?? '').toString();
    final activityAtSite = (site['activity_at_site'] ?? '').toString();
    final combined = '$main $activity $activityAtSite'.toUpperCase();

    return combined.contains('GFA') ||
        combined.contains('CBT') ||
        combined.contains('EBSFP');
  }

  /// Helper: Check if activity is TSFP type (single date, like non-DM).
  /// Used for bulk verify filter: DM = 3 dates, TSFP = 1 date.
  bool _isTsfpActivity(Map<String, dynamic> site) {
    final surveyTool = (site['survey_tool'] ?? site['tool_to_be_used'] ?? '')
        .toString()
        .trim()
        .toUpperCase();
    final ad = site['additional_data'] as Map<String, dynamic>?;
    final fromAdditional = (ad != null)
        ? ((ad['survey_tool'] ?? ad['tool_to_be_used'] ?? '')
              .toString()
              .trim()
              .toUpperCase())
        : '';
    if (surveyTool == 'TSFP' || fromAdditional == 'TSFP') return true;
    final main = (site['main_activity'] ?? '').toString();
    final activity = (site['activity'] ?? '').toString();
    final activityAtSite = (site['activity_at_site'] ?? '').toString();
    final combined = '$main $activity $activityAtSite'.toUpperCase();
    return combined.contains('TSFP');
  }

  /// Helper: Activity type label for bulk verify (DM, TSFP, or Other).
  String _activityFilterLabel(Map<String, dynamic> site) {
    if (_isDmActivity(site)) return 'DM';
    if (_isTsfpActivity(site)) return 'TSFP';
    return 'Other';
  }

  /// Helper: Check if activity requires multiple visits
  bool _isMultiVisitActivity(Map<String, dynamic> site) {
    final activity = site['activity']?.toString() ?? '';
    final mainActivity = site['main_activity']?.toString() ?? '';

    return _multiVisitActivities.any(
      (multi) =>
          activity.toUpperCase().contains(multi.toUpperCase()) ||
          mainActivity.toUpperCase().contains(multi.toUpperCase()),
    );
  }

  /// Helper: Check if activity is urgent (requires immediate visit)
  bool _isUrgentActivity(Map<String, dynamic> site) {
    final activity = site['activity']?.toString() ?? '';
    final mainActivity = site['main_activity']?.toString() ?? '';

    return _urgentActivities.any(
      (urgent) =>
          activity.toUpperCase().contains(urgent.toUpperCase()) ||
          mainActivity.toUpperCase().contains(urgent.toUpperCase()),
    );
  }

  // ============================================================================
  // END CONSTRAINT VALIDATION METHODS
  // ============================================================================

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      key: _scaffoldKey,
      drawer: CustomDrawerMenu(
        currentUser: _supabase.auth.currentUser,
        onClose: () => _scaffoldKey.currentState?.closeDrawer(),
      ),
      backgroundColor: AppColors.backgroundGray,
      body: SafeArea(
        child: Column(
          children: [
            // Header
            ReusableAppBar(
              title: 'Site Verification',
              scaffoldKey: _scaffoldKey,
              actions: [
                HeaderActionButton(
                  icon: Icons.refresh,
                  tooltip: 'Refresh',
                  backgroundColor: AppColors.primaryBlue,
                  color: Colors.white,
                  onPressed: _loadData,
                ),
              ],
            ),

            // ── Custom bilingual scrollable pill tab row ──────────────
            Container(
              color: Colors.white,
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _buildVerifTabButton(
                      'new',
                      'New',
                      'جديد التصاريح',
                      Icons.fiber_new_rounded,
                      _newSites.length,
                      Colors.blue,
                    ),
                    const SizedBox(width: 8),
                    _buildVerifTabButton(
                      'cp_verification',
                      'CP Verification',
                      'تحقق الشريك',
                      Icons.fact_check_outlined,
                      _cpVerificationSites.length,
                      Colors.indigo,
                    ),
                    const SizedBox(width: 8),
                    _buildVerifTabButton(
                      'verified',
                      'Verified',
                      'موكد',
                      Icons.verified_outlined,
                      _verifiedSites.length,
                      Colors.green,
                    ),
                    const SizedBox(width: 8),
                    _buildVerifTabButton(
                      'approved',
                      'Approved',
                      'معتمد',
                      Icons.thumb_up_outlined,
                      _approvedSites.length,
                      Colors.teal,
                    ),
                    const SizedBox(width: 8),
                    _buildVerifTabButton(
                      'completed',
                      'Completed',
                      'مكتمل',
                      Icons.check_circle_outline,
                      _completedSites.length,
                      Colors.purple,
                    ),
                    const SizedBox(width: 8),
                    _buildVerifTabButton(
                      'rejected',
                      'Rejected',
                      'مرفوض',
                      Icons.cancel_outlined,
                      _rejectedSites.length,
                      Colors.red,
                    ),
                  ],
                ),
              ),
            ),
            const Divider(height: 1),

            // Search
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.shadowColor.withValues(alpha: 0.05),
                      blurRadius: 12,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: TextField(
                  decoration: InputDecoration(
                    prefixIcon: Icon(Icons.search),
                    hintText: _bi(
                      'Search — site name, code, state, locality',
                      'بحث — اسم الموقع، الرمز، الولاية، المحلية',
                    ),
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 12,
                    ),
                  ),
                  onChanged: (value) =>
                      setState(() => _searchQuery = value.trim()),
                ),
              ),
            ),

            // MMP Filter bar
            MmpFilterBar(
              mmpOptions: _availableMmps,
              selectedMmpId: _selectedMmpId,
              onChanged: (id) => setState(() => _selectedMmpId = id),
              totalCount: _availableMmps.fold(
                0,
                (sum, m) => sum + (m['count'] as int),
              ),
              filteredCount: _selectedMmpId == null
                  ? _availableMmps.fold(
                      0,
                      (sum, m) => sum + (m['count'] as int),
                    )
                  : (_availableMmps
                            .where((m) => m['id'] == _selectedMmpId)
                            .isNotEmpty
                        ? _availableMmps.firstWhere(
                                (m) => m['id'] == _selectedMmpId,
                              )['count']
                              as int
                        : 0),
            ),

            // Activity filter (All / DM / Non-DM)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(
                    _bi('Activity:', 'النشاط:'),
                    style: GoogleFonts.poppins(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF6B7280),
                    ),
                  ),
                  _buildActivityChip('all', 'All', 'الكل'),
                  _buildActivityChip('dm', 'DM', 'DM'),
                  _buildActivityChip('non_dm', 'Non-DM', 'غير DM'),
                ],
              ),
            ),

            // Content
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : _activeTab == 'cp_verification'
                  ? _buildSiteList(_cpVerificationSites, 'cp_verification')
                  : _activeTab == 'verified'
                  ? _buildSiteList(_verifiedSites, 'verified')
                  : _activeTab == 'approved'
                  ? _buildSiteList(_approvedSites, 'approved')
                  : _activeTab == 'completed'
                  ? _buildSiteList(_completedSites, 'completed')
                  : _activeTab == 'rejected'
                  ? _buildSiteList(_rejectedSites, 'rejected')
                  : _buildNewTabContent(),
            ),
          ],
        ),
      ),
    );
  }

  void _toggleSiteSelection(String? id) {
    if (id == null) return;
    setState(() {
      if (_selectedSiteIds.contains(id)) {
        _selectedSiteIds.remove(id);
      } else {
        _selectedSiteIds.add(id);
      }
    });
  }

  void _toggleReturnSiteSelection(String? id) {
    if (id == null) return;
    setState(() {
      if (_selectedReturnSiteIds.contains(id)) {
        _selectedReturnSiteIds.remove(id);
      } else {
        _selectedReturnSiteIds.add(id);
      }
    });
  }

  List<Map<String, dynamic>> _getSelectedReturnSites(
    List<Map<String, dynamic>> candidates,
  ) {
    return candidates
        .where((s) => _selectedReturnSiteIds.contains(s['id']?.toString()))
        .toList();
  }

  List<Map<String, dynamic>> _getSelectedSitesForBulkVerify() {
    return _cpVerificationSites
        .where((s) => _selectedSiteIds.contains(s['id']?.toString()))
        .toList();
  }

  Widget _buildActivityChip(String value, String labelEn, String labelAr) {
    final isSelected = _activityFilter == value;
    return FilterChip(
      label: Text(
        labelEn,
        style: GoogleFonts.poppins(fontSize: 12, fontWeight: FontWeight.w600),
      ),
      selected: isSelected,
      onSelected: (selected) {
        if (selected) setState(() => _activityFilter = value);
      },
      selectedColor: AppColors.primaryBlue.withValues(alpha: 0.2),
      checkmarkColor: AppColors.primaryBlue,
    );
  }

  /// Bilingual animated pill tab button for site verification tabs
  Widget _buildVerifTabButton(
    String tab,
    String labelEn,
    String labelAr,
    IconData icon,
    int count,
    Color activeColor,
  ) {
    final isActive = _activeTab == tab;
    return GestureDetector(
      onTap: () {
        setState(() {
          if (_activeTab == 'cp_verification' && tab != 'cp_verification') {
            _selectedSiteIds.clear();
          }
          _selectedReturnSiteIds.clear();
          _activeTab = tab;
        });
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: isActive ? activeColor : const Color(0xFFF3F6FA),
          borderRadius: BorderRadius.circular(20),
          boxShadow: isActive
              ? [
                  BoxShadow(
                    color: activeColor.withValues(alpha: 0.25),
                    blurRadius: 8,
                    offset: const Offset(0, 3),
                  ),
                ]
              : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 16,
              color: isActive ? Colors.white : AppColors.textLight,
            ),
            const SizedBox(width: 6),
            Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  labelEn,
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: isActive ? Colors.white : AppColors.textLight,
                  ),
                ),
                Text(
                  labelAr,
                  style: GoogleFonts.poppins(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: isActive
                        ? Colors.white.withValues(alpha: 0.85)
                        : AppColors.textLight,
                  ),
                ),
              ],
            ),
            if (count > 0) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: isActive
                      ? Colors.white.withValues(alpha: 0.3)
                      : activeColor,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  count.toString(),
                  style: GoogleFonts.poppins(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Build New tab content with sub-tabs for State Permit and Locality Permit
}
