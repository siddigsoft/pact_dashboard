import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../theme/app_colors.dart';

class SiteVisitDetailScreen extends StatefulWidget {
  final String siteVisitId;
  
  const SiteVisitDetailScreen({
    super.key,
    required this.siteVisitId,
  });

  @override
  State<SiteVisitDetailScreen> createState() => _SiteVisitDetailScreenState();
}

class _SiteVisitDetailScreenState extends State<SiteVisitDetailScreen> {
  bool _isLoading = true;
  Map<String, dynamic>? _siteVisit;
  Map<String, dynamic>? _assignedUser;
  List<Map<String, dynamic>> _costSubmissions = [];
  List<Map<String, dynamic>> _auditTrail = [];
  String _currentLocale = 'en';

  @override
  void initState() {
    super.initState();
    _loadSiteVisitDetails();
  }

  Future<void> _loadSiteVisitDetails() async {
    setState(() => _isLoading = true);
    
    try {
      final response = await Supabase.instance.client
          .from('site_visits')
          .select('*')
          .eq('id', widget.siteVisitId)
          .maybeSingle();

      if (response != null) {
        _siteVisit = response;
        
        if (response['assignedTo'] != null) {
          final userResponse = await Supabase.instance.client
              .from('profiles')
              .select('id, full_name, email, phone, role')
              .eq('id', response['assignedTo'])
              .maybeSingle();
          _assignedUser = userResponse;
        }

        final costsResponse = await Supabase.instance.client
            .from('cost_submissions')
            .select('*')
            .eq('site_visit_id', widget.siteVisitId)
            .order('created_at', ascending: false);
        _costSubmissions = List<Map<String, dynamic>>.from(costsResponse ?? []);

        final auditResponse = await Supabase.instance.client
            .from('audit_logs')
            .select('*')
            .eq('entity_id', widget.siteVisitId)
            .eq('entity_type', 'site_visit')
            .order('created_at', ascending: false)
            .limit(20);
        _auditTrail = List<Map<String, dynamic>>.from(auditResponse ?? []);
      }
    } catch (e) {
      debugPrint('Error loading site visit: $e');
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _toggleLanguage() {
    setState(() {
      _currentLocale = _currentLocale == 'en' ? 'ar' : 'en';
    });
  }

  String _formatDate(String? dateStr) {
    if (dateStr == null) return '-';
    try {
      final date = DateTime.parse(dateStr);
      return DateFormat('MMM dd, yyyy').format(date);
    } catch (e) {
      return dateStr;
    }
  }

  String _formatDateTime(String? dateStr) {
    if (dateStr == null) return '-';
    try {
      final date = DateTime.parse(dateStr);
      return DateFormat('MMM dd, yyyy HH:mm').format(date);
    } catch (e) {
      return dateStr;
    }
  }

  Color _getStatusColor(String? status) {
    switch (status?.toLowerCase()) {
      case 'completed':
        return Colors.green;
      case 'in_progress':
      case 'in progress':
        return Colors.blue;
      case 'pending':
        return Colors.orange;
      case 'overdue':
        return Colors.red;
      case 'cancelled':
        return Colors.grey;
      default:
        return Colors.grey;
    }
  }

  String _getStatusLabel(String? status) {
    final isArabic = _currentLocale == 'ar';
    switch (status?.toLowerCase()) {
      case 'completed':
        return isArabic ? 'مكتمل' : 'Completed';
      case 'in_progress':
      case 'in progress':
        return isArabic ? 'قيد التنفيذ' : 'In Progress';
      case 'pending':
        return isArabic ? 'معلق' : 'Pending';
      case 'overdue':
        return isArabic ? 'متأخر' : 'Overdue';
      case 'cancelled':
        return isArabic ? 'ملغي' : 'Cancelled';
      default:
        return status ?? '-';
    }
  }

  Future<void> _openInMaps() async {
    final lat = _siteVisit?['latitude'];
    final lng = _siteVisit?['longitude'];
    if (lat != null && lng != null) {
      final url = Uri.parse('https://www.google.com/maps/search/?api=1&query=$lat,$lng');
      if (await canLaunchUrl(url)) {
        await launchUrl(url, mode: LaunchMode.externalApplication);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = _currentLocale == 'ar';

    return Directionality(
      textDirection: isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
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
            isArabic ? 'تفاصيل الزيارة الميدانية' : 'Site Visit Details',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.refresh, color: Colors.white),
              onPressed: _loadSiteVisitDetails,
            ),
            TextButton.icon(
              onPressed: _toggleLanguage,
              icon: const Icon(Icons.language, color: Colors.white, size: 20),
              label: Text(
                isArabic ? 'EN' : 'عربي',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
        body: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : _siteVisit == null
                ? Center(
                    child: Text(
                      isArabic ? 'لم يتم العثور على الزيارة' : 'Site visit not found',
                      style: GoogleFonts.poppins(fontSize: 16, color: Colors.grey),
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _loadSiteVisitDetails,
                    child: SingleChildScrollView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _buildStatusHeader(isArabic),
                          const SizedBox(height: 16),
                          _buildSiteInfoCard(isArabic),
                          const SizedBox(height: 16),
                          _buildLocationCard(isArabic),
                          const SizedBox(height: 16),
                          _buildAssignmentCard(isArabic),
                          const SizedBox(height: 16),
                          _buildDatesCard(isArabic),
                          if (_costSubmissions.isNotEmpty) ...[
                            const SizedBox(height: 16),
                            _buildCostsCard(isArabic),
                          ],
                          if (_auditTrail.isNotEmpty) ...[
                            const SizedBox(height: 16),
                            _buildAuditTrailCard(isArabic),
                          ],
                          const SizedBox(height: 32),
                        ],
                      ),
                    ),
                  ),
      ),
    );
  }

  Widget _buildStatusHeader(bool isArabic) {
    final status = _siteVisit?['status'] ?? 'pending';
    final statusColor = _getStatusColor(status);

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [statusColor.withOpacity(0.8), statusColor],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              _getStatusIcon(status),
              color: Colors.white,
              size: 32,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _getStatusLabel(status),
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  _siteVisit?['siteName'] ?? '-',
                  style: GoogleFonts.poppins(
                    color: Colors.white.withOpacity(0.9),
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  IconData _getStatusIcon(String? status) {
    switch (status?.toLowerCase()) {
      case 'completed':
        return Icons.check_circle;
      case 'in_progress':
      case 'in progress':
        return Icons.pending;
      case 'pending':
        return Icons.schedule;
      case 'overdue':
        return Icons.warning;
      case 'cancelled':
        return Icons.cancel;
      default:
        return Icons.help;
    }
  }

  Widget _buildSiteInfoCard(bool isArabic) {
    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.location_city, color: AppColors.primaryBlue),
                const SizedBox(width: 8),
                Text(
                  isArabic ? 'معلومات الموقع' : 'Site Information',
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const Divider(height: 24),
            _buildInfoRow(
              isArabic ? 'اسم الموقع' : 'Site Name',
              _siteVisit?['siteName'] ?? '-',
              Icons.place,
            ),
            _buildInfoRow(
              isArabic ? 'الولاية' : 'State',
              _siteVisit?['state'] ?? '-',
              Icons.map,
            ),
            _buildInfoRow(
              isArabic ? 'المحلية' : 'Locality',
              _siteVisit?['locality'] ?? '-',
              Icons.location_on,
            ),
            _buildInfoRow(
              isArabic ? 'النشاط' : 'Activity',
              _siteVisit?['activityType'] ?? '-',
              Icons.work,
            ),
            if (_siteVisit?['projectName'] != null)
              _buildInfoRow(
                isArabic ? 'المشروع' : 'Project',
                _siteVisit?['projectName'] ?? '-',
                Icons.folder,
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildLocationCard(bool isArabic) {
    final lat = _siteVisit?['latitude'];
    final lng = _siteVisit?['longitude'];
    final hasCoordinates = lat != null && lng != null;

    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.gps_fixed, color: AppColors.primaryBlue),
                const SizedBox(width: 8),
                Text(
                  isArabic ? 'الموقع الجغرافي' : 'GPS Location',
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const Divider(height: 24),
            if (hasCoordinates) ...[
              _buildInfoRow(
                isArabic ? 'خط العرض' : 'Latitude',
                lat.toString(),
                Icons.north,
              ),
              _buildInfoRow(
                isArabic ? 'خط الطول' : 'Longitude',
                lng.toString(),
                Icons.east,
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _openInMaps,
                  icon: const Icon(Icons.map),
                  label: Text(isArabic ? 'فتح في الخرائط' : 'Open in Maps'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryBlue,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
            ] else
              Center(
                child: Column(
                  children: [
                    Icon(Icons.location_off, size: 48, color: Colors.grey[400]),
                    const SizedBox(height: 8),
                    Text(
                      isArabic ? 'لا توجد إحداثيات' : 'No coordinates available',
                      style: GoogleFonts.poppins(color: Colors.grey[600]),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildAssignmentCard(bool isArabic) {
    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.person, color: AppColors.primaryBlue),
                const SizedBox(width: 8),
                Text(
                  isArabic ? 'التعيين' : 'Assignment',
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const Divider(height: 24),
            if (_assignedUser != null) ...[
              Row(
                children: [
                  CircleAvatar(
                    radius: 24,
                    backgroundColor: AppColors.primaryBlue.withOpacity(0.1),
                    child: Text(
                      (_assignedUser?['full_name'] ?? 'U')[0].toUpperCase(),
                      style: GoogleFonts.poppins(
                        color: AppColors.primaryBlue,
                        fontWeight: FontWeight.bold,
                        fontSize: 18,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _assignedUser?['full_name'] ?? '-',
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w600,
                            fontSize: 16,
                          ),
                        ),
                        Text(
                          _assignedUser?['email'] ?? '-',
                          style: GoogleFonts.poppins(
                            color: Colors.grey[600],
                            fontSize: 13,
                          ),
                        ),
                        if (_assignedUser?['role'] != null)
                          Container(
                            margin: const EdgeInsets.only(top: 4),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.primaryBlue.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              _assignedUser?['role'] ?? '',
                              style: GoogleFonts.poppins(
                                fontSize: 11,
                                color: AppColors.primaryBlue,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ] else
              Center(
                child: Column(
                  children: [
                    Icon(Icons.person_off, size: 48, color: Colors.grey[400]),
                    const SizedBox(height: 8),
                    Text(
                      isArabic ? 'غير معين' : 'Not assigned',
                      style: GoogleFonts.poppins(color: Colors.grey[600]),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildDatesCard(bool isArabic) {
    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.calendar_today, color: AppColors.primaryBlue),
                const SizedBox(width: 8),
                Text(
                  isArabic ? 'التواريخ' : 'Dates',
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const Divider(height: 24),
            _buildInfoRow(
              isArabic ? 'تاريخ الزيارة' : 'Visit Date',
              _formatDate(_siteVisit?['dueDate']),
              Icons.event,
            ),
            _buildInfoRow(
              isArabic ? 'تاريخ الإنشاء' : 'Created At',
              _formatDateTime(_siteVisit?['created_at']),
              Icons.access_time,
            ),
            if (_siteVisit?['completedAt'] != null)
              _buildInfoRow(
                isArabic ? 'تاريخ الإكمال' : 'Completed At',
                _formatDateTime(_siteVisit?['completedAt']),
                Icons.check_circle_outline,
              ),
            if (_siteVisit?['startedAt'] != null)
              _buildInfoRow(
                isArabic ? 'تاريخ البدء' : 'Started At',
                _formatDateTime(_siteVisit?['startedAt']),
                Icons.play_circle_outline,
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildCostsCard(bool isArabic) {
    double totalCost = 0;
    for (var cost in _costSubmissions) {
      totalCost += (cost['amount'] ?? 0).toDouble();
    }

    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Icon(Icons.attach_money, color: AppColors.primaryGreen),
                    const SizedBox(width: 8),
                    Text(
                      isArabic ? 'التكاليف' : 'Costs',
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.primaryGreen.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '${totalCost.toStringAsFixed(2)} SDG',
                    style: GoogleFonts.poppins(
                      color: AppColors.primaryGreen,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const Divider(height: 24),
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _costSubmissions.length,
              separatorBuilder: (_, __) => const Divider(height: 16),
              itemBuilder: (context, index) {
                final cost = _costSubmissions[index];
                return Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.grey[100],
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(
                        Icons.receipt,
                        color: Colors.grey[600],
                        size: 20,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            cost['cost_type'] ?? (isArabic ? 'تكلفة' : 'Cost'),
                            style: GoogleFonts.poppins(fontWeight: FontWeight.w500),
                          ),
                          Text(
                            _formatDate(cost['created_at']),
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              color: Colors.grey[600],
                            ),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      '${(cost['amount'] ?? 0).toStringAsFixed(2)} SDG',
                      style: GoogleFonts.poppins(
                        fontWeight: FontWeight.bold,
                        color: AppColors.primaryGreen,
                      ),
                    ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAuditTrailCard(bool isArabic) {
    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.history, color: AppColors.primaryBlue),
                const SizedBox(width: 8),
                Text(
                  isArabic ? 'سجل النشاط' : 'Activity History',
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const Divider(height: 24),
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _auditTrail.length > 5 ? 5 : _auditTrail.length,
              itemBuilder: (context, index) {
                final audit = _auditTrail[index];
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        margin: const EdgeInsets.only(top: 6),
                        decoration: BoxDecoration(
                          color: AppColors.primaryBlue,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              audit['action'] ?? '-',
                              style: GoogleFonts.poppins(
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            Text(
                              _formatDateTime(audit['created_at']),
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
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoRow(String label, String value, IconData icon) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Icon(icon, size: 18, color: Colors.grey[500]),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: Colors.grey[600],
                  ),
                ),
                Text(
                  value,
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
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
