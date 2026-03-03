// lib/screens/admin/email_tracking_screen.dart

import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';
import '../../theme/app_colors.dart';

class EmailTrackingScreen extends StatefulWidget {
  final bool isArabic;

  const EmailTrackingScreen({super.key, this.isArabic = false});

  @override
  State<EmailTrackingScreen> createState() => _EmailTrackingScreenState();
}

class _EmailTrackingScreenState extends State<EmailTrackingScreen> {
  final _supabase = Supabase.instance.client;
  final _searchController = TextEditingController();

  List<Map<String, dynamic>> _emails = [];
  bool _isLoading = true;
  String _selectedStatus = 'all';

  int _totalEmails = 0;
  int _sentEmails = 0;
  int _deliveredEmails = 0;
  int _failedEmails = 0;

  RealtimeChannel? _emailChannel;
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
      _loadEmails();
      _setupRealtimeSubscription();
    } catch (e) {
      debugPrint('Error checking super admin access: $e');
      if (mounted) Navigator.pop(context);
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    _emailChannel?.unsubscribe();
    super.dispose();
  }

  void _setupRealtimeSubscription() {
    _emailChannel = _supabase
        .channel('email-tracking-realtime')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'email_logs',
          callback: (payload) {
            debugPrint('[EmailTracking] Update received');
            _loadEmails();
          },
        )
        .subscribe();
  }

  Future<void> _loadEmails() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      final baseQuery = _supabase.from('email_logs').select();

      dynamic query = _selectedStatus != 'all'
          ? baseQuery.eq('status', _selectedStatus)
          : baseQuery;

      query = query.order('created_at', ascending: false).limit(100);

      final response = await query;
      final emails = List<Map<String, dynamic>>.from(response as List);

      if (!mounted) return;
      setState(() {
        _emails = emails;
        _totalEmails = emails.length;
        _sentEmails = emails.where((e) => e['status'] == 'sent').length;
        _deliveredEmails = emails
            .where((e) => e['status'] == 'delivered')
            .length;
        _failedEmails = emails.where((e) => e['status'] == 'failed').length;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint('Error loading emails: $e');
      if (!mounted) return;
      setState(() {
        _emails = [];
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: widget.isArabic
          ? ui.TextDirection.rtl
          : ui.TextDirection.ltr,
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
            widget.isArabic ? 'تتبع البريد الإلكتروني' : 'Email Tracking',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.refresh, color: Colors.white),
              onPressed: _loadEmails,
            ),
          ],
        ),
        body: !_hasAccess
            ? const Center(child: CircularProgressIndicator())
            : SafeArea(
                top: false,
                child: Column(
                  children: [
                    _buildStatsRow(),
                    _buildFilterBar(),
                    Expanded(
                      child: _isLoading
                          ? const Center(child: CircularProgressIndicator())
                          : _emails.isEmpty
                          ? _buildEmptyState()
                          : RefreshIndicator(
                              onRefresh: _loadEmails,
                              child: ListView.builder(
                                padding: const EdgeInsets.all(16),
                                itemCount: _emails.length,
                                itemBuilder: (context, index) =>
                                    _buildEmailCard(_emails[index]),
                              ),
                            ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _buildStatsRow() {
    return Container(
      padding: const EdgeInsets.all(16),
      color: Colors.white,
      child: Row(
        children: [
          _buildStatBadge(
            widget.isArabic ? 'الإجمالي' : 'Total',
            _totalEmails.toString(),
            AppColors.primaryBlue,
          ),
          const SizedBox(width: 8),
          _buildStatBadge(
            widget.isArabic ? 'مرسل' : 'Sent',
            _sentEmails.toString(),
            Colors.orange,
          ),
          const SizedBox(width: 8),
          _buildStatBadge(
            widget.isArabic ? 'مستلم' : 'Delivered',
            _deliveredEmails.toString(),
            AppColors.primaryGreen,
          ),
          const SizedBox(width: 8),
          _buildStatBadge(
            widget.isArabic ? 'فشل' : 'Failed',
            _failedEmails.toString(),
            Colors.red,
          ),
        ],
      ),
    );
  }

  Widget _buildStatBadge(String label, String value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Text(
              value,
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            Text(label, style: GoogleFonts.poppins(fontSize: 10, color: color)),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      color: Colors.white,
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: widget.isArabic ? 'بحث...' : 'Search by recipient...',
                prefixIcon: const Icon(Icons.search, size: 20),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
                isDense: true,
              ),
              onChanged: (_) => setState(() {}),
            ),
          ),
          const SizedBox(width: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              border: Border.all(color: Colors.grey.shade300),
              borderRadius: BorderRadius.circular(12),
            ),
            child: DropdownButton<String>(
              value: _selectedStatus,
              underline: const SizedBox(),
              items: [
                DropdownMenuItem(
                  value: 'all',
                  child: Text(widget.isArabic ? 'الكل' : 'All'),
                ),
                DropdownMenuItem(
                  value: 'sent',
                  child: Text(widget.isArabic ? 'مرسل' : 'Sent'),
                ),
                DropdownMenuItem(
                  value: 'delivered',
                  child: Text(widget.isArabic ? 'مستلم' : 'Delivered'),
                ),
                DropdownMenuItem(
                  value: 'failed',
                  child: Text(widget.isArabic ? 'فشل' : 'Failed'),
                ),
              ],
              onChanged: (value) {
                setState(() => _selectedStatus = value ?? 'all');
                _loadEmails();
              },
            ),
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
          Icon(Icons.email_outlined, size: 64, color: Colors.grey[400]),
          const SizedBox(height: 16),
          Text(
            widget.isArabic ? 'لا توجد رسائل' : 'No emails found',
            style: GoogleFonts.poppins(fontSize: 18, color: Colors.grey[600]),
          ),
        ],
      ),
    );
  }

  Widget _buildEmailCard(Map<String, dynamic> email) {
    final recipient =
        email['recipient'] as String? ??
        email['to_email'] as String? ??
        'Unknown';
    final subject = email['subject'] as String? ?? 'No Subject';
    final status = email['status'] as String? ?? 'unknown';
    final emailType =
        email['email_type'] as String? ?? email['type'] as String? ?? '';
    final createdAt =
        DateTime.tryParse(email['created_at'] ?? '') ?? DateTime.now();

    final statusColor = _getStatusColor(status);
    final statusIcon = _getStatusIcon(status);

    final query = _searchController.text.toLowerCase();
    if (query.isNotEmpty &&
        !recipient.toLowerCase().contains(query) &&
        !subject.toLowerCase().contains(query)) {
      return const SizedBox.shrink();
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(statusIcon, color: statusColor, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        subject,
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        recipient,
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          color: Colors.grey[600],
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                _buildStatusBadge(status, statusColor),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                if (emailType.isNotEmpty) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.primaryBlue.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      emailType,
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: AppColors.primaryBlue,
                      ),
                    ),
                  ),
                  const Spacer(),
                ],
                Icon(Icons.access_time, size: 14, color: Colors.grey[500]),
                const SizedBox(width: 4),
                Text(
                  DateFormat('MMM dd, HH:mm').format(createdAt),
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
    );
  }

  Widget _buildStatusBadge(String status, Color color) {
    String label;
    switch (status.toLowerCase()) {
      case 'sent':
        label = widget.isArabic ? 'مرسل' : 'Sent';
        break;
      case 'delivered':
        label = widget.isArabic ? 'مستلم' : 'Delivered';
        break;
      case 'failed':
        label = widget.isArabic ? 'فشل' : 'Failed';
        break;
      case 'pending':
        label = widget.isArabic ? 'معلق' : 'Pending';
        break;
      default:
        label = status;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        label,
        style: GoogleFonts.poppins(
          fontSize: 11,
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'sent':
        return Colors.orange;
      case 'delivered':
        return AppColors.primaryGreen;
      case 'failed':
        return Colors.red;
      case 'pending':
        return Colors.grey;
      default:
        return Colors.grey;
    }
  }

  IconData _getStatusIcon(String status) {
    switch (status.toLowerCase()) {
      case 'sent':
        return Icons.send;
      case 'delivered':
        return Icons.check_circle;
      case 'failed':
        return Icons.error;
      case 'pending':
        return Icons.schedule;
      default:
        return Icons.email;
    }
  }
}
