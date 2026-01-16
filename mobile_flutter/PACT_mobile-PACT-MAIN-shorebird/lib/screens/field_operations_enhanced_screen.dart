import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:geolocator/geolocator.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../widgets/reusable_app_bar.dart';
import '../widgets/custom_drawer_menu.dart';
import '../widgets/notifications_panel.dart';
import '../widgets/main_layout.dart';
import '../widgets/start_visit_dialog.dart';
import '../widgets/visit_report_dialog.dart';
import '../theme/app_colors.dart';
import '../services/location_service.dart';
import '../services/photo_upload_service.dart';
import '../services/advance_request_service.dart';
import '../services/offline_data_service.dart';
import '../services/offline/sync_manager.dart';
import '../models/visit_report.dart';
import '../models/visit_report_data.dart';
import '../widgets/request_advance_dialog.dart';
import '../models/site_visit.dart';
import 'visit_report_detail_screen.dart';

class FieldOperationsEnhancedScreen extends StatefulWidget {
  const FieldOperationsEnhancedScreen({super.key});

  @override
  State<FieldOperationsEnhancedScreen> createState() => _MMPScreenState();
}

// Alias for backward compatibility
typedef MMPScreen = FieldOperationsEnhancedScreen;

class _MMPScreenState extends State<MMPScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();

  bool _isLoading = true;
  bool _isCoordinator = false;
  bool _isDataCollector = false;
  String? _userId;
  String? _userStateId;
  String? _userLocalityId;
  String? _userStateName;
  String? _userLocalityName;
  String? _userRole;
  List<String> _userProjectIds = [];
  bool _isAdminOrSuperUser = false;

  // Tab states
  final String _activeTab = 'my-assignments';
  String _enumeratorSubTab = 'claimable';
  String _mySitesSubTab = 'pending';

  // Site entries
  List<Map<String, dynamic>> _availableSites = [];
  List<Map<String, dynamic>> _smartAssignedSites = [];
  List<Map<String, dynamic>> _mySites = [];
  List<Map<String, dynamic>> _unsyncedCompletedVisits = [];
  List<Map<String, dynamic>> _coordinatorSites = [];

  // Advance requests map: siteId -> request data
  Map<String, Map<String, dynamic>> _advanceRequests = {};
  bool _loadingAdvanceRequests = false;

  // Grouped data
  Map<String, List<Map<String, dynamic>>> _groupedByStateLocality = {};

  // Search
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  RealtimeChannel? _realtimeChannel;

  @override
  void initState() {
    super.initState();
    _initializeMMP();
  }

  @override
  void dispose() {
    _realtimeChannel?.unsubscribe();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _initializeMMP() async {
    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) {
        if (!mounted) return;
        setState(() => _isLoading = false);
        return;
      }

      _userId = user.id;

      // Get user profile to determine role
      final profileResponse = await Supabase.instance.client
          .from('profiles')
          .select('role, state_id, locality_id')
          .eq('id', user.id)
          .maybeSingle();

      if (profileResponse != null) {
        _userRole = (profileResponse['role'] as String?)?.toLowerCase() ?? '';
        _isCoordinator =
            _userRole == 'coordinator' ||
            _userRole == 'field_coordinator' ||
            _userRole == 'state_coordinator';
        _isDataCollector =
            _userRole == 'datacollector' ||
            _userRole == 'enumerator' ||
            _userRole == 'data_collector';

        _userStateId = profileResponse['state_id'] as String?;
        _userLocalityId = profileResponse['locality_id'] as String?;

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

        // Query actual state and locality names from database
        await _loadLocationNames();
      }

      // Load data based on role
      // Coordinators should see the same MMP experience as data collectors
      if (_isDataCollector || _isCoordinator) {
        await _loadDataCollectorData();
        _setupRealtimeSubscription();
      }

      if (!mounted) return;
      setState(() => _isLoading = false);
    } catch (e) {
      debugPrint('Error initializing MMP: $e');
      if (!mounted) return;
      setState(() => _isLoading = false);
    }
  }

  void _setupRealtimeSubscription() {
    try {
      _realtimeChannel?.unsubscribe();

      _realtimeChannel = Supabase.instance.client
          .channel('mmp_realtime')
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'mmp_site_entries',
            callback: (payload) {
              debugPrint('mmp_site_entries changed, reloading...');
              if (_isDataCollector || _isCoordinator) {
                _loadDataCollectorData();
              }
            },
          )
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'down_payment_requests',
            callback: (payload) async {
              debugPrint('down_payment_requests changed, reloading...');
              if (!_isDataCollector && !_isCoordinator) return;
              if (!mounted) return;
              await _loadAdvanceRequests();
              if (!mounted) return;
              setState(() {});
            },
          )
          .subscribe();
    } catch (e) {
      debugPrint('Error setting up real-time subscription: $e');
    }
  }

  Future<void> _loadDataCollectorData({
    bool preserveExistingData = false,
  }) async {
    final supabase = Supabase.instance.client;

    try {
      // Validate session before starting reload
      var session = supabase.auth.currentSession;
      if (session == null || session.isExpired) {
        debugPrint('[_loadDataCollectorData] Session expired, refreshing...');
        try {
          await supabase.auth.refreshSession();
          session = supabase.auth.currentSession;
          if (session == null) {
            debugPrint(
              '[_loadDataCollectorData] Session refresh failed - aborting reload',
            );
            return;
          }
          // Update _userId if it changed
          final currentUserId = supabase.auth.currentUser?.id;
          if (currentUserId != null) {
            _userId = currentUserId;
          }
        } catch (refreshError) {
          debugPrint(
            '[_loadDataCollectorData] Session refresh error: $refreshError',
          );
          return;
        }
      }

      // Re-validate _userId from current session
      final currentUserId = supabase.auth.currentUser?.id;
      if (currentUserId == null) {
        debugPrint(
          '[_loadDataCollectorData] User ID is null - aborting reload',
        );
        return;
      }
      _userId = currentUserId;

      debugPrint(
        '[_loadDataCollectorData] Starting reload with userId: $_userId (preserveExistingData: $preserveExistingData)',
      );

      // If preserving data, don't clear existing lists - they'll be updated with new data
      if (!preserveExistingData) {
        // Only clear if this is a fresh load, not a background refresh
      }

      // Load available sites (Dispatched, not accepted, in collector's area)
      await _loadAvailableSites();

      // Verify session after each major operation
      session = supabase.auth.currentSession;
      if (session == null || session.isExpired) {
        debugPrint(
          '[_loadDataCollectorData] Session expired after _loadAvailableSites, refreshing...',
        );
        await supabase.auth.refreshSession();
      }

      // Load smart assigned sites (status = 'Assigned', accepted_by = currentUser, not cost-acknowledged)
      await _loadSmartAssignedSites();

      // Verify session
      session = supabase.auth.currentSession;
      if (session == null || session.isExpired) {
        debugPrint(
          '[_loadDataCollectorData] Session expired after _loadSmartAssignedSites, refreshing...',
        );
        await supabase.auth.refreshSession();
      }

      // Load my sites (all sites accepted by this collector)
      await _loadMySites();

      // Verify session
      session = supabase.auth.currentSession;
      if (session == null || session.isExpired) {
        debugPrint(
          '[_loadDataCollectorData] Session expired after _loadMySites, refreshing...',
        );
        await supabase.auth.refreshSession();
      }

      // Load unsynced completed visits (from offline DB if available)
      await _loadUnsyncedCompletedVisits();

      // Load advance requests
      await _loadAdvanceRequests();

      // Group available sites by state-locality
      _groupAvailableSites();

      debugPrint('[_loadDataCollectorData] Reload completed successfully');
    } catch (e) {
      debugPrint(
        '[_loadDataCollectorData] Error loading data collector data: $e',
      );

      // Check if it's an auth error
      final errorStr = e.toString().toLowerCase();
      if (errorStr.contains('auth') ||
          errorStr.contains('unauthorized') ||
          errorStr.contains('jwt') ||
          errorStr.contains('token')) {
        debugPrint(
          '[_loadDataCollectorData] Auth error during reload - attempting recovery',
        );
        try {
          await supabase.auth.refreshSession();
          debugPrint(
            '[_loadDataCollectorData] Session refreshed after auth error',
          );
        } catch (refreshError) {
          debugPrint(
            '[_loadDataCollectorData] Session refresh after error failed: $refreshError',
          );
          // Don't throw - just log and return, don't trigger logout
        }
      }
      // Don't rethrow - we don't want reload errors to cause logout
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
        final response = await Supabase.instance.client
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
        final projectsResponse = await Supabase.instance.client
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

  Future<void> _loadLocationNames() async {
    try {
      // Load state name from hub_states table
      if (_userStateId != null) {
        final hubState = await Supabase.instance.client
            .from('hub_states')
            .select('state_name')
            .eq('state_id', _userStateId!)
            .maybeSingle();

        if (hubState != null) {
          _userStateName = hubState['state_name'] as String?;
        } else {
          // Fallback: Try sites_registry if hub_states doesn't have it
          final registryState = await Supabase.instance.client
              .from('sites_registry')
              .select('state_name')
              .eq('state_id', _userStateId!)
              .limit(1)
              .maybeSingle();

          _userStateName = registryState?['state_name'] as String?;
        }

        debugPrint(
          'Loaded state name: $_userStateName for state_id: $_userStateId',
        );
      }

      // Load locality name from sites_registry table
      if (_userLocalityId != null && _userStateId != null) {
        final locality = await Supabase.instance.client
            .from('sites_registry')
            .select('locality_name')
            .eq('locality_id', _userLocalityId!)
            .eq('state_id', _userStateId!)
            .limit(1)
            .maybeSingle();

        _userLocalityName = locality?['locality_name'] as String?;
        debugPrint(
          'Loaded locality name: $_userLocalityName for locality_id: $_userLocalityId',
        );
      }
    } catch (e) {
      debugPrint('Error loading location names: $e');
      // If lookup fails, we'll show all dispatched sites (fallback behavior)
    }
  }

  Future<void> _loadAvailableSites() async {
    final supabase = Supabase.instance.client;

    try {
      if (_userId == null) return;

      // Check connectivity first
      final connectivityResult = await Connectivity().checkConnectivity();
      final isOffline = connectivityResult.contains(ConnectivityResult.none);
      
      if (isOffline) {
        debugPrint('[_loadAvailableSites] Offline - loading from cache');
        await _loadAvailableSitesFromCache();
        return;
      }

      // Verify session before query
      var session = supabase.auth.currentSession;
      if (session == null || session.isExpired) {
        debugPrint('[_loadAvailableSites] Session expired, refreshing...');
        await supabase.auth.refreshSession();
      }

      debugPrint('Loading available sites...');
      debugPrint('User state: $_userStateName (ID: $_userStateId)');
      debugPrint('User locality: $_userLocalityName (ID: $_userLocalityId)');

      // Build query step by step
      var query = supabase
          .from('mmp_site_entries')
          .select('*, mmp_files(project_id)')
          .ilike('status', 'Dispatched');

      // Filter by location if names are available
      // Only filter if we have actual names, not IDs
      if (_userLocalityName != null && _userLocalityName!.isNotEmpty) {
        debugPrint('Filtering by locality: $_userLocalityName');
        query = query.ilike('locality', _userLocalityName!);
      } else if (_userStateName != null && _userStateName!.isNotEmpty) {
        debugPrint('Filtering by state: $_userStateName');
        query = query.ilike('state', _userStateName!);
      } else {
        // If no location info, show all dispatched sites (remove location filter)
        debugPrint('No location info available - showing all dispatched sites');
      }

      final response = await query
          .order('created_at', ascending: false)
          .limit(1000);

      // Filter out sites that have been accepted (accepted_by is not null)
      List<Map<String, dynamic>> filteredSites = (response as List)
          .map((e) => e as Map<String, dynamic>)
          .where((site) => site['accepted_by'] == null)
          .toList();

      // Filter by project membership (for non-admin users)
      if (!_isAdminOrSuperUser) {
        final beforeCount = filteredSites.length;
        filteredSites = filteredSites.where((site) {
          final mmpFile = site['mmp_files'] as Map<String, dynamic>? ?? {};
          final projectId = mmpFile['project_id']?.toString();

          // If site has no project ID, exclude it
          if (projectId == null || projectId.isEmpty) {
            return false;
          }

          // Site must be in one of user's projects
          return _userProjectIds.contains(projectId);
        }).toList();

        debugPrint(
          'Filtered available sites by project: ${filteredSites.length} of $beforeCount',
        );
      }

      _availableSites = filteredSites;

      debugPrint('Loaded ${_availableSites.length} available sites');

      // Cache the sites for offline use
      await _cacheAvailableSites(filteredSites);

      // Debug: Print first few sites for verification
      if (_availableSites.isNotEmpty) {
        debugPrint(
          'Sample site: ${_availableSites.first['site_name']} - State: ${_availableSites.first['state']} - Locality: ${_availableSites.first['locality']}',
        );
      }
    } catch (e) {
      debugPrint('[_loadAvailableSites] Error loading available sites: $e');

      // Check if it's a network error - fall back to cache
      final errorStr = e.toString().toLowerCase();
      if (e is SocketException ||
          errorStr.contains('socketexception') ||
          errorStr.contains('failed host lookup') ||
          errorStr.contains('connection refused') ||
          errorStr.contains('network is unreachable') ||
          errorStr.contains('no address associated') ||
          errorStr.contains('connection timed out') ||
          errorStr.contains('errno = 7')) {
        debugPrint('[_loadAvailableSites] Network error - falling back to cache');
        await _loadAvailableSitesFromCache();
        return;
      }

      // Check if it's an auth error
      if (errorStr.contains('auth') ||
          errorStr.contains('unauthorized') ||
          errorStr.contains('jwt') ||
          errorStr.contains('token')) {
        debugPrint(
          '[_loadAvailableSites] Auth error - attempting session refresh',
        );
        try {
          await supabase.auth.refreshSession();
          // Don't retry automatically - just log and set empty list
        } catch (refreshError) {
          debugPrint(
            '[_loadAvailableSites] Session refresh failed: $refreshError',
          );
        }
      }

      // Try to load from cache as last resort
      if (_availableSites.isEmpty) {
        await _loadAvailableSitesFromCache();
      }
    }
  }

  Future<void> _cacheAvailableSites(List<Map<String, dynamic>> sites) async {
    try {
      final offlineDb = OfflineDb();
      await offlineDb.cacheItem(
        OfflineDb.siteCacheBox,
        'available_sites_$_userId',
        data: {'sites': sites},
        ttl: const Duration(hours: 24),
      );
      debugPrint('[_cacheAvailableSites] Cached ${sites.length} available sites');
    } catch (e) {
      debugPrint('[_cacheAvailableSites] Error caching sites: $e');
    }
  }

  Future<void> _loadAvailableSitesFromCache() async {
    try {
      final offlineDb = OfflineDb();
      final cachedItem = offlineDb.getCachedItem(
        OfflineDb.siteCacheBox,
        'available_sites_$_userId',
      );
      
      if (cachedItem != null && cachedItem.data != null) {
        final data = cachedItem.data as Map<String, dynamic>;
        final sites = data['sites'] as List?;
        if (sites != null) {
          _availableSites = sites.map((e) => e as Map<String, dynamic>).toList();
          debugPrint('[_loadAvailableSitesFromCache] Loaded ${_availableSites.length} sites from cache');
        } else {
          _availableSites = [];
        }
      } else {
        debugPrint('[_loadAvailableSitesFromCache] No cached sites found');
        _availableSites = [];
      }
    } catch (e) {
      debugPrint('[_loadAvailableSitesFromCache] Error loading from cache: $e');
      _availableSites = [];
    }
  }

  Future<void> _loadSmartAssignedSites() async {
    final supabase = Supabase.instance.client;

    try {
      if (_userId == null) return;

      // Check connectivity first
      final connectivityResult = await Connectivity().checkConnectivity();
      final isOffline = connectivityResult.contains(ConnectivityResult.none);
      
      if (isOffline) {
        debugPrint('[_loadSmartAssignedSites] Offline - loading from cache');
        await _loadSmartAssignedSitesFromCache();
        return;
      }

      // Verify session before query
      var session = supabase.auth.currentSession;
      if (session == null || session.isExpired) {
        debugPrint('[_loadSmartAssignedSites] Session expired, refreshing...');
        await supabase.auth.refreshSession();
      }

      final response = await supabase
          .from('mmp_site_entries')
          .select('*, mmp_files(project_id)')
          .ilike('status', 'Assigned')
          .eq('accepted_by', _userId!)
          .order('created_at', ascending: false)
          .limit(1000);

      final allSites = (response as List)
          .map((e) => e as Map<String, dynamic>)
          .toList();

      // Filter out cost-acknowledged sites
      List<Map<String, dynamic>> costFilteredSites = allSites.where((site) {
        final additionalData = site['additional_data'] as Map<String, dynamic>?;
        final costAcknowledged =
            site['cost_acknowledged'] ??
            additionalData?['cost_acknowledged'] ??
            false;
        return !costAcknowledged;
      }).toList();

      // Filter by project membership (for non-admin users)
      if (!_isAdminOrSuperUser) {
        final beforeCount = costFilteredSites.length;
        costFilteredSites = costFilteredSites.where((site) {
          final mmpFile = site['mmp_files'] as Map<String, dynamic>? ?? {};
          final projectId = mmpFile['project_id']?.toString();

          // If site has no project ID, exclude it
          if (projectId == null || projectId.isEmpty) {
            return false;
          }

          // Site must be in one of user's projects
          return _userProjectIds.contains(projectId);
        }).toList();

        debugPrint(
          'Filtered smart assigned sites by project: ${costFilteredSites.length} of $beforeCount',
        );
      }

      _smartAssignedSites = costFilteredSites;
      
      // Cache for offline use
      await _cacheSmartAssignedSites(costFilteredSites);
    } catch (e) {
      debugPrint(
        '[_loadSmartAssignedSites] Error loading smart assigned sites: $e',
      );

      // Check if it's a network error - fall back to cache
      final errorStr = e.toString().toLowerCase();
      if (e is SocketException ||
          errorStr.contains('socketexception') ||
          errorStr.contains('failed host lookup') ||
          errorStr.contains('connection refused') ||
          errorStr.contains('network is unreachable') ||
          errorStr.contains('no address associated') ||
          errorStr.contains('connection timed out') ||
          errorStr.contains('errno = 7')) {
        debugPrint('[_loadSmartAssignedSites] Network error - falling back to cache');
        await _loadSmartAssignedSitesFromCache();
        return;
      }

      // Check if it's an auth error
      if (errorStr.contains('auth') ||
          errorStr.contains('unauthorized') ||
          errorStr.contains('jwt') ||
          errorStr.contains('token')) {
        debugPrint(
          '[_loadSmartAssignedSites] Auth error - attempting session refresh',
        );
        try {
          await supabase.auth.refreshSession();
        } catch (refreshError) {
          debugPrint(
            '[_loadSmartAssignedSites] Session refresh failed: $refreshError',
          );
        }
      }
      
      // Try cache as fallback
      if (_smartAssignedSites.isEmpty) {
        await _loadSmartAssignedSitesFromCache();
      }
    }
  }

  Future<void> _cacheSmartAssignedSites(List<Map<String, dynamic>> sites) async {
    try {
      final offlineDb = OfflineDb();
      await offlineDb.cacheItem(
        OfflineDb.siteCacheBox,
        'smart_assigned_sites_$_userId',
        data: {'sites': sites},
        ttl: const Duration(hours: 24),
      );
      debugPrint('[_cacheSmartAssignedSites] Cached ${sites.length} assigned sites');
    } catch (e) {
      debugPrint('[_cacheSmartAssignedSites] Error caching sites: $e');
    }
  }

  Future<void> _loadSmartAssignedSitesFromCache() async {
    try {
      final offlineDb = OfflineDb();
      final cachedItem = offlineDb.getCachedItem(
        OfflineDb.siteCacheBox,
        'smart_assigned_sites_$_userId',
      );
      
      if (cachedItem != null && cachedItem.data != null) {
        final data = cachedItem.data as Map<String, dynamic>;
        final sites = data['sites'] as List?;
        if (sites != null) {
          _smartAssignedSites = sites.map((e) => e as Map<String, dynamic>).toList();
          debugPrint('[_loadSmartAssignedSitesFromCache] Loaded ${_smartAssignedSites.length} sites from cache');
        } else {
          _smartAssignedSites = [];
        }
      } else {
        debugPrint('[_loadSmartAssignedSitesFromCache] No cached sites found');
        _smartAssignedSites = [];
      }
    } catch (e) {
      debugPrint('[_loadSmartAssignedSitesFromCache] Error loading from cache: $e');
      _smartAssignedSites = [];
    }
  }

  Future<void> _loadMySites() async {
    final supabase = Supabase.instance.client;

    try {
      if (_userId == null) return;

      // Check connectivity first
      final connectivityResult = await Connectivity().checkConnectivity();
      final isOffline = connectivityResult.contains(ConnectivityResult.none);
      
      if (isOffline) {
        debugPrint('[_loadMySites] Offline - loading from cache');
        await _loadMySitesFromCache();
        return;
      }

      // Verify session before query
      var session = supabase.auth.currentSession;
      if (session == null || session.isExpired) {
        debugPrint('[_loadMySites] Session expired, refreshing...');
        await supabase.auth.refreshSession();
      }

      final response = await supabase
          .from('mmp_site_entries')
          .select('*, mmp_files(project_id)')
          .eq('accepted_by', _userId!)
          .order('created_at', ascending: false)
          .limit(1000);

      List<Map<String, dynamic>> allSites = (response as List)
          .map((e) => e as Map<String, dynamic>)
          .toList();

      // Filter by project membership (for non-admin users)
      if (!_isAdminOrSuperUser) {
        final beforeCount = allSites.length;
        allSites = allSites.where((site) {
          final mmpFile = site['mmp_files'] as Map<String, dynamic>? ?? {};
          final projectId = mmpFile['project_id']?.toString();

          // If site has no project ID, exclude it
          if (projectId == null || projectId.isEmpty) {
            return false;
          }

          // Site must be in one of user's projects
          return _userProjectIds.contains(projectId);
        }).toList();

        debugPrint(
          'Filtered my sites by project: ${allSites.length} of $beforeCount',
        );
      }

      _mySites = allSites;
      
      // Cache for offline use
      await _cacheMySites(allSites);
    } catch (e) {
      debugPrint('[_loadMySites] Error loading my sites: $e');

      // Check if it's a network error - fall back to cache
      final errorStr = e.toString().toLowerCase();
      if (e is SocketException ||
          errorStr.contains('socketexception') ||
          errorStr.contains('failed host lookup') ||
          errorStr.contains('connection refused') ||
          errorStr.contains('network is unreachable') ||
          errorStr.contains('no address associated') ||
          errorStr.contains('connection timed out') ||
          errorStr.contains('errno = 7')) {
        debugPrint('[_loadMySites] Network error - falling back to cache');
        await _loadMySitesFromCache();
        return;
      }

      // Check if it's an auth error
      if (errorStr.contains('auth') ||
          errorStr.contains('unauthorized') ||
          errorStr.contains('jwt') ||
          errorStr.contains('token')) {
        debugPrint('[_loadMySites] Auth error - attempting session refresh');
        try {
          await supabase.auth.refreshSession();
        } catch (refreshError) {
          debugPrint('[_loadMySites] Session refresh failed: $refreshError');
        }
      }
      
      // Try cache as fallback
      if (_mySites.isEmpty) {
        await _loadMySitesFromCache();
      }
    }
  }

  Future<void> _cacheMySites(List<Map<String, dynamic>> sites) async {
    try {
      final offlineDb = OfflineDb();
      await offlineDb.cacheItem(
        OfflineDb.siteCacheBox,
        'my_sites_$_userId',
        data: {'sites': sites},
        ttl: const Duration(hours: 24),
      );
      debugPrint('[_cacheMySites] Cached ${sites.length} my sites');
    } catch (e) {
      debugPrint('[_cacheMySites] Error caching sites: $e');
    }
  }

  Future<void> _loadMySitesFromCache() async {
    try {
      final offlineDb = OfflineDb();
      final cachedItem = offlineDb.getCachedItem(
        OfflineDb.siteCacheBox,
        'my_sites_$_userId',
      );
      
      if (cachedItem != null && cachedItem.data != null) {
        final data = cachedItem.data as Map<String, dynamic>;
        final sites = data['sites'] as List?;
        if (sites != null) {
          _mySites = sites.map((e) => e as Map<String, dynamic>).toList();
          debugPrint('[_loadMySitesFromCache] Loaded ${_mySites.length} sites from cache');
        } else {
          _mySites = [];
        }
      } else {
        debugPrint('[_loadMySitesFromCache] No cached sites found');
        _mySites = [];
      }
    } catch (e) {
      debugPrint('[_loadMySitesFromCache] Error loading from cache: $e');
      _mySites = [];
    }
  }

  Future<void> _loadUnsyncedCompletedVisits() async {
    // Load completed sites that don't have a synced report
    try {
      if (_userId == null) return;

      // First, get all completed sites
      final sitesResponse = await Supabase.instance.client
          .from('mmp_site_entries')
          .select('*, mmp_files(project_id)')
          .eq('accepted_by', _userId!)
          .ilike('status', 'Completed')
          .order('created_at', ascending: false)
          .limit(100);

      final allCompletedSites = (sitesResponse as List)
          .map((e) => e as Map<String, dynamic>)
          .toList();

      if (allCompletedSites.isEmpty) {
        _unsyncedCompletedVisits = [];
        return;
      }

      // Get all site IDs
      final siteIds = allCompletedSites
          .map((site) => site['id']?.toString())
          .where((id) => id != null && id.isNotEmpty)
          .cast<String>()
          .toList();

      // Check which sites have reports (query once for efficiency)
      final syncedSiteIds = <String>{}; // Sites with is_synced = true
      final sitesWithAnyReport = <String>{}; // Sites with any report (fallback)
      try {
        if (siteIds.isNotEmpty) {
          final reportsResponse = await Supabase.instance.client
              .from('reports')
              .select('site_visit_id, is_synced')
              .inFilter('site_visit_id', siteIds);

          if (reportsResponse != null && reportsResponse is List) {
            debugPrint(
              '[_loadUnsyncedCompletedVisits] Found ${reportsResponse.length} reports for ${siteIds.length} sites',
            );
            for (final report in reportsResponse) {
              final siteId = report['site_visit_id']?.toString();
              if (siteId == null) continue;

              // Track all sites with any report (fallback check)
              sitesWithAnyReport.add(siteId);

              // Track sites with explicitly synced reports
              // is_synced defaults to false in schema, so null/false means unsynced
              final isSynced = report['is_synced'] as bool? ?? false;
              if (isSynced == true) {
                syncedSiteIds.add(siteId);
                debugPrint(
                  '[_loadUnsyncedCompletedVisits] Site $siteId has synced report (is_synced=true)',
                );
              } else {
                debugPrint(
                  '[_loadUnsyncedCompletedVisits] Site $siteId has report but is_synced=$isSynced',
                );
              }
            }
          } else {
            debugPrint(
              '[_loadUnsyncedCompletedVisits] No reports found or invalid response',
            );
          }
        }
      } catch (e) {
        debugPrint(
          '[_loadUnsyncedCompletedVisits] Error querying reports: $e',
        );
      }

      // Also check additional_data for visit_report_submitted flag (backup check)
      final sitesWithReportFlag = allCompletedSites
          .where((site) {
            final additionalData = site['additional_data'] as Map<String, dynamic>?;
            return additionalData?['visit_report_submitted'] == true;
          })
          .map((site) => site['id']?.toString())
          .where((id) => id != null && id.isNotEmpty)
          .cast<String>()
          .toSet();

      // Combine all checks - if site has:
      // 1. Synced report (is_synced = true), OR
      // 2. visit_report_submitted flag, OR
      // 3. Any report at all (fallback for online completions where is_synced might not be set)
      // then it's considered synced
      final allSyncedSiteIds = syncedSiteIds
          .union(sitesWithReportFlag)
          .union(sitesWithAnyReport);

      debugPrint(
        '[_loadUnsyncedCompletedVisits] Total synced sites: ${allSyncedSiteIds.length} (explicitly synced: ${syncedSiteIds.length}, with flag: ${sitesWithReportFlag.length}, with any report: ${sitesWithAnyReport.length})',
      );

      // Filter for sites that are NOT synced
      List<Map<String, dynamic>> unsyncedSites = allCompletedSites
          .where((site) {
            final siteId = site['id']?.toString();
            if (siteId == null) return false;
            // Site is unsynced if it doesn't have a synced report
            return !allSyncedSiteIds.contains(siteId);
          })
          .toList();

      // Filter by project membership (for non-admin users)
      if (!_isAdminOrSuperUser) {
        final beforeCount = unsyncedSites.length;
        unsyncedSites = unsyncedSites.where((site) {
          final mmpFile = site['mmp_files'] as Map<String, dynamic>? ?? {};
          final projectId = mmpFile['project_id']?.toString();

          // If site has no project ID, exclude it
          if (projectId == null || projectId.isEmpty) {
            return false;
          }

          // Site must be in one of user's projects
          return _userProjectIds.contains(projectId);
        }).toList();

        debugPrint(
          'Filtered unsynced completed visits by project: ${unsyncedSites.length} of $beforeCount',
        );
      }

      _unsyncedCompletedVisits = unsyncedSites;
    } catch (e) {
      debugPrint('Error loading unsynced completed visits: $e');
    }
  }

  Future<void> _loadAdvanceRequests() async {
    try {
      if (_userId == null) return;

      if (!mounted) return;
      setState(() => _loadingAdvanceRequests = true);

      // Load all advance requests for this user
      final response = await Supabase.instance.client
          .from('down_payment_requests')
          .select('*')
          .eq('requested_by', _userId!)
          .order('created_at', ascending: false);

      // Map requests by site ID (keep most recent for each site)
      final requestsMap = <String, Map<String, dynamic>>{};
      for (final request in response) {
        final siteId =
            (request['mmp_site_entry_id'] as String?) ??
            (request['site_visit_id'] as String?);
        if (siteId != null && !requestsMap.containsKey(siteId)) {
          requestsMap[siteId] = request;
        }
      }

      if (!mounted) return;
      setState(() {
        _advanceRequests = requestsMap;
        _loadingAdvanceRequests = false;
      });
    } catch (e) {
      debugPrint('Error loading advance requests: $e');
      if (!mounted) return;
      setState(() {
        _advanceRequests = {};
        _loadingAdvanceRequests = false;
      });
    }
  }

  void _groupAvailableSites() {
    _groupedByStateLocality = {};
    for (final site in _availableSites) {
      final state = site['state'] as String? ?? 'Unknown State';
      final locality = site['locality'] as String? ?? 'Unknown Locality';
      final key = '$state - $locality';
      _groupedByStateLocality.putIfAbsent(key, () => []).add(site);
    }
  }

  Future<void> _loadCoordinatorData() async {
    try {
      if (_userId == null) return;

      // Load sites forwarded to this coordinator
      final response = await Supabase.instance.client
          .from('mmp_site_entries')
          .select('*, mmp_files(project_id)')
          .eq('forwarded_to_user_id', _userId!)
          .order('created_at', ascending: false)
          .limit(1000);

      List<Map<String, dynamic>> allCoordinatorSites = (response as List)
          .map((e) => e as Map<String, dynamic>)
          .toList();

      // Filter by project membership (for non-admin users)
      if (!_isAdminOrSuperUser) {
        final beforeCount = allCoordinatorSites.length;
        allCoordinatorSites = allCoordinatorSites.where((site) {
          final mmpFile = site['mmp_files'] as Map<String, dynamic>? ?? {};
          final projectId = mmpFile['project_id']?.toString();

          // If site has no project ID, exclude it
          if (projectId == null || projectId.isEmpty) {
            return false;
          }

          // Site must be in one of user's projects
          return _userProjectIds.contains(projectId);
        }).toList();

        debugPrint(
          'Filtered coordinator sites by project: ${allCoordinatorSites.length} of $beforeCount',
        );
      }

      _coordinatorSites = allCoordinatorSites;
    } catch (e) {
      debugPrint('Error loading coordinator data: $e');
    }
  }

  Future<void> _claimSite(Map<String, dynamic> site) async {
    try {
      if (_userId == null) return;

      // Use atomic claim RPC for dispatched sites (first-claim system)
      try {
        final result = await Supabase.instance.client.rpc(
          'claim_site_visit',
          params: {'p_site_id': site['id'], 'p_user_id': _userId!},
        );

        final claimResult = result as Map<String, dynamic>?;

        if (claimResult == null || (claimResult['success'] as bool?) != true) {
          String description =
              claimResult?['message'] as String? ?? 'Could not claim site';

          if (claimResult?['error'] == 'ALREADY_CLAIMED') {
            description =
                'Another enumerator claimed this site first. Try a different site.';
          } else if (claimResult?['error'] == 'CLAIM_IN_PROGRESS') {
            description =
                'Someone else is claiming this site right now. Try again in a moment.';
          }

          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(description), backgroundColor: Colors.red),
            );
          }
          return;
        }

        // RPC succeeded
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Site claimed successfully'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } catch (e) {
        // RPC failed
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                e.toString().contains('already')
                    ? 'Could not claim this site. It may have been claimed by another enumerator.'
                    : 'Error claiming site: ${e.toString()}',
              ),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Site claimed successfully!'),
            backgroundColor: Colors.green,
          ),
        );
      }

      // Reload data
      await _loadDataCollectorData();
      if (!mounted) return;
      setState(() {});
    } catch (e) {
      debugPrint('Error claiming site: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _requestAdvance(Map<String, dynamic> site) async {
    try {
      if (_userId == null) return;

      final transportFee = (site['transport_fee'] as num?)?.toDouble() ?? 0.0;
      if (transportFee <= 0) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('This site has no transport fee'),
              backgroundColor: Colors.orange,
            ),
          );
        }
        return;
      }

      final siteName = site['site_name'] ?? site['siteName'] ?? 'Unknown Site';
      final hubId = site['hub_id'] ?? site['hubId'];
      final hubName =
          site['hub_name'] ??
          site['hubName'] ??
          site['hub_office'] ??
          site['hubOffice'];

      // Show request dialog
      final result = await showDialog<Map<String, dynamic>>(
        context: context,
        builder: (context) => RequestAdvanceDialog(
          site: site,
          transportationBudget: transportFee,
          hubId: hubId,
          hubName: hubName,
        ),
      );

      if (result == null || result['success'] != true) return;

      final requestedAmount = (result['requestedAmount'] as num).toDouble();
      final paymentType = result['paymentType'] as String;
      final justification = result['justification'] as String;

      // Properly convert installmentPlan from List<dynamic> to List<Map<String, dynamic>>
      List<Map<String, dynamic>> installmentPlan = [];
      if (result['installmentPlan'] != null) {
        final planList = result['installmentPlan'] as List?;
        if (planList != null && planList.isNotEmpty) {
          installmentPlan = planList
              .map((e) => e as Map<String, dynamic>)
              .toList();
        }
      }

      // Get user role
      final profile = await Supabase.instance.client
          .from('profiles')
          .select('role, hub_id')
          .eq('id', _userId!)
          .maybeSingle();

      final role = (profile?['role'] as String?)?.toLowerCase() ?? '';
      final requesterRole =
          (role == 'coordinator' ||
              role == 'field_coordinator' ||
              role == 'state_coordinator')
          ? 'coordinator'
          : 'dataCollector';

      final finalHubId = hubId ?? profile?['hub_id'] as String?;

      // Create advance request
      final newRequest = await Supabase.instance.client
          .from('down_payment_requests')
          .insert({
            'mmp_site_entry_id': site['id'],
            'site_name': siteName,
            'requested_by': _userId,
            'requester_role': requesterRole,
            'hub_id': finalHubId,
            'hub_name': hubName,
            'total_transportation_budget': transportFee,
            'requested_amount': requestedAmount,
            'payment_type': paymentType,
            'installment_plan': installmentPlan,
            'justification': justification,
            'supporting_documents': [],
            'status': 'pending_supervisor',
            'supervisor_status': 'pending',
          })
          .select()
          .single();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Advance request submitted successfully. Waiting for supervisor approval.',
            ),
            backgroundColor: Colors.green,
          ),
        );
      }

      // Reload advance requests
      await _loadAdvanceRequests();
      if (!mounted) return;
      setState(() {});
    } catch (e) {
      debugPrint('Error requesting advance: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  bool _shouldShowRequestAdvance(Map<String, dynamic> site) {
    // Only show for accepted or in-progress sites owned by current user
    final status = (site['status'] as String? ?? '').toLowerCase();
    final isAcceptedOrOngoing =
        status == 'accepted' ||
        status == 'assigned' ||
        status == 'in progress' ||
        status == 'in_progress' ||
        status == 'ongoing';
    final isOwner = site['accepted_by'] == _userId;
    final transportFee = (site['transport_fee'] as num?)?.toDouble() ?? 0.0;
    final hasTransportBudget = transportFee > 0;

    return isAcceptedOrOngoing && isOwner && hasTransportBudget;
  }

  Widget _buildRequestAdvanceWidget(Map<String, dynamic> site) {
    final siteId = site['id'] as String? ?? '';
    final existingRequest = _advanceRequests[siteId];

    // If request exists, show status badge
    if (existingRequest != null) {
      return _buildAdvanceStatusBadge(existingRequest);
    }

    // Show Request Advance button
    return ElevatedButton.icon(
      onPressed: () => _requestAdvance(site),
      icon: const Icon(Icons.payment, size: 18),
      label: const Text('Request Advance'),
      style: ElevatedButton.styleFrom(
        backgroundColor: Colors.purple,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 12),
      ),
    );
  }

  Widget _buildAdvanceStatusBadge(Map<String, dynamic> request) {
    final status = request['status'] as String? ?? 'pending_supervisor';
    final badgeInfo = AdvanceRequestService.getStatusBadge(status);
    final badgeColor = badgeInfo['color'] as Color;
    final badgeLabel = badgeInfo['label'] as String;
    final badgeIcon = badgeInfo['icon'] as IconData;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: badgeColor.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: badgeColor.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(badgeIcon, size: 18, color: badgeColor),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              badgeLabel,
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: badgeColor,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButtons(
    Map<String, dynamic> site, {
    required String status,
    required bool showClaimButton,
    required bool showAcknowledgeButton,
    required bool showVisitActions,
  }) {
    final buttons = <Widget>[];

    // Claim Button
    if (showClaimButton) {
      buttons.add(
        Expanded(
          child: ElevatedButton.icon(
            onPressed: () => _claimSite(site),
            icon: const Icon(Icons.handshake, size: 18),
            label: const Text('Claim Site'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryBlue,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
          ),
        ),
      );
    }

    // Acknowledge Cost Button
    if (showAcknowledgeButton) {
      buttons.add(
        Expanded(
          child: ElevatedButton.icon(
            onPressed: () => _acknowledgeCost(site),
            icon: const Icon(Icons.check_circle, size: 18),
            label: const Text('Acknowledge Cost'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.orange,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
          ),
        ),
      );
    }

    // Visit Actions
    if (showVisitActions) {
      // Request Advance Button (for accepted/in-progress sites with transport fee)
      if (_shouldShowRequestAdvance(site)) {
        buttons.add(Expanded(child: _buildRequestAdvanceWidget(site)));
      }

      // Start Visit Button (for accepted/assigned sites) - now shows even if Request Advance is shown
      if ((status.toString().toLowerCase() == 'accepted' ||
              status.toString().toLowerCase() == 'assigned') &&
          site['accepted_by'] == _userId) {
        buttons.add(
          Expanded(
            child: ElevatedButton.icon(
              onPressed: () => _startVisit(site),
              icon: const Icon(Icons.play_arrow, size: 18),
              label: const Text('Start Visit'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
        );
      }

      // Complete Visit Button
      if ((status.toString().toLowerCase() == 'in progress' ||
              status.toString().toLowerCase() == 'ongoing') &&
          site['accepted_by'] == _userId) {
        buttons.add(
          Expanded(
            child: ElevatedButton.icon(
              onPressed: () => _completeVisit(site),
              icon: const Icon(Icons.check, size: 18),
              label: const Text('Complete'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
        );
      }

      // View Report Button for completed visits (Admin/FOM/ICT only)
      if ((status.toString().toLowerCase() == 'completed' ||
              status.toString().toLowerCase() == 'complete')) {
        final canViewReport = _isAdminOrSuperUser || 
                              _userRole == 'fom' ||
                              _userRole == 'ict';
        if (canViewReport) {
          buttons.add(
            Expanded(
              child: ElevatedButton.icon(
                onPressed: () => _viewVisitReport(site),
                icon: const Icon(Icons.visibility, size: 18),
                label: const Text('View Report'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.blue,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
          );
        }
      }
    }

    if (buttons.isEmpty) return const SizedBox.shrink();

    // Use Row with Expanded widgets - they'll share space equally
    return Row(children: buttons);
  }

  Future<void> _acknowledgeCost(Map<String, dynamic> site) async {
    // Show cost acknowledgment dialog
    final acknowledged = await showDialog<bool>(
      context: context,
      builder: (context) => _CostAcknowledgmentDialog(site: site),
    );

    if (acknowledged != true) return;

    try {
      final now = DateTime.now().toIso8601String();

      await Supabase.instance.client
          .from('mmp_site_entries')
          .update({
            'status': 'accepted',
            'cost_acknowledged': true,
            'cost_acknowledged_at': now,
            'cost_acknowledged_by': _userId,
            'accepted_at': now,
            'accepted_by': _userId,
            'updated_at': now,
            'additional_data': {
              ...(site['additional_data'] as Map<String, dynamic>? ?? {}),
              'cost_acknowledged': true,
              'cost_acknowledged_at': now,
              'cost_acknowledged_by': _userId,
            },
          })
          .eq('id', site['id']);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Cost acknowledged. Site moved to My Sites.'),
            backgroundColor: Colors.green,
          ),
        );
      }

      await _loadDataCollectorData();
      if (!mounted) return;
      setState(() {});
    } catch (e) {
      debugPrint('Error acknowledging cost: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _startVisit(Map<String, dynamic> site) async {
    final supabase = Supabase.instance.client;

    try {
      // Check connectivity first
      final connectivity = await Connectivity().checkConnectivity();
      final isOffline = connectivity.contains(ConnectivityResult.none);
      
      debugPrint('[_startVisit] Connectivity check - offline: $isOffline');

      // Check location permissions
      final hasPermission = await LocationService.checkPermissions();
      if (!hasPermission) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Location permission is required to start a visit.',
              ),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }

      // Show confirmation dialog
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => StartVisitDialog(site: site),
      );

      if (confirmed != true) return;

      // Get current location (works offline - uses device GPS)
      final position = await LocationService.getCurrentLocation();
      if (position == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Could not get location. Visit will start without location.',
              ),
              backgroundColor: Colors.orange,
            ),
          );
        }
      }

      final now = DateTime.now().toIso8601String();
      final siteStatus = (site['status'] as String? ?? '').toLowerCase();
      final isAssigned =
          siteStatus == 'assigned' && site['accepted_by'] == null;

      // Calculate fees from cached data (works offline)
      final enumeratorFee = (site['enumerator_fee'] as num?)?.toDouble() ?? 0.0;
      final transportFee = (site['transport_fee'] as num?)?.toDouble() ?? 0.0;
      final calculatedCost = enumeratorFee + transportFee;

      // Build update data
      final updateData = <String, dynamic>{
        'status': 'In Progress',
        'visit_started_at': now,
        'visit_started_by': _userId,
        'updated_at': now,
      };

      // Add location to additional_data if available
      if (position != null) {
        final additionalData =
            site['additional_data'] as Map<String, dynamic>? ?? {};
        additionalData['start_location'] = {
          'latitude': position.latitude,
          'longitude': position.longitude,
          'accuracy': position.accuracy,
          'timestamp': now,
        };
        updateData['additional_data'] = additionalData;
      }

      // If site was "assigned" (not yet accepted), auto-accept and set fees
      if (isAssigned) {
        updateData['accepted_by'] = _userId;
        updateData['accepted_at'] = now;
        if (enumeratorFee > 0 || calculatedCost > 0) {
          updateData['enumerator_fee'] = enumeratorFee;
          updateData['transport_fee'] = transportFee;
          updateData['cost'] = calculatedCost;
        }
      }

      // OFFLINE MODE: Queue for sync and update local cache
      if (isOffline) {
        debugPrint('[_startVisit] Offline mode - saving locally');
        
        // Build start location from GPS
        final startLocation = position != null
            ? {
                'latitude': position.latitude,
                'longitude': position.longitude,
                'accuracy': position.accuracy,
              }
            : <String, dynamic>{};
        
        // Queue using OfflineDataService
        final offlineDataService = OfflineDataService();
        await offlineDataService.queueStartVisit(
          visitId: site['id'].toString(),
          userId: _userId ?? '',
          startLocation: startLocation,
        );
        
        // Note: Don't call forceSync while offline - SyncManager will pick up pending actions
        // when connectivity is restored via auto-sync
        
        // Update local cache
        final updatedSite = Map<String, dynamic>.from(site);
        updatedSite.addAll(updateData);
        updatedSite['_offline_modified'] = true;
        updatedSite['_synced'] = false;
        
        // Update in _mySites list
        final siteIndex = _mySites.indexWhere((s) => s['id'] == site['id']);
        if (siteIndex != -1) {
          _mySites[siteIndex] = updatedSite;
        }
        
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Visit started (offline). Will sync when online.'),
              backgroundColor: Colors.orange,
            ),
          );
          setState(() {});
        }
        return;
      }

      // ONLINE MODE: Validate session and update database
      final session = supabase.auth.currentSession;
      debugPrint(
        '[_startVisit] Session check - valid: ${session != null}, expired: ${session?.isExpired ?? true}',
      );

      if (session == null || session.isExpired) {
        debugPrint(
          '[_startVisit] Session expired or missing, attempting refresh...',
        );
        try {
          await supabase.auth.refreshSession();
          debugPrint('[_startVisit] Session refreshed successfully');
        } catch (refreshError) {
          debugPrint('[_startVisit] Session refresh failed: $refreshError');
          // Fall back to offline mode
          debugPrint('[_startVisit] Falling back to offline mode');
          final startLocation = position != null
              ? {
                  'latitude': position.latitude,
                  'longitude': position.longitude,
                  'accuracy': position.accuracy,
                }
              : <String, dynamic>{};
          final offlineDataService = OfflineDataService();
          await offlineDataService.queueStartVisit(
            visitId: site['id'].toString(),
            userId: _userId ?? '',
            startLocation: startLocation,
          );
          // SyncManager will pick up pending actions when online
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Visit started (will sync when online).'),
                backgroundColor: Colors.orange,
              ),
            );
          }
          return;
        }
      }

      // Re-check user ID after potential refresh
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) {
        debugPrint('[_startVisit] User ID is null after session check');
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Authentication error. Please log in again.'),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }

      // Update database
      try {
        await supabase
            .from('mmp_site_entries')
            .update(updateData)
            .eq('id', site['id']);
        debugPrint('[_startVisit] Database update successful');
      } catch (dbError) {
        debugPrint('[_startVisit] Database error: $dbError');
        // Check if it's a network error - queue offline
        final errorStr = dbError.toString().toLowerCase();
        if (errorStr.contains('socket') ||
            errorStr.contains('network') ||
            errorStr.contains('host lookup') ||
            errorStr.contains('connection')) {
          debugPrint('[_startVisit] Network error - queueing offline');
          final startLocation = position != null
              ? {
                  'latitude': position.latitude,
                  'longitude': position.longitude,
                  'accuracy': position.accuracy,
                }
              : <String, dynamic>{};
          final offlineDataService = OfflineDataService();
          await offlineDataService.queueStartVisit(
            visitId: site['id'].toString(),
            userId: _userId ?? '',
            startLocation: startLocation,
          );
          // SyncManager will pick up pending actions when online
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Visit started (will sync when online).'),
                backgroundColor: Colors.orange,
              ),
            );
          }
          return;
        }
        // Check if it's an auth-related error
        if (errorStr.contains('auth') ||
            errorStr.contains('unauthorized') ||
            errorStr.contains('jwt') ||
            errorStr.contains('token')) {
          debugPrint('[_startVisit] Auth-related database error detected');
          // Try to refresh session and retry once
          try {
            await supabase.auth.refreshSession();
            await supabase
                .from('mmp_site_entries')
                .update(updateData)
                .eq('id', site['id']);
            debugPrint('[_startVisit] Retry after session refresh successful');
          } catch (retryError) {
            debugPrint('[_startVisit] Retry after refresh failed: $retryError');
            throw Exception('Authentication error. Please log in again.');
          }
        } else {
          rethrow;
        }
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Visit started successfully'),
            backgroundColor: Colors.green,
          ),
        );
      }

      // Reload data
      await _loadDataCollectorData();
      if (!mounted) return;
      if (mounted) setState(() {});
    } catch (e) {
      debugPrint('[_startVisit] Error starting visit: $e');

      // Check session state after error
      final sessionAfterError = supabase.auth.currentSession;
      debugPrint(
        '[_startVisit] Session after error - valid: ${sessionAfterError != null}',
      );

      if (mounted) {
        final errorMessage =
            e.toString().contains('Authentication') ||
                e.toString().contains('Session expired')
            ? 'Authentication error. Please log in again.'
            : 'Error: ${e.toString()}';

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(errorMessage), backgroundColor: Colors.red),
        );
      }
    }
  }

  Future<void> _completeVisit(Map<String, dynamic> site) async {
    final supabase = Supabase.instance.client;

    try {
      debugPrint(
        '[_completeVisit] Starting completion for site: ${site['id']}',
      );

      // Check connectivity first
      final connectivity = await Connectivity().checkConnectivity();
      final isOffline = connectivity.contains(ConnectivityResult.none);
      
      debugPrint('[_completeVisit] Connectivity check - offline: $isOffline');

      // Show visit report dialog first (works offline)
      final reportData = await showDialog<VisitReportData>(
        context: context,
        builder: (context) => VisitReportDialog(site: site),
      );

      if (reportData == null) return;

      // Get final location (works offline - uses device GPS)
      final position =
          reportData.coordinates ?? await LocationService.getCurrentLocation();

      final now = DateTime.now().toIso8601String();

      // Build coordinates JSON
      final coordinates = position != null
          ? {
              'latitude': position.latitude,
              'longitude': position.longitude,
              'accuracy': position.accuracy,
            }
          : <String, dynamic>{};

      // Calculate fees from cached data (works offline)
      final enumeratorFee = (site['enumerator_fee'] as num?)?.toDouble() ?? 0.0;
      final transportFee = (site['transport_fee'] as num?)?.toDouble() ?? 0.0;
      final totalCost = enumeratorFee + transportFee;

      // OFFLINE MODE: Save locally and queue for sync
      if (isOffline) {
        debugPrint('[_completeVisit] Offline mode - saving locally');
        
        // Build end location map
        final endLocation = coordinates.isNotEmpty ? coordinates : <String, dynamic>{};
        
        // Convert photos to base64 for offline storage
        final List<String> photoBase64Urls = [];
        for (final file in reportData.photos) {
          try {
            final bytes = await file.readAsBytes();
            final base64String = 'data:image/jpeg;base64,${base64Encode(bytes)}';
            photoBase64Urls.add(base64String);
          } catch (e) {
            debugPrint('[_completeVisit] Error converting photo to base64: $e');
          }
        }
        
        // Queue using OfflineDataService
        final offlineDataService = OfflineDataService();
        await offlineDataService.queueCompleteVisit(
          visitId: site['id'].toString(),
          userId: _userId ?? '',
          endLocation: endLocation,
          notes: reportData.notes,
          activities: reportData.activities,
          durationMinutes: reportData.durationMinutes,
          photoDataUrls: photoBase64Urls,
        );
        
        // Note: Don't call forceSync while offline - SyncManager will pick up pending actions
        // when connectivity is restored via auto-sync
        
        // Update local cache
        final updatedSite = Map<String, dynamic>.from(site);
        updatedSite['status'] = 'Completed';
        updatedSite['visit_completed_at'] = now;
        updatedSite['_offline_modified'] = true;
        updatedSite['_synced'] = false;
        
        // Update in _mySites list
        final siteIndex = _mySites.indexWhere((s) => s['id'] == site['id']);
        if (siteIndex != -1) {
          _mySites[siteIndex] = updatedSite;
        }
        
        // Add to unsynced list for Outbox display
        _unsyncedCompletedVisits.add(updatedSite);
        
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Visit completed (offline). Will sync when online.'),
              backgroundColor: Colors.orange,
            ),
          );
          setState(() {});
        }
        return;
      }

      // ONLINE MODE: Validate session
      final session = supabase.auth.currentSession;
      debugPrint(
        '[_completeVisit] Session check - valid: ${session != null}, expired: ${session?.isExpired ?? true}',
      );

      if (session == null || session.isExpired) {
        debugPrint(
          '[_completeVisit] Session expired or missing, attempting refresh...',
        );
        try {
          await supabase.auth.refreshSession();
          debugPrint('[_completeVisit] Session refreshed successfully');
        } catch (refreshError) {
          debugPrint('[_completeVisit] Session refresh failed: $refreshError');
          // Fall back to offline mode
          debugPrint('[_completeVisit] Falling back to offline mode');
          final endLocation = coordinates.isNotEmpty ? coordinates : <String, dynamic>{};
          
          // Convert photos to base64
          final List<String> photoBase64Urls = [];
          for (final file in reportData.photos) {
            try {
              final bytes = await file.readAsBytes();
              final base64String = 'data:image/jpeg;base64,${base64Encode(bytes)}';
              photoBase64Urls.add(base64String);
            } catch (e) {
              debugPrint('[_completeVisit] Error converting photo to base64: $e');
            }
          }
          
          final offlineDataService = OfflineDataService();
          await offlineDataService.queueCompleteVisit(
            visitId: site['id'].toString(),
            userId: _userId ?? '',
            endLocation: endLocation,
            notes: reportData.notes,
            activities: reportData.activities,
            durationMinutes: reportData.durationMinutes,
            photoDataUrls: photoBase64Urls,
          );
          
          // SyncManager will pick up pending actions when online
          _unsyncedCompletedVisits.add({...site, 'status': 'Completed', '_offline_modified': true});
          
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Visit completed (will sync when online).'),
                backgroundColor: Colors.orange,
              ),
            );
            setState(() {});
          }
          return;
        }
      }

      // Re-check user ID after potential refresh
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) {
        debugPrint('[_completeVisit] User ID is null after session check');
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Authentication error. Please log in again.'),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }

      // Verify session is still valid after session validation
      var currentSession = supabase.auth.currentSession;
      if (currentSession == null || currentSession.isExpired) {
        debugPrint(
          '[_completeVisit] Session expired, refreshing...',
        );
        try {
          await supabase.auth.refreshSession();
          currentSession = supabase.auth.currentSession;
        } catch (refreshError) {
          debugPrint(
            '[_completeVisit] Session refresh failed: $refreshError',
          );
          throw Exception('Session expired. Please try again.');
        }
      }

      // Upload photos with session refresh during long operation
      List<String> photoUrls = [];
      if (reportData.photos.isNotEmpty) {
        debugPrint(
          '[_completeVisit] Starting photo upload (${reportData.photos.length} photos)',
        );

        // Refresh session before photo uploads if needed
        currentSession = supabase.auth.currentSession;
        if (currentSession == null || currentSession.isExpired) {
          debugPrint(
            '[_completeVisit] Refreshing session before photo uploads...',
          );
          try {
            await supabase.auth.refreshSession();
          } catch (refreshError) {
            debugPrint(
              '[_completeVisit] Session refresh before uploads failed: $refreshError',
            );
            throw Exception(
              'Session expired during photo upload. Please try again.',
            );
          }
        }

        try {
          photoUrls = await PhotoUploadService.uploadPhotos(
            site['id'].toString(),
            reportData.photos,
          );
          debugPrint(
            '[_completeVisit] Photo uploads completed (${photoUrls.length} URLs)',
          );

          // Verify session after photo uploads (they can take a while)
          currentSession = supabase.auth.currentSession;
          if (currentSession == null || currentSession.isExpired) {
            debugPrint(
              '[_completeVisit] Session expired after photo uploads, refreshing...',
            );
            try {
              await supabase.auth.refreshSession();
            } catch (refreshError) {
              debugPrint(
                '[_completeVisit] Session refresh after uploads failed: $refreshError',
              );
              throw Exception(
                'Session expired during upload. Please try again.',
              );
            }
          }
        } catch (uploadError) {
          debugPrint('[_completeVisit] Photo upload error: $uploadError');
          // Check if it's an auth error
          final errorStr = uploadError.toString().toLowerCase();
          if (errorStr.contains('auth') ||
              errorStr.contains('unauthorized') ||
              errorStr.contains('jwt') ||
              errorStr.contains('token')) {
            debugPrint('[_completeVisit] Auth-related photo upload error');
            // Try refreshing session and retry
            try {
              await supabase.auth.refreshSession();
              photoUrls = await PhotoUploadService.uploadPhotos(
                site['id'].toString(),
                reportData.photos,
              );
              debugPrint(
                '[_completeVisit] Photo upload retry after refresh successful',
              );
            } catch (retryError) {
              debugPrint(
                '[_completeVisit] Photo upload retry failed: $retryError',
              );
              throw Exception(
                'Authentication error during photo upload. Please log in again.',
              );
            }
          } else {
            rethrow;
          }
        }
      }

      // Prepare insert payload to match existing reports table schema (coordinates already defined above)
      final reportInsert = <String, dynamic>{
        'site_visit_id': site['id'],
        'notes': reportData.notes.trim(),
        'activities': reportData.activities.trim().isEmpty
            ? null
            : reportData.activities.trim(),
        'duration_minutes': reportData.durationMinutes,
        'coordinates': coordinates,
        'submitted_by': userId,
        'submitted_at': now,
        'is_synced': true,
      };

      // Verify session before database operations
      currentSession = supabase.auth.currentSession;
      if (currentSession == null || currentSession.isExpired) {
        debugPrint(
          '[_completeVisit] Session expired before report insert, refreshing...',
        );
        try {
          await supabase.auth.refreshSession();
        } catch (refreshError) {
          debugPrint(
            '[_completeVisit] Session refresh before report insert failed: $refreshError',
          );
          throw Exception('Session expired. Please try again.');
        }
      }

      // Save report to database
      debugPrint('[_completeVisit] Inserting report for site: ${site['id']}');
      dynamic savedReport;
      try {
        savedReport = await supabase
            .from('reports')
            .insert(reportInsert)
            .select()
            .single();
        debugPrint(
          '[_completeVisit] Report inserted with id: ${savedReport['id']}',
        );
      } catch (dbError) {
        debugPrint('[_completeVisit] Report insert error: $dbError');
        final errorStr = dbError.toString().toLowerCase();
        if (errorStr.contains('auth') ||
            errorStr.contains('unauthorized') ||
            errorStr.contains('jwt') ||
            errorStr.contains('token')) {
          debugPrint('[_completeVisit] Auth-related report insert error');
          try {
            await supabase.auth.refreshSession();
            savedReport = await supabase
                .from('reports')
                .insert(reportInsert)
                .select()
                .single();
            debugPrint(
              '[_completeVisit] Report insert retry after refresh successful',
            );
          } catch (retryError) {
            debugPrint(
              '[_completeVisit] Report insert retry failed: $retryError',
            );
            throw Exception('Authentication error. Please log in again.');
          }
        } else {
          rethrow;
        }
      }

      // Link photos to report
      if (photoUrls.isNotEmpty && savedReport != null) {
        final reportPhotos = photoUrls
            .map(
              (url) => {
                'report_id': savedReport['id'],
                'photo_url': url,
                'storage_path':
                    url, // Use URL as storage path if separate path not available
              },
            )
            .toList();

        debugPrint(
          '[_completeVisit] Inserting ${reportPhotos.length} report photos',
        );
        // Verify session before inserting photos
        currentSession = supabase.auth.currentSession;
        if (currentSession == null || currentSession.isExpired) {
          debugPrint(
            '[_completeVisit] Refreshing session before report_photos insert...',
          );
          await supabase.auth.refreshSession();
        }

        try {
          await supabase.from('report_photos').insert(reportPhotos);
        } catch (photoError) {
          debugPrint(
            '[_completeVisit] Report photos insert error: $photoError',
          );
          final errorStr = photoError.toString().toLowerCase();
          if (errorStr.contains('auth') ||
              errorStr.contains('unauthorized') ||
              errorStr.contains('jwt') ||
              errorStr.contains('token')) {
            debugPrint('[_completeVisit] Auth-related report photos error');
            await supabase.auth.refreshSession();
            await supabase.from('report_photos').insert(reportPhotos);
          } else {
            rethrow;
          }
        }
      }

      // Verify session before updating site status
      currentSession = supabase.auth.currentSession;
      if (currentSession == null || currentSession.isExpired) {
        debugPrint(
          '[_completeVisit] Refreshing session before site status update...',
        );
        await supabase.auth.refreshSession();
      }

      // Update site status
      final updateData = <String, dynamic>{
        'status': 'Completed',
        'visit_completed_at': now,
        'visit_completed_by': userId,
        'updated_at': now,
        'additional_data': {
          ...(site['additional_data'] as Map<String, dynamic>? ?? {}),
          'visit_report_submitted': true,
          'visit_report_id': savedReport['id'],
          'visit_report_submitted_at': now,
          if (position != null)
            'final_location': {
              'latitude': position.latitude,
              'longitude': position.longitude,
              'accuracy': position.accuracy,
            },
        },
      };

      // Ensure visit_completed_at is set
      final currentSite = await Supabase.instance.client
          .from('mmp_site_entries')
          .select('visit_completed_at, visit_completed_by')
          .eq('id', site['id'])
          .maybeSingle();

      if (currentSite?['visit_completed_at'] == null) {
        updateData['visit_completed_at'] = now;
      }
      if (currentSite?['visit_completed_by'] == null) {
        updateData['visit_completed_by'] = userId;
      }

      debugPrint(
        '[_completeVisit] Updating mmp_site_entries for site: ${site['id']}',
      );
      try {
        await supabase
            .from('mmp_site_entries')
            .update(updateData)
            .eq('id', site['id']);
      } catch (updateError) {
        debugPrint('[_completeVisit] Site status update error: $updateError');
        final errorStr = updateError.toString().toLowerCase();
        if (errorStr.contains('auth') ||
            errorStr.contains('unauthorized') ||
            errorStr.contains('jwt') ||
            errorStr.contains('token')) {
          debugPrint('[_completeVisit] Auth-related site update error');
          await supabase.auth.refreshSession();
          await supabase
              .from('mmp_site_entries')
              .update(updateData)
              .eq('id', site['id']);
        } else {
          rethrow;
        }
      }

      // Save GPS to site_locations table
      if (position != null) {
        debugPrint(
          '[_completeVisit] Inserting final location for site: ${site['id']}',
        );
        // Verify session before location insert
        currentSession = supabase.auth.currentSession;
        if (currentSession == null || currentSession.isExpired) {
          debugPrint(
            '[_completeVisit] Refreshing session before location insert...',
          );
          await supabase.auth.refreshSession();
        }

        try {
          await supabase.from('site_locations').insert({
            'site_id': site['id'],
            'user_id': userId,
            'latitude': position.latitude,
            'longitude': position.longitude,
            'accuracy': position.accuracy ?? 10,
            'notes': 'Visit end location',
            'recorded_at': now,
          });
        } catch (locationError) {
          debugPrint('[_completeVisit] Location insert error: $locationError');
          final errorStr = locationError.toString().toLowerCase();
          if (errorStr.contains('auth') ||
              errorStr.contains('unauthorized') ||
              errorStr.contains('jwt') ||
              errorStr.contains('token')) {
            debugPrint('[_completeVisit] Auth-related location insert error');
            await supabase.auth.refreshSession();
            await supabase.from('site_locations').insert({
              'site_id': site['id'],
              'user_id': userId,
              'latitude': position.latitude,
              'longitude': position.longitude,
              'accuracy': position.accuracy ?? 10,
              'notes': 'Visit end location',
              'recorded_at': now,
            });
          } else {
            // Location insert failure is not critical, log and continue
            debugPrint(
              '[_completeVisit] Location insert failed but continuing: $locationError',
            );
          }
        }
      }

      // Verify session is still valid before reloading data
      currentSession = supabase.auth.currentSession;
      if (currentSession == null || currentSession.isExpired) {
        debugPrint(
          '[_completeVisit] Session expired before reload, refreshing...',
        );
        try {
          await supabase.auth.refreshSession();
          debugPrint('[_completeVisit] Session refreshed before reload');
        } catch (refreshError) {
          debugPrint(
            '[_completeVisit] Session refresh before reload failed: $refreshError',
          );
          // Don't throw - just log and continue, the reload might still work
        }
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Visit completed and report submitted successfully'),
            backgroundColor: Colors.green,
            duration: Duration(seconds: 2),
          ),
        );
      }

      // Don't reload immediately - let the user see the success message and stay on the page
      // The realtime subscription will automatically update the UI when the database changes
      // If realtime is not working, we can reload in the background after a delay
      debugPrint(
        '[_completeVisit] Completion successful - UI will update via realtime subscription',
      );

      // Optionally reload in background after a longer delay to ensure UI stays responsive
      // Only reload if realtime updates don't work
      final finalSessionCheck = supabase.auth.currentSession;
      if (finalSessionCheck != null && !finalSessionCheck.isExpired) {
        // Reload after 2 seconds in the background - this gives realtime a chance to update first
        Future.delayed(const Duration(seconds: 2), () async {
          if (!mounted) return;

          try {
            debugPrint(
              '[_completeVisit] Starting background refresh (realtime may have already updated)...',
            );
            // Only reload specific data, not everything
            await _loadAvailableSites();
            await _loadMySites();
            if (mounted) {
              // Only update if widget is still mounted and visible
              setState(() {});
              debugPrint('[_completeVisit] Background refresh completed');
            }
          } catch (reloadError) {
            debugPrint(
              '[_completeVisit] Error during background refresh (non-critical): $reloadError',
            );
            // Silently fail - realtime should handle updates
          }
        });
      }
    } catch (e, stack) {
      debugPrint('[_completeVisit] Error completing visit: $e');
      debugPrint('[_completeVisit] Stack trace: $stack');

      // Check session state after error
      final sessionAfterError = supabase.auth.currentSession;
      debugPrint(
        '[_completeVisit] Session after error - valid: ${sessionAfterError != null}, expired: ${sessionAfterError?.isExpired ?? true}',
      );

      // Check if error is auth-related
      final errorStr = e.toString().toLowerCase();
      final isAuthError =
          errorStr.contains('auth') ||
          errorStr.contains('unauthorized') ||
          errorStr.contains('jwt') ||
          errorStr.contains('token') ||
          errorStr.contains('session expired');

      if (isAuthError) {
        debugPrint(
          '[_completeVisit] ⚠️ AUTH ERROR detected during completion: $e',
        );
        // Don't let auth errors trigger logout - user might still be valid
        // Only show error message
      }

      if (mounted) {
        final errorMessage = isAuthError
            ? 'Authentication error occurred. Please try again or log in again if the problem persists.'
            : 'Error: ${e.toString()}';

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  /// Check if a site has a synced report
  bool _hasSyncedReport(Map<String, dynamic> site) {
    final siteId = site['id']?.toString();
    if (siteId == null) return false;

    // Check if site is in unsynced list - if it is, it's definitely not synced
    final isUnsynced = _unsyncedCompletedVisits.any(
      (uv) => uv['id']?.toString() == siteId,
    );
    if (isUnsynced) return false;

    // Check additional_data flag (most reliable indicator)
    final additionalData = site['additional_data'] as Map<String, dynamic>?;
    if (additionalData?['visit_report_submitted'] == true) {
      return true;
    }

    // If status is completed and not in unsynced list, it's synced
    final status = (site['status'] as String? ?? '').toLowerCase();
    if (status == 'completed' || status == 'complete') {
      // If it's completed and not in unsynced list, it must be synced
      return true;
    }

    // For in-progress sites, check if visit_report_id exists in additional_data
    // This indicates a report was submitted even if status hasn't updated yet
    if (additionalData?['visit_report_id'] != null) {
      return true;
    }

    return false;
  }

  List<Map<String, dynamic>> _getFilteredSites(
    List<Map<String, dynamic>> sites,
  ) {
    if (_searchQuery.isEmpty) return sites;

    final query = _searchQuery.toLowerCase();
    return sites.where((site) {
      final siteName = (site['site_name'] ?? site['siteName'] ?? '')
          .toString()
          .toLowerCase();
      final siteCode = (site['site_code'] ?? site['siteCode'] ?? '')
          .toString()
          .toLowerCase();
      final state = (site['state'] ?? '').toString().toLowerCase();
      final locality = (site['locality'] ?? '').toString().toLowerCase();

      return siteName.contains(query) ||
          siteCode.contains(query) ||
          state.contains(query) ||
          locality.contains(query);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return MainLayout(
      currentIndex: 1, // MMP is typically index 1
      child: Scaffold(
        key: _scaffoldKey,
        backgroundColor: AppColors.backgroundGray,
        drawer: CustomDrawerMenu(
          currentUser: Supabase.instance.client.auth.currentUser,
          onClose: () => _scaffoldKey.currentState?.closeDrawer(),
        ),
        body: SafeArea(
          child: Column(
            children: [
              ReusableAppBar(
                title: 'MMP Management',
                scaffoldKey: _scaffoldKey,
                showLanguageSwitcher: false,
                showNotifications: true,
                onNotificationTap: () => NotificationsPanel.show(context),
                showUserAvatar: true,
                
                
              ),
              Expanded(
                child: _isLoading
                    ? const Center(child: CircularProgressIndicator())
                    : (_isDataCollector || _isCoordinator)
                    ? _buildDataCollectorView()
                    : _buildNoAccessView(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildNoAccessView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.lock_outline, size: 64, color: AppColors.textLight),
            const SizedBox(height: 16),
            Text(
              'Access Denied',
              style: GoogleFonts.poppins(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: AppColors.textDark,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'You don\'t have permission to access this page.',
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: AppColors.textLight,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDataCollectorView() {
    return Column(
      children: [
        // Header
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF2563EB), Color(0xFF1E40AF)],
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.blue.withOpacity(0.3),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.assignment,
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
                          'My Assignments',
                          style: GoogleFonts.poppins(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                        Text(
                          'Claim, manage, and complete site visits',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: Colors.white.withOpacity(0.9),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),

        // Search Bar
        Padding(
          padding: const EdgeInsets.all(16),
          child: TextField(
            controller: _searchController,
            onChanged: (value) {
              setState(() => _searchQuery = value);
            },
            decoration: InputDecoration(
              hintText: 'Search sites...',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _searchQuery.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        _searchController.clear();
                        setState(() => _searchQuery = '');
                      },
                    )
                  : null,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              filled: true,
              fillColor: Colors.white,
            ),
          ),
        ),

        // Tabs
        Container(
          color: Colors.white,
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: _buildTabButton(
                      'claimable',
                      'Claimable',
                      Icons.handshake,
                      _availableSites.length,
                    ),
                  ),
                  Expanded(
                    child: _buildTabButton(
                      'assigned',
                      'Assigned',
                      Icons.assignment,
                      _smartAssignedSites.length,
                    ),
                  ),
                  Expanded(
                    child: _buildTabButton(
                      'my-sites',
                      'My Sites',
                      Icons.location_on,
                      _mySites.length,
                    ),
                  ),
                ],
              ),
              if (_enumeratorSubTab == 'my-sites') ...[
                const Divider(height: 1),
                Row(
                  children: [
                    Expanded(
                      child: _buildSubTabButton(
                        'pending',
                        'Inbox',
                        _getPendingCount(),
                      ),
                    ),
                    Expanded(
                      child: _buildSubTabButton(
                        'drafts',
                        'Drafts',
                        _getDraftsCount(),
                      ),
                    ),
                    Expanded(
                      child: _buildSubTabButton(
                        'outbox',
                        'Outbox',
                        _unsyncedCompletedVisits.length,
                      ),
                    ),
                    Expanded(
                      child: _buildSubTabButton(
                        'sent',
                        'Sent',
                        _getSentCount(),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),

        // Content
        Expanded(child: _buildDataCollectorContent()),
      ],
    );
  }

  Widget _buildTabButton(String tab, String label, IconData icon, int count) {
    final isActive = _enumeratorSubTab == tab;
    return InkWell(
      onTap: () => setState(() => _enumeratorSubTab = tab),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: isActive ? AppColors.primaryBlue : Colors.transparent,
              width: 2,
            ),
          ),
        ),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  icon,
                  size: 18,
                  color: isActive ? AppColors.primaryBlue : AppColors.textLight,
                ),
                const SizedBox(width: 4),
                Text(
                  label,
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    fontWeight: isActive ? FontWeight.w600 : FontWeight.normal,
                    color: isActive
                        ? AppColors.primaryBlue
                        : AppColors.textLight,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: isActive
                    ? AppColors.primaryBlue.withOpacity(0.1)
                    : AppColors.backgroundGray,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                count.toString(),
                style: GoogleFonts.poppins(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: isActive ? AppColors.primaryBlue : AppColors.textLight,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSubTabButton(String tab, String label, int count) {
    final isActive = _mySitesSubTab == tab;
    return InkWell(
      onTap: () => setState(() => _mySitesSubTab = tab),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: isActive
              ? AppColors.primaryBlue.withOpacity(0.1)
              : Colors.transparent,
          border: Border(
            bottom: BorderSide(
              color: isActive ? AppColors.primaryBlue : Colors.transparent,
              width: 2,
            ),
          ),
        ),
        child: Column(
          children: [
            Text(
              label,
              style: GoogleFonts.poppins(
                fontSize: 11,
                fontWeight: isActive ? FontWeight.w600 : FontWeight.normal,
                color: isActive ? AppColors.primaryBlue : AppColors.textLight,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              count.toString(),
              style: GoogleFonts.poppins(
                fontSize: 10,
                color: isActive ? AppColors.primaryBlue : AppColors.textLight,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDataCollectorContent() {
    switch (_enumeratorSubTab) {
      case 'claimable':
        return _buildClaimableSites();
      case 'assigned':
        return _buildSmartAssignedSites();
      case 'my-sites':
        return _buildMySitesContent();
      default:
        return const SizedBox();
    }
  }

  Widget _buildClaimableSites() {
    final filtered = _getFilteredSites(_availableSites);

    if (filtered.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.location_off, size: 64, color: AppColors.textLight),
              const SizedBox(height: 16),
              Text(
                'No sites available',
                style: GoogleFonts.poppins(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textDark,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'No sites available in your area yet.',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  color: AppColors.textLight,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    // Group by state-locality
    final grouped = <String, List<Map<String, dynamic>>>{};
    for (final site in filtered) {
      final state = site['state'] as String? ?? 'Unknown State';
      final locality = site['locality'] as String? ?? 'Unknown Locality';
      final key = '$state - $locality';
      grouped.putIfAbsent(key, () => []).add(site);
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Info card
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.blue.shade50,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.blue.shade200),
          ),
          child: Row(
            children: [
              Icon(Icons.info_outline, color: Colors.blue.shade700),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'First-Come, First-Served',
                      style: GoogleFonts.poppins(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Colors.blue.shade900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Tap "Claim Site" to assign a site to yourself. Be quick - other enumerators can see these sites too!',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.blue.shade800,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Grouped sites
        ...grouped.entries.map(
          (entry) => _buildSiteGroup(entry.key, entry.value),
        ),
      ],
    );
  }

  Widget _buildSiteGroup(String title, List<Map<String, dynamic>> sites) {
    return ExpansionTile(
      title: Text(
        title,
        style: GoogleFonts.poppins(fontSize: 16, fontWeight: FontWeight.w600),
      ),
      subtitle: Text(
        '${sites.length} site${sites.length != 1 ? 's' : ''}',
        style: GoogleFonts.poppins(fontSize: 12, color: AppColors.textLight),
      ),
      children: sites
          .map((site) => _buildSiteCard(site, showClaimButton: true))
          .toList(),
    );
  }

  Widget _buildSmartAssignedSites() {
    final filtered = _getFilteredSites(_smartAssignedSites);

    if (filtered.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.assignment_outlined,
                size: 64,
                color: AppColors.textLight,
              ),
              const SizedBox(height: 16),
              Text(
                'No assigned sites',
                style: GoogleFonts.poppins(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textDark,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'No sites assigned to you yet.',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  color: AppColors.textLight,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.orange.shade50,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.orange.shade200),
          ),
          child: Row(
            children: [
              Icon(Icons.warning_amber, color: Colors.orange.shade700),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Sites under this category are mandatory to be visited. If you have any issues, please contact your immediate supervisors.',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: Colors.orange.shade900,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        ...filtered.map(
          (site) => _buildSiteCard(site, showAcknowledgeButton: true),
        ),
      ],
    );
  }

  Widget _buildMySitesContent() {
    List<Map<String, dynamic>> sitesToShow = [];

    switch (_mySitesSubTab) {
      case 'pending':
        sitesToShow = _mySites.where((site) {
          final status = (site['status'] as String? ?? '').toLowerCase();
          return status == 'accepted' ||
              status == 'assigned' ||
              status == 'dispatched' ||
              status == 'pending';
        }).toList();
        break;
      case 'drafts':
        sitesToShow = _mySites.where((site) {
          final status = (site['status'] as String? ?? '').toLowerCase();
          final isInProgress = status == 'in progress' ||
              status == 'in_progress' ||
              status == 'ongoing';
          
          // Only show in drafts if it's in progress AND doesn't have a synced report
          return isInProgress && !_hasSyncedReport(site);
        }).toList();
        break;
      case 'outbox':
        sitesToShow = _unsyncedCompletedVisits;
        break;
      case 'sent':
        sitesToShow = _mySites
            .where((site) {
              // Include sites with synced reports (regardless of status)
              // OR sites with completed status that are synced
              return _hasSyncedReport(site);
            })
            .toList();
        break;
    }

    final filtered = _getFilteredSites(sitesToShow);

    if (filtered.isEmpty) {
      String message = 'No sites found';
      switch (_mySitesSubTab) {
        case 'pending':
          message = 'No pending visits found.';
          break;
        case 'drafts':
          message =
              'No in-progress or ongoing site visits found. Start a visit to see it here.';
          break;
        case 'outbox':
          message =
              'No completed visits waiting to sync. All visits have been submitted.';
          break;
        case 'sent':
          message = 'No completed sites found.';
          break;
      }

      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            message,
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: AppColors.textLight,
            ),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: filtered
          .map((site) => _buildSiteCard(site, showVisitActions: true))
          .toList(),
    );
  }

  Widget _buildSiteCard(
    Map<String, dynamic> site, {
    bool showClaimButton = false,
    bool showAcknowledgeButton = false,
    bool showVisitActions = false,
  }) {
    final siteName = site['site_name'] ?? site['siteName'] ?? 'Unknown Site';
    final siteCode = site['site_code'] ?? site['siteCode'] ?? '';
    final state = site['state'] ?? '';
    final locality = site['locality'] ?? '';
    final status = site['status'] ?? 'Pending';
    final enumeratorFee = (site['enumerator_fee'] as num?)?.toDouble() ?? 0.0;
    final transportFee = (site['transport_fee'] as num?)?.toDouble() ?? 0.0;
    // Always calculate total as enumerator_fee + transport_fee (ignore stored cost)
    final cost = enumeratorFee + transportFee;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.backgroundGray),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 5,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      siteName.toString(),
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textDark,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '$locality, $state',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: AppColors.textLight,
                      ),
                    ),
                    if (siteCode.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        'Code: $siteCode',
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          color: AppColors.textLight,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: _getStatusColor(status).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  status.toUpperCase(),
                  style: GoogleFonts.poppins(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: _getStatusColor(status),
                  ),
                ),
              ),
            ],
          ),

          if (cost > 0) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.backgroundGray,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        'Total',
                        style: GoogleFonts.poppins(
                          fontSize: 10,
                          color: AppColors.textLight,
                        ),
                      ),
                      Text(
                        '${cost.toStringAsFixed(0)} SDG',
                        style: GoogleFonts.poppins(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: AppColors.primaryBlue,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 12),
          _buildActionButtons(
            site,
            status: status,
            showClaimButton: showClaimButton,
            showAcknowledgeButton: showAcknowledgeButton,
            showVisitActions: showVisitActions,
          ),
        ],
      ),
    );
  }

  Widget _buildCoordinatorView() {
    final filtered = _getFilteredSites(_coordinatorSites);

    return Column(
      children: [
        // Header
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF2563EB), Color(0xFF1E40AF)],
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.blue.withOpacity(0.3),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.verified_user,
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
                          'Verified Sites',
                          style: GoogleFonts.poppins(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                        Text(
                          'Sites forwarded to you for verification',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: Colors.white.withOpacity(0.9),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),

        // Search
        Padding(
          padding: const EdgeInsets.all(16),
          child: TextField(
            controller: _searchController,
            onChanged: (value) {
              setState(() => _searchQuery = value);
            },
            decoration: InputDecoration(
              hintText: 'Search sites...',
              prefixIcon: const Icon(Icons.search),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              filled: true,
              fillColor: Colors.white,
            ),
          ),
        ),

        // Sites list
        Expanded(
          child: filtered.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.assignment_outlined,
                          size: 64,
                          color: AppColors.textLight,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'No sites found',
                          style: GoogleFonts.poppins(
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textDark,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'No sites have been forwarded to you yet.',
                          style: GoogleFonts.poppins(
                            fontSize: 14,
                            color: AppColors.textLight,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: filtered
                      .map((site) => _buildCoordinatorSiteCard(site))
                      .toList(),
                ),
        ),
      ],
    );
  }

  Widget _buildCoordinatorSiteCard(Map<String, dynamic> site) {
    final siteName = site['site_name'] ?? site['siteName'] ?? 'Unknown Site';
    final siteCode = site['site_code'] ?? site['siteCode'] ?? '';
    final state = site['state'] ?? '';
    final locality = site['locality'] ?? '';
    final status = site['status'] ?? 'Pending';
    final isCompleted = status.toString().toLowerCase() == 'completed' || 
                        status.toString().toLowerCase() == 'complete';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.backgroundGray),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      siteName.toString(),
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '$locality, $state',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: AppColors.textLight,
                      ),
                    ),
                    if (siteCode.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        'Code: $siteCode',
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          color: AppColors.textLight,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: _getStatusColor(status).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  status.toUpperCase(),
                  style: GoogleFonts.poppins(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: _getStatusColor(status),
                  ),
                ),
              ),
            ],
          ),
          if (isCompleted && (_isAdminOrSuperUser || _userRole == 'fom')) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () => _viewVisitReport(site),
                icon: const Icon(Icons.visibility, size: 18),
                label: const Text('View Visit Report'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.blue,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  void _viewVisitReport(Map<String, dynamic> site) {
    final siteVisit = SiteVisit(
      id: site['id']?.toString() ?? '',
      siteName: site['site_name']?.toString() ?? site['siteName']?.toString() ?? 'Unknown',
      siteCode: site['site_code']?.toString() ?? site['siteCode']?.toString() ?? '',
      state: site['state']?.toString() ?? '',
      locality: site['locality']?.toString() ?? '',
      status: site['status']?.toString() ?? '',
      activity: site['activity']?.toString() ?? site['main_activity']?.toString() ?? '',
      priority: site['priority']?.toString() ?? 'medium',
      notes: site['notes']?.toString() ?? '',
      mainActivity: site['main_activity']?.toString() ?? site['activity']?.toString() ?? '',
      assignedTo: site['accepted_by']?.toString() ?? site['assigned_to']?.toString() ?? '',
      createdAt: site['created_at'] != null 
          ? DateTime.tryParse(site['created_at'].toString()) ?? DateTime.now()
          : DateTime.now(),
      transportFee: (site['transport_fee'] as num?)?.toDouble() ?? 0,
      enumeratorFee: (site['enumerator_fee'] as num?)?.toDouble() ?? 0,
      dueDate: site['due_date'] != null ? DateTime.tryParse(site['due_date'].toString()) : null,
    );

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => VisitReportDetailScreen(visit: siteVisit),
      ),
    );
  }

  Color _getStatusColor(String status) {
    final s = status.toLowerCase();
    if (s == 'completed' || s == 'complete') return Colors.green;
    if (s == 'in progress' || s == 'in_progress' || s == 'ongoing') {
      return Colors.blue;
    }
    if (s == 'pending' || s == 'assigned' || s == 'dispatched') {
      return Colors.orange;
    }
    if (s == 'verified') return Colors.purple;
    if (s == 'rejected') return Colors.red;
    return AppColors.textLight;
  }

  int _getPendingCount() {
    return _mySites.where((site) {
      final status = (site['status'] as String? ?? '').toLowerCase();
      return status == 'accepted' ||
          status == 'assigned' ||
          status == 'dispatched' ||
          status == 'pending';
    }).length;
  }

  int _getDraftsCount() {
    return _mySites.where((site) {
      final status = (site['status'] as String? ?? '').toLowerCase();
      return status == 'in progress' ||
          status == 'in_progress' ||
          status == 'ongoing';
    }).length;
  }

  int _getSentCount() {
    return _mySites
        .where((site) {
          final status = (site['status'] as String? ?? '').toLowerCase();
          return status == 'completed' || status == 'complete';
        })
        .where((site) {
          return !_unsyncedCompletedVisits.any((uv) => uv['id'] == site['id']);
        })
        .length;
  }
}

// Cost Acknowledgment Dialog
class _CostAcknowledgmentDialog extends StatefulWidget {
  final Map<String, dynamic> site;

  const _CostAcknowledgmentDialog({required this.site});

  @override
  State<_CostAcknowledgmentDialog> createState() =>
      _CostAcknowledgmentDialogState();
}

class _CostAcknowledgmentDialogState extends State<_CostAcknowledgmentDialog> {
  bool _acknowledged = false;

  @override
  Widget build(BuildContext context) {
    final site = widget.site;
    final enumeratorFee = site['enumerator_fee'] ?? 0;
    final transportFee = site['transport_fee'] ?? 0;
    // Always calculate total as transport + enumerator fee (not just site['cost'])
    final totalCost = (transportFee is num ? transportFee : 0) + (enumeratorFee is num ? enumeratorFee : 0);

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Cost Acknowledgment',
              style: GoogleFonts.poppins(
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Site: ${site['site_name'] ?? site['siteName'] ?? 'Unknown'}',
              style: GoogleFonts.poppins(
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.backgroundGray,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                children: [
                  _buildCostRow('Total Cost', totalCost, isTotal: true),
                ],
              ),
            ),
            const SizedBox(height: 16),
            CheckboxListTile(
              value: _acknowledged,
              onChanged: (value) =>
                  setState(() => _acknowledged = value ?? false),
              title: Text(
                'I acknowledge receipt of the cost details',
                style: GoogleFonts.poppins(fontSize: 12),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('Cancel'),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: _acknowledged
                      ? () => Navigator.of(context).pop(true)
                      : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green,
                    foregroundColor: Colors.white,
                  ),
                  child: const Text('Acknowledge'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCostRow(String label, num amount, {bool isTotal = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: GoogleFonts.poppins(
              fontSize: isTotal ? 16 : 14,
              fontWeight: isTotal ? FontWeight.bold : FontWeight.normal,
            ),
          ),
          Text(
            '${amount.toStringAsFixed(0)} SDG',
            style: GoogleFonts.poppins(
              fontSize: isTotal ? 18 : 14,
              fontWeight: FontWeight.bold,
              color: isTotal ? AppColors.primaryBlue : AppColors.textDark,
            ),
          ),
        ],
      ),
    );
  }
}
