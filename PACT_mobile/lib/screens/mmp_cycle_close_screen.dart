// lib/screens/mmp_cycle_close_screen.dart
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/reusable_app_bar.dart';

class MmpCycleCloseScreen extends StatefulWidget {
  const MmpCycleCloseScreen({super.key});

  @override
  State<MmpCycleCloseScreen> createState() => _MmpCycleCloseScreenState();
}

class _MmpCycleCloseScreenState extends State<MmpCycleCloseScreen> {
  final _supabase = Supabase.instance.client;
  List<Map<String, dynamic>> _mmps = [];
  bool _loading = true;
  String? _currentUserId;
  String? _currentRole;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final user = _supabase.auth.currentUser;
    if (user == null) return;
    _currentUserId = user.id;
    try {
      final profile = await _supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
      _currentRole = profile?['role'] as String?;
    } catch (_) {}
    await _loadMMPs();
  }

  Future<void> _loadMMPs() async {
    if (!mounted) return;
    setState(() => _loading = true);
    try {
      final data = await _supabase
          .from('mmp_files')
          .select(
            'id, name, month, year, region, cycle_status, cycle_closed_at, cycle_close_deadline',
          )
          .inFilter('cycle_status', ['active', 'closing', 'pending_approval'])
          .order('created_at', ascending: false)
          .limit(50);
      if (mounted) {
        setState(() {
          _mmps = List<Map<String, dynamic>>.from(data);
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool get _canApprove =>
      _currentRole == 'fom' ||
      _currentRole == 'admin' ||
      _currentRole == 'super_admin';

  Color _statusColor(String? status) {
    switch (status) {
      case 'closing':
        return const Color(0xFFD97706);
      case 'pending_approval':
        return const Color(0xFF7C3AED);
      case 'closed':
        return const Color(0xFF16A34A);
      default:
        return const Color(0xFF3B82F6);
    }
  }

  String _statusLabel(String? status) {
    switch (status) {
      case 'active':
        return 'Active';
      case 'closing':
        return 'Closing';
      case 'pending_approval':
        return 'Pending Approval';
      case 'closed':
        return 'Closed';
      default:
        return status ?? 'Unknown';
    }
  }

  Future<void> _initiateClose(String mmpId) async {
    final confirm = await _showConfirmDialog(
      'Initiate Cycle Close?',
      'This will set the cycle status to "Closing" and start the close process. A 5-day deadline will be set.',
    );
    if (confirm != true) return;
    try {
      final deadline = DateTime.now()
          .add(const Duration(days: 5))
          .toUtc()
          .toIso8601String();
      await _supabase
          .from('mmp_files')
          .update({'cycle_status': 'closing', 'cycle_close_deadline': deadline})
          .eq('id', mmpId);
      _showSnack('Cycle close initiated.');
      _loadMMPs();
    } catch (e) {
      _showSnack('Error: $e', isError: true);
    }
  }

  Future<void> _submitForApproval(String mmpId) async {
    final confirm = await _showConfirmDialog(
      'Submit for Approval?',
      'This will submit the cycle for FOM/Director approval.',
    );
    if (confirm != true) return;
    try {
      await _supabase
          .from('mmp_files')
          .update({'cycle_status': 'pending_approval'})
          .eq('id', mmpId);
      _showSnack('Submitted for approval.');
      _loadMMPs();
    } catch (e) {
      _showSnack('Error: $e', isError: true);
    }
  }

  Future<void> _approve(String mmpId) async {
    final noteCtrl = TextEditingController();
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(
          'Approve Cycle Close',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Approving this will mark the MMP cycle as closed.',
              style: GoogleFonts.poppins(fontSize: 13),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: noteCtrl,
              maxLines: 3,
              decoration: InputDecoration(
                labelText: 'Approval Note (optional)',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                contentPadding: const EdgeInsets.all(10),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF16A34A),
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Approve'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await _supabase
          .from('mmp_files')
          .update({
            'cycle_status': 'closed',
            'cycle_closed_at': DateTime.now().toUtc().toIso8601String(),
            'cycle_closed_by': _currentUserId,
            'cycle_approval_note': noteCtrl.text.trim().isNotEmpty
                ? noteCtrl.text.trim()
                : null,
          })
          .eq('id', mmpId);
      _showSnack('Cycle approved and closed.');
      _loadMMPs();
    } catch (e) {
      _showSnack('Error: $e', isError: true);
    }
  }

  Future<void> _reject(String mmpId) async {
    final noteCtrl = TextEditingController();
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(
          'Reject & Reopen',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'This will revert the MMP back to "Closing" status.',
              style: GoogleFonts.poppins(fontSize: 13),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: noteCtrl,
              maxLines: 3,
              decoration: InputDecoration(
                labelText: 'Rejection Reason *',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                contentPadding: const EdgeInsets.all(10),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red.shade700,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Reject'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await _supabase
          .from('mmp_files')
          .update({'cycle_status': 'closing'})
          .eq('id', mmpId);
      _showSnack('Cycle close rejected. MMP returned to Closing.');
      _loadMMPs();
    } catch (e) {
      _showSnack('Error: $e', isError: true);
    }
  }

  Future<bool?> _showConfirmDialog(String title, String body) {
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(
          title,
          style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
        ),
        content: Text(body, style: GoogleFonts.poppins(fontSize: 13)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0F2041),
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
  }

  void _showSnack(String msg, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: isError ? Colors.red.shade700 : Colors.green.shade700,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: 'MMP Cycle Close',
              showBackButton: true,
              actions: [
                IconButton(onPressed: _loadMMPs, icon: const Icon(Icons.refresh)),
              ],
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _mmps.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.check_circle_outline,
                            size: 60,
                            color: Colors.grey[300],
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'No MMPs pending cycle close',
                            style: GoogleFonts.poppins(color: Colors.grey[500]),
                          ),
                        ],
                      ),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: _mmps.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                      itemBuilder: (_, i) => _buildMmpCard(_mmps[i]),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMmpCard(Map<String, dynamic> mmp) {
    final status = mmp['cycle_status'] as String? ?? 'active';
    final statusColor = _statusColor(status);
    final name = mmp['name'] as String? ?? 'Unnamed MMP';
    final month = mmp['month'] as int?;
    final year = mmp['year'] as int?;
    final period = (month != null && year != null) ? '$month/$year' : '';
    final deadline = mmp['cycle_close_deadline'] != null
        ? DateTime.tryParse(mmp['cycle_close_deadline'] as String)
        : null;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border(left: BorderSide(color: statusColor, width: 5)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    name,
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    _statusLabel(status),
                    style: GoogleFonts.poppins(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: statusColor,
                    ),
                  ),
                ),
              ],
            ),
            if (period.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                'Period: $period',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: Colors.grey[600],
                ),
              ),
            ],
            if (deadline != null) ...[
              const SizedBox(height: 2),
              Row(
                children: [
                  Icon(
                    deadline.isBefore(DateTime.now())
                        ? Icons.warning_amber
                        : Icons.schedule,
                    size: 13,
                    color: deadline.isBefore(DateTime.now())
                        ? Colors.red
                        : Colors.grey[500],
                  ),
                  const SizedBox(width: 4),
                  Text(
                    'Deadline: ${deadline.toLocal().toString().substring(0, 10)}',
                    style: GoogleFonts.poppins(
                      fontSize: 11,
                      color: deadline.isBefore(DateTime.now())
                          ? Colors.red
                          : Colors.grey[600],
                      fontWeight: deadline.isBefore(DateTime.now())
                          ? FontWeight.w700
                          : FontWeight.normal,
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 12),
            _buildActionButtons(mmp, status),
          ],
        ),
      ),
    );
  }

  Widget _buildActionButtons(Map<String, dynamic> mmp, String status) {
    final id = mmp['id'] as String;
    return Wrap(
      spacing: 8,
      runSpacing: 6,
      children: [
        if (status == 'active')
          _actionBtn(
            'Initiate Close',
            Icons.lock_clock,
            const Color(0xFFD97706),
            () => _initiateClose(id),
          ),
        if (status == 'closing')
          _actionBtn(
            'Submit for Approval',
            Icons.send,
            const Color(0xFF7C3AED),
            () => _submitForApproval(id),
          ),
        if (status == 'pending_approval' && _canApprove) ...[
          _actionBtn(
            'Approve',
            Icons.check_circle,
            const Color(0xFF16A34A),
            () => _approve(id),
          ),
          _actionBtn(
            'Reject',
            Icons.cancel,
            Colors.red.shade700,
            () => _reject(id),
          ),
        ],
        if (status == 'pending_approval' && !_canApprove)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.grey[100],
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              'Awaiting FOM/Admin Approval',
              style: GoogleFonts.poppins(fontSize: 11, color: Colors.grey[600]),
            ),
          ),
      ],
    );
  }

  Widget _actionBtn(
    String label,
    IconData icon,
    Color color,
    VoidCallback onTap,
  ) {
    return ElevatedButton.icon(
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        elevation: 0,
      ),
      onPressed: onTap,
      icon: Icon(icon, size: 15),
      label: Text(
        label,
        style: GoogleFonts.poppins(fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }
}
