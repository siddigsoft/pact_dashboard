// lib/screens/admin/audit_logs_screen.dart

import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';
import '../../theme/app_colors.dart';

class AuditLogsScreen extends StatefulWidget {
  final bool isArabic;

  const AuditLogsScreen({super.key, this.isArabic = false});

  @override
  State<AuditLogsScreen> createState() => _AuditLogsScreenState();
}

class _AuditLogsScreenState extends State<AuditLogsScreen> {
  final _supabase = Supabase.instance.client;
  final _searchController = TextEditingController();

  List<Map<String, dynamic>> _logs = [];
  bool _isLoading = true;
  String _selectedType = 'all';
  DateTime? _startDate;
  DateTime? _endDate;

  RealtimeChannel? _logsChannel;
  bool _hasAccess = false;

  @override
  void initState() {
    super.initState();
    _checkSuperAdminAccess();
  }

  Future<void> _checkSuperAdminAccess() async {
    try {
      final user = _supabase.auth.currentUser;
      if (user == null) {
        if (mounted) Navigator.pop(context);
        return;
      }

      final profile = await _supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

      final role = (profile?['role'] as String?)?.toLowerCase() ?? '';
      final isSuperAdmin = role == 'super_admin' || role == 'superadmin';

      if (!mounted) return;

      if (!isSuperAdmin) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.isArabic
                  ? 'الوصول مرفوض - للمشرف العام فقط'
                  : 'Access Denied - Super Admin Only',
            ),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }

      setState(() => _hasAccess = true);
      _loadLogs();
      _setupRealtimeSubscription();
    } catch (e) {
      debugPrint('Error checking super admin access: $e');
      if (mounted) Navigator.pop(context);
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    _logsChannel?.unsubscribe();
    super.dispose();
  }

  void _setupRealtimeSubscription() {
    _logsChannel = _supabase
        .channel('audit-logs-realtime')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'audit_logs',
          callback: (payload) {
            debugPrint('[AuditLogs] New log entry');
            _loadLogs();
          },
        )
        .subscribe();
  }

  Future<void> _loadLogs() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      dynamic query = _supabase
          .from('audit_logs')
          .select('*, profiles:user_id(full_name, email)');

      if (_selectedType != 'all') {
        query = query.eq('action_type', _selectedType);
      }

      if (_startDate != null) {
        query = query.gte('created_at', _startDate!.toIso8601String());
      }

      if (_endDate != null) {
        query = query.lte(
          'created_at',
          _endDate!.add(const Duration(days: 1)).toIso8601String(),
        );
      }

      query = query.order('created_at', ascending: false).limit(200);

      final response = await query;

      if (!mounted) return;
      setState(() {
        _logs = List<Map<String, dynamic>>.from(response as List);
        _isLoading = false;
      });
    } catch (e) {
      debugPrint('Error loading audit logs: $e');
      if (!mounted) return;
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection:
          widget.isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
      child: Scaffold(
        backgroundColor: AppColors.backgroundGray,
        appBar: AppBar(
          backgroundColor: AppColors.primaryBlue,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          title: Text(
            widget.isArabic ? 'سجلات التدقيق' : 'Audit Logs',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.refresh, color: Colors.white),
              onPressed: _loadLogs,
            ),
            IconButton(
              icon: const Icon(Icons.filter_list, color: Colors.white),
              onPressed: _showFilterDialog,
            ),
          ],
        ),
        body: !_hasAccess
            ? const Center(child: CircularProgressIndicator())
            : Column(
                children: [
                  _buildFiltersBar(),
                  Expanded(
                    child: _isLoading
                        ? const Center(child: CircularProgressIndicator())
                        : _logs.isEmpty
                            ? _buildEmptyState()
                            : RefreshIndicator(
                                onRefresh: _loadLogs,
                                child: ListView.builder(
                                  padding: const EdgeInsets.all(16),
                                  itemCount: _logs.length,
                                  itemBuilder: (context, index) =>
                                      _buildLogCard(_logs[index]),
                                ),
                              ),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _buildFiltersBar() {
    return Container(
      padding: const EdgeInsets.all(16),
      color: Colors.white,
      child: Row(
        children: [
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey.shade300),
                borderRadius: BorderRadius.circular(12),
              ),
              child: DropdownButton<String>(
                value: _selectedType,
                underline: const SizedBox(),
                isExpanded: true,
                items: [
                  DropdownMenuItem(
                    value: 'all',
                    child: Text(
                      widget.isArabic ? 'كل الإجراءات' : 'All Actions',
                    ),
                  ),
                  DropdownMenuItem(
                    value: 'login',
                    child: Text(widget.isArabic ? 'تسجيل دخول' : 'Login'),
                  ),
                  DropdownMenuItem(
                    value: 'logout',
                    child: Text(widget.isArabic ? 'تسجيل خروج' : 'Logout'),
                  ),
                  DropdownMenuItem(
                    value: 'create',
                    child: Text(widget.isArabic ? 'إنشاء' : 'Create'),
                  ),
                  DropdownMenuItem(
                    value: 'update',
                    child: Text(widget.isArabic ? 'تحديث' : 'Update'),
                  ),
                  DropdownMenuItem(
                    value: 'delete',
                    child: Text(widget.isArabic ? 'حذف' : 'Delete'),
                  ),
                  DropdownMenuItem(
                    value: 'approval',
                    child: Text(widget.isArabic ? 'موافقة' : 'Approval'),
                  ),
                  DropdownMenuItem(
                    value: 'financial',
                    child: Text(widget.isArabic ? 'مالي' : 'Financial'),
                  ),
                ],
                onChanged: (value) {
                  setState(() => _selectedType = value ?? 'all');
                  _loadLogs();
                },
              ),
            ),
          ),
          const SizedBox(width: 12),
          OutlinedButton.icon(
            onPressed: _selectDateRange,
            icon: const Icon(Icons.date_range, size: 18),
            label: Text(
              _startDate != null
                  ? DateFormat('MM/dd').format(_startDate!)
                  : (widget.isArabic ? 'التاريخ' : 'Date'),
              style: GoogleFonts.poppins(fontSize: 12),
            ),
          ),
          if (_startDate != null)
            IconButton(
              icon: const Icon(Icons.clear, size: 18),
              onPressed: () {
                setState(() {
                  _startDate = null;
                  _endDate = null;
                });
                _loadLogs();
              },
            ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.history, size: 64, color: Colors.grey[400]),
          const SizedBox(height: 16),
          Text(
            widget.isArabic ? 'لا توجد سجلات' : 'No audit logs found',
            style: GoogleFonts.poppins(fontSize: 18, color: Colors.grey[600]),
          ),
        ],
      ),
    );
  }

  Widget _buildLogCard(Map<String, dynamic> log) {
    final actionType = log['action_type'] as String? ?? 'unknown';
    final description = log['description'] as String? ?? '';
    final createdAt =
        DateTime.tryParse(log['created_at'] ?? '') ?? DateTime.now();
    final entityType = log['entity_type'] as String? ?? '';
    final profile = log['profiles'] as Map<String, dynamic>?;
    final userName = profile?['full_name'] as String? ??
        profile?['email'] as String? ??
        'System';

    final icon = _getActionIcon(actionType);
    final color = _getActionColor(actionType);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      _buildActionBadge(actionType, color),
                      if (entityType.isNotEmpty) ...[
                        const SizedBox(width: 8),
                        Text(
                          entityType,
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: Colors.grey[600],
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    description,
                    style: GoogleFonts.poppins(fontSize: 13),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Icon(
                        Icons.person_outline,
                        size: 14,
                        color: Colors.grey[500],
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          userName,
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: Colors.grey[600],
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Icon(
                        Icons.access_time,
                        size: 14,
                        color: Colors.grey[500],
                      ),
                      const SizedBox(width: 4),
                      Text(
                        _formatDateTime(createdAt),
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          color: Colors.grey[600],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionBadge(String action, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        action.toUpperCase(),
        style: GoogleFonts.poppins(
          fontSize: 10,
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  IconData _getActionIcon(String action) {
    switch (action.toLowerCase()) {
      case 'login':
        return Icons.login;
      case 'logout':
        return Icons.logout;
      case 'create':
        return Icons.add_circle;
      case 'update':
        return Icons.edit;
      case 'delete':
        return Icons.delete;
      case 'approval':
        return Icons.check_circle;
      case 'financial':
        return Icons.attach_money;
      default:
        return Icons.info;
    }
  }

  Color _getActionColor(String action) {
    switch (action.toLowerCase()) {
      case 'login':
        return AppColors.primaryGreen;
      case 'logout':
        return Colors.orange;
      case 'create':
        return AppColors.primaryBlue;
      case 'update':
        return Colors.teal;
      case 'delete':
        return Colors.red;
      case 'approval':
        return Colors.purple;
      case 'financial':
        return Colors.amber;
      default:
        return Colors.grey;
    }
  }

  String _formatDateTime(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);

    if (diff.inMinutes < 60) {
      return widget.isArabic
          ? 'منذ ${diff.inMinutes} دقيقة'
          : '${diff.inMinutes}m ago';
    } else if (diff.inHours < 24) {
      return widget.isArabic
          ? 'منذ ${diff.inHours} ساعة'
          : '${diff.inHours}h ago';
    } else if (diff.inDays < 7) {
      return widget.isArabic ? 'منذ ${diff.inDays} يوم' : '${diff.inDays}d ago';
    }
    return DateFormat('MM/dd HH:mm').format(dt);
  }

  Future<void> _selectDateRange() async {
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now(),
      initialDateRange: _startDate != null && _endDate != null
          ? DateTimeRange(start: _startDate!, end: _endDate!)
          : null,
    );

    if (picked != null) {
      setState(() {
        _startDate = picked.start;
        _endDate = picked.end;
      });
      _loadLogs();
    }
  }

  void _showFilterDialog() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => Container(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.isArabic ? 'تصفية السجلات' : 'Filter Logs',
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _buildFilterChip('all', widget.isArabic ? 'الكل' : 'All'),
                _buildFilterChip('login', widget.isArabic ? 'دخول' : 'Login'),
                _buildFilterChip(
                  'create',
                  widget.isArabic ? 'إنشاء' : 'Create',
                ),
                _buildFilterChip(
                  'update',
                  widget.isArabic ? 'تحديث' : 'Update',
                ),
                _buildFilterChip('delete', widget.isArabic ? 'حذف' : 'Delete'),
                _buildFilterChip(
                  'financial',
                  widget.isArabic ? 'مالي' : 'Financial',
                ),
              ],
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  Navigator.pop(context);
                  _loadLogs();
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primaryBlue,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: Text(
                  widget.isArabic ? 'تطبيق' : 'Apply',
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterChip(String value, String label) {
    final isSelected = _selectedType == value;
    return FilterChip(
      label: Text(label),
      selected: isSelected,
      selectedColor: AppColors.primaryBlue.withValues(alpha: 0.2),
      checkmarkColor: AppColors.primaryBlue,
      onSelected: (selected) {
        setState(() => _selectedType = selected ? value : 'all');
      },
    );
  }
}
