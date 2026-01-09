import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../widgets/reusable_app_bar.dart';
import '../widgets/dashboard_card.dart';
import '../widgets/custom_drawer_menu.dart';
import '../services/wallet_service.dart';
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
  bool _isCoordinator = false;
  String? _userId;
  String? _userState;
  String? _userHub;
  
  // Coordinator metrics
  int _totalOperations = 0;
  int _completedVisits = 0;
  int _activeOperations = 0;
  int _pendingQueue = 0;
  double _completionRate = 0.0;
  
  // Data Collector metrics
  int _assigned = 0;
  int _today = 0;
  int _inProgress = 0;
  int _completed = 0;
  int _overdue = 0;
  double _earnings = 0.0;

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

      // Get user profile to determine role
      final profileResponse = await Supabase.instance.client
          .from('profiles')
          .select('role, state_id, hub_id')
          .eq('id', user.id)
          .maybeSingle();

      if (profileResponse != null) {
        final role = (profileResponse['role'] as String?)?.toLowerCase() ?? '';
        _isCoordinator = role == 'coordinator' || 
                        role == 'field_coordinator' ||
                        role == 'state_coordinator';
        
        _userState = profileResponse['state_id'] as String?;
        _userHub = profileResponse['hub_id'] as String?;
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
      debugPrint('Error initializing dashboard: $e');
      setState(() => _isLoading = false);
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

  Future<void> _loadCoordinatorDashboard() async {
    try {
      if (_userId == null) return;

      // Fetch site entries forwarded to this coordinator
      // Mobile app is only for coordinators, so we just filter by forwarded_to_user_id
      final response = await Supabase.instance.client
          .from('mmp_site_entries')
          .select('*')
          .eq('forwarded_to_user_id', _userId!)
          .order('created_at', ascending: false)
          .limit(1000);

      if (response == null) return;

      // Convert to SiteVisit objects
      final siteVisits = (response as List)
          .map((json) => SiteVisit.fromJson(json as Map<String, dynamic>))
          .toList();

      // Calculate metrics (matching React implementation)
      _totalOperations = siteVisits.length;
      
      _completedVisits = siteVisits
          .where((v) {
            final status = v.status.toLowerCase();
            return status == 'completed' || status == 'complete';
          })
          .length;

      _activeOperations = siteVisits
          .where((v) {
            final status = v.status.toLowerCase();
            return status == 'assigned' || 
                   status == 'ongoing' ||
                   status == 'in progress' ||
                   status == 'in_progress' ||
                   status == 'accepted';
          })
          .length;

      _pendingQueue = siteVisits
          .where((v) {
            final status = v.status.toLowerCase();
            return status == 'pending' || 
                   status == 'dispatched' ||
                   status == 'permitverified' ||
                   status == 'permit_verified';
          })
          .length;

      // Calculate completion rate
      if (_totalOperations > 0) {
        _completionRate = (_completedVisits / _totalOperations) * 100;
      } else {
        _completionRate = 0.0;
      }

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
          .select('*')
          .eq('accepted_by', _userId!)
          .order('created_at', ascending: false)
          .limit(1000);

      // Query 2: Get entries where additional_data->>'assigned_to' matches
      // Note: Supabase Flutter doesn't support direct JSONB queries easily, so we fetch all and filter
      final allEntriesResponse = await Supabase.instance.client
          .from('mmp_site_entries')
          .select('*')
          .order('created_at', ascending: false)
          .limit(1000);

      // Combine and deduplicate results using a Map with id as key
      final allEntriesMap = <String, Map<String, dynamic>>{};
      
      // Add entries from accepted_by query
      if (acceptedByResponse != null) {
        for (final entry in acceptedByResponse as List) {
          final entryMap = entry as Map<String, dynamic>;
          final entryId = entryMap['id'] as String?;
          if (entryId != null) {
            allEntriesMap[entryId] = entryMap;
          }
        }
      }
      
      // Add entries from additional_data->>'assigned_to' filter
      if (allEntriesResponse != null) {
        for (final entry in allEntriesResponse as List) {
          final entryMap = entry as Map<String, dynamic>;
          final additionalData = entryMap['additional_data'] as Map<String, dynamic>?;
          final assignedTo = additionalData?['assigned_to'] as String?;
          
          if (assignedTo == _userId) {
            final entryId = entryMap['id'] as String?;
            if (entryId != null) {
              allEntriesMap[entryId] = entryMap;
            }
          }
        }
      }

      // Convert to SiteVisit objects
      final allVisits = allEntriesMap.values
          .map((json) => SiteVisit.fromJson(json))
          .toList();

      // Calculate metrics
      _assigned = allVisits.length;

      // Filter by status
      final acceptedVisits = allVisits
          .where((v) {
            final status = v.status.toLowerCase();
            return status == 'assigned' || 
                   status == 'accepted' ||
                   status == 'permitverified' ||
                   status == 'permit_verified';
          })
          .toList();

      _inProgress = allVisits
          .where((v) {
            final status = v.status.toLowerCase();
            return status == 'inprogress' ||
                   status == 'in_progress' ||
                   status == 'ongoing';
          })
          .length;

      _completed = allVisits
          .where((v) {
            final status = v.status.toLowerCase();
            return status == 'completed' || status == 'complete';
          })
          .length;

      // Calculate today's visits
      final today = DateTime.now();
      _today = acceptedVisits
          .where((v) {
            if (v.dueDate == null) return false;
            final visitDate = v.dueDate!;
            return visitDate.year == today.year &&
                   visitDate.month == today.month &&
                   visitDate.day == today.day;
          })
          .length;

      // Calculate overdue visits
      _overdue = acceptedVisits
          .where((v) {
            if (v.dueDate == null) return false;
            final visitDate = v.dueDate!;
            final todayStart = DateTime(today.year, today.month, today.day);
            return visitDate.isBefore(todayStart) && 
                   v.status.toLowerCase() != 'completed' &&
                   v.status.toLowerCase() != 'complete';
          })
          .length;

      // Get earnings from wallet
      try {
        final walletStats = await _walletService.fetchWalletStats();
        _earnings = walletStats.totalEarned;
      } catch (e) {
        debugPrint('Error fetching wallet stats: $e');
        _earnings = 0.0;
      }

      if (mounted) {
        setState(() {});
      }
    } catch (e) {
      debugPrint('Error loading data collector dashboard: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
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
                                  color: AppColors.accentGreen.withOpacity(0.1),
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
                          ],
                        ),
                      ),
                    ),
            ),
          ],
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
                subtitle: '${_completionRate.toStringAsFixed(1)}% completion rate',
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
}

