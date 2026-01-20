import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:geolocator/geolocator.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../widgets/reusable_app_bar.dart';
import '../widgets/dashboard_card.dart';
import '../widgets/custom_drawer_menu.dart';
import '../widgets/notifications_panel.dart';
import '../widgets/main_layout.dart';
import '../services/wallet_service.dart';
import '../services/offline/offline_db.dart';
import '../models/site_visit.dart';
import '../theme/app_colors.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final WalletService _walletService = WalletService();

  bool _isLoading = true;
  bool _isOffline = false;
  bool _isCoordinator = false;
  String? _userId;
  String? _userState;
  String? _userHub;
  String? _userRole;
  List<String> _userProjectIds = [];
  bool _isAdminOrSuperUser = false;

  // Coordinator metrics
  int _totalOperations = 0;
  int _completedVisits = 0;
  int _activeOperations = 0;
  int _pendingQueue = 0;
  double _completionRate = 0.0;
  List<SiteVisit> _coordinatorVisits = [];

  // Data Collector metrics
  int _assigned = 0;
  int _today = 0;
  int _inProgress = 0;
  int _completed = 0;
  int _overdue = 0;
  double _earnings = 0.0;
  List<SiteVisit> _dataCollectorVisits = [];
  int _streak = 0;
  double _completionRateDC = 0.0;
  int? _averageVisitTime;
  bool _hasLocation = false;
  Map<String, double>? _currentLocation;
  String? _locationLastUpdated;
  bool _isUpdatingLocation = false;

  // Tab states
  String _coordinatorTab = 'overview';
  String _dataCollectorTab = 'my-visits';

  RealtimeChannel? _realtimeChannel;

  @override
  void initState() {
    super.initState();
    _initializeDashboard();
  }

  @override
  void dispose() {
    _realtimeChannel?.unsubscribe();
    super.dispose();
  }

  Future<void> _initializeDashboard() async {
    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) {
        setState(() => _isLoading = false);
        return;
      }

      _userId = user.id;

      // Check connectivity first
      final connectivityResult = await Connectivity().checkConnectivity();
      final isOffline = connectivityResult.contains(ConnectivityResult.none);
      
      if (mounted) {
        setState(() => _isOffline = isOffline);
      }
      
      if (isOffline) {
        // OFFLINE MODE: Load from cache
        debugPrint('[Dashboard] Offline - loading from cache');
        await _initializeFromCache(user.id);
        return;
      }

      // ONLINE MODE: Fetch from Supabase and cache
      try {
        // Get user profile to determine role
        final profileResponse = await Supabase.instance.client
            .from('profiles')
            .select('role, state_id, hub_id')
            .eq('id', user.id)
            .maybeSingle();

        if (profileResponse != null) {
          // Cache profile for offline use
          await _cacheProfile(user.id, profileResponse);
          _applyProfileData(profileResponse);

          // Fetch user's project memberships (for non-admin users)
          if (!_isAdminOrSuperUser) {
            await _fetchUserProjectMemberships();
          }
        }

        // Load dashboard data based on role
        if (_isCoordinator) {
          await _loadCoordinatorDashboard();
          _setupRealtimeSubscription();
        } else {
          await _loadDataCollectorDashboard();
        }

        setState(() => _isLoading = false);
      } catch (e) {
        // Network error - fall back to cache
        debugPrint('[Dashboard] Network error, falling back to cache: $e');
        await _initializeFromCache(user.id);
      }
    } catch (e) {
      debugPrint('Error initializing dashboard: $e');
      // Try cache as last resort
      final user = Supabase.instance.client.auth.currentUser;
      if (user != null) {
        await _initializeFromCache(user.id);
      } else {
        setState(() => _isLoading = false);
      }
    }
  }
  
  /// Initialize from cached data when offline
  Future<void> _initializeFromCache(String userId) async {
    try {
      if (mounted) {
        setState(() => _isOffline = true);
      }
      debugPrint('[Dashboard] Loading from cache');
      
      // Load cached profile
      final cachedProfile = await _getCachedProfile(userId);
      if (cachedProfile != null) {
        _applyProfileData(cachedProfile);
      }
      
      // Load cached dashboard data
      final cachedData = await _getCachedDashboardData(userId);
      if (cachedData != null) {
        _applyCachedDashboardData(cachedData);
      }
      
      if (!mounted) return;
      setState(() => _isLoading = false);
    } catch (e) {
      debugPrint('[Dashboard] Error loading from cache: $e');
      if (!mounted) return;
      setState(() => _isLoading = false);
    }
  }
  
  void _applyProfileData(Map<String, dynamic> profileResponse) {
    _userRole = (profileResponse['role'] as String?)?.toLowerCase() ?? '';
    _isCoordinator =
        _userRole == 'coordinator' ||
        _userRole == 'field_coordinator' ||
        _userRole == 'state_coordinator';

    _userState = profileResponse['state_id'] as String?;
    _userHub = profileResponse['hub_id'] as String?;

    _isAdminOrSuperUser =
        _userRole == 'admin' ||
        _userRole == 'super_admin' ||
        _userRole == 'supervisor' ||
        _userRole == 'fom';
  }
  
  Future<void> _cacheProfile(String userId, Map<String, dynamic> profile) async {
    try {
      final offlineDb = OfflineDb();
      await offlineDb.cacheItem(
        OfflineDb.profileCacheBox,
        'profile_$userId',
        data: profile,
        ttl: const Duration(days: 7),
      );
    } catch (e) {
      debugPrint('[Dashboard] Error caching profile: $e');
    }
  }
  
  Future<Map<String, dynamic>?> _getCachedProfile(String userId) async {
    try {
      final offlineDb = OfflineDb();
      final cached = offlineDb.getCachedItem(OfflineDb.profileCacheBox, 'profile_$userId');
      return cached?.data as Map<String, dynamic>?;
    } catch (e) {
      debugPrint('[Dashboard] Error getting cached profile: $e');
      return null;
    }
  }
  
  Future<void> _cacheDashboardData(String userId) async {
    try {
      final offlineDb = OfflineDb();
      final data = {
        'totalOperations': _totalOperations,
        'completedVisits': _completedVisits,
        'activeOperations': _activeOperations,
        'pendingQueue': _pendingQueue,
        'completionRate': _completionRate,
        'assigned': _assigned,
        'today': _today,
        'inProgress': _inProgress,
        'completed': _completed,
        'overdue': _overdue,
        'earnings': _earnings,
        'streak': _streak,
        'completionRateDC': _completionRateDC,
        'isCoordinator': _isCoordinator,
        'coordinatorVisits': _coordinatorVisits.map((v) => v.toJson()).toList(),
        'dataCollectorVisits': _dataCollectorVisits.map((v) => v.toJson()).toList(),
      };
      await offlineDb.cacheItem(
        OfflineDb.siteCacheBox,
        'dashboard_data_$userId',
        data: data,
        ttl: const Duration(hours: 12),
      );
      debugPrint('[Dashboard] Cached dashboard data with ${_coordinatorVisits.length} coordinator and ${_dataCollectorVisits.length} DC visits');
    } catch (e) {
      debugPrint('[Dashboard] Error caching dashboard data: $e');
    }
  }
  
  Future<Map<String, dynamic>?> _getCachedDashboardData(String userId) async {
    try {
      final offlineDb = OfflineDb();
      final cached = offlineDb.getCachedItem(OfflineDb.siteCacheBox, 'dashboard_data_$userId');
      return cached?.data as Map<String, dynamic>?;
    } catch (e) {
      debugPrint('[Dashboard] Error getting cached dashboard data: $e');
      return null;
    }
  }
  
  void _applyCachedDashboardData(Map<String, dynamic> data) {
    _totalOperations = (data['totalOperations'] as num?)?.toInt() ?? 0;
    _completedVisits = (data['completedVisits'] as num?)?.toInt() ?? 0;
    _activeOperations = (data['activeOperations'] as num?)?.toInt() ?? 0;
    _pendingQueue = (data['pendingQueue'] as num?)?.toInt() ?? 0;
    _completionRate = (data['completionRate'] as num?)?.toDouble() ?? 0.0;
    _assigned = (data['assigned'] as num?)?.toInt() ?? 0;
    _today = (data['today'] as num?)?.toInt() ?? 0;
    _inProgress = (data['inProgress'] as num?)?.toInt() ?? 0;
    _completed = (data['completed'] as num?)?.toInt() ?? 0;
    _overdue = (data['overdue'] as num?)?.toInt() ?? 0;
    _earnings = (data['earnings'] as num?)?.toDouble() ?? 0.0;
    _streak = (data['streak'] as num?)?.toInt() ?? 0;
    _completionRateDC = (data['completionRateDC'] as num?)?.toDouble() ?? 0.0;
    _isCoordinator = data['isCoordinator'] as bool? ?? false;
    
    // Restore visit lists
    final coordVisits = data['coordinatorVisits'] as List?;
    if (coordVisits != null) {
      _coordinatorVisits = coordVisits
          .map((v) => SiteVisit.fromJson(Map<String, dynamic>.from(v as Map)))
          .toList();
    }
    
    final dcVisits = data['dataCollectorVisits'] as List?;
    if (dcVisits != null) {
      _dataCollectorVisits = dcVisits
          .map((v) => SiteVisit.fromJson(Map<String, dynamic>.from(v as Map)))
          .toList();
    }
  }

  /// Setup real-time subscription for coordinator dashboard updates
  void _setupRealtimeSubscription() {
    try {
      _realtimeChannel?.unsubscribe();

      _realtimeChannel = Supabase.instance.client
          .channel('coordinator_dashboard_realtime')
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'mmp_site_entries',
            callback: (payload) {
              debugPrint('mmp_site_entries changed, reloading dashboard...');
              _loadCoordinatorDashboard();
            },
          )
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'mmp_files',
            callback: (payload) {
              debugPrint('mmp_files changed, reloading dashboard...');
              _loadCoordinatorDashboard();
            },
          )
          .subscribe();

      // Fallback polling every 60 seconds
      Future.delayed(const Duration(seconds: 60), () {
        if (mounted) {
          _loadCoordinatorDashboard();
        }
      });
    } catch (e) {
      debugPrint('Error setting up real-time subscription: $e');
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

  Future<void> _loadCoordinatorDashboard() async {
    try {
      if (_userId == null) return;

      // Fetch site entries forwarded to this coordinator
      // Mobile app is only for coordinators, so we just filter by forwarded_to_user_id
      final response = await Supabase.instance.client
          .from('mmp_site_entries')
          .select('*, mmp_files(project_id)')
          .eq('forwarded_to_user_id', _userId!)
          .order('created_at', ascending: false)
          .limit(1000);

      // Filter by project membership (for non-admin users) before converting to SiteVisit
      List<Map<String, dynamic>> filteredResponse = (response as List)
          .map((e) => e as Map<String, dynamic>)
          .toList();
      if (!_isAdminOrSuperUser) {
        final beforeCount = filteredResponse.length;
        filteredResponse = filteredResponse.where((json) {
          final mmpFiles = json['mmp_files'] as Map<String, dynamic>?;
          final projectId = mmpFiles?['project_id']?.toString();

          // If site has no project ID, exclude it
          if (projectId == null || projectId.isEmpty) {
            return false;
          }

          // Site must be in one of user's projects
          return _userProjectIds.contains(projectId);
        }).toList();

        debugPrint(
          'Filtered coordinator sites by project: ${filteredResponse.length} of $beforeCount',
        );
      }

      // Convert to SiteVisit objects
      final siteVisits = filteredResponse
          .map((json) => SiteVisit.fromJson(json))
          .toList();

      _coordinatorVisits = siteVisits;

      // Calculate metrics (matching React implementation)
      _totalOperations = siteVisits.length;

      _completedVisits = siteVisits.where((v) {
        final status = v.status.toLowerCase();
        return status == 'completed' || status == 'complete';
      }).length;

      _activeOperations = siteVisits.where((v) {
        final status = v.status.toLowerCase();
        return status == 'assigned' ||
            status == 'ongoing' ||
            status == 'in progress' ||
            status == 'in_progress' ||
            status == 'accepted';
      }).length;

      _pendingQueue = siteVisits.where((v) {
        final status = v.status.toLowerCase();
        return status == 'pending' ||
            status == 'dispatched' ||
            status == 'permitverified' ||
            status == 'permit_verified';
      }).length;

      // Calculate completion rate
      if (_totalOperations > 0) {
        _completionRate = (_completedVisits / _totalOperations) * 100;
      } else {
        _completionRate = 0.0;
      }

      // Cache dashboard data for offline use
      await _cacheDashboardData(_userId!);

      if (mounted) {
        setState(() {});
      }
    } catch (e) {
      debugPrint('Error loading coordinator dashboard: $e');
    }
  }

  Future<void> _loadDataCollectorDashboard() async {
    try {
      if (_userId == null) return;

      // Fetch all site entries assigned to this data collector
      // Data collectors are assigned via accepted_by or additional_data->>'assigned_to'
      // Query 1: Get entries where accepted_by matches
      final acceptedByResponse = await Supabase.instance.client
          .from('mmp_site_entries')
          .select('*, mmp_files(project_id)')
          .eq('accepted_by', _userId!)
          .order('created_at', ascending: false)
          .limit(1000);

      // Query 2: Get entries where additional_data->>'assigned_to' matches
      // Note: Supabase Flutter doesn't support direct JSONB queries easily, so we fetch all and filter
      final allEntriesResponse = await Supabase.instance.client
          .from('mmp_site_entries')
          .select('*, mmp_files(project_id)')
          .order('created_at', ascending: false)
          .limit(1000);

      // Combine and deduplicate results using a Map with id as key
      final allEntriesMap = <String, Map<String, dynamic>>{};

      // Add entries from accepted_by query
      for (final entry in acceptedByResponse as List) {
        final entryMap = entry as Map<String, dynamic>;
        final entryId = entryMap['id'] as String?;
        if (entryId != null) {
          allEntriesMap[entryId] = entryMap;
        }
      }

      // Add entries from additional_data->>'assigned_to' filter
      for (final entry in allEntriesResponse as List) {
        final entryMap = entry as Map<String, dynamic>;
        final additionalData =
            entryMap['additional_data'] as Map<String, dynamic>?;
        final assignedTo = additionalData?['assigned_to'] as String?;

        if (assignedTo == _userId) {
          final entryId = entryMap['id'] as String?;
          if (entryId != null) {
            allEntriesMap[entryId] = entryMap;
          }
        }
      }

      // Filter by project membership (for non-admin users) before converting to SiteVisit
      List<Map<String, dynamic>> filteredEntries = allEntriesMap.values
          .toList();
      if (!_isAdminOrSuperUser) {
        final beforeCount = filteredEntries.length;
        filteredEntries = filteredEntries.where((json) {
          final mmpFiles = json['mmp_files'] as Map<String, dynamic>?;
          final projectId = mmpFiles?['project_id']?.toString();

          // If site has no project ID, exclude it
          if (projectId == null || projectId.isEmpty) {
            return false;
          }

          // Site must be in one of user's projects
          return _userProjectIds.contains(projectId);
        }).toList();

        debugPrint(
          'Filtered data collector sites by project: ${filteredEntries.length} of $beforeCount',
        );
      }

      // Convert to SiteVisit objects
      final allVisits = filteredEntries
          .map((json) => SiteVisit.fromJson(json))
          .toList();

      _dataCollectorVisits = allVisits;

      // Calculate metrics
      _assigned = allVisits.length;

      // Filter by status
      final acceptedVisits = allVisits.where((v) {
        final status = v.status.toLowerCase();
        return status == 'assigned' ||
            status == 'accepted' ||
            status == 'permitverified' ||
            status == 'permit_verified';
      }).toList();

      _inProgress = allVisits.where((v) {
        final status = v.status.toLowerCase();
        return status == 'inprogress' ||
            status == 'in_progress' ||
            status == 'ongoing';
      }).length;

      _completed = allVisits.where((v) {
        final status = v.status.toLowerCase();
        return status == 'completed' || status == 'complete';
      }).length;

      // Calculate today's visits
      final today = DateTime.now();
      _today = acceptedVisits.where((v) {
        if (v.dueDate == null) return false;
        final visitDate = v.dueDate!;
        return visitDate.year == today.year &&
            visitDate.month == today.month &&
            visitDate.day == today.day;
      }).length;

      // Calculate overdue visits
      _overdue = acceptedVisits.where((v) {
        if (v.dueDate == null) return false;
        final visitDate = v.dueDate!;
        final todayStart = DateTime(today.year, today.month, today.day);
        return visitDate.isBefore(todayStart) &&
            v.status.toLowerCase() != 'completed' &&
            v.status.toLowerCase() != 'complete';
      }).length;

      // Get earnings from wallet
      try {
        final walletStats = await _walletService.fetchWalletStats();
        _earnings = walletStats.totalEarned;
      } catch (e) {
        debugPrint('Error fetching wallet stats: $e');
        _earnings = 0.0;
      }

      // Calculate completion rate
      if (_assigned > 0) {
        _completionRateDC = (_completed / _assigned) * 100;
      } else {
        _completionRateDC = 0.0;
      }

      // Calculate streak (simplified - consecutive days with completed visits)
      _streak = _calculateStreak(allVisits);

      // Load location info
      await _loadLocationInfo();

      // Cache dashboard data for offline use
      await _cacheDashboardData(_userId!);

      if (mounted) {
        setState(() {});
      }
    } catch (e) {
      debugPrint('Error loading data collector dashboard: $e');
    }
  }

  Future<void> _loadLocationInfo() async {
    try {
      if (_userId == null) return;

      final data = await Supabase.instance.client
          .from('profiles')
          .select('location, updated_at')
          .eq('id', _userId!)
          .maybeSingle();

      if (data != null) {
        final location = data['location'];
        if (location != null) {
          final locMap = location is Map
              ? location
              : (location is String
                    ? Map<String, dynamic>.from(
                        Map<String, dynamic>.from(
                          (location)
                              .split(',')
                              .asMap()
                              .map(
                                (i, v) => MapEntry(
                                  i == 0 ? 'latitude' : 'longitude',
                                  double.tryParse(v.trim()) ?? 0.0,
                                ),
                              ),
                        ),
                      )
                    : null);

          if (locMap != null) {
            _currentLocation = {
              'latitude':
                  (locMap['latitude'] ?? locMap['lat'] ?? 0.0) as double,
              'longitude':
                  (locMap['longitude'] ?? locMap['lng'] ?? locMap['lon'] ?? 0.0)
                      as double,
            };
            _hasLocation =
                _currentLocation!['latitude'] != 0.0 &&
                _currentLocation!['longitude'] != 0.0;
          }
        }

        final updatedAt = data['updated_at'] as String?;
        if (updatedAt != null) {
          _locationLastUpdated = updatedAt;
        }
      }
    } catch (e) {
      debugPrint('Error loading location info: $e');
    }
  }

  Future<void> _updateLocation() async {
    setState(() => _isUpdatingLocation = true);
    try {
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );

      final locationData = {
        'latitude': position.latitude,
        'longitude': position.longitude,
      };

      await Supabase.instance.client
          .from('profiles')
          .update({
            'location': locationData,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', _userId!);

      _currentLocation = {
        'latitude': position.latitude,
        'longitude': position.longitude,
      };
      _hasLocation = true;
      _locationLastUpdated = DateTime.now().toIso8601String();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Location updated successfully'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      debugPrint('Error updating location: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error updating location: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      setState(() => _isUpdatingLocation = false);
    }
  }

  int _calculateStreak(List<SiteVisit> visits) {
    // Simplified streak calculation - consecutive days with completed visits
    final completed = visits.where((v) {
      final status = v.status.toLowerCase();
      return status == 'completed' || status == 'complete';
    }).toList();

    if (completed.isEmpty) return 0;

    final completedDates =
        completed
            .where((v) => v.completedAt != null)
            .map((v) => v.completedAt!.toLocal())
            .map((d) => DateTime(d.year, d.month, d.day))
            .toSet()
            .toList()
          ..sort((a, b) => b.compareTo(a));

    if (completedDates.isEmpty) return 0;

    int streak = 0;
    final today = DateTime.now();
    final todayStart = DateTime(today.year, today.month, today.day);
    DateTime currentDate = todayStart;

    for (final date in completedDates) {
      final daysDiff = currentDate.difference(date).inDays;
      if (daysDiff == streak) {
        streak++;
        currentDate = currentDate.subtract(const Duration(days: 1));
      } else {
        break;
      }
    }

    return streak;
  }

  @override
  Widget build(BuildContext context) {
    return MainLayout(
      currentIndex: 0,
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
                title: 'Dashboard',
                scaffoldKey: _scaffoldKey,
                showLanguageSwitcher: false,
                showNotifications: true,
                onNotificationTap: () => NotificationsPanel.show(context),
                showUserAvatar: true,
              ),
              Expanded(
                child: _isLoading
                    ? const Center(child: CircularProgressIndicator())
                    : RefreshIndicator(
                        onRefresh: _initializeDashboard,
                        child: SingleChildScrollView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Operations Center Header
                              Row(
                                children: [
                                  Icon(
                                    Icons.dashboard_outlined,
                                    color: AppColors.primaryBlue,
                                    size: 24,
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    'Operations Center',
                                    style: GoogleFonts.poppins(
                                      fontSize: 20,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.textDark,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Field operations command and control',
                                style: GoogleFonts.poppins(
                                  fontSize: 14,
                                  color: AppColors.textLight,
                                ),
                              ),
                              const SizedBox(height: 16),

                              // State/Hub indicator
                              if (_userState != null || _userHub != null)
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 6,
                                  ),
                                  decoration: BoxDecoration(
                                    color: AppColors.accentGreen.withOpacity(
                                      0.1,
                                    ),
                                    borderRadius: BorderRadius.circular(20),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(
                                        Icons.location_on,
                                        size: 16,
                                        color: AppColors.accentGreen,
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        _userState != null
                                            ? 'State: $_userState'
                                            : 'Hub: $_userHub',
                                        style: GoogleFonts.poppins(
                                          fontSize: 12,
                                          color: AppColors.accentGreen,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              const SizedBox(height: 24),

                              // Dashboard Cards
                              if (_isCoordinator)
                                _buildCoordinatorCards()
                              else
                                _buildDataCollectorCards(),

                              const SizedBox(height: 24),

                              // Location Sharing Card (Data Collectors only)
                              if (!_isCoordinator) _buildLocationCard(),

                              // Streak & Performance Banner (Data Collectors only)
                              if (!_isCoordinator &&
                                  (_streak > 0 || _completionRateDC > 0))
                                _buildPerformanceBanner(),

                              const SizedBox(height: 24),

                              // Tabs Section
                              _buildTabsSection(),
                            ],
                          ),
                        ),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCoordinatorCards() {
    return Column(
      children: [
        // First row
        Row(
          children: [
            Expanded(
              child: DashboardCard(
                title: 'Total Operations',
                value: _totalOperations.toString(),
                subtitle: 'All site visits',
                icon: Icons.assessment_outlined,
                color: AppColors.primaryBlue,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: DashboardCard(
                title: 'Completed Visits',
                value: _completedVisits.toString(),
                subtitle:
                    '${_completionRate.toStringAsFixed(1)}% completion rate',
                icon: Icons.check_circle_outline,
                color: AppColors.accentGreen,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        // Second row
        Row(
          children: [
            Expanded(
              child: DashboardCard(
                title: 'Active Operations',
                value: _activeOperations.toString(),
                subtitle: 'In progress now',
                icon: Icons.people_outline,
                color: Colors.cyan,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: DashboardCard(
                title: 'Pending Queue',
                value: _pendingQueue.toString(),
                subtitle: 'Awaiting assignment',
                icon: Icons.schedule_outlined,
                color: AppColors.primaryOrange,
              ),
            ),
          ],
        ),
      ],
    ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.2, end: 0);
  }

  Widget _buildDataCollectorCards() {
    return Column(
      children: [
        // First row
        Row(
          children: [
            Expanded(
              child: DashboardCard(
                title: 'Assigned',
                value: _assigned.toString(),
                icon: Icons.assignment_outlined,
                color: AppColors.primaryBlue,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: DashboardCard(
                title: 'Today',
                value: _today.toString(),
                icon: Icons.today_outlined,
                color: AppColors.primaryOrange,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        // Second row
        Row(
          children: [
            Expanded(
              child: DashboardCard(
                title: 'In Progress',
                value: _inProgress.toString(),
                icon: Icons.work_outline,
                color: Colors.cyan,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: DashboardCard(
                title: 'Completed',
                value: _completed.toString(),
                icon: Icons.check_circle_outline,
                color: AppColors.accentGreen,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        // Third row
        Row(
          children: [
            Expanded(
              child: DashboardCard(
                title: 'Overdue',
                value: _overdue.toString(),
                icon: Icons.warning_amber_rounded,
                color: AppColors.accentRed,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: DashboardCard(
                title: 'Earnings',
                value: _walletService.formatCurrency(_earnings),
                icon: Icons.account_balance_wallet_outlined,
                color: Colors.purple,
              ),
            ),
          ],
        ),
      ],
    ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.2, end: 0);
  }

  Widget _buildLocationCard() {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.blue.shade50,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.blue.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.blue.shade600,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.location_on,
                  color: Colors.white,
                  size: 20,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          'Location Sharing',
                          style: GoogleFonts.poppins(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: Colors.blue.shade900,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: _hasLocation ? Colors.green : Colors.red,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                _hasLocation
                                    ? Icons.check_circle
                                    : Icons.cancel,
                                size: 12,
                                color: Colors.white,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                _hasLocation ? 'Enabled' : 'Not Set',
                                style: GoogleFonts.poppins(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.white,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Share your location to appear on the team map and receive nearby site visit assignments.',
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
          if (_hasLocation && _currentLocation != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Current Location:',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Colors.blue.shade900,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Lat: ${_currentLocation!['latitude']!.toStringAsFixed(6)}, '
                    'Lng: ${_currentLocation!['longitude']!.toStringAsFixed(6)}',
                    style: GoogleFonts.poppins(
                      fontSize: 11,
                      color: Colors.blue.shade700,
                    ),
                  ),
                  if (_locationLastUpdated != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      'Last Updated: ${DateFormat('MMM dd, yyyy h:mm:ss a').format(DateTime.parse(_locationLastUpdated!))}',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: Colors.blue.shade600,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _isUpdatingLocation ? null : _updateLocation,
              icon: _isUpdatingLocation
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.refresh),
              label: Text(
                _isUpdatingLocation
                    ? 'Updating...'
                    : (_hasLocation ? 'Update Location' : 'Share Location'),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue.shade600,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPerformanceBanner() {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Colors.orange.shade50, Colors.amber.shade50],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.orange.shade200),
      ),
      child: Row(
        children: [
          if (_streak > 0) ...[
            Row(
              children: [
                Icon(
                  Icons.local_fire_department,
                  color: Colors.orange.shade600,
                  size: 24,
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '$_streak Day Streak',
                      style: GoogleFonts.poppins(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Colors.orange.shade900,
                      ),
                    ),
                    Text(
                      'Keep it up!',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        color: Colors.orange.shade700,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(width: 24),
          ],
          if (_averageVisitTime != null) ...[
            Row(
              children: [
                Icon(Icons.access_time, color: Colors.blue.shade600, size: 24),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Avg: $_averageVisitTime min',
                      style: GoogleFonts.poppins(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Colors.blue.shade900,
                      ),
                    ),
                    Text(
                      'Per visit',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        color: Colors.blue.shade700,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(width: 24),
          ],
          const Spacer(),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${_completionRateDC.toStringAsFixed(0)}%',
                style: GoogleFonts.poppins(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: Colors.orange.shade900,
                ),
              ),
              Text(
                'Completion Rate',
                style: GoogleFonts.poppins(
                  fontSize: 11,
                  color: Colors.orange.shade700,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTabsSection() {
    if (_isCoordinator) {
      return _buildCoordinatorTabs();
    } else {
      return _buildDataCollectorTabs();
    }
  }

  Widget _buildCoordinatorTabs() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          // Tab Buttons
          Row(
            children: [
              Expanded(
                child: _buildTabButton('overview', 'Overview', Icons.list_alt),
              ),
              Expanded(
                child: _buildTabButton(
                  'upcoming',
                  'Upcoming',
                  Icons.calendar_today,
                ),
              ),
              Expanded(
                child: _buildTabButton(
                  'calendar',
                  'Calendar',
                  Icons.calendar_month,
                ),
              ),
              Expanded(
                child: _buildTabButton('costs', 'Costs', Icons.attach_money),
              ),
            ],
          ),
          const Divider(height: 1),
          // Tab Content
          Padding(
            padding: const EdgeInsets.all(16),
            child: _buildCoordinatorTabContent(),
          ),
        ],
      ),
    );
  }

  Widget _buildDataCollectorTabs() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          // Tab Buttons
          Row(
            children: [
              Expanded(
                child: _buildTabButton(
                  'my-visits',
                  'Visits',
                  Icons.location_on,
                ),
              ),
              Expanded(
                child: _buildTabButton(
                  'schedule',
                  'Schedule',
                  Icons.calendar_today,
                ),
              ),
              Expanded(
                child: _buildTabButton(
                  'performance',
                  'Stats',
                  Icons.trending_up,
                ),
              ),
              Expanded(
                child: _buildTabButton(
                  'wallet',
                  'Wallet',
                  Icons.account_balance_wallet,
                ),
              ),
              Expanded(
                child: _buildTabButton('help', 'Help', Icons.help_outline),
              ),
            ],
          ),
          const Divider(height: 1),
          // Tab Content
          Padding(
            padding: const EdgeInsets.all(16),
            child: _buildDataCollectorTabContent(),
          ),
        ],
      ),
    );
  }

  Widget _buildTabButton(String tab, String label, IconData icon) {
    final isActive = _isCoordinator
        ? _coordinatorTab == tab
        : _dataCollectorTab == tab;

    return InkWell(
      onTap: () => setState(() {
        if (_isCoordinator) {
          _coordinatorTab = tab;
        } else {
          _dataCollectorTab = tab;
        }
      }),
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
            Icon(
              icon,
              size: 20,
              color: isActive ? AppColors.primaryBlue : AppColors.textLight,
            ),
            const SizedBox(height: 4),
            Text(
              label,
              textAlign: TextAlign.center,
              style: GoogleFonts.poppins(
                fontSize: 10,
                fontWeight: isActive ? FontWeight.w600 : FontWeight.normal,
                color: isActive ? AppColors.primaryBlue : AppColors.textLight,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCoordinatorTabContent() {
    switch (_coordinatorTab) {
      case 'overview':
        return _buildOverviewTab();
      case 'upcoming':
        return _buildUpcomingTab();
      case 'calendar':
        return _buildCalendarTab();
      case 'costs':
        return _buildCostsTab();
      default:
        return const SizedBox();
    }
  }

  Widget _buildDataCollectorTabContent() {
    switch (_dataCollectorTab) {
      case 'my-visits':
        return _buildMyVisitsTab();
      case 'schedule':
        return _buildScheduleTab();
      case 'performance':
        return _buildPerformanceTab();
      case 'wallet':
        return _buildWalletTab();
      case 'help':
        return _buildHelpTab();
      default:
        return const SizedBox();
    }
  }

  Widget _buildOverviewTab() {
    // Site visits overview - simplified list
    if (_coordinatorVisits.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            'No site visits found',
            style: GoogleFonts.poppins(color: AppColors.textLight),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Site Visits Overview',
          style: GoogleFonts.poppins(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),
        ..._coordinatorVisits
            .take(10)
            .map((visit) => _buildVisitListItem(visit)),
      ],
    );
  }

  Widget _buildUpcomingTab() {
    final upcoming =
        _coordinatorVisits
            .where(
              (v) => v.dueDate != null && v.dueDate!.isAfter(DateTime.now()),
            )
            .toList()
          ..sort((a, b) => a.dueDate!.compareTo(b.dueDate!));

    if (upcoming.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            'No upcoming visits',
            style: GoogleFonts.poppins(color: AppColors.textLight),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Upcoming Site Visits (${upcoming.length})',
          style: GoogleFonts.poppins(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),
        ...upcoming.take(20).map((visit) => _buildVisitListItem(visit)),
      ],
    );
  }

  Widget _buildCalendarTab() {
    // Simplified calendar view - just show upcoming visits by date
    final upcoming =
        _coordinatorVisits
            .where(
              (v) => v.dueDate != null && v.dueDate!.isAfter(DateTime.now()),
            )
            .toList()
          ..sort((a, b) => a.dueDate!.compareTo(b.dueDate!));

    final groupedByDate = <DateTime, List<SiteVisit>>{};
    for (final visit in upcoming) {
      if (visit.dueDate != null) {
        final date = DateTime(
          visit.dueDate!.year,
          visit.dueDate!.month,
          visit.dueDate!.day,
        );
        groupedByDate.putIfAbsent(date, () => []).add(visit);
      }
    }

    if (groupedByDate.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            'No scheduled visits',
            style: GoogleFonts.poppins(color: AppColors.textLight),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Calendar View',
          style: GoogleFonts.poppins(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),
        ...groupedByDate.entries.map((entry) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                DateFormat('MMM dd, yyyy').format(entry.key),
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.primaryBlue,
                ),
              ),
              const SizedBox(height: 8),
              ...entry.value.map((visit) => _buildVisitListItem(visit)),
              const SizedBox(height: 16),
            ],
          );
        }),
      ],
    );
  }

  Widget _buildCostsTab() {
    // Simplified cost summary
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Cost Summary',
          style: GoogleFonts.poppins(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.backgroundGray,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            children: [
              _buildCostRow(
                'Total Operations',
                _totalOperations.toString(),
                Icons.assessment,
              ),
              const Divider(),
              _buildCostRow(
                'Completed',
                _completedVisits.toString(),
                Icons.check_circle,
              ),
              const Divider(),
              _buildCostRow('Active', _activeOperations.toString(), Icons.work),
              const Divider(),
              _buildCostRow('Pending', _pendingQueue.toString(), Icons.pending),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildCostRow(String label, String value, IconData icon) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.primaryBlue),
          const SizedBox(width: 12),
          Expanded(
            child: Text(label, style: GoogleFonts.poppins(fontSize: 14)),
          ),
          Text(
            value,
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMyVisitsTab() {
    final overdue = _dataCollectorVisits.where((v) {
      if (v.dueDate == null) return false;
      final today = DateTime.now();
      final todayStart = DateTime(today.year, today.month, today.day);
      return v.dueDate!.isBefore(todayStart) &&
          v.status.toLowerCase() != 'completed' &&
          v.status.toLowerCase() != 'complete';
    }).toList();

    final today = DateTime.now();
    final todaysVisits = _dataCollectorVisits.where((v) {
      if (v.dueDate == null) return false;
      return v.dueDate!.year == today.year &&
          v.dueDate!.month == today.month &&
          v.dueDate!.day == today.day;
    }).toList();

    final upcoming =
        _dataCollectorVisits
            .where(
              (v) => v.dueDate != null && v.dueDate!.isAfter(DateTime.now()),
            )
            .toList()
          ..sort((a, b) => a.dueDate!.compareTo(b.dueDate!));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (overdue.isNotEmpty) ...[
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.red.shade50,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.red.shade200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.warning, color: Colors.red.shade700),
                    const SizedBox(width: 8),
                    Text(
                      'Overdue Visits (${overdue.length})',
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: Colors.red.shade900,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                ...overdue
                    .take(5)
                    .map(
                      (visit) => _buildVisitListItem(visit, isOverdue: true),
                    ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],
        if (todaysVisits.isNotEmpty) ...[
          Text(
            "Today's Visits (${todaysVisits.length})",
            style: GoogleFonts.poppins(
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 12),
          ...todaysVisits.map((visit) => _buildVisitListItem(visit)),
          const SizedBox(height: 16),
        ],
        if (upcoming.isNotEmpty) ...[
          Text(
            'Upcoming Visits (${upcoming.length})',
            style: GoogleFonts.poppins(
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 12),
          ...upcoming.take(10).map((visit) => _buildVisitListItem(visit)),
        ],
        if (overdue.isEmpty && todaysVisits.isEmpty && upcoming.isEmpty)
          Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                children: [
                  Icon(
                    Icons.location_off,
                    size: 48,
                    color: AppColors.textLight,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'No visits assigned at the moment.',
                    style: GoogleFonts.poppins(color: AppColors.textLight),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Check back later for new assignments.',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: AppColors.textLight,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildScheduleTab() {
    // Simplified schedule - same as calendar for coordinators
    return _buildCalendarTab();
  }

  Widget _buildPerformanceTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Performance Stats',
          style: GoogleFonts.poppins(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.backgroundGray),
          ),
          child: Column(
            children: [
              _buildStatRow(
                'Completion Rate',
                '${_completionRateDC.toStringAsFixed(1)}%',
                Icons.trending_up,
              ),
              const Divider(),
              _buildStatRow(
                'Completed',
                _completed.toString(),
                Icons.check_circle,
              ),
              const Divider(),
              _buildStatRow(
                'Total Assigned',
                _assigned.toString(),
                Icons.assignment,
              ),
              if (_averageVisitTime != null) ...[
                const Divider(),
                _buildStatRow(
                  'Avg Visit Time',
                  '$_averageVisitTime min',
                  Icons.access_time,
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildStatRow(String label, String value, IconData icon) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.primaryBlue),
          const SizedBox(width: 12),
          Expanded(
            child: Text(label, style: GoogleFonts.poppins(fontSize: 14)),
          ),
          Text(
            value,
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildWalletTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Wallet Summary',
          style: GoogleFonts.poppins(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF3B82F6), Color(0xFF1D4ED8)],
            ),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Total Earned',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  color: Colors.white.withOpacity(0.9),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                _walletService.formatCurrency(_earnings),
                style: GoogleFonts.poppins(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildHelpTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Quick Guide',
          style: GoogleFonts.poppins(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),
        _buildHelpCard('Starting a Visit', [
          '1. Find your assigned visit',
          '2. Click "Start" button',
          '3. Enable location permissions',
          '4. Complete the visit report',
        ], Icons.play_arrow),
        const SizedBox(height: 12),
        _buildHelpCard('Completing a Visit', [
          '1. Fill in all required fields',
          '2. Add photos if needed',
          '3. Submit the report',
          '4. Wait for verification',
        ], Icons.check_circle),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.backgroundGray,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.phone, color: AppColors.primaryBlue),
                  const SizedBox(width: 8),
                  Text(
                    'Need Help?',
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Contact your coordinator or supervisor for assistance with:',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: AppColors.textLight,
                ),
              ),
              const SizedBox(height: 8),
              ...[
                'Visit assignments',
                'Technical issues',
                'Payment questions',
                'Report problems',
              ].map(
                (item) => Padding(
                  padding: const EdgeInsets.only(left: 16, top: 4),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.circle,
                        size: 6,
                        color: AppColors.textLight,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        item,
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          color: AppColors.textLight,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildHelpCard(String title, List<String> steps, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.backgroundGray,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 20, color: AppColors.primaryBlue),
              const SizedBox(width: 8),
              Text(
                title,
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ...steps.map(
            (step) => Padding(
              padding: const EdgeInsets.only(left: 8, top: 4),
              child: Text(
                step,
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: AppColors.textLight,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVisitListItem(SiteVisit visit, {bool isOverdue = false}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isOverdue ? Colors.red.shade50 : Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isOverdue ? Colors.red.shade200 : AppColors.backgroundGray,
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  visit.siteName ?? 'Unknown Site',
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${visit.locality ?? ''}, ${visit.state ?? ''}',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: AppColors.textLight,
                  ),
                ),
                if (visit.dueDate != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    DateFormat('MMM dd, yyyy').format(visit.dueDate!),
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
              color: _getStatusColor(visit.status).withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              visit.status.toUpperCase(),
              style: GoogleFonts.poppins(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: _getStatusColor(visit.status),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Color _getStatusColor(String status) {
    final s = status.toLowerCase();
    if (s == 'completed' || s == 'complete') return Colors.green;
    if (s == 'in progress' || s == 'in_progress' || s == 'ongoing') {
      return Colors.blue;
    }
    if (s == 'pending' || s == 'assigned') return Colors.orange;
    return AppColors.textLight;
  }
}
