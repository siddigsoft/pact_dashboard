// lib/screens/tracker_preparation_plan_screen.dart
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class TrackerPreparationPlanScreen extends StatefulWidget {
  const TrackerPreparationPlanScreen({super.key});

  @override
  State<TrackerPreparationPlanScreen> createState() => _TrackerPreparationPlanScreenState();
}

class _TrackerPreparationPlanScreenState extends State<TrackerPreparationPlanScreen> {
  final _supabase = Supabase.instance.client;
  List<Map<String, dynamic>> _plans = [];
  bool _loading = true;
  bool _creating = false;

  // Create form
  final _nameCtrl        = TextEditingController();
  final _descCtrl        = TextEditingController();
  final _targetSitesCtrl = TextEditingController();
  String? _selectedRegion;
  String? _selectedMonth;
  int     _selectedYear  = DateTime.now().year;

  final _months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  final _regions = ['Khartoum','Gezira','White Nile','Blue Nile','Kassala','Red Sea','Gedaref','Sennar','North Kordofan','South Kordofan','North Darfur','South Darfur','Central Darfur','East Darfur','West Darfur','River Nile','Northern','West Kordofan'];

  @override
  void initState() {
    super.initState();
    _loadPlans();
    _selectedMonth = _months[DateTime.now().month - 1];
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _descCtrl.dispose();
    _targetSitesCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadPlans() async {
    if (!mounted) return;
    setState(() => _loading = true);
    try {
      final data = await _supabase
          .from('tracker_plan_configs')
          .select('*')
          .order('created_at', ascending: false)
          .limit(50);
      if (mounted) setState(() { _plans = List<Map<String, dynamic>>.from(data); _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _createPlan() async {
    if (_nameCtrl.text.trim().isEmpty) {
      _showSnack('Plan name is required.', isError: true);
      return;
    }
    setState(() => _creating = true);
    try {
      final user = _supabase.auth.currentUser;
      await _supabase.from('tracker_plan_configs').insert({
        'name':           _nameCtrl.text.trim(),
        'description':    _descCtrl.text.trim().isNotEmpty ? _descCtrl.text.trim() : null,
        'region':         _selectedRegion,
        'month':          _selectedMonth,
        'year':           _selectedYear,
        'target_sites':   int.tryParse(_targetSitesCtrl.text.trim()) ?? 0,
        'status':         'draft',
        'created_by':     user?.id,
        'created_at':     DateTime.now().toUtc().toIso8601String(),
      });
      _nameCtrl.clear();
      _descCtrl.clear();
      _targetSitesCtrl.clear();
      setState(() { _selectedRegion = null; _creating = false; });
      _showSnack('Plan created successfully.');
      Navigator.pop(context);
      _loadPlans();
    } catch (e) {
      _showSnack('Error: $e', isError: true);
      if (mounted) setState(() => _creating = false);
    }
  }

  Future<void> _updateStatus(String id, String status) async {
    try {
      await _supabase.from('tracker_plan_configs').update({'status': status}).eq('id', id);
      _showSnack('Status updated to $status.');
      _loadPlans();
    } catch (e) {
      _showSnack('Error: $e', isError: true);
    }
  }

  Future<void> _deletePlan(String id) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Delete Plan?', style: GoogleFonts.poppins(fontWeight: FontWeight.w700)),
        content: Text('This action cannot be undone.', style: GoogleFonts.poppins(fontSize: 13)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white), onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await _supabase.from('tracker_plan_configs').delete().eq('id', id);
      _showSnack('Plan deleted.');
      _loadPlans();
    } catch (e) {
      _showSnack('Error: $e', isError: true);
    }
  }

  void _showSnack(String msg, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: isError ? Colors.red.shade700 : Colors.green.shade700,
      behavior: SnackBarBehavior.floating,
    ));
  }

  void _openCreateSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.85,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        builder: (_, controller) => Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              const SizedBox(height: 8),
              Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('New Tracker Plan', style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 17)),
                    IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
                  ],
                ),
              ),
              const Divider(),
              Expanded(
                child: ListView(
                  controller: controller,
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                  children: [
                    _formField(_nameCtrl, 'Plan Name *', 'e.g. Q1 2026 Khartoum Tracker'),
                    const SizedBox(height: 12),
                    _formField(_descCtrl, 'Description', 'Optional description...', maxLines: 3),
                    const SizedBox(height: 12),
                    _dropdown<String>('Region', _selectedRegion, _regions.map((r) => DropdownMenuItem(value: r, child: Text(r))).toList(), (v) => setState(() => _selectedRegion = v)),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(child: _dropdown<String>('Month', _selectedMonth, _months.map((m) => DropdownMenuItem(value: m, child: Text(m))).toList(), (v) => setState(() => _selectedMonth = v))),
                        const SizedBox(width: 12),
                        SizedBox(
                          width: 100,
                          child: _dropdown<int>('Year', _selectedYear, [2024,2025,2026,2027].map((y) => DropdownMenuItem(value: y, child: Text('$y'))).toList(), (v) => setState(() => _selectedYear = v!)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    _formField(_targetSitesCtrl, 'Target Sites', '0', keyboardType: TextInputType.number),
                    const SizedBox(height: 20),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF0F2041), foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                      onPressed: _creating ? null : _createPlan,
                      child: _creating
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : Text('Create Plan', style: GoogleFonts.poppins(fontWeight: FontWeight.w700)),
                    ),
                    const SizedBox(height: 30),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _formField(TextEditingController ctrl, String label, String hint, {int maxLines = 1, TextInputType? keyboardType}) {
    return TextField(
      controller: ctrl, maxLines: maxLines, keyboardType: keyboardType,
      style: GoogleFonts.poppins(fontSize: 13),
      decoration: InputDecoration(
        labelText: label, hintText: hint,
        labelStyle: GoogleFonts.poppins(fontSize: 12),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      ),
    );
  }

  Widget _dropdown<T>(String label, T? value, List<DropdownMenuItem<T>> items, ValueChanged<T?> onChanged) {
    return DropdownButtonFormField<T>(
      value: value, items: items, onChanged: onChanged,
      style: GoogleFonts.poppins(fontSize: 13, color: Colors.black87),
      decoration: InputDecoration(
        labelText: label, labelStyle: GoogleFonts.poppins(fontSize: 12),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F2041),
        foregroundColor: Colors.white,
        title: Text('Tracker Preparation Plans', style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 15)),
        actions: [IconButton(onPressed: _loadPlans, icon: const Icon(Icons.refresh))],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: const Color(0xFF0F2041),
        foregroundColor: Colors.white,
        onPressed: _openCreateSheet,
        icon: const Icon(Icons.add),
        label: Text('New Plan', style: GoogleFonts.poppins(fontWeight: FontWeight.w600)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _plans.isEmpty
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.list_alt, size: 56, color: Colors.grey[300]),
                  const SizedBox(height: 12),
                  Text('No plans yet', style: GoogleFonts.poppins(color: Colors.grey[500])),
                  const SizedBox(height: 8),
                  TextButton.icon(onPressed: _openCreateSheet, icon: const Icon(Icons.add), label: const Text('Create First Plan')),
                ]))
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
                  itemCount: _plans.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) => _buildCard(_plans[i]),
                ),
    );
  }

  Widget _buildCard(Map<String, dynamic> plan) {
    final status  = plan['status'] as String? ?? 'draft';
    final Color statusColor = status == 'active' ? const Color(0xFF16A34A) : status == 'completed' ? const Color(0xFF3B82F6) : Colors.grey.shade600;
    final targets = plan['target_sites'] as int? ?? 0;
    final month   = plan['month'] as String? ?? '';
    final year    = plan['year'] as int?;
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        leading: Container(
          width: 42, height: 42,
          decoration: BoxDecoration(color: const Color(0xFF0F2041).withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
          child: const Icon(Icons.track_changes, color: Color(0xFF0F2041), size: 22),
        ),
        title: Text(plan['name'] as String? ?? 'Unnamed', style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (month.isNotEmpty || year != null)
              Text('$month${year != null ? ' $year' : ''}  ·  $targets target sites', style: GoogleFonts.poppins(fontSize: 11, color: Colors.grey[600])),
          ],
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
              child: Text(status.toUpperCase(), style: GoogleFonts.poppins(fontSize: 10, fontWeight: FontWeight.w700, color: statusColor)),
            ),
            PopupMenuButton<String>(
              onSelected: (action) {
                final id = plan['id'] as String;
                if (action == 'activate') _updateStatus(id, 'active');
                if (action == 'complete') _updateStatus(id, 'completed');
                if (action == 'delete')   _deletePlan(id);
              },
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'activate', child: Text('Set Active')),
                const PopupMenuItem(value: 'complete', child: Text('Mark Complete')),
                const PopupMenuItem(value: 'delete',   child: Text('Delete', style: TextStyle(color: Colors.red))),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
