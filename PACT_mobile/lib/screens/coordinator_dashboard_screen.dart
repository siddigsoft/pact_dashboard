import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';
import '../services/auth_service.dart';
import '../widgets/shimmer_loading.dart';
import '../widgets/reusable_app_bar.dart';

class CoordinatorDashboardScreen extends StatefulWidget {
  const CoordinatorDashboardScreen({super.key});
  @override
  State<CoordinatorDashboardScreen> createState() =>
      _CoordinatorDashboardScreenState();
}

class _CoordinatorDashboardScreenState
    extends State<CoordinatorDashboardScreen> {
  final _supabase = Supabase.instance.client;
  final _authService = AuthService();
  bool _isLoading = true;
  Map<String, dynamic> _stats = {};
  List<Map<String, dynamic>> _pendingVerifications = [];
  List<Map<String, dynamic>> _recentVisits = [];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final user = _supabase.auth.currentUser;
      if (user == null) {
        if (!mounted) return;
        setState(() => _isLoading = false);
        return;
      }

      final results = await Future.wait([
        _supabase
            .from('site_visits')
            .select('id, status')
            .eq('assigned_coordinator', user.id),
        _supabase
            .from('mmp_site_entries')
            .select('id, verification_status')
            .eq('coordinator_id', user.id),
      ]);

      final visits = List<Map<String, dynamic>>.from(results[0]);
      final siteEntries = List<Map<String, dynamic>>.from(results[1]);

      if (!mounted) return;
      setState(() {
        _stats = {
          'total_visits': visits.length,
          'completed_visits': visits
              .where((v) => v['status'] == 'completed')
              .length,
          'pending_sites': siteEntries
              .where((s) => s['verification_status'] == 'pending')
              .length,
          'verified_sites': siteEntries
              .where((s) => s['verification_status'] == 'verified')
              .length,
        };
        _recentVisits = visits.take(5).toList();
        _pendingVerifications = siteEntries
            .where((s) => s['verification_status'] == 'pending')
            .take(10)
            .toList();
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: 'Coordinator Dashboard',
              showBackButton: true,
              actions: [
                IconButton(
                  icon: const Icon(Icons.refresh),
                  onPressed: _loadData,
                ),
              ],
            ),
            Expanded(
              child: _isLoading
                  ? const ShimmerBody(layout: ShimmerLayout.statGrid)
                  : RefreshIndicator(
              onRefresh: _loadData,
              child: ListView(
                padding: const EdgeInsets.all(14),
                children: [
                  const Text(
                    'My Performance',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                  const SizedBox(height: 10),
                  GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                    childAspectRatio: 1.5,
                    children: [
                      _statTile(
                        'Total Visits',
                        '${_stats['total_visits'] ?? 0}',
                        Icons.map,
                        Colors.blue,
                      ),
                      _statTile(
                        'Completed',
                        '${_stats['completed_visits'] ?? 0}',
                        Icons.check_circle,
                        Colors.green,
                      ),
                      _statTile(
                        'Pending Sites',
                        '${_stats['pending_sites'] ?? 0}',
                        Icons.pending,
                        Colors.orange,
                      ),
                      _statTile(
                        'Verified Sites',
                        '${_stats['verified_sites'] ?? 0}',
                        Icons.verified,
                        Colors.teal,
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Pending Verifications',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      Text(
                        '${_pendingVerifications.length} pending',
                        style: const TextStyle(
                          color: Colors.orange,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  if (_pendingVerifications.isEmpty)
                    const Card(
                      child: Padding(
                        padding: EdgeInsets.all(20),
                        child: Center(
                          child: Text(
                            'No pending verifications.',
                            style: TextStyle(color: Colors.grey),
                          ),
                        ),
                      ),
                    )
                  else
                    ..._pendingVerifications.map(
                      (s) => Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: ListTile(
                          leading: const Icon(
                            Icons.location_on,
                            color: Colors.orange,
                          ),
                          title: Text(
                            s['site_name'] ??
                                s['id']?.toString().substring(0, 8) ??
                                'Site',
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          subtitle: Text(
                            s['locality'] ?? s['state'] ?? '',
                            style: const TextStyle(fontSize: 13),
                          ),
                          trailing: const Icon(Icons.chevron_right),
                        ),
                      ),
                    ),
                  const SizedBox(height: 18),
                  const Text(
                    'Recent Visits',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                  const SizedBox(height: 10),
                  if (_recentVisits.isEmpty)
                    const Card(
                      child: Padding(
                        padding: EdgeInsets.all(20),
                        child: Center(
                          child: Text(
                            'No recent visits.',
                            style: TextStyle(color: Colors.grey),
                          ),
                        ),
                      ),
                    )
                  else
                    ..._recentVisits.map(
                      (v) => Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: ListTile(
                          leading: const Icon(
                            Icons.directions_walk,
                            color: AppColors.primaryDark,
                          ),
                          title: Text(
                            v['site_name'] ??
                                'Visit ${v['id']?.toString().substring(0, 6)}',
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          trailing: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: _statusColor(
                                v['status'],
                              ).withOpacity(0.12),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              v['status'] ?? '',
                              style: TextStyle(
                                color: _statusColor(v['status']),
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
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
      ),
    );
  }

  Color _statusColor(String? s) {
    switch (s) {
      case 'completed':
        return Colors.green;
      case 'in_progress':
        return Colors.blue;
      case 'pending':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  Widget _statTile(String label, String value, IconData icon, Color color) =>
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Colors.grey.shade200),
          boxShadow: [
            BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 4),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 24),
            const Spacer(),
            Text(
              value,
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            Text(
              label,
              style: const TextStyle(fontSize: 12, color: Colors.grey),
            ),
          ],
        ),
      );
}
