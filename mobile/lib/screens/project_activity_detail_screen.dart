import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/shimmer_loading.dart';
import '../widgets/reusable_app_bar.dart';

class ProjectActivityDetailScreen extends StatefulWidget {
  final String activityId;
  final String activityTitle;
  const ProjectActivityDetailScreen({
    super.key,
    required this.activityId,
    required this.activityTitle,
  });
  @override
  State<ProjectActivityDetailScreen> createState() =>
      _ProjectActivityDetailScreenState();
}

class _ProjectActivityDetailScreenState
    extends State<ProjectActivityDetailScreen> {
  final _supabase = Supabase.instance.client;
  bool _isLoading = true;
  Map<String, dynamic>? _activity;
  Map<String, dynamic>? _myAssignment;
  List<Map<String, dynamic>> _allAssignments = [];
  bool _isUpdating = false;
  final _notesCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _isLoading = true);
    try {
      final user = _supabase.auth.currentUser;
      if (user == null) return;

      final results = await Future.wait([
        _supabase
            .from('project_activities')
            .select('*, project:projects(id, name)')
            .eq('id', widget.activityId)
            .single(),
        _supabase
            .from('project_activity_assignments')
            .select('*, profile:profiles(full_name, role)')
            .eq('activity_id', widget.activityId),
      ]);

      final activity = results[0] as Map<String, dynamic>;
      final assignments = List<Map<String, dynamic>>.from(results[1] as List);
      final myAssignment = assignments.where((a) => a['user_id'] == user.id).toList();

      if (!mounted) return;
      setState(() {
        _activity = activity;
        _allAssignments = assignments;
        _myAssignment = myAssignment.isNotEmpty ? myAssignment.first : null;
        if (_myAssignment != null) {
          _notesCtrl.text = _myAssignment!['notes'] ?? '';
        }
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoading = false);
    }
  }

  Future<void> _updateStatus(String newStatus) async {
    if (_myAssignment == null) return;
    setState(() => _isUpdating = true);
    try {
      final updateData = <String, dynamic>{
        'status': newStatus,
        'notes': _notesCtrl.text.trim().isNotEmpty
            ? _notesCtrl.text.trim()
            : _myAssignment!['notes'],
      };
      if (newStatus == 'in_progress') {
        updateData['started_at'] = DateTime.now().toIso8601String();
      } else if (newStatus == 'completed') {
        updateData['completed_at'] = DateTime.now().toIso8601String();
      }
      await _supabase
          .from('project_activity_assignments')
          .update(updateData)
          .eq('id', _myAssignment!['id']);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Status updated to ${newStatus.replaceAll('_', ' ')}'),
          backgroundColor: Colors.green,
        ),
      );
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Update failed: $e'), backgroundColor: Colors.red),
      );
    } finally {
      if (mounted) setState(() => _isUpdating = false);
    }
  }

  Color _statusColor(String? s) {
    switch (s) {
      case 'completed':
        return Colors.green;
      case 'in_progress':
        return const Color(0xFF1D6FA4);
      case 'assigned':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  bool get _isOverdue {
    final end = _activity?['end_date'] as String?;
    if (end == null) return false;
    final d = DateTime.tryParse(end);
    return d != null && d.isBefore(DateTime.now());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: widget.activityTitle,
              showBackButton: true,
              actions: [
                IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
              ],
            ),
            Expanded(
              child: _isLoading
                  ? const ShimmerBody(layout: ShimmerLayout.profile)
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.all(16),
                        children: [
                          // ── Activity Overview Card ──────────────
                          Card(
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                              side: BorderSide(
                                color: _isOverdue
                                    ? Colors.red.shade200
                                    : Colors.grey.shade200,
                              ),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          _activity?['title'] ?? '',
                                          style: const TextStyle(
                                            fontSize: 18,
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                      ),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 10, vertical: 4),
                                        decoration: BoxDecoration(
                                          color: _statusColor(_activity?['status']).withOpacity(0.12),
                                          borderRadius: BorderRadius.circular(12),
                                        ),
                                        child: Text(
                                          (_activity?['status'] ?? '').toString().replaceAll('_', ' ').toUpperCase(),
                                          style: TextStyle(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w700,
                                            color: _statusColor(_activity?['status']),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  if (_activity?['project'] != null) ...[
                                    const SizedBox(height: 4),
                                    Text(
                                      (_activity!['project'] as Map<String, dynamic>)['name'] ?? '',
                                      style: const TextStyle(
                                        color: Color(0xFF1D6FA4),
                                        fontWeight: FontWeight.w500,
                                        fontSize: 13,
                                      ),
                                    ),
                                  ],
                                  if (_isOverdue) ...[
                                    const SizedBox(height: 6),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: Colors.red.shade50,
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: const Text(
                                        '⚠ OVERDUE',
                                        style: TextStyle(color: Colors.red, fontSize: 11, fontWeight: FontWeight.w700),
                                      ),
                                    ),
                                  ],
                                  const Divider(height: 20),
                                  _infoRow(Icons.category_outlined, 'Type',
                                      _activity?['activity_type'] ?? 'N/A'),
                                  _infoRow(Icons.location_on_outlined, 'Hub',
                                      _activity?['location_hub'] ?? 'N/A'),
                                  _infoRow(Icons.map_outlined, 'State',
                                      _activity?['location_state'] ?? 'N/A'),
                                  _infoRow(Icons.calendar_today, 'Start',
                                      _activity?['start_date'] ?? 'N/A'),
                                  _infoRow(Icons.event, 'End',
                                      _activity?['end_date'] ?? 'N/A'),
                                  if (_activity?['description'] != null) ...[
                                    const SizedBox(height: 10),
                                    Text(
                                      _activity!['description'],
                                      style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),

                          // ── My Assignment Card ──────────────────
                          if (_myAssignment != null) ...[
                            const Text('My Assignment',
                                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                            const SizedBox(height: 8),
                            Card(
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                                side: BorderSide(
                                  color: _statusColor(_myAssignment?['status']).withOpacity(0.4),
                                ),
                              ),
                              child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Icon(Icons.person_outline,
                                            color: _statusColor(_myAssignment?['status']), size: 20),
                                        const SizedBox(width: 8),
                                        Text(
                                          'Status: ${(_myAssignment?['status'] ?? '').toString().replaceAll('_', ' ')}',
                                          style: TextStyle(
                                            fontWeight: FontWeight.w600,
                                            color: _statusColor(_myAssignment?['status']),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 12),
                                    TextField(
                                      controller: _notesCtrl,
                                      maxLines: 3,
                                      decoration: InputDecoration(
                                        labelText: 'Progress Notes',
                                        hintText: 'Add notes about your progress...',
                                        border: OutlineInputBorder(
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                        contentPadding: const EdgeInsets.all(12),
                                      ),
                                    ),
                                    const SizedBox(height: 12),
                                    if (_isUpdating)
                                      const Center(child: CircularProgressIndicator(strokeWidth: 2))
                                    else if (_myAssignment?['status'] == 'assigned')
                                      SizedBox(
                                        width: double.infinity,
                                        child: ElevatedButton.icon(
                                          onPressed: () => _updateStatus('in_progress'),
                                          icon: const Icon(Icons.play_arrow, size: 18),
                                          label: const Text('Start Activity'),
                                          style: ElevatedButton.styleFrom(
                                            backgroundColor: const Color(0xFF1D6FA4),
                                            foregroundColor: Colors.white,
                                            padding: const EdgeInsets.symmetric(vertical: 12),
                                          ),
                                        ),
                                      )
                                    else if (_myAssignment?['status'] == 'in_progress')
                                      Column(
                                        children: [
                                          SizedBox(
                                            width: double.infinity,
                                            child: ElevatedButton.icon(
                                              onPressed: () => _updateStatus('completed'),
                                              icon: const Icon(Icons.check_circle, size: 18),
                                              label: const Text('Mark as Completed'),
                                              style: ElevatedButton.styleFrom(
                                                backgroundColor: Colors.green,
                                                foregroundColor: Colors.white,
                                                padding: const EdgeInsets.symmetric(vertical: 12),
                                              ),
                                            ),
                                          ),
                                          const SizedBox(height: 8),
                                          SizedBox(
                                            width: double.infinity,
                                            child: OutlinedButton(
                                              onPressed: () => _updateStatus('in_progress'),
                                              child: const Text('Save Notes'),
                                            ),
                                          ),
                                        ],
                                      )
                                    else if (_myAssignment?['status'] == 'completed')
                                      const Row(
                                        children: [
                                          Icon(Icons.check_circle, color: Colors.green),
                                          SizedBox(width: 8),
                                          Text('Completed ✓',
                                              style: TextStyle(color: Colors.green, fontWeight: FontWeight.w600)),
                                        ],
                                      ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(height: 16),
                          ],

                          // ── Team Section ────────────────────────
                          if (_allAssignments.isNotEmpty) ...[
                            Text('Team (${_allAssignments.length} members)',
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                            const SizedBox(height: 8),
                            ..._allAssignments.map((a) {
                              final profile = a['profile'] as Map<String, dynamic>?;
                              return Card(
                                margin: const EdgeInsets.only(bottom: 8),
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(8)),
                                child: ListTile(
                                  leading: CircleAvatar(
                                    backgroundColor:
                                        _statusColor(a['status']).withOpacity(0.15),
                                    child: Text(
                                      (profile?['full_name'] ?? '?').toString().isNotEmpty
                                          ? (profile?['full_name'] as String).substring(0, 1).toUpperCase()
                                          : '?',
                                      style: TextStyle(
                                        color: _statusColor(a['status']),
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ),
                                  title: Text(profile?['full_name'] ?? 'Unknown',
                                      style: const TextStyle(fontWeight: FontWeight.w600)),
                                  subtitle: Text(profile?['role'] ?? '',
                                      style: const TextStyle(fontSize: 12)),
                                  trailing: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(
                                      color: _statusColor(a['status']).withOpacity(0.12),
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: Text(
                                      (a['status'] ?? '').toString().replaceAll('_', ' '),
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: _statusColor(a['status']),
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                ),
                              );
                            }),
                          ],
                        ],
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _infoRow(IconData icon, String label, String value) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Row(
      children: [
        Icon(icon, size: 15, color: Colors.grey),
        const SizedBox(width: 8),
        Text('$label: ', style: const TextStyle(color: Colors.grey, fontSize: 13)),
        Expanded(
          child: Text(value,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
        ),
      ],
    ),
  );
}
