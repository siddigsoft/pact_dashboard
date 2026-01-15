// lib/screens/site_verification_screen.dart

import 'dart:io';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import '../theme/app_colors.dart';
import '../models/site_visit.dart';
import '../services/site_visit_service.dart';
import '../l10n/app_localizations.dart';
import '../widgets/custom_drawer_menu.dart';
import '../widgets/reusable_app_bar.dart';
import '../widgets/modern_app_header.dart';

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

/// Site Verification Screen for Coordinators
/// Allows coordinators to verify sites, manage permits, and approve site visits
class SiteVerificationScreen extends StatefulWidget {
  const SiteVerificationScreen({super.key});

  @override
  State<SiteVerificationScreen> createState() => _SiteVerificationScreenState();
}

class _SiteVerificationScreenState extends State<SiteVerificationScreen>
    with SingleTickerProviderStateMixin {
  final SiteVisitService _siteVisitService = SiteVisitService();
  final SupabaseClient _supabase = Supabase.instance.client;
  // Key to control the Scaffold for opening/closing drawer
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();

  late TabController _tabController;
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

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 6, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
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
          _userProjectIds = (response as List)
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

        for (final project in projectsResponse as List) {
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
            .select('*, mmp_files(name, workflow, project_id)')
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
              .select('*, mmp_files(name, workflow, project_id)')
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
              .select('*, mmp_files(name, workflow)')
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

      // Tab 1: NEW - Only show sites with Pending status
      // Note: Dispatched sites and other statuses are excluded
      _newSites = sites.where((s) {
        final rawStatus = s['status']?.toString() ?? '';
        final lowerStatus = rawStatus.toLowerCase();

        // Only include sites with Pending status (case-insensitive)
        return rawStatus == 'Pending' || lowerStatus == 'pending';
      }).toList();

      debugPrint('New sites count: ${_newSites.length}');

      // Tab 2: CP VERIFICATION - Sites with permits attached (status = permits_attached)
      _cpVerificationSites = sites.where((s) {
        final status = s['status']?.toString().toLowerCase() ?? '';

        // Match web app: permits_attached tab is purely status-based
        return status == 'permits_attached';
      }).toList();

      // Tab 3: VERIFIED - Sites verified by coordinator, waiting for approval
      _verifiedSites = sites.where((s) {
        final status = s['status']?.toString().toLowerCase() ?? '';
        return status == 'verified';
      }).toList();

      // Tab 4: APPROVED - Sites approved by hub supervisor
      _approvedSites = sites.where((s) {
        final status = s['status']?.toString().toLowerCase() ?? '';
        return status == 'approved';
      }).toList();

      // Tab 5: COMPLETED - Sites with completed visits
      _completedSites = sites.where((s) {
        final status = s['status']?.toString().toLowerCase() ?? '';
        return status == 'completed';
      }).toList();

      // Tab 6: REJECTED - Sites rejected during verification
      _rejectedSites = sites.where((s) {
        final status = s['status']?.toString().toLowerCase() ?? '';
        // Match web app: rejected tab only shows explicit rejected status
        return status == 'rejected';
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

      if (mounted) {
        setState(() {});
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

    // Check 1: Must be forwarded to this coordinator
    if (forwardedTo != _userId) {
      // Also check additional_data->>'assigned_to'
      final additionalData =
          site['additional_data'] as Map<String, dynamic>? ?? {};
      final assignedTo = additionalData['assigned_to']?.toString();
      if (assignedTo != _userId) {
        debugPrint(
          'Site not assigned to user (forwarded_to: $forwardedTo, assigned_to: $assignedTo)',
        );
        return 'This site is not assigned to you';
      }
    }

    // Check 2: Must be in coordinator's state (normalized comparison)
    if (_userState != null && _userState!.isNotEmpty) {
      // Normalize: lowercase, remove dashes/underscores/spaces
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

    // Check 3: Must be in coordinator's hub (normalized comparison)
    if (_userHub != null && _userHub!.isNotEmpty) {
      final userHubNorm = _userHub!.toLowerCase().replaceAll(
        RegExp(r'[-_\s]'),
        '',
      );
      final siteHubNorm = (siteHub ?? '').toLowerCase().replaceAll(
        RegExp(r'[-_\s]'),
        '',
      );
      if (userHubNorm != siteHubNorm &&
          !siteHubNorm.contains(userHubNorm) &&
          !userHubNorm.contains(siteHubNorm)) {
        debugPrint(
          'Hub mismatch: user hub "$_userHub" ($userHubNorm) vs site hub "$siteHub" ($siteHubNorm)',
        );
        return 'This site is not in your assigned hub ($_userHub)';
      }
    }

    // Check 4: If coordinator assigned to specific locality, normally we'd enforce match,
    // but coordinators should be able to verify any site within their state regardless
    // of locality. We'll log a mismatch but not block verification based on locality.
    if (_userLocality != null && _userLocality!.isNotEmpty) {
      final userLocalityNorm = _userLocality!.toLowerCase().replaceAll(
        RegExp(r'[-_\s]'),
        '',
      );
      final siteLocalityNorm = (siteLocality ?? '').toLowerCase().replaceAll(
        RegExp(r'[-_\s]'),
        '',
      );
      if (userLocalityNorm != siteLocalityNorm &&
          !siteLocalityNorm.contains(userLocalityNorm) &&
          !userLocalityNorm.contains(siteLocalityNorm)) {
        debugPrint(
          'Locality mismatch (ignored): user locality "$_userLocality" ($userLocalityNorm) vs site locality "$siteLocality" ($siteLocalityNorm)',
        );
        // Do NOT return here; coordinators are allowed to verify sites anywhere in their state.
      }
    }

    debugPrint('Regional access validation passed');
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

    // Check state permit
    final hasStatePermit = additionalData['state_permit_attached'] == true;
    final stateNotRequired =
        additionalData['state_permit_not_required'] == true;

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

  /// Helper: Check if activity is DM type (requires distribution period)
  /// Based on CoordinatorSites.tsx - only GFA, CBT, EBSFP
  bool _isDmActivity(Map<String, dynamic> site) {
    // Check main_activity, activity, and activity_at_site (some records use this key)
    final main = (site['main_activity'] ?? '').toString();
    final activity = (site['activity'] ?? '').toString();
    final activityAtSite = (site['activity_at_site'] ?? '').toString();

    final combined = '$main $activity $activityAtSite'.toUpperCase();

    return combined.contains('GFA') ||
        combined.contains('CBT') ||
        combined.contains('EBSFP');
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

            // Tabs container
            Container(
              margin: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.shadowColor.withOpacity(0.06),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: TabBar(
                controller: _tabController,
                isScrollable: true,
                indicator: BoxDecoration(
                  color: AppColors.primaryBlue,
                  borderRadius: BorderRadius.circular(12),
                ),
                indicatorSize: TabBarIndicatorSize.tab,
                labelColor: Colors.white,
                unselectedLabelColor: AppColors.textDark,
                labelStyle: GoogleFonts.poppins(
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
                unselectedLabelStyle: GoogleFonts.poppins(
                  fontWeight: FontWeight.w500,
                  fontSize: 12,
                ),
                tabs: [
                  _buildTab(
                    icon: Icons.fiber_new_rounded,
                    label: 'New',
                    count: _newSites.length,
                    badgeColor: AppColors.primaryBlue,
                  ),
                  _buildTab(
                    icon: Icons.fact_check_outlined,
                    label: 'CP Verification',
                    count: _cpVerificationSites.length,
                    badgeColor: Colors.blue,
                  ),
                  _buildTab(
                    icon: Icons.verified_outlined,
                    label: 'Verified',
                    count: _verifiedSites.length,
                    badgeColor: Colors.green,
                  ),
                  _buildTab(
                    icon: Icons.thumb_up_outlined,
                    label: 'Approved',
                    count: _approvedSites.length,
                    badgeColor: Colors.teal,
                  ),
                  _buildTab(
                    icon: Icons.check_circle_outline,
                    label: 'Completed',
                    count: _completedSites.length,
                    badgeColor: Colors.purple,
                  ),
                  _buildTab(
                    icon: Icons.cancel_outlined,
                    label: 'Rejected',
                    count: _rejectedSites.length,
                    badgeColor: Colors.red,
                    highlightIfNonZero: true,
                  ),
                ],
              ),
            ),

            // Search
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.shadowColor.withOpacity(0.05),
                      blurRadius: 12,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: TextField(
                  decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.search),
                    hintText: 'Search by site name, code, state, or locality',
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 12,
                    ),
                  ),
                  onChanged: (value) {
                    setState(() {
                      _searchQuery = value.trim();
                    });
                  },
                ),
              ),
            ),

            // Content
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : TabBarView(
                      controller: _tabController,
                      children: [
                        _buildNewTabContent(),
                        _buildSiteList(_cpVerificationSites, 'cp_verification'),
                        _buildSiteList(_verifiedSites, 'verified'),
                        _buildSiteList(_approvedSites, 'approved'),
                        _buildSiteList(_completedSites, 'completed'),
                        _buildSiteList(_rejectedSites, 'rejected'),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }

  /// Build a styled tab with icon, label, and badge
  Widget _buildTab({
    required IconData icon,
    required String label,
    required int count,
    required Color badgeColor,
    bool highlightIfNonZero = false,
  }) {
    final showHighlight = highlightIfNonZero && count > 0;

    return Tab(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(5),
              decoration: BoxDecoration(
                color: showHighlight
                    ? Colors.red.withOpacity(0.3)
                    : Colors.white.withOpacity(0.2),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Icon(icon, size: 14),
            ),
            const SizedBox(width: 6),
            Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(fontSize: 12)),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 1,
                  ),
                  decoration: BoxDecoration(
                    color: showHighlight
                        ? Colors.red
                        : badgeColor.withOpacity(0.3),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '$count',
                    style: GoogleFonts.poppins(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Build New tab content with sub-tabs for State Permit and Locality Permit
  Widget _buildNewTabContent() {
    if (_newSites.isEmpty) {
      return _buildEmptyState('new');
    }

    final filteredNewSites = _applySearchFilter(_newSites);

    if (filteredNewSites.isEmpty) {
      return _buildEmptyState('new');
    }

    // Filter sites that need STATE permit (don't have state permit yet)
    final sitesNeedingStatePermit = filteredNewSites.where((s) {
      final additionalData =
          s['additional_data'] as Map<String, dynamic>? ?? {};
      return additionalData['state_permit_attached'] != true &&
          additionalData['state_permit_not_required'] != true;
    }).toList();

    // Filter sites that need LOCALITY permit (have state permit but not locality)
    final sitesNeedingLocalityPermit = filteredNewSites.where((s) {
      final additionalData =
          s['additional_data'] as Map<String, dynamic>? ?? {};
      final hasStatePermit =
          additionalData['state_permit_attached'] == true ||
          additionalData['state_permit_not_required'] == true;
      return hasStatePermit &&
          additionalData['locality_permit_attached'] != true;
    }).toList();

    // Group sites needing state permit by state
    final sitesByState = <String, List<Map<String, dynamic>>>{};
    for (final site in sitesNeedingStatePermit) {
      final state = site['state']?.toString() ?? 'Unknown';
      sitesByState.putIfAbsent(state, () => []).add(site);
    }

    // Group sites needing locality permit by locality
    final sitesByLocality = <String, List<Map<String, dynamic>>>{};
    for (final site in sitesNeedingLocalityPermit) {
      final state = site['state']?.toString() ?? 'Unknown';
      final locality = site['locality']?.toString() ?? 'Unknown';
      sitesByLocality.putIfAbsent('$state - $locality', () => []).add(site);
    }

    return Column(
      children: [
        // Sub-tab selector with counts
        Container(
          margin: const EdgeInsets.all(12),
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: Colors.grey[200],
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _newSubTabIndex = 0),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: _newSubTabIndex == 0
                          ? AppColors.primaryBlue
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.warning_amber_rounded,
                          size: 16,
                          color: _newSubTabIndex == 0
                              ? Colors.white
                              : Colors.grey[600],
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'State (${sitesNeedingStatePermit.length})',
                          style: GoogleFonts.poppins(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: _newSubTabIndex == 0
                                ? Colors.white
                                : Colors.grey[600],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _newSubTabIndex = 1),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: _newSubTabIndex == 1
                          ? AppColors.primaryBlue
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.location_on_outlined,
                          size: 16,
                          color: _newSubTabIndex == 1
                              ? Colors.white
                              : Colors.grey[600],
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'Locality (${sitesNeedingLocalityPermit.length})',
                          style: GoogleFonts.poppins(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: _newSubTabIndex == 1
                                ? Colors.white
                                : Colors.grey[600],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        // Sub-tab content
        Expanded(
          child: _newSubTabIndex == 0
              ? _buildStatePermitSubTab(sitesByState)
              : _buildLocalityPermitSubTab(sitesByLocality),
        ),
      ],
    );
  }

  /// Build State Permit sub-tab content grouped by state
  Widget _buildStatePermitSubTab(
    Map<String, List<Map<String, dynamic>>> sitesByState,
  ) {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      itemCount: sitesByState.length,
      itemBuilder: (context, index) {
        final state = sitesByState.keys.elementAt(index);
        final sites = sitesByState[state]!;
        final sitesNeedingStatePermit = sites.where((s) {
          final additionalData =
              s['additional_data'] as Map<String, dynamic>? ?? {};
          return additionalData['state_permit_attached'] != true &&
              additionalData['state_permit_not_required'] != true;
        }).toList();

        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          elevation: 2,
          child: ExpansionTile(
            leading: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppColors.backgroundGray,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                Icons.warning_amber_rounded,
                color: AppColors.primaryBlue,
                size: 20,
              ),
            ),
            title: Text(
              state,
              style: GoogleFonts.poppins(
                fontWeight: FontWeight.w600,
                fontSize: 15,
              ),
            ),
            subtitle: Text(
              '${sitesNeedingStatePermit.length} sites need state permit',
              style: GoogleFonts.poppins(fontSize: 12, color: Colors.grey[600]),
            ),
            trailing: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppColors.primaryBlue.withOpacity(0.12),
                ),
              ),
              child: Text(
                '${sites.length}',
                style: GoogleFonts.poppins(
                  color: AppColors.primaryBlue,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            children: [
              if (sitesNeedingStatePermit.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          icon: const Icon(Icons.upload_file),
                          label: Text(
                            'Manage state permit (${sitesNeedingStatePermit.length})',
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.white,
                            foregroundColor: AppColors.primaryBlue,
                            side: BorderSide(
                              color: AppColors.primaryBlue.withOpacity(0.12),
                            ),
                            elevation: 0,
                          ),
                          onPressed: () => _handleStateCardClick(state, sites),
                        ),
                      ),
                    ],
                  ),
                ),
              ...sites.map((site) => _buildSiteCard(site, 'new')),
            ],
          ),
        );
      },
    );
  }

  /// Build Locality Permit sub-tab content grouped by locality
  Widget _buildLocalityPermitSubTab(
    Map<String, List<Map<String, dynamic>>> sitesByLocality,
  ) {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      itemCount: sitesByLocality.length,
      itemBuilder: (context, index) {
        final locality = sitesByLocality.keys.elementAt(index);
        final sites = sitesByLocality[locality]!;
        final sitesNeedingLocalityPermit = sites.where((s) {
          final additionalData =
              s['additional_data'] as Map<String, dynamic>? ?? {};
          return additionalData['locality_permit_attached'] != true;
        }).toList();

        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          elevation: 2,
          child: ExpansionTile(
            leading: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.blue.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.location_on_outlined,
                color: Colors.blue,
                size: 20,
              ),
            ),
            title: Row(
              children: [
                Expanded(
                  child: Text(
                    locality,
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                ),
                if (sites.any((s) {
                  final additional =
                      s['additional_data'] as Map<String, dynamic>? ?? {};
                  return additional['locality_permit_skipped'] == true;
                }))
                  Container(
                    margin: const EdgeInsets.only(left: 8),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: AppColors.primaryBlue.withOpacity(0.12),
                      ),
                    ),
                    child: Text(
                      'Skipped',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        color: AppColors.primaryBlue,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
              ],
            ),
            subtitle: Text(
              '${sitesNeedingLocalityPermit.length} sites need locality permit',
              style: GoogleFonts.poppins(fontSize: 12, color: Colors.grey[600]),
            ),
            trailing: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.blue,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                '${sites.length}',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            // Use 'locality_permit' category for different handling
            children: [
              if (sitesNeedingLocalityPermit.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          icon: const Icon(Icons.upload_file),
                          label: Text(
                            'Upload locality permit (${sitesNeedingLocalityPermit.length})',
                          ),
                          onPressed: () {
                            final parts = locality.split(' - ');
                            final stateName = parts.isNotEmpty ? parts[0] : '';
                            final localityName = parts.length > 1
                                ? parts[1]
                                : '';
                            _handleLocalityCardClick(
                              stateName,
                              localityName,
                              sites,
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              ...sites.map((site) => _buildSiteCard(site, 'locality_permit')),
            ],
          ),
        );
      },
    );
  }

  /// Build empty state widget
  Widget _buildEmptyState(String category) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: AppColors.primaryBlue.withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(
              _getEmptyIcon(category),
              size: 64,
              color: AppColors.primaryBlue.withOpacity(0.5),
            ),
          ),
          const SizedBox(height: 24),
          Text(
            _getEmptyMessage(category),
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.w500,
              color: Colors.grey[600],
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildSiteList(List<Map<String, dynamic>> sites, String category) {
    final filteredSites = _applySearchFilter(sites);

    if (filteredSites.isEmpty) {
      if (sites.isNotEmpty && _searchQuery.isNotEmpty) {
        return Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.search_off, size: 64, color: const Color(0xFF9CA3AF)),
              const SizedBox(height: 12),
              Text(
                'No sites match your search',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  color: const Color(0xFF6B7280),
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () {
                  setState(() => _searchQuery = '');
                },
                child: const Text('Clear search'),
              ),
            ],
          ),
        );
      }

      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: AppColors.primaryBlue.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(
                _getEmptyIcon(category),
                size: 64,
                color: AppColors.primaryBlue.withOpacity(0.5),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              _getEmptyMessage(category),
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: const Color(0xFF374151),
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              _getEmptySubMessage(category),
              style: GoogleFonts.poppins(
                fontSize: 13,
                color: const Color(0xFF6B7280),
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 18),
            ElevatedButton.icon(
              onPressed: _loadData,
              icon: const Icon(Icons.refresh),
              label: const Text('Refresh'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryBlue,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                elevation: 3,
              ),
            ),
          ],
        ),
      );
    }

    // Special grouping for CP Verification: group sites by state + locality
    if (category == 'cp_verification') {
      final grouped = <String, List<Map<String, dynamic>>>{};
      for (final site in filteredSites) {
        final state = site['state']?.toString() ?? 'Unknown';
        final locality = site['locality']?.toString() ?? 'Unknown';
        final key = '$state - $locality';
        grouped.putIfAbsent(key, () => []).add(site);
      }

      return RefreshIndicator(
        color: AppColors.primaryBlue,
        onRefresh: _loadData,
        child: ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: grouped.length,
          itemBuilder: (context, index) {
            final key = grouped.keys.elementAt(index);
            final localitySites = grouped[key]!;
            final parts = key.split(' - ');
            final stateName = parts.isNotEmpty ? parts[0] : '';
            final localityName = parts.length > 1 ? parts[1] : '';

            return Card(
              margin: const EdgeInsets.only(bottom: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              elevation: 3,
              child: Column(
                children: [
                  // Header row for group
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                stateName,
                                style: GoogleFonts.poppins(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 15,
                                  color: const Color(0xFF111827),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                localityName,
                                style: GoogleFonts.poppins(
                                  fontSize: 12,
                                  color: const Color(0xFF6B7280),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 12),
                        ElevatedButton.icon(
                          onPressed: () => _showBulkVerifyDialog(
                            stateName,
                            localityName,
                            localitySites,
                          ),
                          icon: const Icon(Icons.verified, size: 18),
                          label: Text('Verify All (${localitySites.length})'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF10B981),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 10,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            textStyle: GoogleFonts.poppins(
                              fontWeight: FontWeight.w600,
                            ),
                            elevation: 6,
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Divider
                  const Divider(height: 1),

                  // Site list under group
                  Column(
                    children: localitySites.map((s) {
                      return Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                        child: _buildSiteCard(s, category),
                      );
                    }).toList(),
                  ),
                ],
              ),
            );
          },
        ),
      );
    }

    return RefreshIndicator(
      color: AppColors.primaryBlue,
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: sites.length,
        itemBuilder: (context, index) {
          final site = sites[index];
          return _buildSiteCard(site, category);
        },
      ),
    );
  }

  IconData _getEmptyIcon(String category) {
    switch (category) {
      case 'new':
        return Icons.fiber_new_rounded;
      case 'cp_verification':
        return Icons.fact_check_outlined;
      case 'verified':
        return Icons.verified_user;
      case 'approved':
        return Icons.thumb_up_outlined;
      case 'completed':
        return Icons.check_circle_outline;
      case 'rejected':
        return Icons.cancel_outlined;
      default:
        return Icons.folder;
    }
  }

  String _getEmptyMessage(String category) {
    switch (category) {
      case 'new':
        return 'No new sites';
      case 'cp_verification':
        return 'No sites ready for CP verification';
      case 'verified':
        return 'No verified sites';
      case 'approved':
        return 'No approved sites';
      case 'completed':
        return 'No completed sites';
      case 'rejected':
        return 'No rejected sites';
      default:
        return 'No sites found';
    }
  }

  String _getEmptySubMessage(String category) {
    switch (category) {
      case 'new':
        return 'Newly assigned sites requiring permit verification will appear here';
      case 'cp_verification':
        return 'Sites with permits attached and ready for verification';
      case 'verified':
        return 'Sites verified by you, waiting for supervisor approval';
      case 'approved':
        return 'Sites approved by hub supervisor';
      case 'completed':
        return 'Sites with completed visits and payment info';
      case 'rejected':
        return 'Rejected sites that need re-verification';
      default:
        return '';
    }
  }

  List<Map<String, dynamic>> _applySearchFilter(
    List<Map<String, dynamic>> sites,
  ) {
    if (_searchQuery.isEmpty) {
      return sites;
    }

    final query = _searchQuery.toLowerCase();

    return sites.where((site) {
      final name = site['site_name']?.toString().toLowerCase() ?? '';
      final code = site['site_code']?.toString().toLowerCase() ?? '';
      final locality = site['locality']?.toString().toLowerCase() ?? '';
      final state = site['state']?.toString().toLowerCase() ?? '';

      return name.contains(query) ||
          code.contains(query) ||
          locality.contains(query) ||
          state.contains(query);
    }).toList();
  }

  Widget _buildSiteCard(Map<String, dynamic> site, String category) {
    final siteName = site['site_name']?.toString() ?? 'Unknown Site';
    final siteCode = site['site_code']?.toString() ?? '';
    final locality = site['locality']?.toString() ?? '';
    final state = site['state']?.toString() ?? '';
    final status = site['status']?.toString() ?? '';
    final additionalData =
        site['additional_data'] as Map<String, dynamic>? ?? {};
    final mmpFile = site['mmp_files'] as Map<String, dynamic>? ?? {};
    final projectName = mmpFile['name']?.toString() ?? '';

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 3,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: Colors.white,
          boxShadow: [
            BoxShadow(
              color: AppColors.shadowColor.withOpacity(0.06),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: InkWell(
          onTap: () => _showSiteDetails(site, category),
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header row
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: _getStatusColor(status).withOpacity(0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(
                        _getStatusIcon(status),
                        color: _getStatusColor(status),
                        size: 24,
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            siteName,
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w600,
                              fontSize: 16,
                              color: const Color(0xFF111827),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            siteCode,
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              color: const Color(0xFF6B7280),
                              letterSpacing: 0.5,
                            ),
                          ),
                          if (projectName.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 6,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.backgroundGray,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.folder,
                                    size: 14,
                                    color: AppColors.textDark,
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    projectName,
                                    style: GoogleFonts.poppins(
                                      fontSize: 12,
                                      color: const Color(0xFF374151),
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    _buildStatusChip(status),
                  ],
                ),
                const SizedBox(height: 16),
                // Location info with improved styling
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF9FAFB),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: const Color(0xFFE5E7EB),
                      width: 1,
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: AppColors.primaryBlue.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(
                          Icons.location_on,
                          size: 16,
                          color: AppColors.primaryBlue,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              locality,
                              style: GoogleFonts.poppins(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: const Color(0xFF374151),
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              state,
                              style: GoogleFonts.poppins(
                                fontSize: 11,
                                color: const Color(0xFF6B7280),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                if (projectName.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Icon(
                        Icons.folder_outlined,
                        size: 16,
                        color: const Color(0xFF9CA3AF),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          projectName,
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: const Color(0xFF6B7280),
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ],

                // Coordinator summary fields (CP, Activity, Tool)
                const SizedBox(height: 8),
                if (additionalData['cp_name'] != null) ...[
                  Row(
                    children: [
                      Icon(
                        Icons.person_outline,
                        size: 14,
                        color: const Color(0xFF9CA3AF),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          additionalData['cp_name'].toString(),
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: const Color(0xFF374151),
                            fontWeight: FontWeight.w600,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                ],

                if ((site['main_activity'] ?? '').toString().isNotEmpty ||
                    (site['activity_at_site'] ?? '').toString().isNotEmpty) ...[
                  Row(
                    children: [
                      Icon(
                        Icons.work_outline,
                        size: 14,
                        color: const Color(0xFF9CA3AF),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '${site['main_activity'] ?? ''} ${(site['activity_at_site'] ?? '')}'
                              .trim(),
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: const Color(0xFF6B7280),
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                ],

                if (additionalData['survey_tool'] != null) ...[
                  Row(
                    children: [
                      Icon(
                        Icons.analytics_outlined,
                        size: 14,
                        color: const Color(0xFF9CA3AF),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Tool: ${additionalData['survey_tool'].toString()}',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: const Color(0xFF6B7280),
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                ],

                // Flag indicator
                if (additionalData['isFlagged'] == true) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.red.withOpacity(0.08),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.red.withOpacity(0.12)),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.report_problem, size: 14, color: Colors.red),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Flagged: ${additionalData['flagReason'] ?? 'Issue reported'}',
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              color: Colors.red[700],
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                // Permit status indicators
                const SizedBox(height: 16),
                _buildPermitIndicators(additionalData),
                // Action buttons based on category
                if (category == 'new' ||
                    category == 'locality_permit' ||
                    category == 'cp_verification' ||
                    category == 'rejected') ...[
                  const SizedBox(height: 16),
                  _buildActionButtons(site, category),
                ],
              ],
            ),
          ),
        ),
      ),
    ).animate().fadeIn(duration: 300.ms);
  }

  Widget _buildStatusChip(String status) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: _getStatusColor(status).withOpacity(0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: _getStatusColor(status).withOpacity(0.3),
          width: 1.5,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: _getStatusColor(status),
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            _formatStatus(status),
            style: GoogleFonts.poppins(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: _getStatusColor(status),
            ),
          ),
        ],
      ),
    );
  }

  String _formatStatus(String status) {
    return status
        .replaceAll('_', ' ')
        .split(' ')
        .map(
          (word) => word.isNotEmpty
              ? '${word[0].toUpperCase()}${word.substring(1).toLowerCase()}'
              : '',
        )
        .join(' ');
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'pending':
      case 'dispatched':
      case 'assigned':
        return AppColors.primaryBlue;
      case 'permits_attached':
        return Colors.blue;
      case 'verified':
        return Colors.green;
      case 'returned_to_fom':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  IconData _getStatusIcon(String status) {
    switch (status.toLowerCase()) {
      case 'pending':
      case 'dispatched':
      case 'assigned':
        return Icons.pending_actions;
      case 'permits_attached':
        return Icons.attach_file;
      case 'verified':
        return Icons.verified;
      case 'returned_to_fom':
        return Icons.undo;
      default:
        return Icons.help_outline;
    }
  }

  Widget _buildPermitIndicators(Map<String, dynamic> additionalData) {
    final hasStatePermit = additionalData['state_permit_attached'] == true;
    final stateNotRequired =
        additionalData['state_permit_not_required'] == true;
    final hasLocalityPermit =
        additionalData['locality_permit_attached'] == true;

    return Row(
      children: [
        Expanded(
          child: _buildPermitChip(
            'State Permit',
            hasStatePermit
                ? 'Attached'
                : stateNotRequired
                ? 'N/A'
                : 'Pending',
            hasStatePermit || stateNotRequired,
            Icons.shield_outlined,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _buildPermitChip(
            'Locality',
            hasLocalityPermit ? 'Attached' : 'Pending',
            hasLocalityPermit,
            Icons.location_city_outlined,
          ),
        ),
      ],
    );
  }

  Widget _buildPermitChip(
    String label,
    String status,
    bool isComplete,
    IconData icon,
  ) {
    final color = isComplete ? const Color(0xFF10B981) : AppColors.primaryBlue;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withOpacity(0.2), width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 14, color: color),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  label,
                  style: GoogleFonts.poppins(
                    fontSize: 10,
                    fontWeight: FontWeight.w500,
                    color: const Color(0xFF6B7280),
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 4,
                height: 4,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              const SizedBox(width: 4),
              Text(
                status,
                style: GoogleFonts.poppins(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildActionButtons(Map<String, dynamic> site, String category) {
    final additionalData =
        site['additional_data'] as Map<String, dynamic>? ?? {};
    final hasStatePermit =
        additionalData['state_permit_attached'] == true ||
        additionalData['state_permit_not_required'] == true;
    final hasLocalityPermit =
        additionalData['locality_permit_attached'] == true;

    if (category == 'new') {
      // Show Upload Permits button for new sites
      return Row(
        children: [
          Expanded(
            child: ElevatedButton.icon(
              onPressed: () => _showPermitVerificationDialog(site),
              icon: Icon(
                !hasStatePermit
                    ? Icons.upload_file
                    : !hasLocalityPermit
                    ? Icons.location_on
                    : Icons.check_circle,
                size: 18,
              ),
              label: Text(
                !hasStatePermit
                    ? 'Upload State Permit'
                    : !hasLocalityPermit
                    ? 'Upload Locality Permit'
                    : 'Permits Complete',
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryBlue,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                textStyle: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                elevation: 6,
                shadowColor: AppColors.primaryBlue.withOpacity(0.25),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => _returnToFOM(site),
              icon: const Icon(Icons.undo, size: 18),
              label: const Text('Return'),
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFFEF4444),
                side: const BorderSide(color: Color(0xFFEF4444), width: 1.5),
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ],
      );
    } else if (category == 'locality_permit') {
      // Sites in Locality Permit tab - state permit already uploaded
      // Show dialog asking if state permit is uploaded before proceeding to locality
      return Row(
        children: [
          Expanded(
            child: ElevatedButton.icon(
              onPressed: () => _showLocalityPermitDialog(site),
              icon: const Icon(Icons.location_on, size: 18),
              label: const Text('Permit Status'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryBlue,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                textStyle: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                elevation: 6,
                shadowColor: AppColors.primaryBlue.withOpacity(0.25),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => _returnToFOM(site),
              icon: const Icon(Icons.undo, size: 18),
              label: const Text('Return'),
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFFEF4444),
                side: const BorderSide(color: Color(0xFFEF4444), width: 1.5),
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ],
      );
    } else if (category == 'cp_verification') {
      // Show Verify Site button for CP verification sites
      return SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: () => _verifySite(site),
          icon: const Icon(Icons.verified, size: 20),
          label: const Text('Verify Site'),
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF10B981),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            textStyle: GoogleFonts.poppins(
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
            elevation: 6,
            shadowColor: const Color(0xFF10B981).withOpacity(0.25),
          ),
        ),
      );
    } else if (category == 'rejected') {
      // Show Re-verify button for rejected sites
      return Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => _verifySite(site),
              icon: Icon(Icons.refresh, size: 18, color: AppColors.primaryBlue),
              label: const Text('Re-verify Site'),
              style: OutlinedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: AppColors.primaryBlue,
                side: BorderSide(
                  color: AppColors.primaryBlue.withOpacity(0.12),
                ),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                textStyle: GoogleFonts.poppins(fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      );
    }
    return const SizedBox.shrink();
  }

  void _showSiteDetails(Map<String, dynamic> site, String category) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _SiteDetailsSheet(
        site: site,
        category: category,
        onVerify: () => _verifySite(site),
        onReturn: () => _returnToFOM(site),
        onPermitVerify: () => _showPermitVerificationDialog(site),
      ),
    );
  }

  void _showPermitVerificationDialog(Map<String, dynamic> site) {
    showDialog(
      context: context,
      builder: (context) => _PermitVerificationDialog(
        site: site,
        onComplete: (permitDecision) async {
          await _updatePermitDecision(site, permitDecision);
        },
        onSendBackToFOM: (reason) async {
          // Handle sending back to FOM
          await _returnToFOMWithReason(site, reason);
        },
      ),
    );
  }

  Future<void> _returnToFOMWithReason(
    Map<String, dynamic> site,
    String reason,
  ) async {
    try {
      setState(() => _isLoading = true);

      final siteId = site['id'].toString();

      await _supabase
          .from('mmp_site_entries')
          .update({
            'status': 'returned_to_fom',
            'verification_notes': reason,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', siteId);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Site returned to FOM: $reason'),
            backgroundColor: AppColors.primaryBlue,
          ),
        );
      }

      await _loadData();
    } catch (e) {
      debugPrint('Error returning site to FOM: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  /// Show Locality Permit Dialog for sites in Locality Permit tab
  /// This dialog first asks if locality permit is required, then proceeds accordingly
  void _showLocalityPermitDialog(Map<String, dynamic> site) async {
    final locality = site['locality']?.toString() ?? '';
    final state = site['state']?.toString() ?? '';

    // First show locality permit requirement dialog
    final requirementResult = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => _BulkLocalityPermitRequirementDialog(
        locality: locality,
        state: state,
        siteCount: 1,
      ),
    );

    if (requirementResult == null) return;

    final localityPermitRequirement = requirementResult['requirement'];

    // If not required, mark as not required
    if (localityPermitRequirement == 'not_required') {
      await _markLocalityPermitNotRequiredSingle(site);
      return;
    }

    // If required but don't have it, show follow-up options
    if (localityPermitRequirement == 'required_dont_have_it') {
      final followUpResult = await showDialog<Map<String, dynamic>>(
        context: context,
        builder: (context) => _BulkLocalityPermitFollowUpDialog(
          locality: locality,
          state: state,
          siteCount: 1,
        ),
      );

      if (followUpResult == null) return;

      final followUpChoice = followUpResult['canWorkWithout'];

      if (followUpChoice == 'yes') {
        // Can proceed without - complete without upload
        await _completeLocalityWithoutUploadSingle(site);
      } else {
        // Cannot proceed - send back to FOM
        await _sendSiteBackToFOM(
          site,
          'Locality permit is required for $locality but coordinator cannot proceed without it.',
        );
      }
      return;
    }

    // If required and will upload, proceed to upload dialog
    showDialog(
      context: context,
      builder: (context) => _LocalityPermitDialog(
        site: site,
        onComplete: (decision) async {
          Navigator.pop(context);
          await _updateLocalityPermitDecision(site, decision);
        },
        onStatePermitMissing: () {
          // If state permit is not uploaded, redirect to full permit dialog
          Navigator.pop(context);
          _showPermitVerificationDialog(site);
        },
        startOnUpload: true,
        initialStateConfirmed:
            true, // assume state is uploaded since in locality tab
      ),
    );
  }

  /// Update locality permit decision - simplified flow for Locality Permit tab
  Future<void> _updateLocalityPermitDecision(
    Map<String, dynamic> site,
    Map<String, dynamic> decision,
  ) async {
    try {
      setState(() => _isLoading = true);

      final siteId = site['id'].toString();
      final additionalData = Map<String, dynamic>.from(
        site['additional_data'] as Map<String, dynamic>? ?? {},
      );

      // Mark locality permit as uploaded
      if (decision['locality_permit_uploaded'] == true) {
        additionalData['locality_permit_attached'] = true;
        additionalData['locality_permit_uploaded_at'] = DateTime.now()
            .toIso8601String();
        additionalData['locality_permit_uploaded_by'] = _userId;

        // If coordinator provided issue/expiry dates, persist them in additional_data
        if (decision['locality_permit_issue_date'] != null) {
          additionalData['locality_permit_issue_date'] =
              decision['locality_permit_issue_date'];
        }
        if (decision['locality_permit_expiry_date'] != null) {
          additionalData['locality_permit_expiry_date'] =
              decision['locality_permit_expiry_date'];
        }

        // Attach metadata into mmp_files.permits.localPermits for discoverability/search
        final mmpFiles = Map<String, dynamic>.from(
          site['mmp_files'] as Map<String, dynamic>? ?? {},
        );
        final permits = Map<String, dynamic>.from(
          mmpFiles['permits'] as Map<String, dynamic>? ?? {},
        );
        final localPermits = List<Map<String, dynamic>>.from(
          permits['localPermits'] as List? ?? [],
        );

        final newLocalPermit = {
          'uploaded_at': additionalData['locality_permit_uploaded_at'],
          'uploaded_by': additionalData['locality_permit_uploaded_by'],
          if (additionalData['locality_permit_issue_date'] != null)
            'issue_date': additionalData['locality_permit_issue_date'],
          if (additionalData['locality_permit_expiry_date'] != null)
            'expiry_date': additionalData['locality_permit_expiry_date'],
          'source': 'coordinator',
        };

        localPermits.add(newLocalPermit);
        permits['localPermits'] = localPermits;
        mmpFiles['permits'] = permits;

        // Since state permit is already verified (that's why it's in locality tab),
        // move to permits_attached status and persist mmp_files + additional data
        try {
          await _supabase
              .from('mmp_site_entries')
              .update({
                'status': 'permits_attached',
                'additional_data': additionalData,
                'mmp_files': mmpFiles,
                'updated_at': DateTime.now().toIso8601String(),
              })
              .eq('id', siteId);
        } catch (e) {
          // Some deployments may not have an `mmp_files` column in the table.
          // Fall back to updating only additional_data to avoid hard failures.
          final err = e.toString();
          debugPrint('Failed updating with mmp_files: $err');

          if (err.contains("Could not find the 'mmp_files' column")) {
            try {
              await _supabase
                  .from('mmp_site_entries')
                  .update({
                    'status': 'permits_attached',
                    'additional_data': additionalData,
                    'updated_at': DateTime.now().toIso8601String(),
                  })
                  .eq('id', siteId);

              debugPrint('Updated site without mmp_files column fallback.');
            } catch (e2) {
              debugPrint('Fallback update also failed: $e2');
              rethrow;
            }
          } else {
            rethrow;
          }
        }

        // Try to also insert a record into coordinator_locality_permits table for indexing
        try {
          await _supabase.from('coordinator_locality_permits').insert({
            'site_entry_id': siteId,
            'uploaded_at': additionalData['locality_permit_uploaded_at'],
            'uploaded_by': additionalData['locality_permit_uploaded_by'],
            'issue_date': additionalData['locality_permit_issue_date'],
            'expiry_date': additionalData['locality_permit_expiry_date'],
            'metadata': {'source': 'mobile_coordinator'},
          });
        } catch (e) {
          final err = e.toString();
          debugPrint(
            'Could not insert coordinator_locality_permits record: $err',
          );
          if (err.contains(
            "Could not find the table 'public.coordinator_locality_permits'",
          )) {
            debugPrint(
              'coordinator_locality_permits table not found; skipping insert.',
            );
          }
        }

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Row(
                children: [
                  const Icon(Icons.check_circle, color: Colors.white),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Locality permit uploaded - Site ready for verification',
                      style: GoogleFonts.poppins(),
                    ),
                  ),
                ],
              ),
              backgroundColor: Colors.green,
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
          );
        }
      }

      await _loadData();
    } catch (e) {
      debugPrint('Error updating locality permit: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _updatePermitDecision(
    Map<String, dynamic> site,
    PermitDecision decision,
  ) async {
    try {
      setState(() => _isLoading = true);

      final siteId = site['id'].toString();
      final additionalData = Map<String, dynamic>.from(
        site['additional_data'] as Map<String, dynamic>? ?? {},
      );

      // Attachable mmp_files/permits metadata
      final mmpFiles = Map<String, dynamic>.from(
        site['mmp_files'] as Map<String, dynamic>? ?? {},
      );
      final permits = Map<String, dynamic>.from(
        mmpFiles['permits'] as Map<String, dynamic>? ?? {},
      );

      // ========================================================================
      // CONSTRAINT 2: PERMIT GATE LOGIC
      // ========================================================================

      // Update additional_data with permit decision
      additionalData['permit_decision'] = decision.toJson();

      // Determine new status based on permit decision
      String newStatus = site['status']?.toString() ?? 'Pending';
      String? notificationMessage;

      final stateReq = decision.statePermit.requirement;
      final canWorkWithout = decision.statePermit.canWorkWithout;

      // STATE PERMIT GATE
      if (stateReq == 'required_dont_have_it' && canWorkWithout == 'no') {
        // TIER 1 BLOCKING: State permit required but not available + cannot proceed
        newStatus = 'returned_to_fom';
        additionalData['return_reason'] =
            'State permit required but not available - Cannot proceed without permit';
        additionalData['returned_at'] = DateTime.now().toIso8601String();
        additionalData['returned_by'] = _userId;
        notificationMessage = 'Site returned to FOM - State permit required';
      } else if (stateReq == 'required_have_it') {
        // State permit uploaded - mark as attached
        additionalData['state_permit_attached'] = true;
        additionalData['state_permit_verified_at'] = DateTime.now()
            .toIso8601String();
        additionalData['state_permit_verified_by'] = _userId;

        // If coordinator supplied dates with the decision, persist them
        if (decision.statePermit.issueDate != null) {
          additionalData['state_permit_issue_date'] =
              decision.statePermit.issueDate;
        }
        if (decision.statePermit.expiryDate != null) {
          additionalData['state_permit_expiry_date'] =
              decision.statePermit.expiryDate;
        }

        // Attach metadata into mmp_files.permits.statePermits for discoverability/search
        final statePermits = List<Map<String, dynamic>>.from(
          permits['statePermits'] as List? ?? [],
        );

        final newStatePermit = {
          'uploaded_at': additionalData['state_permit_verified_at'],
          'uploaded_by': additionalData['state_permit_verified_by'],
          if (additionalData['state_permit_issue_date'] != null)
            'issue_date': additionalData['state_permit_issue_date'],
          if (additionalData['state_permit_expiry_date'] != null)
            'expiry_date': additionalData['state_permit_expiry_date'],
          'state': site['state']?.toString() ?? '',
          'source': 'coordinator',
        };

        statePermits.add(newStatePermit);
        permits['statePermits'] = statePermits;
        mmpFiles['permits'] = permits;

        // Check locality permit
        if (decision.localityPermit.uploaded) {
          additionalData['locality_permit_attached'] = true;
          additionalData['locality_permit_uploaded_at'] = DateTime.now()
              .toIso8601String();
          newStatus = 'permits_attached'; // Ready for verification
          notificationMessage =
              'All permits attached - Site ready for verification';
        } else {
          // Don't change site status here; wait for locality permit
          notificationMessage =
              'State permit recorded - Upload locality permit to continue';
        }
      } else if (stateReq == 'not_required') {
        // State permit not required - skip to locality
        additionalData['state_permit_not_required'] = true;
        additionalData['state_permit_decision_at'] = DateTime.now()
            .toIso8601String();

        // Check locality permit
        if (decision.localityPermit.uploaded) {
          additionalData['locality_permit_attached'] = true;
          additionalData['locality_permit_uploaded_at'] = DateTime.now()
              .toIso8601String();
          newStatus = 'permits_attached'; // Ready for verification
          notificationMessage = 'Permits ready - Site can now be verified';
        } else {
          // Don't change site status here; wait for locality permit
          notificationMessage =
              'State permit not required - Upload locality permit to continue';
        }
      } else if (stateReq == 'required_dont_have_it' &&
          canWorkWithout == 'yes') {
        // Can proceed without state permit
        additionalData['state_permit_can_work_without'] = true;
        // Mark as not required so validation allows proceeding to locality
        additionalData['state_permit_not_required'] = true;
        additionalData['state_permit_decision_at'] = DateTime.now()
            .toIso8601String();

        // Check locality permit
        if (decision.localityPermit.uploaded) {
          additionalData['locality_permit_attached'] = true;
          additionalData['locality_permit_uploaded_at'] = DateTime.now()
              .toIso8601String();
          newStatus = 'permits_attached'; // Ready for verification
          notificationMessage =
              'Proceeding without state permit - Site ready for verification';
        } else {
          // Don't change site status here; wait for locality permit
          notificationMessage =
              'State permit skipped - Upload locality permit to continue';
        }
      } else if (stateReq == 'required_dont_have_it' &&
          (canWorkWithout == null || canWorkWithout == 'no')) {
        // State permit required but not available - wait for locality permit
        additionalData['state_permit_required_but_missing'] = true;
        additionalData['state_permit_decision_at'] = DateTime.now()
            .toIso8601String();

        // Check locality permit
        if (decision.localityPermit.uploaded) {
          additionalData['locality_permit_attached'] = true;
          additionalData['locality_permit_uploaded_at'] = DateTime.now()
              .toIso8601String();
          newStatus = 'permits_attached'; // Ready for verification
          notificationMessage =
              'Locality permit uploaded - State permit still required but missing';
        } else {
          // Don't change site status here; wait for locality permit
          notificationMessage =
              'State permit required but missing - Upload locality permit to continue';
        }
      }

      // Update the site entry (include mmp_files when available)
      try {
        await _supabase
            .from('mmp_site_entries')
            .update({
              'status': newStatus,
              'additional_data': additionalData,
              'mmp_files': mmpFiles,
              'updated_at': DateTime.now().toIso8601String(),
            })
            .eq('id', siteId);
      } catch (e) {
        final err = e.toString();
        debugPrint('Failed updating mmp_files: $err');

        if (err.contains("Could not find the 'mmp_files' column")) {
          // Fallback to update ONLY additional_data
          await _supabase
              .from('mmp_site_entries')
              .update({
                'status': newStatus,
                'additional_data': additionalData,
                'updated_at': DateTime.now().toIso8601String(),
              })
              .eq('id', siteId);
        } else {
          rethrow;
        }
      }

      // If a state permit was uploaded, try to insert a coordinator_state_permits record (best-effort)
      if (decision.statePermit.uploaded) {
        try {
          await _supabase.from('coordinator_state_permits').insert({
            'site_entry_id': siteId,
            'uploaded_at': additionalData['state_permit_verified_at'],
            'uploaded_by': additionalData['state_permit_verified_by'],
            'issue_date': additionalData['state_permit_issue_date'],
            'expiry_date': additionalData['state_permit_expiry_date'],
            'state': site['state']?.toString() ?? '',
            'metadata': {'source': 'mobile_coordinator'},
          });
        } catch (e) {
          debugPrint('Could not insert coordinator_state_permits record: $e');
        }
      }

      // Locality permit info is stored in additional_data on mmp_site_entries
      // No need for separate coordinator_locality_permits table
      if (decision.localityPermit.uploaded) {
        final siteLocality = site['locality']?.toString();
        final siteState = site['state']?.toString();
        debugPrint(
          'Locality permit marked as uploaded for $siteLocality, $siteState',
        );
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                Icon(
                  newStatus == 'returned_to_fom'
                      ? Icons.undo
                      : newStatus == 'permits_attached'
                      ? Icons.check_circle
                      : Icons.info_outline,
                  color: Colors.white,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    notificationMessage ?? 'Permit status updated',
                    style: GoogleFonts.poppins(),
                  ),
                ),
              ],
            ),
            backgroundColor: newStatus == 'returned_to_fom'
                ? AppColors.primaryBlue
                : newStatus == 'permits_attached'
                ? Colors.green
                : AppColors.primaryBlue,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        );
      }

      await _loadData();
    } catch (e) {
      debugPrint('Error updating permit decision: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  // Bulk handlers: state permit, locality permit, and locality verification
  Future<void> _handleStateCardClick(
    String state,
    List<Map<String, dynamic>> sites,
  ) async {
    // If any site in state already has a state permit or marked not required, show info and still allow decision
    final firstSite = sites.isNotEmpty ? sites.first : null;
    if (firstSite == null) return;

    final PermitDecision? decision = await showDialog<PermitDecision>(
      context: context,
      builder: (context) => _PermitVerificationDialog(
        site: firstSite,
        onComplete: (d) => Navigator.of(context).pop(d),
      ),
    );

    if (decision == null) return;

    await _bulkUpdateStatePermit(state, decision);
  }

  Future<void> _bulkUpdateStatePermit(
    String state,
    PermitDecision decision,
  ) async {
    try {
      setState(() => _isLoading = true);

      final sitesInState = _newSites
          .where((s) => (s['state']?.toString() ?? '') == state)
          .toList();
      int updated = 0;
      for (final site in sitesInState) {
        final siteId = site['id'].toString();
        final additionalData = Map<String, dynamic>.from(
          site['additional_data'] as Map<String, dynamic>? ?? {},
        );
        additionalData['permit_decision'] = decision.toJson();

        final stateReq = decision.statePermit.requirement;
        final canWorkWithout = decision.statePermit.canWorkWithout;

        String newStatus = site['status']?.toString() ?? 'Pending';

        if (stateReq == 'required_dont_have_it' && canWorkWithout == 'no') {
          newStatus = 'returned_to_fom';
          additionalData['return_reason'] =
              'State permit required but not available - Cannot proceed without permit';
          additionalData['returned_at'] = DateTime.now().toIso8601String();
          additionalData['returned_by'] = _userId;
        } else if (stateReq == 'required_have_it') {
          additionalData['state_permit_attached'] = true;
          additionalData['state_permit_verified_at'] = DateTime.now()
              .toIso8601String();
          additionalData['state_permit_verified_by'] = _userId;

          if (decision.statePermit.issueDate != null) {
            additionalData['state_permit_issue_date'] =
                decision.statePermit.issueDate;
          }
          if (decision.statePermit.expiryDate != null) {
            additionalData['state_permit_expiry_date'] =
                decision.statePermit.expiryDate;
          }
          // Do not change status here; wait for locality permits
        } else if (stateReq == 'not_required') {
          additionalData['state_permit_not_required'] = true;
          additionalData['state_permit_decision_at'] = DateTime.now()
              .toIso8601String();
          // Do not change status here; wait for locality permits
        } else if (stateReq == 'required_dont_have_it' &&
            canWorkWithout == 'yes') {
          additionalData['state_permit_can_work_without'] = true;
          // Mark as not required so mobile validation allows proceeding
          additionalData['state_permit_not_required'] = true;
          additionalData['state_permit_decision_at'] = DateTime.now()
              .toIso8601String();
          // Do not change status here; wait for locality permits
        }

        await _supabase
            .from('mmp_site_entries')
            .update({
              'status': newStatus,
              'additional_data': additionalData,
              'updated_at': DateTime.now().toIso8601String(),
            })
            .eq('id', siteId);

        updated++;
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Updated $updated site(s) for state $state'),
            backgroundColor: Colors.green,
          ),
        );
      }
      await _loadData();
    } catch (e) {
      debugPrint('Error performing bulk state update: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleLocalityCardClick(
    String state,
    String locality,
    List<Map<String, dynamic>> sites,
  ) async {
    final firstSite = sites.isNotEmpty ? sites.first : null;
    if (firstSite == null) return;

    // First show locality permit requirement dialog
    final requirementResult = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => _BulkLocalityPermitRequirementDialog(
        locality: locality,
        state: state,
        siteCount: sites.length,
      ),
    );

    if (requirementResult == null) return;

    final localityPermitRequirement = requirementResult['requirement'];

    // If not required, mark as not required for all sites
    if (localityPermitRequirement == 'not_required') {
      await _markLocalityPermitNotRequired(state, locality, sites);
      return;
    }

    // If required but don't have it, show follow-up options
    if (localityPermitRequirement == 'required_dont_have_it') {
      final followUpResult = await showDialog<Map<String, dynamic>>(
        context: context,
        builder: (context) => _BulkLocalityPermitFollowUpDialog(
          locality: locality,
          state: state,
          siteCount: sites.length,
        ),
      );

      if (followUpResult == null) return;

      final followUpChoice = followUpResult['canWorkWithout'];

      if (followUpChoice == 'yes') {
        // Can proceed without - complete with locality required but not uploaded
        await _completeBulkLocalityWithoutUpload(state, locality, sites);
      } else {
        // Cannot proceed - send back to FOM
        await _sendBulkSitesBackToFOM(
          state,
          locality,
          sites,
          'Locality permit is required for $locality but coordinator cannot proceed without it.',
        );
      }
      return;
    }

    // If required and will upload, proceed to upload dialog
    final siteAdditional = Map<String, dynamic>.from(
      firstSite['additional_data'] as Map<String, dynamic>? ?? {},
    );
    final hasStatePermit =
        siteAdditional['state_permit_attached'] == true ||
        siteAdditional['state_permit_not_required'] == true;

    final Map<String, dynamic>? decision =
        await showDialog<Map<String, dynamic>>(
          context: context,
          builder: (context) => _LocalityPermitDialog(
            site: firstSite,
            onComplete: (d) => Navigator.of(context).pop(d),
            onStatePermitMissing: () {
              Navigator.of(context).pop(); // close and show a note
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(
                    'State permit not found - upload state permit first',
                  ),
                  backgroundColor: AppColors.primaryBlue,
                ),
              );
            },
            startOnUpload: true,
            initialStateConfirmed: hasStatePermit,
          ),
        );

    if (decision == null) return;

    // If the user chose to proceed without locality permit, handle specially
    if (decision['proceed_without_locality_permit'] == true) {
      await _proceedWithoutLocalityPermit(state, locality, sites);
      return;
    }

    await _bulkUpdateLocalityPermit(state, locality, decision);
  }

  Future<void> _markLocalityPermitNotRequired(
    String state,
    String locality,
    List<Map<String, dynamic>> sites,
  ) async {
    try {
      setState(() => _isLoading = true);

      int updated = 0;

      for (final site in sites) {
        final siteId = site['id'].toString();
        final additionalData = Map<String, dynamic>.from(
          site['additional_data'] as Map<String, dynamic>? ?? {},
        );

        additionalData['locality_permit_not_required'] = true;
        additionalData['locality_permit_requirement_set_at'] = DateTime.now()
            .toIso8601String();
        additionalData['locality_permit_requirement_set_by'] = _userId;

        try {
          await _supabase
              .from('mmp_site_entries')
              .update({
                'additional_data': additionalData,
                'status': 'permits_attached',
                'updated_at': DateTime.now().toIso8601String(),
              })
              .eq('id', siteId);
          updated++;
        } catch (e) {
          debugPrint('Failed to update site $siteId: $e');
        }
      }

      setState(() => _isLoading = false);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Marked locality permit as not required for $updated site(s)',
            ),
            backgroundColor: Colors.green,
          ),
        );
      }
      await _loadData();
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error updating sites: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _completeBulkLocalityWithoutUpload(
    String state,
    String locality,
    List<Map<String, dynamic>> sites,
  ) async {
    try {
      setState(() => _isLoading = true);

      int updated = 0;

      for (final site in sites) {
        final siteId = site['id'].toString();
        final additionalData = Map<String, dynamic>.from(
          site['additional_data'] as Map<String, dynamic>? ?? {},
        );

        additionalData['locality_permit_required_but_not_uploaded'] = true;
        additionalData['locality_permit_requirement_set_at'] = DateTime.now()
            .toIso8601String();
        additionalData['locality_permit_requirement_set_by'] = _userId;

        try {
          await _supabase
              .from('mmp_site_entries')
              .update({
                'additional_data': additionalData,
                'status': 'permits_attached',
                'updated_at': DateTime.now().toIso8601String(),
              })
              .eq('id', siteId);
          updated++;
        } catch (e) {
          debugPrint('Failed to update site $siteId: $e');
        }
      }

      setState(() => _isLoading = false);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Completed locality verification without upload for $updated site(s)',
            ),
            backgroundColor: Colors.green,
          ),
        );
      }
      await _loadData();
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error updating sites: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _sendBulkSitesBackToFOM(
    String state,
    String locality,
    List<Map<String, dynamic>> sites,
    String reason,
  ) async {
    try {
      setState(() => _isLoading = true);

      final eligibleStatuses = [
        'Pending',
        'Dispatched',
        'assigned',
        'inProgress',
        'in_progress',
      ];
      final targetSites = _newSites.where((s) {
        final sState = (s['state']?.toString() ?? '');
        final sLocality = (s['locality']?.toString() ?? '');
        final status = s['status']?.toString() ?? '';
        return sState == state &&
            sLocality == locality &&
            eligibleStatuses.contains(status);
      }).toList();

      int updated = 0;

      for (final site in targetSites) {
        final siteId = site['id'].toString();
        final additionalData = Map<String, dynamic>.from(
          site['additional_data'] as Map<String, dynamic>? ?? {},
        );

        additionalData['sent_back_to_fom'] = true;
        additionalData['sent_back_reason'] = reason;
        additionalData['sent_back_at'] = DateTime.now().toIso8601String();
        additionalData['sent_back_by'] = _userId;

        try {
          await _supabase
              .from('mmp_site_entries')
              .update({
                'status': 'returned_to_fom',
                'additional_data': additionalData,
                'updated_at': DateTime.now().toIso8601String(),
              })
              .eq('id', siteId);
          updated++;
        } catch (e) {
          debugPrint('Failed to update site $siteId: $e');
        }
      }

      setState(() => _isLoading = false);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Sent $updated site(s) back to FOM: $reason'),
            backgroundColor: Colors.orange,
          ),
        );
      }
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error sending sites back to FOM: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  // Single site versions for individual locality verification
  Future<void> _markLocalityPermitNotRequiredSingle(
    Map<String, dynamic> site,
  ) async {
    try {
      setState(() => _isLoading = true);

      final siteId = site['id'].toString();
      final additionalData = Map<String, dynamic>.from(
        site['additional_data'] as Map<String, dynamic>? ?? {},
      );

      additionalData['locality_permit_not_required'] = true;
      additionalData['locality_permit_requirement_set_at'] = DateTime.now()
          .toIso8601String();
      additionalData['locality_permit_requirement_set_by'] = _userId;

      await _supabase
          .from('mmp_site_entries')
          .update({
            'additional_data': additionalData,
            'status': 'permits_attached',
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', siteId);

      setState(() => _isLoading = false);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Locality permit marked as not required - moved to CP verification',
            ),
            backgroundColor: Colors.green,
          ),
        );
      }
      await _loadData();
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error updating site: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _completeLocalityWithoutUploadSingle(
    Map<String, dynamic> site,
  ) async {
    try {
      setState(() => _isLoading = true);

      final siteId = site['id'].toString();
      final additionalData = Map<String, dynamic>.from(
        site['additional_data'] as Map<String, dynamic>? ?? {},
      );

      final localityPermit =
          additionalData['locality_permit'] as Map<String, dynamic>? ?? {};
      localityPermit['requirement'] = 'required_dont_have_it';
      localityPermit['canWorkWithout'] = 'yes';
      additionalData['locality_permit'] = localityPermit;

      await _supabase
          .from('mmp_site_entries')
          .update({
            'additional_data': additionalData,
            'status': 'permits_attached',
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', siteId);

      setState(() => _isLoading = false);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Proceeding without locality permit - moved to CP verification',
            ),
            backgroundColor: Colors.green,
          ),
        );
      }
      await _loadData();
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error updating site: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _sendSiteBackToFOM(
    Map<String, dynamic> site,
    String reason,
  ) async {
    try {
      setState(() => _isLoading = true);

      final siteId = site['id'].toString();
      final additionalData = Map<String, dynamic>.from(
        site['additional_data'] as Map<String, dynamic>? ?? {},
      );

      additionalData['sent_back_to_fom'] = true;
      additionalData['sent_back_reason'] = reason;
      additionalData['sent_back_at'] = DateTime.now().toIso8601String();
      additionalData['sent_back_by'] = _userId;

      await _supabase
          .from('mmp_site_entries')
          .update({
            'status': 'returned_to_fom',
            'additional_data': additionalData,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', siteId);

      setState(() => _isLoading = false);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Site sent back to FOM: $reason'),
            backgroundColor: Colors.orange,
          ),
        );
      }
      await _loadData();
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error sending site back to FOM: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _bulkUpdateLocalityPermit(
    String state,
    String locality,
    Map<String, dynamic> decision,
  ) async {
    try {
      setState(() => _isLoading = true);

      final eligibleStatuses = [
        'Pending',
        'Dispatched',
        'assigned',
        'inProgress',
        'in_progress',
      ];
      final targetSites = _newSites.where((s) {
        final sState = (s['state']?.toString() ?? '');
        final sLocality = (s['locality']?.toString() ?? '');
        final status = s['status']?.toString() ?? '';
        return sState == state &&
            sLocality == locality &&
            eligibleStatuses.contains(status);
      }).toList();

      int updated = 0;
      // Track whether we've observed missing DB schema to avoid repeated attempts/log noise
      bool mmpFilesColumnMissing = false;
      bool coordLocalityTableMissing = false;

      for (final site in targetSites) {
        final siteId = site['id'].toString();
        final additionalData = Map<String, dynamic>.from(
          site['additional_data'] as Map<String, dynamic>? ?? {},
        );

        additionalData['locality_permit_attached'] = true;
        additionalData['locality_permit_uploaded_at'] = DateTime.now()
            .toIso8601String();
        additionalData['locality_permit_uploaded_by'] = _userId;

        if (decision['locality_permit_issue_date'] != null) {
          additionalData['locality_permit_issue_date'] =
              decision['locality_permit_issue_date'];
        }
        if (decision['locality_permit_expiry_date'] != null) {
          additionalData['locality_permit_expiry_date'] =
              decision['locality_permit_expiry_date'];
        }

        // Attempt mmp_files update like single-update flow (best-effort)
        final mmpFiles = Map<String, dynamic>.from(
          site['mmp_files'] as Map<String, dynamic>? ?? {},
        );
        final permits = Map<String, dynamic>.from(
          mmpFiles['permits'] as Map<String, dynamic>? ?? {},
        );
        final localPermits = List<Map<String, dynamic>>.from(
          permits['localPermits'] as List? ?? [],
        );

        final newLocalPermit = {
          'uploaded_at': additionalData['locality_permit_uploaded_at'],
          'uploaded_by': additionalData['locality_permit_uploaded_by'],
          if (additionalData['locality_permit_issue_date'] != null)
            'issue_date': additionalData['locality_permit_issue_date'],
          if (additionalData['locality_permit_expiry_date'] != null)
            'expiry_date': additionalData['locality_permit_expiry_date'],
          'source': 'coordinator',
        };

        localPermits.add(newLocalPermit);
        permits['localPermits'] = localPermits;
        mmpFiles['permits'] = permits;

        if (!mmpFilesColumnMissing) {
          try {
            await _supabase
                .from('mmp_site_entries')
                .update({
                  'status': 'permits_attached',
                  'additional_data': additionalData,
                  'mmp_files': mmpFiles,
                  'updated_at': DateTime.now().toIso8601String(),
                })
                .eq('id', siteId);
          } catch (e) {
            final err = e.toString();
            debugPrint(
              'Failed updating mmp_files during bulk locality update: $err',
            );
            if (err.contains("Could not find the 'mmp_files' column")) {
              mmpFilesColumnMissing = true;
              // Fallback to update without mmp_files
              await _supabase
                  .from('mmp_site_entries')
                  .update({
                    'status': 'permits_attached',
                    'additional_data': additionalData,
                    'updated_at': DateTime.now().toIso8601String(),
                  })
                  .eq('id', siteId);
            } else {
              rethrow;
            }
          }
        } else {
          // Column already known to be missing; do the simpler update
          await _supabase
              .from('mmp_site_entries')
              .update({
                'status': 'permits_attached',
                'additional_data': additionalData,
                'updated_at': DateTime.now().toIso8601String(),
              })
              .eq('id', siteId);
        }

        // Try to insert a coordinator_locality_permits record (best-effort)
        if (!coordLocalityTableMissing) {
          try {
            await _supabase.from('coordinator_locality_permits').insert({
              'site_entry_id': siteId,
              'uploaded_at': additionalData['locality_permit_uploaded_at'],
              'uploaded_by': additionalData['locality_permit_uploaded_by'],
              'issue_date': additionalData['locality_permit_issue_date'],
              'expiry_date': additionalData['locality_permit_expiry_date'],
              'metadata': {'source': 'mobile_coordinator_bulk'},
            });
          } catch (e) {
            final err = e.toString();
            debugPrint(
              'Could not insert coordinator_locality_permits record during bulk: $err',
            );
            if (err.contains(
              "Could not find the table 'public.coordinator_locality_permits'",
            )) {
              coordLocalityTableMissing = true;
              debugPrint(
                'coordinator_locality_permits table not found; skipping further inserts.',
              );
            }
          }
        }

        updated++;
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Uploaded locality permit for $updated site(s) in $locality, $state',
            ),
            backgroundColor: Colors.green,
          ),
        );
      }

      await _loadData();
    } catch (e) {
      debugPrint('Error performing bulk locality update: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _proceedWithoutLocalityPermit(
    String state,
    String locality,
    List<Map<String, dynamic>> sites,
  ) async {
    try {
      setState(() => _isLoading = true);

      final eligibleStatuses = [
        'Pending',
        'Dispatched',
        'assigned',
        'inProgress',
        'in_progress',
      ];
      final targetSites = sites.where((s) {
        final status = s['status']?.toString() ?? '';
        return eligibleStatuses.contains(status);
      }).toList();

      int updated = 0;
      for (final site in targetSites) {
        final siteId = site['id'].toString();
        final additionalData = Map<String, dynamic>.from(
          site['additional_data'] as Map<String, dynamic>? ?? {},
        );

        additionalData['locality_permit_skipped'] = true;
        additionalData['locality_permit_skipped_at'] = DateTime.now()
            .toIso8601String();
        additionalData['locality_permit_skipped_by'] = _userId;

        await _supabase
            .from('mmp_site_entries')
            .update({
              'status': 'permits_attached',
              'additional_data': additionalData,
              'updated_at': DateTime.now().toIso8601String(),
            })
            .eq('id', siteId);

        // Insert an audit record for the skip action (best-effort)
        try {
          await _supabase.from('coordinator_locality_permits').insert({
            'site_entry_id': siteId,
            'uploaded_at': additionalData['locality_permit_skipped_at'],
            'uploaded_by': additionalData['locality_permit_skipped_by'],
            'issue_date': additionalData['locality_permit_issue_date'],
            'expiry_date': additionalData['locality_permit_expiry_date'],
            'metadata': {'source': 'mobile_coordinator_skip', 'skipped': true},
          });
        } catch (e) {
          debugPrint(
            'Could not insert coordinator_locality_permits skip record: $e',
          );
        }

        updated++;
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Proceeding without local permit for $updated site(s) in $locality, $state',
            ),
            backgroundColor: Colors.green,
          ),
        );
      }
      await _loadData();
    } catch (e) {
      debugPrint('Error during proceed without locality permit: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _showBulkVerifyDialog(
    String state,
    String locality,
    List<Map<String, dynamic>> sites,
  ) async {
    // Determine activity mix across sites
    final anyDm = sites.any((s) => _isDmActivity(s));
    final anyMulti = sites.any((s) => _isMultiVisitActivity(s));
    final anyUrgent = sites.any((s) => _isUrgentActivity(s));

    final firstSite = sites.isNotEmpty ? sites.first : null;
    if (firstSite == null) return;

    // Use the existing VerificationDialog to collect the relevant dates/inputs
    final Map<String, dynamic>? result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => _VerificationDialog(
        site: firstSite,
        isDMActivity: anyDm,
        isMultiVisitActivity: anyMulti,
        isUrgentActivity: anyUrgent,
      ),
    );

    if (result == null) return;

    await _bulkVerifyLocality(state, locality, sites, result);
  }

  Future<void> _bulkVerifyLocality(
    String state,
    String locality,
    List<Map<String, dynamic>> sites,
    Map<String, dynamic> result,
  ) async {
    try {
      setState(() => _isLoading = true);

      // Validate result depending on activity types
      final activityType = result['activity_type'] as String? ?? 'standard';
      final visitDate = result['visit_date'] as DateTime?;
      final distributionStart = result['distribution_start'] as DateTime?;
      final distributionEnd = result['distribution_end'] as DateTime?;
      final followUpDate = result['follow_up_date'] as DateTime?;
      final requiresFollowUp = result['requires_follow_up'] as bool? ?? false;
      final verificationNotes =
          (result['verification_notes'] as String?)?.trim() ?? '';

      if (visitDate == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text('Please select a visit date'),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }

      if (activityType == 'distribution') {
        if (distributionStart == null || distributionEnd == null) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: const Text(
                  'Please select distribution start and end dates',
                ),
                backgroundColor: Colors.red,
              ),
            );
          }
          return;
        }
        if (visitDate.isBefore(distributionStart) ||
            visitDate.isAfter(distributionEnd)) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: const Text(
                  'Visit date must be within distribution period',
                ),
                backgroundColor: Colors.red,
              ),
            );
          }
          return;
        }
      }

      if (activityType == 'multi_visit' && requiresFollowUp) {
        if (followUpDate == null) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: const Text('Please select a follow-up date'),
                backgroundColor: Colors.red,
              ),
            );
          }
          return;
        }
        if (followUpDate.isBefore(visitDate)) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: const Text(
                  'Follow-up date must be after the primary visit',
                ),
                backgroundColor: Colors.red,
              ),
            );
          }
          return;
        }
      }

      int updated = 0;

      for (final site in sites) {
        final siteId = site['id'].toString();
        final existingAdditionalData =
            site['additional_data'] as Map<String, dynamic>? ?? {};

        // Determine per-site activity type (use site-specific detection)
        final isDm = _isDmActivity(site);
        final isMulti = _isMultiVisitActivity(site);
        final isUrgent = _isUrgentActivity(site);

        // Build expected_visit per site
        final Map<String, dynamic> expectedVisit;
        if (isDm) {
          expectedVisit = {
            'type': 'range',
            'start_date': DateFormat('yyyy-MM-dd').format(distributionStart!),
            'end_date': DateFormat('yyyy-MM-dd').format(distributionEnd!),
            'expected_date': DateFormat('yyyy-MM-dd').format(visitDate),
          };
        } else if (isMulti) {
          expectedVisit = {
            'type': 'multi_visit',
            'primary_visit': DateFormat('yyyy-MM-dd').format(visitDate),
            'follow_up_visit': requiresFollowUp && followUpDate != null
                ? DateFormat('yyyy-MM-dd').format(followUpDate)
                : null,
            'requires_follow_up': requiresFollowUp,
          };
        } else if (isUrgent) {
          expectedVisit = {
            'type': 'urgent',
            'expected_date': DateFormat('yyyy-MM-dd').format(visitDate),
            'priority': 'high',
          };
        } else {
          expectedVisit = {
            'type': 'single',
            'expected_date': DateFormat('yyyy-MM-dd').format(visitDate),
          };
        }

        final updatedAdditionalData = {
          ...existingAdditionalData,
          'expected_visit': expectedVisit,
          'cp_verification': {
            'status': 'verified',
            'verified_at': DateTime.now().toIso8601String(),
            'verified_by': _userId,
          },
        };

        final updatePayload = {
          'status': 'verified',
          'verified_at': DateTime.now().toIso8601String(),
          'verified_by': _userId,
          'visit_date': DateFormat('yyyy-MM-dd').format(visitDate),
          'additional_data': updatedAdditionalData,
          'updated_at': DateTime.now().toIso8601String(),
        };

        if (verificationNotes.isNotEmpty) {
          updatePayload['verification_notes'] = verificationNotes;
        }

        await _supabase
            .from('mmp_site_entries')
            .update(updatePayload)
            .eq('id', siteId);

        final mmpFileId = site['mmp_file_id']?.toString();
        if (mmpFileId != null && mmpFileId.isNotEmpty) {
          await _updateMmpWorkflowAfterVerification(mmpFileId);
        }

        updated++;
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Verified $updated site(s) in $locality, $state'),
            backgroundColor: Colors.green,
          ),
        );
      }
      await _loadData();
    } catch (e) {
      debugPrint('Error during bulk verify: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _verifySite(Map<String, dynamic> site) async {
    // ========================================================================
    // CONSTRAINT 5: PRE-VERIFICATION CHECKS
    // ========================================================================
    final preCheck = _performPreVerificationChecks(site);

    if (!preCheck['success']) {
      final tier = preCheck['tier'] as int;
      final error = preCheck['error'] as String;

      if (tier == 1) {
        // TIER 1: BLOCKING - Show error and prevent verification
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: Row(
              children: [
                Icon(Icons.error_outline, color: Colors.red, size: 28),
                const SizedBox(width: 12),
                const Text('Cannot Verify'),
              ],
            ),
            content: Text(error),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('OK'),
              ),
            ],
          ),
        );
        return;
      } else if (tier == 2) {
        // TIER 2: WARNING - Ask for confirmation
        final proceed = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: Row(
              children: [
                Icon(
                  Icons.warning_amber,
                  color: AppColors.primaryBlue,
                  size: 28,
                ),
                const SizedBox(width: 12),
                const Text('Warning'),
              ],
            ),
            content: Text('$error\n\nDo you want to proceed anyway?'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () => Navigator.pop(context, true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primaryBlue,
                ),
                child: const Text('Proceed'),
              ),
            ],
          ),
        );

        if (proceed != true) return;
      }
    }

    // Check if this is a DM activity that requires date range
    // Uses the same logic as CoordinatorSites.tsx - check for GFA, CBT, EBSFP
    final mainActivity = (site['main_activity'] ?? '').toString().toUpperCase();
    final activity = (site['activity'] ?? '').toString().toUpperCase();

    final isDMActivity = _isDmActivity(site);
    final isMultiVisitActivity = _isMultiVisitActivity(site);
    final isUrgentActivity = _isUrgentActivity(site);

    // Debug logging - include activity_at_site for clarity
    debugPrint(
      'Activity detection: main=${site['main_activity'] ?? ''}, activity=${site['activity'] ?? ''}, activity_at_site=${site['activity_at_site'] ?? ''}',
    );
    debugPrint(
      'isDMActivity=$isDMActivity, isMultiVisit=$isMultiVisitActivity, isUrgent=$isUrgentActivity',
    );

    // Optional visual debug during development: show a short message when opened in debug mode
    assert(() {
      // ignore: avoid_print
      print(
        'DEBUG: DM detection -> $isDMActivity (combined="${(site['main_activity'] ?? '')} ${(site['activity'] ?? '')} ${(site['activity_at_site'] ?? '')}")',
      );
      return true;
    }());

    // Show verification dialog with date inputs
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      barrierDismissible: false,
      builder: (context) => _VerificationDialog(
        site: site,
        isDMActivity: isDMActivity,
        isMultiVisitActivity: isMultiVisitActivity,
        isUrgentActivity: isUrgentActivity,
      ),
    );

    if (result == null) return; // User cancelled

    final visitDate = result['visit_date'] as DateTime?;
    final distributionStart = result['distribution_start'] as DateTime?;
    final distributionEnd = result['distribution_end'] as DateTime?;
    final followUpDate = result['follow_up_date'] as DateTime?;
    final activityType = result['activity_type'] as String? ?? 'standard';
    final requiresFollowUp = result['requires_follow_up'] as bool? ?? false;
    final verificationNotes =
        (result['verification_notes'] as String?)?.trim() ?? '';

    // Validate dates based on activity type
    if (visitDate == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Please select a visit date'),
            backgroundColor: Colors.red,
          ),
        );
      }
      return;
    }

    // Validate activity-specific requirements
    if (activityType == 'distribution') {
      if (distributionStart == null || distributionEnd == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text(
                'Please select distribution start and end dates',
              ),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }

      // Validate visit date is within distribution period
      if (visitDate.isBefore(distributionStart) ||
          visitDate.isAfter(distributionEnd)) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text(
                'Visit date must be within the distribution period',
              ),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }
    } else if (activityType == 'multi_visit' && requiresFollowUp) {
      if (followUpDate == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text('Please select a follow-up date'),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }

      // Validate follow-up is after primary visit
      if (followUpDate.isBefore(visitDate)) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text(
                'Follow-up date must be after the primary visit',
              ),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }
    }

    try {
      setState(() => _isLoading = true);

      final siteId = site['id'].toString();
      final mmpFileId = site['mmp_file_id']?.toString();

      // Build expected_visit data based on activity type
      final Map<String, dynamic> expectedVisit;
      final activityType = result['activity_type'] as String? ?? 'standard';

      if (activityType == 'distribution') {
        expectedVisit = {
          'type': 'range',
          'start_date': DateFormat('yyyy-MM-dd').format(distributionStart!),
          'end_date': DateFormat('yyyy-MM-dd').format(distributionEnd!),
          'expected_date': DateFormat('yyyy-MM-dd').format(visitDate),
        };
      } else if (activityType == 'multi_visit') {
        final requiresFollowUp = result['requires_follow_up'] as bool? ?? false;
        final followUpDate = result['follow_up_date'] as DateTime?;
        expectedVisit = {
          'type': 'multi_visit',
          'primary_visit': DateFormat('yyyy-MM-dd').format(visitDate),
          'follow_up_visit': requiresFollowUp && followUpDate != null
              ? DateFormat('yyyy-MM-dd').format(followUpDate)
              : null,
          'requires_follow_up': requiresFollowUp,
        };
      } else if (activityType == 'urgent') {
        expectedVisit = {
          'type': 'urgent',
          'expected_date': DateFormat('yyyy-MM-dd').format(visitDate),
          'priority': 'high',
        };
      } else {
        expectedVisit = {
          'type': 'single',
          'expected_date': DateFormat('yyyy-MM-dd').format(visitDate),
        };
      }

      // Update additional_data with expected_visit
      final existingAdditionalData =
          site['additional_data'] as Map<String, dynamic>? ?? {};
      final updatedAdditionalData = {
        ...existingAdditionalData,
        'expected_visit': expectedVisit,
        'cp_verification': {
          'status': 'verified',
          'verified_at': DateTime.now().toIso8601String(),
          'verified_by': _userId,
        },
      };

      // ========================================================================
      // CONSTRAINT 6: POST-VERIFICATION ACTIONS
      // ========================================================================

      // Action 1: Update mmp_site_entries with visit date and status
      final updatePayload = {
        'status': 'verified',
        'verified_at': DateTime.now().toIso8601String(),
        'verified_by': _userId,
        'visit_date': DateFormat('yyyy-MM-dd').format(visitDate),
        'additional_data': updatedAdditionalData,
        'updated_at': DateTime.now().toIso8601String(),
      };

      if (verificationNotes.isNotEmpty) {
        updatePayload['verification_notes'] = verificationNotes;
      }

      await _supabase
          .from('mmp_site_entries')
          .update(updatePayload)
          .eq('id', siteId);

      // Action 2: Update MMP file workflow
      if (mmpFileId != null && mmpFileId.isNotEmpty) {
        await _updateMmpWorkflowAfterVerification(mmpFileId);
      }

      // Action 3: Create notifications (handled by database triggers/service)
      // The NotificationTriggerService should handle this automatically
      // But we can also call it explicitly here if needed
      // Action 4: Success message
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.check_circle, color: Colors.white),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Site "${site['site_name']}" verified successfully',
                    style: GoogleFonts.poppins(),
                  ),
                ),
              ],
            ),
            backgroundColor: Colors.green,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        );
      }

      await _loadData();
    } catch (e) {
      debugPrint('Error verifying site: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.error_outline, color: Colors.white),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Error verifying site: $e',
                    style: GoogleFonts.poppins(),
                  ),
                ),
              ],
            ),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _updateMmpWorkflowAfterVerification(String mmpFileId) async {
    if (mmpFileId.isEmpty) {
      return;
    }

    try {
      final mmpFile = await _supabase
          .from('mmp_files')
          .select('workflow')
          .eq('id', mmpFileId)
          .maybeSingle();

      if (mmpFile != null) {
        final workflow = Map<String, dynamic>.from(
          mmpFile['workflow'] as Map<String, dynamic>? ?? {},
        );

        final nowIso = DateTime.now().toIso8601String();

        workflow['coordinatorVerified'] = true;
        workflow['coordinatorVerifiedAt'] = nowIso;
        workflow['coordinatorVerifiedBy'] = _userId;

        final currentStage = workflow['currentStage']?.toString();
        if (currentStage == 'awaitingCoordinatorVerification') {
          workflow['currentStage'] = 'verified';
        } else {
          workflow['currentStage'] =
              (currentStage != null && currentStage.isNotEmpty)
                  ? currentStage
                  : 'verified';
        }

        await _supabase
            .from('mmp_files')
            .update({
              'workflow': workflow,
              'updated_at': DateTime.now().toIso8601String(),
            })
            .eq('id', mmpFileId);
      }
    } catch (e) {
      debugPrint('Error updating MMP workflow: $e');
      // Don’t fail the overall operation if workflow update fails
    }
  }

  Future<void> _returnToFOM(Map<String, dynamic> site) async {
    final TextEditingController reasonController = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Return to FOM'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Return "${site['site_name']}" to Field Operations Manager?',
              style: const TextStyle(fontSize: 14),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: reasonController,
              decoration: const InputDecoration(
                labelText: 'Reason for returning',
                hintText: 'Enter reason...',
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Return'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      setState(() => _isLoading = true);

      final siteId = site['id'].toString();

      await _supabase
          .from('mmp_site_entries')
          .update({
            'status': 'returned_to_fom',
            'verification_notes': reasonController.text,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', siteId);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Site returned to FOM'),
          backgroundColor: AppColors.primaryBlue,
        ),
      );
      await _loadData();
    } catch (e) {
      debugPrint('Error returning site: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
      );
    } finally {
      setState(() => _isLoading = false);
    }
  }
}

// Site Details Bottom Sheet
class _SiteDetailsSheet extends StatelessWidget {
  final Map<String, dynamic> site;
  final String category;
  final VoidCallback onVerify;
  final VoidCallback onReturn;
  final VoidCallback onPermitVerify;

  const _SiteDetailsSheet({
    required this.site,
    required this.category,
    required this.onVerify,
    required this.onReturn,
    required this.onPermitVerify,
  });

  @override
  Widget build(BuildContext context) {
    final siteName = site['site_name']?.toString() ?? 'Unknown Site';
    final siteCode = site['site_code']?.toString() ?? '';
    final locality = site['locality']?.toString() ?? '';
    final state = site['state']?.toString() ?? '';
    final hubOffice = site['hub_office']?.toString() ?? '';
    final cpName = site['cp_name']?.toString() ?? '';
    final visitType = site['visit_type']?.toString() ?? '';
    final mainActivity = site['main_activity']?.toString() ?? '';
    // Local helper to format statuses within this sheet
    String formatStatus(String status) {
      return status
          .replaceAll('_', ' ')
          .split(' ')
          .map(
            (word) => word.isNotEmpty
                ? '${word[0].toUpperCase()}${word.substring(1).toLowerCase()}'
                : '',
          )
          .join(' ');
    }

    final comments = site['comments']?.toString() ?? '';
    final additionalData =
        site['additional_data'] as Map<String, dynamic>? ?? {};

    final visitDateRaw = site['visit_date']?.toString();
    final visitDate = visitDateRaw != null && visitDateRaw.isNotEmpty
        ? DateTime.tryParse(visitDateRaw)
        : null;
    final verifiedAtRaw = site['verified_at']?.toString();
    final verifiedAt = verifiedAtRaw != null && verifiedAtRaw.isNotEmpty
        ? DateTime.tryParse(verifiedAtRaw)
        : null;
    final verifiedBy = site['verified_by']?.toString() ?? '';
    final verificationNotes =
        (site['verification_notes']?.toString() ??
        additionalData['verification_notes']?.toString() ??
        '');
    final surveyTool = additionalData['survey_tool']?.toString() ?? '';
    final marketDiversion = additionalData['market_diversion_monitoring'];
    final warehouseMonitoring = additionalData['warehouse_monitoring'];

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle bar
          Container(
            margin: const EdgeInsets.symmetric(vertical: 12),
            width: 48,
            height: 5,
            decoration: BoxDecoration(
              color: const Color(0xFFE5E7EB),
              borderRadius: BorderRadius.circular(3),
            ),
          ),
          // Title with gradient background
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  AppColors.primaryBlue.withOpacity(0.1),
                  AppColors.primaryBlue.withOpacity(0.05),
                ],
              ),
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(24),
                topRight: Radius.circular(24),
              ),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [AppColors.primaryBlue, AppColors.darkBlue],
                    ),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.location_on,
                    color: Colors.white,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        siteName,
                        style: GoogleFonts.poppins(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFF111827),
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        siteCode,
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          color: const Color(0xFF6B7280),
                          letterSpacing: 0.5,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close, color: Color(0xFF6B7280)),
                  ),
                ),
              ],
            ),
          ),
          // Content
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildInfoRow('Location', '$locality, $state'),
                  _buildInfoRow('Hub Office', hubOffice),
                  _buildInfoRow('CP Name', cpName),
                  if (site['status'] != null)
                    _buildInfoRow(
                      'Status',
                      formatStatus(site['status'].toString()),
                    ),
                  if (visitDate != null)
                    _buildInfoRow(
                      'Visit Date',
                      '${visitDate.day}/${visitDate.month}/${visitDate.year}',
                    ),
                  if (surveyTool.isNotEmpty)
                    _buildInfoRow('Tool to be Used', surveyTool),
                  if (verificationNotes.isNotEmpty)
                    _buildInfoRow('Verification Notes', verificationNotes),
                  if (verifiedAt != null)
                    _buildInfoRow(
                      'Verified At',
                      '${verifiedAt.day}/${verifiedAt.month}/${verifiedAt.year} by ${verifiedBy.isNotEmpty ? verifiedBy : 'Unknown'}',
                    ),
                  if (additionalData['locality_permit_issue_date'] != null)
                    _buildInfoRow(
                      'Locality Permit Issue',
                      additionalData['locality_permit_issue_date'].toString(),
                    ),
                  if (additionalData['locality_permit_expiry_date'] != null)
                    _buildInfoRow(
                      'Locality Permit Expiry',
                      additionalData['locality_permit_expiry_date'].toString(),
                    ),
                  if (marketDiversion != null)
                    _buildInfoRow(
                      'Market Diversion Monitoring',
                      marketDiversion is bool
                          ? (marketDiversion ? 'Yes' : 'No')
                          : marketDiversion.toString(),
                    ),
                  if (warehouseMonitoring != null)
                    _buildInfoRow(
                      'Warehouse Monitoring',
                      warehouseMonitoring is bool
                          ? (warehouseMonitoring ? 'Yes' : 'No')
                          : warehouseMonitoring.toString(),
                    ),
                  if ((additionalData['isFlagged'] == true) &&
                      (additionalData['flagReason'] != null))
                    _buildInfoRow(
                      'Flag Reason',
                      additionalData['flagReason'].toString(),
                    ),
                  const SizedBox(height: 16),
                  _buildInfoRow('Visit Type', visitType),
                  _buildInfoRow('Main Activity', mainActivity),
                  if (comments.isNotEmpty) _buildInfoRow('Comments', comments),
                  const SizedBox(height: 16),
                  Text(
                    'Permit Status',
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  _buildPermitStatus(additionalData),
                  const SizedBox(height: 24),
                  // Action buttons
                  if (category == 'pending') ...[
                    SizedBox(
                      width: double.infinity,
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [AppColors.primaryBlue, AppColors.darkBlue],
                          ),
                          borderRadius: BorderRadius.circular(12),
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.primaryBlue.withOpacity(0.3),
                              blurRadius: 8,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: ElevatedButton.icon(
                          onPressed: () {
                            Navigator.pop(context);
                            onPermitVerify();
                          },
                          icon: const Icon(Icons.verified_user),
                          label: const Text('Verify Permits'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.transparent,
                            foregroundColor: Colors.white,
                            shadowColor: Colors.transparent,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            textStyle: GoogleFonts.poppins(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          onReturn();
                        },
                        icon: const Icon(Icons.undo),
                        label: const Text('Return to FOM'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFFEF4444),
                          side: const BorderSide(
                            color: Color(0xFFEF4444),
                            width: 1.5,
                          ),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ),
                  ],
                  if (category == 'permits')
                    SizedBox(
                      width: double.infinity,
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [Color(0xFF10B981), Color(0xFF059669)],
                          ),
                          borderRadius: BorderRadius.circular(12),
                          boxShadow: [
                            BoxShadow(
                              color: const Color(0xFF10B981).withOpacity(0.3),
                              blurRadius: 8,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: ElevatedButton.icon(
                          onPressed: () {
                            Navigator.pop(context);
                            onVerify();
                          },
                          icon: const Icon(Icons.verified),
                          label: const Text('Verify Site'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.transparent,
                            foregroundColor: Colors.white,
                            shadowColor: Colors.transparent,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            textStyle: GoogleFonts.poppins(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    if (value.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: GoogleFonts.poppins(fontSize: 13, color: Colors.grey[600]),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: GoogleFonts.poppins(
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPermitStatus(Map<String, dynamic> additionalData) {
    final hasStatePermit = additionalData['state_permit_attached'] == true;
    final stateNotRequired =
        additionalData['state_permit_not_required'] == true;
    final hasLocalityPermit =
        additionalData['locality_permit_attached'] == true;

    return Column(
      children: [
        _buildPermitRow(
          'State Permit',
          hasStatePermit
              ? 'Attached'
              : stateNotRequired
              ? 'Not Required'
              : 'Pending',
          hasStatePermit || stateNotRequired,
        ),
        const SizedBox(height: 8),
        _buildPermitRow(
          'Locality Permit',
          hasLocalityPermit ? 'Attached' : 'Pending',
          hasLocalityPermit,
        ),
      ],
    );
  }

  Widget _buildPermitRow(String label, String status, bool isComplete) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isComplete
            ? Colors.green.withOpacity(0.1)
            : AppColors.primaryBlue.withOpacity(0.06),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isComplete
              ? Colors.green.withOpacity(0.3)
              : AppColors.primaryBlue.withOpacity(0.12),
        ),
      ),
      child: Row(
        children: [
          Icon(
            isComplete ? Icons.check_circle : Icons.pending,
            color: isComplete ? Colors.green : AppColors.primaryBlue,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w500),
                ),
                Text(
                  status,
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: isComplete
                        ? Colors.green[700]
                        : AppColors.primaryBlue,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// Permit Verification Dialog - Matches PermitVerificationQuestions.tsx flow
class _PermitVerificationDialog extends StatefulWidget {
  final Map<String, dynamic> site;
  final Function(PermitDecision) onComplete;
  final Function(String)? onSendBackToFOM;

  const _PermitVerificationDialog({
    required this.site,
    required this.onComplete,
    this.onSendBackToFOM,
  });

  @override
  State<_PermitVerificationDialog> createState() =>
      _PermitVerificationDialogState();
}

enum _PermitStep {
  stateQuestion,
  stateUpload,
  stateFollowUp,
  localityQuestion,
  localityUpload,
  localityFollowUp,
  complete,
}

class _PermitVerificationDialogState extends State<_PermitVerificationDialog> {
  _PermitStep _currentStep = _PermitStep.stateQuestion;
  String? _statePermitRequirement;
  String? _canWorkWithoutStatePermit;
  bool _statePermitUploaded = false;
  File? _statePermitImage;
  DateTime? _statePermitIssueDate;
  DateTime? _statePermitExpiryDate;
  final ImagePicker _imagePicker = ImagePicker();

  // Locality permit state
  String? _localityPermitRequirement;
  String? _canWorkWithoutLocalityPermit;
  bool _localityPermitUploaded = false;
  File? _localityPermitImage;
  DateTime? _localityPermitIssueDate;
  DateTime? _localityPermitExpiryDate;

  @override
  void initState() {
    super.initState();
    // Initialize dates from persisted additional_data if present
    final additional =
        widget.site['additional_data'] as Map<String, dynamic>? ?? {};
    try {
      final sIssue = additional['state_permit_issue_date'] as String?;
      final sExpiry = additional['state_permit_expiry_date'] as String?;
      if (sIssue != null) _statePermitIssueDate = DateTime.tryParse(sIssue);
      if (sExpiry != null) _statePermitExpiryDate = DateTime.tryParse(sExpiry);

      final lIssue = additional['locality_permit_issue_date'] as String?;
      final lExpiry = additional['locality_permit_expiry_date'] as String?;
      if (lIssue != null) _localityPermitIssueDate = DateTime.tryParse(lIssue);
      if (lExpiry != null) {
        _localityPermitExpiryDate = DateTime.tryParse(lExpiry);
      }

      if (additional['state_permit_attached'] == true) {
        _statePermitUploaded = true;
      }
      if (additional['locality_permit_attached'] == true) {
        _localityPermitUploaded = true;
      }
    } catch (e) {
      debugPrint('Failed to parse permit dates from additional_data: $e');
    }
  }

  // Confirmation dialog state
  bool _confirmationDialogOpen = false;
  String _confirmationMessage = '';
  PermitDecision? _pendingDecision;

  String _formatDate(DateTime date) =>
      '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

  /// Helper to build a placeholder for broken/unavailable images
  Widget _buildImagePlaceholder() {
    return Container(
      height: 150,
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.grey[200],
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.broken_image, size: 48, color: Colors.grey[400]),
          const SizedBox(height: 8),
          Text(
            'Image unavailable',
            style: GoogleFonts.poppins(color: Colors.grey[600]),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.site['state']?.toString() ?? '';

    return Stack(
      children: [
        Dialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          child: Container(
            constraints: const BoxConstraints(maxWidth: 600, maxHeight: 700),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Colors.white, AppColors.primaryBlue.withOpacity(0.02)],
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Content
                Flexible(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(24),
                    child: _buildCurrentStep(state),
                  ),
                ),
              ],
            ),
          ),
        ),
        // Confirmation Dialog
        if (_confirmationDialogOpen)
          Dialog(
            child: Container(
              padding: const EdgeInsets.all(24),
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.check_circle,
                        color: Colors.green,
                        size: 28,
                      ),
                      const SizedBox(width: 12),
                      Text(
                        'Process Completed',
                        style: GoogleFonts.poppins(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text(
                    _confirmationMessage,
                    style: GoogleFonts.poppins(
                      fontSize: 14,
                      color: Colors.grey[700],
                    ),
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _handleConfirmationOkay,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryBlue,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: Text('Okay', style: GoogleFonts.poppins()),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildCurrentStep(String state) {
    final locality = widget.site['locality']?.toString() ?? '';

    switch (_currentStep) {
      case _PermitStep.stateQuestion:
        return _buildStatePermitQuestion(state);
      case _PermitStep.stateUpload:
        return _buildStatePermitUpload();
      case _PermitStep.stateFollowUp:
        return _buildCanWorkWithoutQuestion(state);
      case _PermitStep.localityQuestion:
        return _buildLocalityPermitQuestion(locality);
      case _PermitStep.localityUpload:
        return _buildLocalityPermitUpload();
      case _PermitStep.localityFollowUp:
        return _buildCanWorkWithoutLocalityQuestion(locality);
      case _PermitStep.complete:
        return const SizedBox.shrink();
    }
  }

  Widget _buildStatePermitQuestion(String state) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.blue[200]!, width: 1),
      ),
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Colors.blue[50]!.withOpacity(0.5), Colors.white],
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.warning_amber, color: Colors.blue[600], size: 24),
                  const SizedBox(width: 8),
                  Text(
                    'State Permit Verification',
                    style: GoogleFonts.poppins(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: Colors.blue[800],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Verify state permit requirements for $state',
                style: GoogleFonts.poppins(
                  fontSize: 13,
                  color: Colors.grey[600],
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'Do you require a State permit in your state?',
                style: GoogleFonts.poppins(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Colors.grey[800],
                ),
              ),
              const SizedBox(height: 16),
              _buildOptionWithDescription(
                'Yes, it\'s required and I will upload it',
                'I have the state permit and will upload it now',
                'required_have_it',
                _statePermitRequirement,
                (value) => setState(() => _statePermitRequirement = value),
              ),
              _buildOptionWithDescription(
                'Yes, it\'s required but I don\'t have it',
                'The state permit is required but not available',
                'required_dont_have_it',
                _statePermitRequirement,
                (value) => setState(() => _statePermitRequirement = value),
              ),
              _buildOptionWithDescription(
                'No, it\'s not a requirement',
                'State permit is not required in this state',
                'not_required',
                _statePermitRequirement,
                (value) => setState(() => _statePermitRequirement = value),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(context),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: Text('Cancel', style: GoogleFonts.poppins()),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton(
                      onPressed: _statePermitRequirement != null
                          ? _handleStatePermitNext
                          : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryBlue,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            'Next',
                            style: GoogleFonts.poppins(color: Colors.white),
                          ),
                          const SizedBox(width: 8),
                          const Icon(
                            Icons.arrow_forward,
                            size: 18,
                            color: Colors.white,
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _handleStatePermitNext() {
    if (_statePermitRequirement == null) return;

    if (_statePermitRequirement == 'required_have_it') {
      setState(() => _currentStep = _PermitStep.stateUpload);
    } else if (_statePermitRequirement == 'required_dont_have_it') {
      // Required but don't have it - show follow-up question about working without it
      setState(() => _currentStep = _PermitStep.stateFollowUp);
    } else if (_statePermitRequirement == 'not_required') {
      // Not required - complete with state not required, locality required but not uploaded
      final decision = PermitDecision(
        statePermit: PermitStatus(requirement: 'not_required'),
        localityPermit: PermitStatus(
          requirement: 'required_have_it',
          uploaded: false,
        ),
      );
      widget.onComplete(decision);
      Navigator.pop(context);
    }
  }

  Widget _buildCanWorkWithoutQuestion(String state) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: AppColors.primaryBlue.withOpacity(0.12),
          width: 1,
        ),
      ),
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.primaryBlue.withOpacity(0.05), Colors.white],
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.warning_amber,
                    color: AppColors.primaryBlue,
                    size: 24,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'State Permit Not Available',
                    style: GoogleFonts.poppins(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: AppColors.primaryBlue,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'You indicated the state permit for $state is required but not available',
                style: GoogleFonts.poppins(
                  fontSize: 13,
                  color: Colors.grey[600],
                ),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.primaryBlue.withOpacity(0.05),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: AppColors.primaryBlue.withOpacity(0.12),
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.info_outline,
                      color: AppColors.primaryBlue,
                      size: 20,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'The state permit is required but you don\'t have it. Can you proceed with the verification without it?',
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          color: AppColors.primaryBlue,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'Are you able to work without the state permit?',
                style: GoogleFonts.poppins(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Colors.grey[800],
                ),
              ),
              const SizedBox(height: 16),
              _buildOptionWithDescription(
                'Yes, I can proceed without it',
                'I will continue with the CP verification',
                'yes',
                _canWorkWithoutStatePermit,
                (value) => setState(() => _canWorkWithoutStatePermit = value),
              ),
              _buildOptionWithDescription(
                'No, I cannot proceed without it',
                'Send the MMP back to FOM for action',
                'no',
                _canWorkWithoutStatePermit,
                (value) => setState(() => _canWorkWithoutStatePermit = value),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => setState(
                        () => _currentStep = _PermitStep.stateQuestion,
                      ),
                      icon: const Icon(Icons.arrow_back, size: 18),
                      label: Text('Back', style: GoogleFonts.poppins()),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: _canWorkWithoutStatePermit != null
                          ? _handleStateFollowUpNext
                          : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _canWorkWithoutStatePermit == 'no'
                            ? Colors.red
                            : AppColors.primaryBlue,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      icon: Icon(
                        _canWorkWithoutStatePermit == 'no'
                            ? Icons.send
                            : Icons.arrow_forward,
                        size: 18,
                        color: Colors.white,
                      ),
                      label: Text(
                        _canWorkWithoutStatePermit == 'no'
                            ? 'Send Back to FOM'
                            : 'Continue',
                        style: GoogleFonts.poppins(color: Colors.white),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _handleStateFollowUpNext() {
    if (_canWorkWithoutStatePermit == null) return;

    if (_canWorkWithoutStatePermit == 'yes') {
      // Can work without state permit - complete state verification and let user navigate to locality manually
      final decision = PermitDecision(
        statePermit: PermitStatus(
          requirement: 'required_dont_have_it',
          canWorkWithout: 'yes',
          uploaded: false,
        ),
        localityPermit: PermitStatus(
          requirement: 'required_have_it',
          uploaded: false,
        ),
      );
      widget.onComplete(decision);
      Navigator.pop(context);
    } else {
      // Cannot work without - send back to FOM
      final state = widget.site['state']?.toString() ?? '';
      final reason =
          'State permit is required for $state but coordinator does not have it and cannot proceed without it.';

      if (widget.onSendBackToFOM != null) {
        widget.onSendBackToFOM!(reason);
      }
      Navigator.pop(context);
    }
  }

  Widget _buildStatePermitUpload() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        OutlinedButton.icon(
          onPressed: () =>
              setState(() => _currentStep = _PermitStep.stateQuestion),
          icon: const Icon(Icons.arrow_back, size: 18),
          label: Text('Back to Questions', style: GoogleFonts.poppins()),
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 12),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'Upload State Permit',
          style: GoogleFonts.poppins(fontSize: 16, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 8),
        Text(
          'Take a photo or select from gallery',
          style: GoogleFonts.poppins(fontSize: 12, color: Colors.grey[600]),
        ),
        const SizedBox(height: 16),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            border: Border.all(
              color: _statePermitUploaded ? Colors.green : Colors.grey[300]!,
              width: _statePermitUploaded ? 2 : 1,
            ),
            borderRadius: BorderRadius.circular(12),
            color: _statePermitUploaded ? Colors.green.withOpacity(0.1) : null,
          ),
          child: Column(
            children: [
              if (_statePermitImage != null) ...[
                // Show image preview - use different widget for web vs mobile
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: kIsWeb
                      ? Image.network(
                          _statePermitImage!.path,
                          height: 150,
                          width: double.infinity,
                          fit: BoxFit.cover,
                          errorBuilder: (context, error, stackTrace) {
                            return _buildImagePlaceholder();
                          },
                        )
                      : Image.file(
                          _statePermitImage!,
                          height: 150,
                          width: double.infinity,
                          fit: BoxFit.cover,
                          errorBuilder: (context, error, stackTrace) {
                            return _buildImagePlaceholder();
                          },
                        ),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(
                      Icons.check_circle,
                      color: Colors.green,
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Permit Uploaded',
                      style: GoogleFonts.poppins(
                        color: Colors.green,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: () => _pickPermitImage(isState: true),
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('Replace Image'),
                ),
              ] else ...[
                Icon(Icons.add_a_photo, size: 48, color: Colors.grey[400]),
                const SizedBox(height: 12),
                Text(
                  'Tap to upload permit photo',
                  style: GoogleFonts.poppins(color: Colors.grey[600]),
                ),
                const SizedBox(height: 16),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    ElevatedButton.icon(
                      onPressed: () =>
                          _pickPermitImage(isState: true, useCamera: true),
                      icon: const Icon(Icons.camera_alt, size: 16),
                      label: const Text(
                        'Camera',
                        style: TextStyle(fontSize: 12),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryBlue,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                    OutlinedButton.icon(
                      onPressed: () =>
                          _pickPermitImage(isState: true, useCamera: false),
                      icon: const Icon(Icons.photo_library, size: 16),
                      label: const Text(
                        'Gallery',
                        style: TextStyle(fontSize: 12),
                      ),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.primaryBlue,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                        side: BorderSide(color: AppColors.primaryBlue),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                // Optional issue / expiry dates for state permit
                Row(
                  children: [
                    Expanded(
                      child: GestureDetector(
                        onTap: () async {
                          final picked = await showDatePicker(
                            context: context,
                            initialDate:
                                _statePermitIssueDate ?? DateTime.now(),
                            firstDate: DateTime(2000),
                            lastDate: DateTime(2100),
                          );
                          if (picked != null) {
                            setState(() => _statePermitIssueDate = picked);
                          }
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            vertical: 12,
                            horizontal: 12,
                          ),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.grey[300]!),
                          ),
                          child: Text(
                            _statePermitIssueDate != null
                                ? 'Issue: ${_formatDate(_statePermitIssueDate!)}'
                                : 'Select issue date',
                            style: GoogleFonts.poppins(fontSize: 13),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: GestureDetector(
                        onTap: () async {
                          final picked = await showDatePicker(
                            context: context,
                            initialDate:
                                _statePermitExpiryDate ?? DateTime.now(),
                            firstDate: DateTime(2000),
                            lastDate: DateTime(2100),
                          );
                          if (picked != null) {
                            setState(() => _statePermitExpiryDate = picked);
                          }
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            vertical: 12,
                            horizontal: 12,
                          ),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.grey[300]!),
                          ),
                          child: Text(
                            _statePermitExpiryDate != null
                                ? 'Expiry: ${_formatDate(_statePermitExpiryDate!)}'
                                : 'Select expiry date',
                            style: GoogleFonts.poppins(fontSize: 13),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                if ((_statePermitIssueDate != null ||
                        _statePermitExpiryDate != null) &&
                    (_statePermitIssueDate == null ||
                        _statePermitExpiryDate == null ||
                        (_statePermitIssueDate != null &&
                            _statePermitExpiryDate != null &&
                            _statePermitExpiryDate!.isBefore(
                              _statePermitIssueDate!,
                            )))) ...[
                  Text(
                    'Please ensure both Issue and Expiry dates are set and Expiry is after Issue.',
                    style: GoogleFonts.poppins(color: Colors.red, fontSize: 12),
                  ),
                  const SizedBox(height: 8),
                ],
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildLocalityPermitQuestion(String locality) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.green[200]!, width: 1),
      ),
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Colors.green[50]!.withOpacity(0.5), Colors.white],
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.location_on, color: Colors.green[600], size: 24),
                  const SizedBox(width: 8),
                  Text(
                    'Locality Permit Verification',
                    style: GoogleFonts.poppins(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: Colors.green[800],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Verify locality permit requirements for $locality',
                style: GoogleFonts.poppins(
                  fontSize: 13,
                  color: Colors.grey[600],
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'Do you require a Locality permit in your locality?',
                style: GoogleFonts.poppins(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Colors.grey[800],
                ),
              ),
              const SizedBox(height: 16),
              _buildOptionWithDescription(
                'Yes, it\'s required and I will upload it',
                'I have the locality permit and will upload it now',
                'required_have_it',
                _localityPermitRequirement,
                (value) => setState(() => _localityPermitRequirement = value),
              ),
              _buildOptionWithDescription(
                'Yes, it\'s required but I don\'t have it',
                'The locality permit is required but not available',
                'required_dont_have_it',
                _localityPermitRequirement,
                (value) => setState(() => _localityPermitRequirement = value),
              ),
              _buildOptionWithDescription(
                'No, it\'s not a requirement',
                'Locality permit is not required in this locality',
                'not_required',
                _localityPermitRequirement,
                (value) => setState(() => _localityPermitRequirement = value),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => setState(
                        () => _currentStep = _PermitStep.stateQuestion,
                      ),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: Text(
                        'Back to State',
                        style: GoogleFonts.poppins(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton(
                      onPressed: _localityPermitRequirement != null
                          ? _handleLocalityPermitNext
                          : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryBlue,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            'Next',
                            style: GoogleFonts.poppins(color: Colors.white),
                          ),
                          const SizedBox(width: 8),
                          const Icon(
                            Icons.arrow_forward,
                            size: 18,
                            color: Colors.white,
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _handleLocalityPermitNext() {
    if (_localityPermitRequirement == null) return;

    if (_localityPermitRequirement == 'required_have_it') {
      setState(() => _currentStep = _PermitStep.localityUpload);
    } else if (_localityPermitRequirement == 'required_dont_have_it') {
      setState(() => _currentStep = _PermitStep.localityFollowUp);
    } else {
      // Not required - complete
      _handleComplete();
    }
  }

  Widget _buildLocalityPermitUpload() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        OutlinedButton.icon(
          onPressed: () =>
              setState(() => _currentStep = _PermitStep.stateQuestion),
          icon: const Icon(Icons.arrow_back, size: 18),
          label: Text('Back to State Question', style: GoogleFonts.poppins()),
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 12),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'Upload Locality Permit',
          style: GoogleFonts.poppins(fontSize: 16, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 8),
        Text(
          'Take a photo or select from gallery',
          style: GoogleFonts.poppins(fontSize: 12, color: Colors.grey[600]),
        ),
        const SizedBox(height: 16),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            border: Border.all(
              color: _localityPermitUploaded ? Colors.green : Colors.grey[300]!,
              width: _localityPermitUploaded ? 2 : 1,
            ),
            borderRadius: BorderRadius.circular(12),
            color: _localityPermitUploaded
                ? Colors.green.withOpacity(0.1)
                : null,
          ),
          child: Column(
            children: [
              if (_localityPermitImage != null) ...[
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: kIsWeb
                      ? Image.network(
                          _localityPermitImage!.path,
                          height: 150,
                          width: double.infinity,
                          fit: BoxFit.cover,
                          errorBuilder: (context, error, stackTrace) {
                            return _buildImagePlaceholder();
                          },
                        )
                      : Image.file(
                          _localityPermitImage!,
                          height: 150,
                          width: double.infinity,
                          fit: BoxFit.cover,
                          errorBuilder: (context, error, stackTrace) {
                            return _buildImagePlaceholder();
                          },
                        ),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(
                      Icons.check_circle,
                      color: Colors.green,
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Permit Uploaded',
                      style: GoogleFonts.poppins(
                        color: Colors.green,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: () => _pickPermitImage(isState: false),
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('Replace Image'),
                ),
              ] else ...[
                Icon(Icons.add_a_photo, size: 48, color: Colors.grey[400]),
                const SizedBox(height: 12),
                Text(
                  'Tap to upload permit photo',
                  style: GoogleFonts.poppins(color: Colors.grey[600]),
                ),
                const SizedBox(height: 16),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    ElevatedButton.icon(
                      onPressed: () =>
                          _pickPermitImage(isState: false, useCamera: true),
                      icon: const Icon(Icons.camera_alt, size: 16),
                      label: const Text(
                        'Camera',
                        style: TextStyle(fontSize: 12),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryBlue,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                    OutlinedButton.icon(
                      onPressed: () =>
                          _pickPermitImage(isState: false, useCamera: false),
                      icon: const Icon(Icons.photo_library, size: 16),
                      label: const Text(
                        'Gallery',
                        style: TextStyle(fontSize: 12),
                      ),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.primaryBlue,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                        side: BorderSide(color: AppColors.primaryBlue),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildCanWorkWithoutLocalityQuestion(String locality) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: AppColors.primaryBlue.withOpacity(0.12),
          width: 1,
        ),
      ),
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.primaryBlue.withOpacity(0.05), Colors.white],
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.warning_amber,
                    color: AppColors.primaryBlue,
                    size: 24,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Locality Permit Not Available',
                    style: GoogleFonts.poppins(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: AppColors.primaryBlue,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'You indicated the locality permit for $locality is required but not available',
                style: GoogleFonts.poppins(
                  fontSize: 13,
                  color: Colors.grey[600],
                ),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.primaryBlue.withOpacity(0.05),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: AppColors.primaryBlue.withOpacity(0.12),
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.info_outline,
                      color: AppColors.primaryBlue,
                      size: 20,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'The locality permit is required but you don\'t have it. Can you proceed with the verification without it?',
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          color: AppColors.primaryBlue,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'Are you able to work without the locality permit?',
                style: GoogleFonts.poppins(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Colors.grey[800],
                ),
              ),
              const SizedBox(height: 16),
              _buildOptionWithDescription(
                'Yes, I can proceed without it',
                'I will continue with the CP verification',
                'yes',
                _canWorkWithoutLocalityPermit,
                (value) =>
                    setState(() => _canWorkWithoutLocalityPermit = value),
              ),
              _buildOptionWithDescription(
                'No, I cannot proceed without it',
                'Send the MMP back to FOM for action',
                'no',
                _canWorkWithoutLocalityPermit,
                (value) =>
                    setState(() => _canWorkWithoutLocalityPermit = value),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => setState(
                        () => _currentStep = _PermitStep.localityQuestion,
                      ),
                      icon: const Icon(Icons.arrow_back, size: 18),
                      label: Text('Back', style: GoogleFonts.poppins()),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: _canWorkWithoutLocalityPermit != null
                          ? _handleLocalityFollowUpNext
                          : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _canWorkWithoutLocalityPermit == 'no'
                            ? Colors.red
                            : AppColors.primaryBlue,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      icon: Icon(
                        _canWorkWithoutLocalityPermit == 'no'
                            ? Icons.send
                            : Icons.arrow_forward,
                        size: 18,
                        color: Colors.white,
                      ),
                      label: Text(
                        _canWorkWithoutLocalityPermit == 'no'
                            ? 'Send Back to FOM'
                            : 'Continue',
                        style: GoogleFonts.poppins(color: Colors.white),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _handleLocalityFollowUpNext() {
    if (_canWorkWithoutLocalityPermit == null) return;

    if (_canWorkWithoutLocalityPermit == 'yes') {
      // Can work without locality permit - complete
      _handleComplete();
    } else {
      // Cannot work without - send back to FOM
      final locality = widget.site['locality']?.toString() ?? '';
      final reason =
          'Locality permit is required for $locality but coordinator does not have it and cannot proceed without it.';

      if (widget.onSendBackToFOM != null) {
        widget.onSendBackToFOM!(reason);
      }
      Navigator.pop(context);
    }
  }

  void _handleLocalityPermitUploaded() {
    // Ensure localityPermitRequirement is set (should be 'required_have_it' at this point)
    if (_localityPermitRequirement != 'required_have_it') {
      debugPrint(
        'Locality permit uploaded but requirement is not set correctly: $_localityPermitRequirement',
      );
    }
    _handleComplete(uploadedOverride: true);
  }

  Future<void> _pickPermitImage({
    required bool isState,
    bool useCamera = false,
  }) async {
    try {
      final XFile? image = await _imagePicker.pickImage(
        source: useCamera ? ImageSource.camera : ImageSource.gallery,
        imageQuality: 80,
        maxWidth: 1200,
      );

      if (image != null) {
        setState(() {
          if (isState) {
            _statePermitImage = File(image.path);
            _statePermitUploaded = true;
          } else {
            _localityPermitImage = File(image.path);
            _localityPermitUploaded = true;
          }
        });
        // Prompt for dates when uploading
        if (isState) {
          await _promptForStatePermitDates();
          _handleStatePermitUploaded();
        } else {
          await _promptForLocalityPermitDates();
          _handleLocalityPermitUploaded();
        }
      }
    } catch (e) {
      debugPrint('Error picking image: $e');
    }
  }

  /// Prompt the coordinator to optionally enter Issue and Expiry dates for state permit
  Future<void> _promptForStatePermitDates() async {
    DateTime? tempIssue = _statePermitIssueDate;
    DateTime? tempExpiry = _statePermitExpiryDate;

    final result = await showDialog<String?>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setStateDialog) {
            return AlertDialog(
              title: const Text('Enter State Permit Dates'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  GestureDetector(
                    onTap: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: tempIssue ?? DateTime.now(),
                        firstDate: DateTime(2000),
                        lastDate: DateTime(2100),
                      );
                      if (picked != null) {
                        setStateDialog(() => tempIssue = picked);
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        vertical: 12,
                        horizontal: 12,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.grey[300]!),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.calendar_today,
                            size: 18,
                            color: Colors.grey[700],
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              tempIssue != null
                                  ? 'Issue: ${_formatDate(tempIssue!)}'
                                  : 'Select issue date',
                              style: GoogleFonts.poppins(fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  GestureDetector(
                    onTap: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: tempExpiry ?? DateTime.now(),
                        firstDate: DateTime(2000),
                        lastDate: DateTime(2100),
                      );
                      if (picked != null) {
                        setStateDialog(() => tempExpiry = picked);
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        vertical: 12,
                        horizontal: 12,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.grey[300]!),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.calendar_today_outlined,
                            size: 18,
                            color: Colors.grey[700],
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              tempExpiry != null
                                  ? 'Expiry: ${_formatDate(tempExpiry!)}'
                                  : 'Select expiry date',
                              style: GoogleFonts.poppins(fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  if ((tempIssue != null || tempExpiry != null) &&
                      (tempIssue == null ||
                          tempExpiry == null ||
                          (tempIssue != null &&
                              tempExpiry != null &&
                              tempExpiry!.isBefore(tempIssue!))))
                    Text(
                      'Please provide both dates and ensure Expiry is after Issue.',
                      style: GoogleFonts.poppins(
                        color: Colors.red,
                        fontSize: 12,
                      ),
                    ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context, null),
                  child: const Text('Cancel'),
                ),
                TextButton(
                  onPressed: () => Navigator.pop(context, 'skip'),
                  child: const Text('Skip'),
                ),
                ElevatedButton(
                  onPressed: () {
                    // Validate before closing
                    if ((tempIssue != null || tempExpiry != null) &&
                        (tempIssue == null || tempExpiry == null)) {
                      // keep dialog open
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Please set both dates or Skip.'),
                        ),
                      );
                      return;
                    }
                    if (tempIssue != null &&
                        tempExpiry != null &&
                        tempExpiry!.isBefore(tempIssue!)) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Expiry must be after Issue.'),
                        ),
                      );
                      return;
                    }

                    // Save to state
                    setState(() {
                      _statePermitIssueDate = tempIssue;
                      _statePermitExpiryDate = tempExpiry;
                    });

                    Navigator.pop(context, 'saved');
                  },
                  child: const Text('Save'),
                ),
              ],
            );
          },
        );
      },
    );

    if (result == 'saved') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('State permit dates recorded')),
      );
    }
  }

  /// Prompt the coordinator to optionally enter Issue and Expiry dates for locality permit
  Future<bool> _promptForLocalityPermitDates() async {
    DateTime? tempIssue = _localityPermitIssueDate;
    DateTime? tempExpiry = _localityPermitExpiryDate;

    final result = await showDialog<bool?>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setStateDialog) {
            return AlertDialog(
              title: const Text('Enter Permit Dates'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  GestureDetector(
                    onTap: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: tempIssue ?? DateTime.now(),
                        firstDate: DateTime(2000),
                        lastDate: DateTime(2100),
                      );
                      if (picked != null) {
                        setStateDialog(() => tempIssue = picked);
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        vertical: 12,
                        horizontal: 12,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.grey[300]!),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.calendar_today,
                            size: 18,
                            color: Colors.grey[700],
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              tempIssue != null
                                  ? 'Issue: ${_formatDate(tempIssue!)}'
                                  : 'Select issue date',
                              style: GoogleFonts.poppins(fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  GestureDetector(
                    onTap: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: tempExpiry ?? DateTime.now(),
                        firstDate: DateTime(2000),
                        lastDate: DateTime(2100),
                      );
                      if (picked != null) {
                        setStateDialog(() => tempExpiry = picked);
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        vertical: 12,
                        horizontal: 12,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.grey[300]!),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.calendar_today_outlined,
                            size: 18,
                            color: Colors.grey[700],
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              tempExpiry != null
                                  ? 'Expiry: ${_formatDate(tempExpiry!)}'
                                  : 'Select expiry date',
                              style: GoogleFonts.poppins(fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  if ((tempIssue != null || tempExpiry != null) &&
                      (tempIssue == null ||
                          tempExpiry == null ||
                          (tempIssue != null &&
                              tempExpiry != null &&
                              tempExpiry!.isBefore(tempIssue!))))
                    Text(
                      'Please provide both dates and ensure Expiry is after Issue.',
                      style: GoogleFonts.poppins(
                        color: Colors.red,
                        fontSize: 12,
                      ),
                    ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  onPressed: () {
                    // Validate before closing
                    if (tempIssue == null || tempExpiry == null) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text(
                            'Please set both Issue and Expiry dates.',
                          ),
                        ),
                      );
                      return;
                    }
                    if (tempExpiry!.isBefore(tempIssue!)) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Expiry must be after Issue.'),
                        ),
                      );
                      return;
                    }

                    // Save to state
                    setState(() {
                      _localityPermitIssueDate = tempIssue;
                      _localityPermitExpiryDate = tempExpiry;
                    });

                    Navigator.pop(context, true);
                  },
                  child: const Text('Save'),
                ),
              ],
            );
          },
        );
      },
    );

    if (result == true) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Permit dates recorded')));
      return true;
    }
    return false;
  }

  void _handleStatePermitUploaded() {
    // Ensure statePermitRequirement is set (should be 'required_have_it' at this point)
    if (_statePermitRequirement != 'required_have_it') {
      debugPrint(
        'State permit uploaded but requirement is not set correctly: $_statePermitRequirement',
      );
    }
    // After uploading state permit, do NOT automatically move to locality — complete state-only flow
    _handleStateComplete(uploadedOverride: true, proceedToLocality: false);
  }

  void _handleStateComplete({
    bool? uploadedOverride,
    bool proceedToLocality = true,
  }) {
    // Validate that we have the required information
    if (_statePermitRequirement == null) {
      debugPrint('Cannot complete: statePermitRequirement is not set');
      return;
    }

    // Determine the effective uploaded flag
    final effectiveUploaded = uploadedOverride ?? _statePermitUploaded;

    // Additional validation: if requirement is 'required_have_it', uploaded must be true
    if (_statePermitRequirement == 'required_have_it' && !effectiveUploaded) {
      debugPrint('Cannot complete: state permit is required but not uploaded');
    }

    // Additional validation: if requirement is 'required_dont_have_it', canWorkWithout must be set
    if (_statePermitRequirement == 'required_dont_have_it' &&
        _canWorkWithoutStatePermit == null) {
      debugPrint(
        'Cannot complete: state permit is required but canWorkWithout is not set',
      );
      return;
    }

    if (proceedToLocality) {
      // Proceed to locality questions as before
      setState(() => _currentStep = _PermitStep.localityQuestion);
      return;
    }

    // Finish state-only: create a PermitDecision with only state info and persist
    final decision = PermitDecision(
      statePermit: PermitStatus(
        requirement: _statePermitRequirement,
        canWorkWithout: _canWorkWithoutStatePermit,
        uploaded: effectiveUploaded,
        issueDate: _statePermitIssueDate != null
            ? _formatDate(_statePermitIssueDate!)
            : null,
        expiryDate: _statePermitExpiryDate != null
            ? _formatDate(_statePermitExpiryDate!)
            : null,
      ),
      localityPermit: PermitStatus(),
    );

    // Prepare a confirmation message for state-only completion
    final state = widget.site['state']?.toString() ?? '';
    String message = '';
    if (_statePermitRequirement == 'required_have_it' && effectiveUploaded) {
      message =
          'State permit uploaded successfully for $state. You can upload the locality permit separately.';
    } else if (_statePermitRequirement == 'required_dont_have_it' &&
        _canWorkWithoutStatePermit == 'yes') {
      message =
          'Proceeding without the state permit for $state. You can upload the locality permit separately.';
    } else if (_statePermitRequirement == 'required_dont_have_it' &&
        _canWorkWithoutStatePermit == 'no') {
      message =
          'The MMP has been sent back to FOM because a state permit is required for $state and you cannot proceed without it.';
    } else if (_statePermitRequirement == 'not_required') {
      message =
          'State permit not required for $state. You can upload the locality permit separately if needed.';
    }

    setState(() {
      _confirmationMessage = message;
      _pendingDecision = decision;
      _confirmationDialogOpen = true;
    });
  }

  Widget _buildOptionWithDescription(
    String label,
    String description,
    String value,
    String? selectedValue,
    Function(String) onSelect,
  ) {
    final isSelected = selectedValue == value;
    return InkWell(
      onTap: () => onSelect(value),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: isSelected
              ? LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    AppColors.primaryBlue.withOpacity(0.15),
                    AppColors.primaryBlue.withOpacity(0.05),
                  ],
                )
              : null,
          border: Border.all(
            color: isSelected ? AppColors.primaryBlue : const Color(0xFFE5E7EB),
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: isSelected
                      ? AppColors.primaryBlue
                      : const Color(0xFF9CA3AF),
                  width: 2,
                ),
              ),
              child: Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isSelected
                      ? AppColors.primaryBlue
                      : Colors.transparent,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: GoogleFonts.poppins(
                      fontSize: 14,
                      fontWeight: isSelected
                          ? FontWeight.w600
                          : FontWeight.normal,
                      color: isSelected
                          ? AppColors.primaryBlue
                          : const Color(0xFF374151),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    description,
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _handleComplete({bool? uploadedOverride}) {
    // Validate that we have the required information
    if (_statePermitRequirement == null || _localityPermitRequirement == null) {
      debugPrint('Cannot complete: permit requirements not set');
      return;
    }

    // Determine the effective uploaded flags
    final effectiveStateUploaded = _statePermitUploaded;
    final effectiveLocalityUploaded =
        uploadedOverride ?? _localityPermitUploaded;

    // Additional validation: if requirement is 'required_have_it', uploaded must be true
    if (_statePermitRequirement == 'required_have_it' &&
        !effectiveStateUploaded) {
      debugPrint('Cannot complete: state permit is required but not uploaded');
    }
    if (_localityPermitRequirement == 'required_have_it' &&
        !effectiveLocalityUploaded) {
      debugPrint(
        'Cannot complete: locality permit is required but not uploaded',
      );
    }

    // Additional validation: if requirement is 'required_dont_have_it', canWorkWithout must be set
    if (_statePermitRequirement == 'required_dont_have_it' &&
        _canWorkWithoutStatePermit == null) {
      debugPrint(
        'Cannot complete: state permit is required but canWorkWithout is not set',
      );
      return;
    }
    if (_localityPermitRequirement == 'required_dont_have_it' &&
        _canWorkWithoutLocalityPermit == null) {
      debugPrint(
        'Cannot complete: locality permit is required but canWorkWithout is not set',
      );
      return;
    }

    final state = widget.site['state']?.toString() ?? '';
    final locality = widget.site['locality']?.toString() ?? '';

    final decision = PermitDecision(
      statePermit: PermitStatus(
        requirement: _statePermitRequirement,
        canWorkWithout: _canWorkWithoutStatePermit,
        uploaded: effectiveStateUploaded,
        issueDate: _statePermitIssueDate != null
            ? _formatDate(_statePermitIssueDate!)
            : null,
        expiryDate: _statePermitExpiryDate != null
            ? _formatDate(_statePermitExpiryDate!)
            : null,
      ),
      localityPermit: PermitStatus(
        requirement: _localityPermitRequirement,
        canWorkWithout: _canWorkWithoutLocalityPermit,
        uploaded: effectiveLocalityUploaded,
        issueDate: _localityPermitIssueDate != null
            ? _formatDate(_localityPermitIssueDate!)
            : null,
        expiryDate: _localityPermitExpiryDate != null
            ? _formatDate(_localityPermitExpiryDate!)
            : null,
      ),
    );

    // Generate summary message based on decision
    String message = '';
    final stateReq = _statePermitRequirement;
    final localityReq = _localityPermitRequirement;

    if (stateReq == 'not_required' && localityReq == 'not_required') {
      message =
          'No permits are required for $state/$locality. The verification process is complete.';
    } else if (stateReq == 'required_have_it' &&
        effectiveStateUploaded &&
        localityReq == 'not_required') {
      message =
          'State permit uploaded successfully. No locality permit required. The verification process is complete.';
    } else if (stateReq == 'not_required' &&
        localityReq == 'required_have_it' &&
        effectiveLocalityUploaded) {
      message =
          'Locality permit uploaded successfully. No state permit required. The verification process is complete.';
    } else if (stateReq == 'required_have_it' &&
        effectiveStateUploaded &&
        localityReq == 'required_have_it' &&
        effectiveLocalityUploaded) {
      message =
          'Both state and locality permits uploaded successfully. The verification process is complete.';
    } else if (stateReq == 'required_dont_have_it' &&
        _canWorkWithoutStatePermit == 'yes' &&
        localityReq == 'not_required') {
      message =
          'State permit required but proceeding without it. No locality permit required. The verification process is complete.';
    } else if (stateReq == 'not_required' &&
        localityReq == 'required_dont_have_it' &&
        _canWorkWithoutLocalityPermit == 'yes') {
      message =
          'Locality permit required but proceeding without it. No state permit required. The verification process is complete.';
    } else if (stateReq == 'required_dont_have_it' &&
        _canWorkWithoutStatePermit == 'yes' &&
        localityReq == 'required_dont_have_it' &&
        _canWorkWithoutLocalityPermit == 'yes') {
      message =
          'Both permits required but proceeding without them. The verification process is complete.';
    } else if (stateReq == 'required_dont_have_it' &&
        _canWorkWithoutStatePermit == 'no') {
      message =
          'The MMP has been sent back to FOM because a state permit is required for $state and you cannot proceed without it. No further action is needed here.';
    } else if (localityReq == 'required_dont_have_it' &&
        _canWorkWithoutLocalityPermit == 'no') {
      message =
          'The MMP has been sent back to FOM because a locality permit is required for $locality and you cannot proceed without it. No further action is needed here.';
    }

    setState(() {
      _confirmationMessage = message;
      _pendingDecision = decision;
      _confirmationDialogOpen = true;
    });
  }

  void _handleConfirmationOkay() {
    if (_pendingDecision != null) {
      widget.onComplete(_pendingDecision!);
    }
    setState(() {
      _confirmationDialogOpen = false;
      _pendingDecision = null;
    });
    Navigator.pop(context);
  }
}

/// Locality Permit Dialog for sites in Locality Permit tab
/// First asks if state permit is already uploaded, then proceeds to locality permit upload
class _LocalityPermitDialog extends StatefulWidget {
  final Map<String, dynamic> site;
  final Function(Map<String, dynamic>) onComplete;
  final VoidCallback onStatePermitMissing;
  final bool startOnUpload; // If true, open the dialog on the upload step
  final bool initialStateConfirmed; // Pre-fill state permit confirmation

  const _LocalityPermitDialog({
    required this.site,
    required this.onComplete,
    required this.onStatePermitMissing,
    this.startOnUpload = false,
    this.initialStateConfirmed = false,
  });

  @override
  State<_LocalityPermitDialog> createState() => _LocalityPermitDialogState();
}

class _LocalityPermitDialogState extends State<_LocalityPermitDialog> {
  int _currentStep = 0;
  bool _statePermitConfirmed = false;
  bool _localityPermitUploaded = false;
  File? _localityPermitImage;
  final ImagePicker _imagePicker = ImagePicker();

  @override
  void initState() {
    super.initState();
    // If dialog was requested to start on upload step, set initial state
    if (widget.initialStateConfirmed) {
      _statePermitConfirmed = true;
    }
    if (widget.startOnUpload) {
      _currentStep = 1;
    }
  }

  // Optional issue/expiry dates for locality permit (coordinator-entered)
  DateTime? _localityPermitIssueDate;
  DateTime? _localityPermitExpiryDate;

  String _formatDate(DateTime date) =>
      '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

  /// Helper to build a placeholder for broken/unavailable images
  Widget _buildImagePlaceholder() {
    return Container(
      height: 150,
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.grey[200],
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.broken_image, size: 48, color: Colors.grey[400]),
          const SizedBox(height: 8),
          Text(
            'Image unavailable',
            style: GoogleFonts.poppins(color: Colors.grey[600]),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 420),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Colors.white, Colors.blue.withOpacity(0.02)],
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header with gradient
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Colors.blue, Colors.blue[700]!],
                ),
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(20),
                  topRight: Radius.circular(20),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(
                          Icons.location_on,
                          color: Colors.white,
                          size: 24,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Locality Permit',
                          style: GoogleFonts.poppins(
                            fontSize: 20,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      widget.site['site_name']?.toString() ?? 'Site',
                      style: GoogleFonts.poppins(
                        fontSize: 13,
                        color: Colors.white,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
            // Content
            Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _buildCurrentStep(),
                  const SizedBox(height: 24),
                  _buildNavigationButtons(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCurrentStep() {
    switch (_currentStep) {
      case 0:
        return _buildStatePermitConfirmation();
      case 1:
        return _buildLocalityPermitUpload();
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _buildStatePermitConfirmation() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Info box about locality permit requirement
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.blue.withOpacity(0.1),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.blue.withOpacity(0.3)),
          ),
          child: Row(
            children: [
              Icon(Icons.info_outline, color: Colors.blue[700], size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'This site only requires a locality permit. Please confirm the state permit status.',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: Colors.blue[700],
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        Text(
          'Is the Local Permit required for this locality?',
          style: GoogleFonts.poppins(fontSize: 16, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 16),
        _buildConfirmOption(
          'Yes, It is required continue to upload',
          Icons.check_circle,
          Colors.green,
          true,
          _statePermitConfirmed == true,
        ),
        const SizedBox(height: 8),
        _buildConfirmOption(
          'No, Local permit is not required for this locality',
          Icons.error_outline,
          AppColors.primaryBlue,
          false,
          _statePermitConfirmed == false && _currentStep == 0,
        ),
      ],
    );
  }

  Widget _buildConfirmOption(
    String label,
    IconData icon,
    Color color,
    bool value,
    bool isSelected,
  ) {
    return InkWell(
      onTap: () {
        setState(() {
          if (value) {
            _statePermitConfirmed = true;
          } else {
            // State permit not uploaded - redirect to full permit dialog
            widget.onStatePermitMissing();
          }
        });
      },
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(
            color: isSelected ? color : const Color(0xFFE5E7EB),
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Icon(icon, color: isSelected ? color : Colors.grey[400], size: 24),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                  color: isSelected ? color : const Color(0xFF374151),
                ),
              ),
            ),
            if (isSelected)
              Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(shape: BoxShape.circle, color: color),
                child: const Icon(Icons.check, color: Colors.white, size: 14),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildLocalityPermitUpload() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Success indicator for state permit
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.green.withOpacity(0.1),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.green.withOpacity(0.3)),
          ),
          child: Row(
            children: [
              const Icon(Icons.check_circle, color: Colors.green, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'State Permit confirmed. Now upload the Locality Permit.',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: Colors.green[700],
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        Text(
          'Upload Locality Permit',
          style: GoogleFonts.poppins(fontSize: 16, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 8),
        Text(
          'Take a photo or select from gallery',
          style: GoogleFonts.poppins(fontSize: 12, color: Colors.grey[600]),
        ),
        const SizedBox(height: 16),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            border: Border.all(
              color: _localityPermitUploaded ? Colors.green : Colors.grey[300]!,
              width: _localityPermitUploaded ? 2 : 1,
            ),
            borderRadius: BorderRadius.circular(12),
            color: _localityPermitUploaded
                ? Colors.green.withOpacity(0.1)
                : null,
          ),
          child: Column(
            children: [
              if (_localityPermitImage != null) ...[
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: kIsWeb
                      ? Image.network(
                          _localityPermitImage!.path,
                          height: 150,
                          width: double.infinity,
                          fit: BoxFit.cover,
                          errorBuilder: (context, error, stackTrace) {
                            return _buildImagePlaceholder();
                          },
                        )
                      : Image.file(
                          _localityPermitImage!,
                          height: 150,
                          width: double.infinity,
                          fit: BoxFit.cover,
                          errorBuilder: (context, error, stackTrace) {
                            return _buildImagePlaceholder();
                          },
                        ),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(
                      Icons.check_circle,
                      color: Colors.green,
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Permit Uploaded',
                      style: GoogleFonts.poppins(
                        color: Colors.green,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: () => _pickLocalityPermitImage(),
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('Replace Image'),
                ),
              ] else ...[
                Icon(Icons.add_a_photo, size: 48, color: Colors.grey[400]),
                const SizedBox(height: 12),
                Text(
                  'Tap to upload permit photo',
                  style: GoogleFonts.poppins(color: Colors.grey[600]),
                ),
                const SizedBox(height: 16),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    ElevatedButton.icon(
                      onPressed: () =>
                          _pickLocalityPermitImage(useCamera: true),
                      icon: const Icon(Icons.camera_alt, size: 16),
                      label: const Text(
                        'Camera',
                        style: TextStyle(fontSize: 12),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.blue,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                    OutlinedButton.icon(
                      onPressed: () =>
                          _pickLocalityPermitImage(useCamera: false),
                      icon: const Icon(Icons.photo_library, size: 16),
                      label: const Text(
                        'Gallery',
                        style: TextStyle(fontSize: 12),
                      ),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.blue,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                        side: const BorderSide(color: Colors.blue),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                // Optional issue / expiry dates for locality permit
                Row(
                  children: [
                    Expanded(
                      child: GestureDetector(
                        onTap: () async {
                          final picked = await showDatePicker(
                            context: context,
                            initialDate:
                                _localityPermitIssueDate ?? DateTime.now(),
                            firstDate: DateTime(2000),
                            lastDate: DateTime(2100),
                          );
                          if (picked != null) {
                            setState(() => _localityPermitIssueDate = picked);
                          }
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            vertical: 12,
                            horizontal: 12,
                          ),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.grey[300]!),
                          ),
                          child: Text(
                            _localityPermitIssueDate != null
                                ? 'Issue: ${_formatDate(_localityPermitIssueDate!)}'
                                : 'Select issue date',
                            style: GoogleFonts.poppins(fontSize: 13),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: GestureDetector(
                        onTap: () async {
                          final picked = await showDatePicker(
                            context: context,
                            initialDate:
                                _localityPermitExpiryDate ?? DateTime.now(),
                            firstDate: DateTime(2000),
                            lastDate: DateTime(2100),
                          );
                          if (picked != null) {
                            setState(() => _localityPermitExpiryDate = picked);
                          }
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            vertical: 12,
                            horizontal: 12,
                          ),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.grey[300]!),
                          ),
                          child: Text(
                            _localityPermitExpiryDate != null
                                ? 'Expiry: ${_formatDate(_localityPermitExpiryDate!)}'
                                : 'Select expiry date',
                            style: GoogleFonts.poppins(fontSize: 13),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                if ((_localityPermitIssueDate != null ||
                        _localityPermitExpiryDate != null) &&
                    (_localityPermitIssueDate == null ||
                        _localityPermitExpiryDate == null ||
                        (_localityPermitIssueDate != null &&
                            _localityPermitExpiryDate != null &&
                            _localityPermitExpiryDate!.isBefore(
                              _localityPermitIssueDate!,
                            )))) ...[
                  Text(
                    'Please ensure both Issue and Expiry dates are set and Expiry is after Issue.',
                    style: GoogleFonts.poppins(color: Colors.red, fontSize: 12),
                  ),
                  const SizedBox(height: 8),
                ],
              ],
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _pickLocalityPermitImage({bool useCamera = false}) async {
    try {
      final XFile? image = await _imagePicker.pickImage(
        source: useCamera ? ImageSource.camera : ImageSource.gallery,
        imageQuality: 80,
        maxWidth: 1200,
      );

      if (image != null) {
        setState(() {
          _localityPermitImage = File(image.path);
          _localityPermitUploaded = true;
          // Ensure we're on upload step when an image is selected
          _currentStep = 1;
        });

        // Prompt immediately for dates after upload; dates are required for locality permit
        final saved = await _promptForLocalityPermitDates();
        if (saved != true) {
          // User cancelled or did not save dates — revert upload
          setState(() {
            _localityPermitImage = null;
            _localityPermitUploaded = false;
            _currentStep = 0;
            _localityPermitIssueDate = null;
            _localityPermitExpiryDate = null;
          });
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Locality permit upload cancelled: dates are required',
              ),
              backgroundColor: AppColors.primaryBlue,
            ),
          );
          return;
        }

        // Ensure UI updates and canProceed recalculates
        setState(() {});
      }
    } catch (e) {
      debugPrint('Error picking image: $e');
    }
  }

  /// Prompt the coordinator to optionally enter Issue and Expiry dates
  Future<bool> _promptForLocalityPermitDates() async {
    DateTime? tempIssue = _localityPermitIssueDate;
    DateTime? tempExpiry = _localityPermitExpiryDate;

    final result = await showDialog<String?>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setStateDialog) {
            return AlertDialog(
              title: const Text('Enter Permit Dates'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  GestureDetector(
                    onTap: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: tempIssue ?? DateTime.now(),
                        firstDate: DateTime(2000),
                        lastDate: DateTime(2100),
                      );
                      if (picked != null) {
                        setStateDialog(() => tempIssue = picked);
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        vertical: 12,
                        horizontal: 12,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.grey[300]!),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.calendar_today,
                            size: 18,
                            color: Colors.grey[700],
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              tempIssue != null
                                  ? 'Issue: ${_formatDate(tempIssue!)}'
                                  : 'Select issue date',
                              style: GoogleFonts.poppins(fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  GestureDetector(
                    onTap: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: tempExpiry ?? DateTime.now(),
                        firstDate: DateTime(2000),
                        lastDate: DateTime(2100),
                      );
                      if (picked != null) {
                        setStateDialog(() => tempExpiry = picked);
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        vertical: 12,
                        horizontal: 12,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.grey[300]!),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.calendar_today_outlined,
                            size: 18,
                            color: Colors.grey[700],
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              tempExpiry != null
                                  ? 'Expiry: ${_formatDate(tempExpiry!)}'
                                  : 'Select expiry date',
                              style: GoogleFonts.poppins(fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  if ((tempIssue != null || tempExpiry != null) &&
                      (tempIssue == null ||
                          tempExpiry == null ||
                          (tempIssue != null &&
                              tempExpiry != null &&
                              tempExpiry!.isBefore(tempIssue!))))
                    Text(
                      'Please provide both dates and ensure Expiry is after Issue.',
                      style: GoogleFonts.poppins(
                        color: Colors.red,
                        fontSize: 12,
                      ),
                    ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context, null),
                  child: const Text('Cancel'),
                ),
                TextButton(
                  onPressed: () => Navigator.pop(context, 'skip'),
                  child: const Text('Skip'),
                ),
                ElevatedButton(
                  onPressed: () {
                    // Validate before closing
                    if ((tempIssue != null || tempExpiry != null) &&
                        (tempIssue == null || tempExpiry == null)) {
                      // keep dialog open
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Please set both dates or Skip.'),
                        ),
                      );
                      return;
                    }
                    if (tempIssue != null &&
                        tempExpiry != null &&
                        tempExpiry!.isBefore(tempIssue!)) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Expiry must be after Issue.'),
                        ),
                      );
                      return;
                    }

                    // Save to state
                    setState(() {
                      _localityPermitIssueDate = tempIssue;
                      _localityPermitExpiryDate = tempExpiry;
                    });

                    Navigator.pop(context, 'saved');
                  },
                  child: const Text('Save'),
                ),
              ],
            );
          },
        );
      },
    );

    if (result == 'saved') {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Permit dates recorded')));
      return true;
    }

    return false;
  }

  Widget _buildNavigationButtons() {
    final isLastStep = _currentStep == 1;
    final canProceed = _canProceed();

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        if (_currentStep > 0)
          OutlinedButton.icon(
            onPressed: () => setState(() => _currentStep--),
            icon: const Icon(Icons.arrow_back, size: 18),
            label: const Text('Back'),
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.blue,
              side: const BorderSide(color: Colors.blue, width: 1.5),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          )
        else
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'Cancel',
              style: GoogleFonts.poppins(color: Colors.grey[600]),
            ),
          ),
        if (!isLastStep)
          Container(
            decoration: BoxDecoration(
              gradient: canProceed
                  ? LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Colors.blue, Colors.blue[700]!],
                    )
                  : null,
              borderRadius: BorderRadius.circular(12),
            ),
            child: ElevatedButton.icon(
              onPressed: canProceed ? () => _goToNextStep() : null,
              icon: const Icon(Icons.arrow_forward, size: 18),
              label: const Text('Next'),
              style: ElevatedButton.styleFrom(
                backgroundColor: canProceed ? Colors.transparent : null,
                disabledBackgroundColor: const Color(0xFFE5E7EB),
                foregroundColor: Colors.white,
                shadowColor: Colors.transparent,
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 12,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          )
        else
          Container(
            decoration: BoxDecoration(
              gradient: canProceed
                  ? const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFF10B981), Color(0xFF059669)],
                    )
                  : null,
              borderRadius: BorderRadius.circular(12),
            ),
            child: ElevatedButton.icon(
              onPressed: canProceed ? _complete : null,
              icon: const Icon(Icons.check_circle, size: 18),
              label: const Text('Complete'),
              style: ElevatedButton.styleFrom(
                backgroundColor: canProceed ? Colors.transparent : null,
                disabledBackgroundColor: const Color(0xFFE5E7EB),
                foregroundColor: Colors.white,
                shadowColor: Colors.transparent,
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 12,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
      ],
    );
  }

  bool _canProceed() {
    switch (_currentStep) {
      case 0:
        return _statePermitConfirmed;
      case 1:
        // Allow proceeding even when an image wasn't uploaded (user may choose to
        // proceed without a locality permit). If dates are provided, validate them.
        if (_localityPermitIssueDate != null ||
            _localityPermitExpiryDate != null) {
          if (_localityPermitIssueDate == null ||
              _localityPermitExpiryDate == null) {
            return false;
          }
          if (_localityPermitExpiryDate!.isBefore(_localityPermitIssueDate!)) {
            return false;
          }
        }
        return true;
      default:
        return false;
    }
  }

  void _goToNextStep() {
    setState(() => _currentStep++);
  }

  void _complete() async {
    // If no image uploaded, offer to proceed without locality permit (confirmation)
    if (!_localityPermitUploaded) {
      final confirm = await showDialog<String?>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('No locality permit uploaded'),
          content: const Text(
            'You have not uploaded a locality permit image. Would you like to proceed without uploading it? Sites in this locality will be marked ready for verification.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, 'cancel'),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, 'upload'),
              child: const Text('Upload'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, 'proceed'),
              child: const Text('Proceed without permit'),
            ),
          ],
        ),
      );

      if (confirm == 'cancel' || confirm == null) return; // do nothing
      if (confirm == 'upload') return; // allow user to upload

      // If user chose to proceed without permit, signal parent
      if (confirm == 'proceed') {
        widget.onComplete({'proceed_without_locality_permit': true});
        return;
      }
    }

    // If both dates are not provided, require user to enter them
    if (_localityPermitIssueDate == null && _localityPermitExpiryDate == null) {
      final saved = await _promptForLocalityPermitDates();
      if (!saved) {
        // user cancelled or did not save required dates
        return;
      }
    }

    // If only one date is set, block
    if ((_localityPermitIssueDate == null) !=
        (_localityPermitExpiryDate == null)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Please provide both Issue and Expiry dates or leave both empty.',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    // If both set, ensure expiry > issue
    if (_localityPermitIssueDate != null && _localityPermitExpiryDate != null) {
      if (_localityPermitExpiryDate!.isBefore(_localityPermitIssueDate!)) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Expiry date must be after the issue date.'),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }
    }

    // All good - complete
    widget.onComplete({
      'state_permit_confirmed': true,
      'locality_permit_uploaded': _localityPermitUploaded,
      if (_localityPermitIssueDate != null)
        'locality_permit_issue_date': _formatDate(_localityPermitIssueDate!),
      if (_localityPermitExpiryDate != null)
        'locality_permit_expiry_date': _formatDate(_localityPermitExpiryDate!),
    });
  }
}

/// Verification Dialog with Visit Date Input
/// Supports both single date (non-DM) and date range (DM activities like GFA, CBT, EBSFP)
class _VerificationDialog extends StatefulWidget {
  final Map<String, dynamic> site;
  final bool isDMActivity;
  final bool isMultiVisitActivity;
  final bool isUrgentActivity;

  const _VerificationDialog({
    required this.site,
    required this.isDMActivity,
    this.isMultiVisitActivity = false,
    this.isUrgentActivity = false,
  });

  @override
  State<_VerificationDialog> createState() => _VerificationDialogState();
}

class _VerificationDialogState extends State<_VerificationDialog> {
  final TextEditingController _notesController = TextEditingController();
  DateTime? _visitDate;
  DateTime? _distributionStart;
  DateTime? _distributionEnd;
  DateTime? _followUpDate; // For multi-visit activities
  bool _requiresFollowUp = false; // For multi-visit activities

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final siteName = widget.site['site_name']?.toString() ?? 'Unknown Site';
    final activity =
        '${widget.site['main_activity'] ?? ''} ${widget.site['activity'] ?? ''}'
            .trim();

    // Determine activity type
    final isMultiVisit = widget.isMultiVisitActivity;
    final isUrgent = widget.isUrgentActivity;

    return AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.green.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.verified, color: Colors.green, size: 24),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'Verify Site',
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Site info
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    siteName,
                    style: GoogleFonts.poppins(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (activity.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      'Activity: $activity',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                  ],
                  // Activity type indicator
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: widget.isDMActivity
                          ? Colors.blue.withOpacity(0.1)
                          : isMultiVisit
                          ? AppColors.primaryBlue.withOpacity(0.06)
                          : isUrgent
                          ? Colors.red.withOpacity(0.1)
                          : Colors.green.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: widget.isDMActivity
                            ? Colors.blue.withOpacity(0.3)
                            : isMultiVisit
                            ? AppColors.primaryBlue.withOpacity(0.3)
                            : isUrgent
                            ? Colors.red.withOpacity(0.3)
                            : Colors.green.withOpacity(0.3),
                      ),
                    ),
                    child: Text(
                      widget.isDMActivity
                          ? 'Distribution Activity (DM)'
                          : isMultiVisit
                          ? 'Multi-Visit Activity'
                          : isUrgent
                          ? 'Urgent Activity'
                          : 'Standard Activity',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: widget.isDMActivity
                            ? Colors.blue[700]
                            : isMultiVisit
                            ? AppColors.primaryBlue
                            : isUrgent
                            ? Colors.red[700]
                            : Colors.green[700],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Date inputs based on activity type
            if (widget.isDMActivity) ...[
              // DM Activities: 3 date fields
              Text(
                'Expected Distribution Start *',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: AppColors.primaryBlue,
                ),
              ),
              const SizedBox(height: 8),
              _buildDatePicker(
                label: 'Select Start Date',
                value: _distributionStart,
                onTap: () async {
                  final date = await showDatePicker(
                    context: context,
                    initialDate: _distributionStart ?? DateTime.now(),
                    firstDate: DateTime.now().subtract(
                      const Duration(days: 30),
                    ),
                    lastDate: DateTime.now().add(const Duration(days: 365)),
                  );
                  if (date != null) {
                    setState(() => _distributionStart = date);
                  }
                },
              ),
              const SizedBox(height: 16),

              Text(
                'Expected Distribution End *',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: AppColors.primaryBlue,
                ),
              ),
              const SizedBox(height: 8),
              _buildDatePicker(
                label: 'Select End Date',
                value: _distributionEnd,
                onTap: () async {
                  final date = await showDatePicker(
                    context: context,
                    initialDate:
                        _distributionEnd ??
                        _distributionStart ??
                        DateTime.now(),
                    firstDate: _distributionStart ?? DateTime.now(),
                    lastDate: DateTime.now().add(const Duration(days: 365)),
                  );
                  if (date != null) {
                    setState(() => _distributionEnd = date);
                  }
                },
              ),
              const SizedBox(height: 16),

              Text(
                'Expected Visit Date *',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: AppColors.primaryBlue,
                ),
              ),
              const SizedBox(height: 8),
              _buildDatePicker(
                label: 'Select Date (must be within distribution period)',
                value: _visitDate,
                onTap: () async {
                  final firstDate =
                      _distributionStart ??
                      DateTime.now().subtract(const Duration(days: 30));
                  final lastDate =
                      _distributionEnd ??
                      DateTime.now().add(const Duration(days: 365));
                  final date = await showDatePicker(
                    context: context,
                    initialDate: _visitDate ?? DateTime.now(),
                    firstDate: firstDate,
                    lastDate: lastDate,
                  );
                  if (date != null) {
                    setState(() => _visitDate = date);
                  }
                },
              ),
              const SizedBox(height: 16),
            ] else if (isMultiVisit) ...[
              // Multi-visit activities: Initial visit + follow-up option
              Text(
                'Visit Schedule *',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: AppColors.primaryBlue,
                ),
              ),
              const SizedBox(height: 8),

              // Initial Visit Date
              _buildDatePicker(
                label: 'Initial Visit Date',
                value: _visitDate,
                onTap: () async {
                  final date = await showDatePicker(
                    context: context,
                    initialDate: _visitDate ?? DateTime.now(),
                    firstDate: isUrgent
                        ? DateTime.now()
                        : DateTime.now().subtract(const Duration(days: 30)),
                    lastDate: DateTime.now().add(const Duration(days: 365)),
                  );
                  if (date != null) {
                    setState(() => _visitDate = date);
                  }
                },
              ),
              const SizedBox(height: 12),

              // Follow-up visit option
              Row(
                children: [
                  Checkbox(
                    value: _requiresFollowUp,
                    onChanged: (value) {
                      setState(() => _requiresFollowUp = value ?? false);
                    },
                    activeColor: AppColors.primaryBlue,
                  ),
                  Expanded(
                    child: Text(
                      'Schedule follow-up visit',
                      style: GoogleFonts.poppins(fontSize: 14),
                    ),
                  ),
                ],
              ),

              if (_requiresFollowUp) ...[
                const SizedBox(height: 8),
                _buildDatePicker(
                  label: 'Follow-up Date',
                  value: _followUpDate,
                  onTap: () async {
                    final date = await showDatePicker(
                      context: context,
                      initialDate:
                          _followUpDate ??
                          (_visitDate?.add(const Duration(days: 30)) ??
                              DateTime.now().add(const Duration(days: 30))),
                      firstDate: _visitDate ?? DateTime.now(),
                      lastDate: DateTime.now().add(const Duration(days: 365)),
                    );
                    if (date != null) {
                      setState(() => _followUpDate = date);
                    }
                  },
                ),
              ],
              const SizedBox(height: 16),
            ] else if (isUrgent) ...[
              // Urgent activities: Today or tomorrow only
              Text(
                'Urgent Visit Date *',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: Colors.red,
                ),
              ),
              const SizedBox(height: 8),

              _buildDatePicker(
                label: 'Visit Date (Today/Tomorrow)',
                value: _visitDate,
                onTap: () async {
                  final date = await showDatePicker(
                    context: context,
                    initialDate: DateTime.now(),
                    firstDate: DateTime.now(),
                    lastDate: DateTime.now().add(const Duration(days: 1)),
                  );
                  if (date != null) {
                    setState(() => _visitDate = date);
                  }
                },
              ),
              const SizedBox(height: 16),
            ] else ...[
              // Standard activities: Expected visit date
              Text(
                'Expected Visit Date *',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: AppColors.primaryBlue,
                ),
              ),
              const SizedBox(height: 8),

              _buildDatePicker(
                label: 'Select Date',
                value: _visitDate,
                onTap: () async {
                  final date = await showDatePicker(
                    context: context,
                    initialDate: _visitDate ?? DateTime.now(),
                    firstDate: DateTime.now().subtract(
                      const Duration(days: 30),
                    ),
                    lastDate: DateTime.now().add(const Duration(days: 365)),
                  );
                  if (date != null) {
                    setState(() => _visitDate = date);
                  }
                },
              ),
              const SizedBox(height: 16),
            ],

            // Expected Visit Date (for DM activities only)
            if (widget.isDMActivity) ...[
              Text(
                'Expected Visit Date (within distribution period) *',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: AppColors.primaryBlue,
                ),
              ),
              const SizedBox(height: 8),
              _buildDatePicker(
                label: 'Select Date',
                value: _visitDate,
                onTap: () async {
                  final firstDate =
                      widget.isDMActivity && _distributionStart != null
                      ? _distributionStart!
                      : DateTime.now().subtract(const Duration(days: 30));
                  final lastDate =
                      widget.isDMActivity && _distributionEnd != null
                      ? _distributionEnd!
                      : DateTime.now().add(const Duration(days: 365));

                  final date = await showDatePicker(
                    context: context,
                    initialDate: _visitDate ?? DateTime.now(),
                    firstDate: firstDate,
                    lastDate: lastDate,
                  );
                  if (date != null) {
                    setState(() => _visitDate = date);
                  }
                },
              ),
              const SizedBox(height: 16),
            ],

            // Info box
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.blue.withOpacity(0.3)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, color: Colors.blue, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'This will mark the site as verified and notify supervisors.',
                      style: GoogleFonts.poppins(fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Verification Notes (optional)',
              style: GoogleFonts.poppins(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: Colors.black87,
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _notesController,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: 'Add any notes about this verification...',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, null),
          child: Text(
            'Cancel',
            style: GoogleFonts.poppins(color: Colors.grey[600]),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            gradient: _canVerify()
                ? const LinearGradient(
                    colors: [Color(0xFF10B981), Color(0xFF059669)],
                  )
                : null,
            borderRadius: BorderRadius.circular(8),
            color: _canVerify() ? null : Colors.grey[300],
          ),
          child: ElevatedButton.icon(
            onPressed: _canVerify()
                ? () {
                    Navigator.pop(context, {
                      'visit_date': _visitDate,
                      'distribution_start': _distributionStart,
                      'distribution_end': _distributionEnd,
                      'follow_up_date': _followUpDate,
                      'activity_type': widget.isDMActivity
                          ? 'distribution'
                          : widget.isMultiVisitActivity
                          ? 'multi_visit'
                          : widget.isUrgentActivity
                          ? 'urgent'
                          : 'standard',
                      'requires_follow_up':
                          widget.isMultiVisitActivity && _requiresFollowUp,
                    });
                  }
                : null,
            icon: const Icon(Icons.check_circle, size: 18),
            label: const Text('Verify'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.transparent,
              shadowColor: Colors.transparent,
              disabledBackgroundColor: Colors.transparent,
              disabledForegroundColor: Colors.grey[600],
            ),
          ),
        ),
      ],
    );
  }

  bool _canVerify() {
    // All activities require a visit date
    if (_visitDate == null) return false;

    // DM activities require distribution period
    if (widget.isDMActivity) {
      if (_distributionStart == null || _distributionEnd == null) return false;
      // Validate visit date is within distribution period
      if (_visitDate!.isBefore(_distributionStart!) ||
          _visitDate!.isAfter(_distributionEnd!)) {
        return false;
      }
    }

    // Multi-visit activities require follow-up date if follow-up is requested
    if (widget.isMultiVisitActivity && _requiresFollowUp) {
      if (_followUpDate == null) return false;
    }

    return true;
  }

  Widget _buildDatePicker({
    required String label,
    required DateTime? value,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        decoration: BoxDecoration(
          border: Border.all(
            color: value != null ? AppColors.primaryBlue : Colors.grey[300]!,
          ),
          borderRadius: BorderRadius.circular(8),
          color: value != null
              ? AppColors.primaryBlue.withOpacity(0.05)
              : Colors.grey[50],
        ),
        child: Row(
          children: [
            Icon(
              Icons.calendar_today,
              size: 18,
              color: value != null ? AppColors.primaryBlue : Colors.grey[600],
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                value != null
                    ? DateFormat('MMM dd, yyyy').format(value)
                    : label,
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  color: value != null ? Colors.black87 : Colors.grey[600],
                ),
              ),
            ),
            Icon(Icons.arrow_drop_down, color: Colors.grey[600]),
          ],
        ),
      ),
    );
  }
}

// Bulk Locality Permit Requirement Dialog
class _BulkLocalityPermitRequirementDialog extends StatefulWidget {
  final String locality;
  final String state;
  final int siteCount;

  const _BulkLocalityPermitRequirementDialog({
    required this.locality,
    required this.state,
    required this.siteCount,
  });

  @override
  State<_BulkLocalityPermitRequirementDialog> createState() =>
      _BulkLocalityPermitRequirementDialogState();
}

class _BulkLocalityPermitRequirementDialogState
    extends State<_BulkLocalityPermitRequirementDialog> {
  String? _localityPermitRequirement;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Row(
        children: [
          Icon(Icons.location_on, color: Colors.green[600], size: 24),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Bulk Locality Permit Verification',
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: Colors.green[800],
              ),
            ),
          ),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Verify locality permit requirements for ${widget.locality}, ${widget.state}',
            style: GoogleFonts.poppins(fontSize: 13, color: Colors.grey[600]),
          ),
          Text(
            '${widget.siteCount} sites will be affected',
            style: GoogleFonts.poppins(
              fontSize: 12,
              color: Colors.grey[500],
              fontStyle: FontStyle.italic,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'Do you require a Locality permit in this locality?',
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.w500,
              color: Colors.grey[800],
            ),
          ),
          const SizedBox(height: 16),
          _buildOptionWithDescription(
            'Yes, it\'s required and I will upload it',
            'I have the locality permit and will upload it now',
            'required_have_it',
            _localityPermitRequirement,
            (value) => setState(() => _localityPermitRequirement = value),
          ),
          _buildOptionWithDescription(
            'Yes, it\'s required but I don\'t have it',
            'The locality permit is required but not available',
            'required_dont_have_it',
            _localityPermitRequirement,
            (value) => setState(() => _localityPermitRequirement = value),
          ),
          _buildOptionWithDescription(
            'No, it\'s not a requirement',
            'Locality permit is not required in this locality',
            'not_required',
            _localityPermitRequirement,
            (value) => setState(() => _localityPermitRequirement = value),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text('Cancel', style: GoogleFonts.poppins()),
        ),
        ElevatedButton(
          onPressed: _localityPermitRequirement != null
              ? () => Navigator.of(
                  context,
                ).pop({'requirement': _localityPermitRequirement})
              : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primaryBlue,
          ),
          child: Text('Next', style: GoogleFonts.poppins(color: Colors.white)),
        ),
      ],
    );
  }

  Widget _buildOptionWithDescription(
    String label,
    String description,
    String value,
    String? selectedValue,
    Function(String) onSelect,
  ) {
    final isSelected = selectedValue == value;
    return InkWell(
      onTap: () => onSelect(value),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: isSelected
              ? LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    AppColors.primaryBlue.withOpacity(0.15),
                    AppColors.primaryBlue.withOpacity(0.05),
                  ],
                )
              : null,
          border: Border.all(
            color: isSelected ? AppColors.primaryBlue : Colors.grey[300]!,
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Icon(
              isSelected
                  ? Icons.radio_button_checked
                  : Icons.radio_button_unchecked,
              color: isSelected ? AppColors.primaryBlue : Colors.grey[400],
              size: 20,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: GoogleFonts.poppins(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: isSelected
                          ? AppColors.primaryBlue
                          : Colors.black87,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    description,
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// Bulk Locality Permit Follow-up Dialog
class _BulkLocalityPermitFollowUpDialog extends StatefulWidget {
  final String locality;
  final String state;
  final int siteCount;

  const _BulkLocalityPermitFollowUpDialog({
    required this.locality,
    required this.state,
    required this.siteCount,
  });

  @override
  State<_BulkLocalityPermitFollowUpDialog> createState() =>
      _BulkLocalityPermitFollowUpDialogState();
}

class _BulkLocalityPermitFollowUpDialogState
    extends State<_BulkLocalityPermitFollowUpDialog> {
  String? _canWorkWithoutLocalityPermit;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Row(
        children: [
          Icon(Icons.warning_amber, color: AppColors.primaryBlue, size: 24),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Locality Permit Not Available',
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: AppColors.primaryBlue,
              ),
            ),
          ),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'You indicated the locality permit for ${widget.locality}, ${widget.state} is required but not available',
            style: GoogleFonts.poppins(fontSize: 13, color: Colors.grey[600]),
          ),
          Text(
            '${widget.siteCount} sites will be affected',
            style: GoogleFonts.poppins(
              fontSize: 12,
              color: Colors.grey[500],
              fontStyle: FontStyle.italic,
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.primaryBlue.withOpacity(0.05),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: AppColors.primaryBlue.withOpacity(0.12),
              ),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.info_outline,
                  color: AppColors.primaryBlue,
                  size: 20,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'The locality permit is required but you don\'t have it. Can you proceed with the verification without it?',
                    style: GoogleFonts.poppins(
                      fontSize: 13,
                      color: AppColors.primaryBlue,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'Are you able to work without the locality permit?',
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.w500,
              color: Colors.grey[800],
            ),
          ),
          const SizedBox(height: 16),
          _buildOptionWithDescription(
            'Yes, I can proceed without it',
            'I will continue with the verification',
            'yes',
            _canWorkWithoutLocalityPermit,
            (value) => setState(() => _canWorkWithoutLocalityPermit = value),
          ),
          _buildOptionWithDescription(
            'No, I cannot proceed without it',
            'Send the sites back to FOM for action',
            'no',
            _canWorkWithoutLocalityPermit,
            (value) => setState(() => _canWorkWithoutLocalityPermit = value),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text('Cancel', style: GoogleFonts.poppins()),
        ),
        ElevatedButton(
          onPressed: _canWorkWithoutLocalityPermit != null
              ? () => Navigator.of(
                  context,
                ).pop({'canWorkWithout': _canWorkWithoutLocalityPermit})
              : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: _canWorkWithoutLocalityPermit == 'no'
                ? Colors.red
                : AppColors.primaryBlue,
          ),
          child: Text(
            _canWorkWithoutLocalityPermit == 'no'
                ? 'Send Back to FOM'
                : 'Continue',
            style: GoogleFonts.poppins(color: Colors.white),
          ),
        ),
      ],
    );
  }

  Widget _buildOptionWithDescription(
    String label,
    String description,
    String value,
    String? selectedValue,
    Function(String) onSelect,
  ) {
    final isSelected = selectedValue == value;
    return InkWell(
      onTap: () => onSelect(value),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: isSelected
              ? LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    AppColors.primaryBlue.withOpacity(0.15),
                    AppColors.primaryBlue.withOpacity(0.05),
                  ],
                )
              : null,
          border: Border.all(
            color: isSelected ? AppColors.primaryBlue : Colors.grey[300]!,
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Icon(
              isSelected
                  ? Icons.radio_button_checked
                  : Icons.radio_button_unchecked,
              color: isSelected ? AppColors.primaryBlue : Colors.grey[400],
              size: 20,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: GoogleFonts.poppins(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: isSelected
                          ? AppColors.primaryBlue
                          : Colors.black87,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    description,
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
