import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'dart:developer' as developer;
import '../theme/app_colors.dart';
import '../theme/app_design_system.dart';
import '../widgets/app_widgets.dart';
import '../models/site_visit.dart';

class ReportPhoto {
  final String id;
  final String photoUrl;
  final String storagePath;
  final DateTime createdAt;

  ReportPhoto({
    required this.id,
    required this.photoUrl,
    required this.storagePath,
    required this.createdAt,
  });

  factory ReportPhoto.fromJson(Map<String, dynamic> json) {
    return ReportPhoto(
      id: json['id']?.toString() ?? '',
      photoUrl: json['photo_url']?.toString() ?? '',
      storagePath: json['storage_path']?.toString() ?? '',
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

class VisitReportDetail {
  final String id;
  final String siteVisitId;
  final String? notes;
  final String? activities;
  final int? durationMinutes;
  final Map<String, dynamic>? coordinates;
  final String submittedBy;
  final DateTime? submittedAt;
  final bool isSynced;
  final String? submittedVia;
  final DateTime createdAt;

  VisitReportDetail({
    required this.id,
    required this.siteVisitId,
    this.notes,
    this.activities,
    this.durationMinutes,
    this.coordinates,
    required this.submittedBy,
    this.submittedAt,
    required this.isSynced,
    this.submittedVia,
    required this.createdAt,
  });

  factory VisitReportDetail.fromJson(Map<String, dynamic> json) {
    Map<String, dynamic>? coords;
    if (json['coordinates'] != null) {
      if (json['coordinates'] is Map) {
        coords = Map<String, dynamic>.from(json['coordinates']);
      }
    }

    return VisitReportDetail(
      id: json['id']?.toString() ?? '',
      siteVisitId: json['site_visit_id']?.toString() ?? '',
      notes: json['notes']?.toString(),
      activities: json['activities']?.toString(),
      durationMinutes: json['duration_minutes'] as int?,
      coordinates: coords,
      submittedBy: json['submitted_by']?.toString() ?? '',
      submittedAt: json['submitted_at'] != null
          ? DateTime.tryParse(json['submitted_at'].toString())
          : null,
      isSynced: json['is_synced'] == true,
      submittedVia: json['submitted_via']?.toString(),
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  double? get latitude => coordinates?['latitude'] as double?;
  double? get longitude => coordinates?['longitude'] as double?;
  double? get accuracy => coordinates?['accuracy'] as double?;
}

class VisitReportDetailScreen extends ConsumerStatefulWidget {
  final SiteVisit visit;

  const VisitReportDetailScreen({
    super.key,
    required this.visit,
  });

  @override
  ConsumerState<VisitReportDetailScreen> createState() =>
      _VisitReportDetailScreenState();
}

class _VisitReportDetailScreenState
    extends ConsumerState<VisitReportDetailScreen> {
  bool _isLoading = true;
  String? _error;
  VisitReportDetail? _report;
  List<ReportPhoto> _photos = [];
  String _submitterName = 'Unknown';
  int _selectedPhotoIndex = -1;
  bool _hasAccess = false;

  @override
  void initState() {
    super.initState();
    _checkAccessAndLoad();
  }

  Future<void> _checkAccessAndLoad() async {
    try {
      setState(() {
        _isLoading = true;
        _error = null;
      });

      final supabase = Supabase.instance.client;
      final userId = supabase.auth.currentUser?.id;

      if (userId == null) {
        setState(() {
          _isLoading = false;
          _error = 'Not authenticated';
        });
        return;
      }

      final profileResponse = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .maybeSingle();

      final role = profileResponse?['role']?.toString().toLowerCase() ?? '';
      final allowedRoles = ['admin', 'super_admin', 'superadmin', 'fom', 'ict'];
      _hasAccess = allowedRoles.contains(role);

      if (!_hasAccess) {
        setState(() {
          _isLoading = false;
          _error = 'Access denied. Only Admin, FOM, and ICT roles can view visit reports.';
        });
        return;
      }

      await _loadReportData();
    } catch (e) {
      developer.log('Error checking access: $e');
      setState(() {
        _isLoading = false;
        _error = 'Failed to verify access: $e';
      });
    }
  }

  Future<void> _loadReportData() async {
    try {
      setState(() {
        _isLoading = true;
        _error = null;
      });

      final supabase = Supabase.instance.client;

      final reportResponse = await supabase
          .from('reports')
          .select('*')
          .eq('site_visit_id', widget.visit.id)
          .order('created_at', ascending: false)
          .limit(1)
          .maybeSingle();

      if (reportResponse == null) {
        setState(() {
          _isLoading = false;
          _report = null;
        });
        return;
      }

      final report = VisitReportDetail.fromJson(reportResponse);
      setState(() {
        _report = report;
      });

      final photosResponse = await supabase
          .from('report_photos')
          .select('*')
          .eq('report_id', report.id)
          .order('created_at', ascending: true);

      if (photosResponse != null) {
        setState(() {
          _photos = (photosResponse as List)
              .map((p) => ReportPhoto.fromJson(p))
              .toList();
        });
      }

      if (report.submittedBy.isNotEmpty) {
        final profileResponse = await supabase
            .from('profiles')
            .select('full_name, username, email')
            .eq('id', report.submittedBy)
            .maybeSingle();

        if (profileResponse != null) {
          setState(() {
            _submitterName = profileResponse['full_name']?.toString() ??
                profileResponse['username']?.toString() ??
                profileResponse['email']?.toString() ??
                'Unknown';
          });
        }
      }
    } catch (e) {
      developer.log('Error loading report data: $e');
      setState(() {
        _error = 'Failed to load visit report: $e';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  String _formatDuration(int? minutes) {
    if (minutes == null) return 'N/A';
    if (minutes < 60) return '$minutes min';
    final hours = minutes ~/ 60;
    final mins = minutes % 60;
    return '${hours}h ${mins}m';
  }

  String _getSubmissionSource() {
    if (_report?.submittedVia == 'mobile') return 'Mobile';
    if (_report?.submittedVia == 'web') return 'Web';
    
    if (_report?.coordinates != null) {
      final coords = _report!.coordinates!;
      if (coords.containsKey('locked') || 
          (coords['accuracy'] != null && (coords['accuracy'] as num) < 50)) {
        return 'Mobile';
      }
    }
    return 'Unknown';
  }

  Future<void> _openMap() async {
    if (_report?.latitude == null || _report?.longitude == null) return;
    
    final url = Uri.parse(
      'https://www.google.com/maps?q=${_report!.latitude},${_report!.longitude}'
    );
    
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    }
  }

  void _showPhotoViewer(int index) {
    setState(() {
      _selectedPhotoIndex = index;
    });
    
    showDialog(
      context: context,
      barrierColor: Colors.black87,
      builder: (context) => _PhotoViewerDialog(
        photos: _photos,
        initialIndex: index,
        onClose: () => Navigator.of(context).pop(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Visit Report'),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        actions: [
          if (_report != null)
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: _loadReportData,
              tooltip: 'Refresh',
            ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.error_outline, size: 48, color: Colors.red[400]),
              const SizedBox(height: 16),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.red[700]),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _loadReportData,
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    if (_report == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.description_outlined, size: 48, color: Colors.grey[400]),
              const SizedBox(height: 16),
              Text(
                'No visit report found for this site.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey[600]),
              ),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadReportData,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildSiteHeader(),
            const SizedBox(height: 16),
            _buildStatsGrid(),
            const SizedBox(height: 16),
            if (_report!.activities?.isNotEmpty == true) ...[
              _buildSection('Activities Performed', _report!.activities!),
              const SizedBox(height: 16),
            ],
            if (_report!.notes?.isNotEmpty == true) ...[
              _buildSection('Notes', _report!.notes!),
              const SizedBox(height: 16),
            ],
            if (_photos.isNotEmpty) ...[
              _buildPhotosSection(),
              const SizedBox(height: 16),
            ],
            if (_report!.accuracy != null) ...[
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  'GPS Accuracy: ±${_report!.accuracy!.toStringAsFixed(1)}m',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey[600],
                  ),
                ),
              ),
            ],
            const SizedBox(height: 80),
          ],
        ),
      ),
    );
  }

  Widget _buildSiteHeader() {
    final submissionSource = _getSubmissionSource();
    
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.description, color: AppColors.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    widget.visit.siteName,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _buildChip(
                  widget.visit.siteCode,
                  Icons.qr_code,
                  Colors.blue,
                ),
                if (submissionSource != 'Unknown')
                  _buildChip(
                    submissionSource,
                    submissionSource == 'Mobile' 
                        ? Icons.smartphone 
                        : Icons.computer,
                    Colors.purple,
                  ),
                _buildChip(
                  '${_photos.length} Photo${_photos.length != 1 ? 's' : ''}',
                  Icons.photo_camera,
                  Colors.orange,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildChip(String label, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatsGrid() {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 2.5,
      children: [
        _buildStatCard(
          'Duration',
          _formatDuration(_report!.durationMinutes),
          Icons.timer_outlined,
          Colors.blue,
        ),
        _buildStatCard(
          'Submitted By',
          _submitterName,
          Icons.person_outline,
          Colors.green,
        ),
        _buildStatCard(
          'Submitted',
          _report!.submittedAt != null
              ? DateFormat('MMM d, yyyy').format(_report!.submittedAt!)
              : 'N/A',
          Icons.calendar_today_outlined,
          Colors.orange,
        ),
        if (_report!.latitude != null && _report!.longitude != null)
          InkWell(
            onTap: _openMap,
            child: _buildStatCard(
              'Location',
              'View Map',
              Icons.location_on_outlined,
              Colors.red,
              isClickable: true,
            ),
          )
        else
          _buildStatCard(
            'Location',
            'Not Available',
            Icons.location_off_outlined,
            Colors.grey,
          ),
      ],
    );
  }

  Widget _buildStatCard(
    String label,
    String value,
    IconData icon,
    Color color, {
    bool isClickable = false,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 24, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.grey[600],
                  ),
                ),
                Text(
                  value,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: isClickable ? color : null,
                    decoration: isClickable ? TextDecoration.underline : null,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSection(String title, String content) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title.toUpperCase(),
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: Colors.grey[600],
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 8),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.grey[100],
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            content,
            style: const TextStyle(fontSize: 14),
          ),
        ),
      ],
    );
  }

  Widget _buildPhotosSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'VISIT PHOTOS',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: Colors.grey[600],
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 12),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3,
            crossAxisSpacing: 8,
            mainAxisSpacing: 8,
          ),
          itemCount: _photos.length,
          itemBuilder: (context, index) {
            return GestureDetector(
              onTap: () => _showPhotoViewer(index),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.network(
                  _photos[index].photoUrl,
                  fit: BoxFit.cover,
                  loadingBuilder: (context, child, loadingProgress) {
                    if (loadingProgress == null) return child;
                    return Container(
                      color: Colors.grey[200],
                      child: Center(
                        child: CircularProgressIndicator(
                          value: loadingProgress.expectedTotalBytes != null
                              ? loadingProgress.cumulativeBytesLoaded /
                                  loadingProgress.expectedTotalBytes!
                              : null,
                          strokeWidth: 2,
                        ),
                      ),
                    );
                  },
                  errorBuilder: (context, error, stackTrace) {
                    return Container(
                      color: Colors.grey[300],
                      child: const Icon(Icons.broken_image, color: Colors.grey),
                    );
                  },
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}

class _PhotoViewerDialog extends StatefulWidget {
  final List<ReportPhoto> photos;
  final int initialIndex;
  final VoidCallback onClose;

  const _PhotoViewerDialog({
    required this.photos,
    required this.initialIndex,
    required this.onClose,
  });

  @override
  State<_PhotoViewerDialog> createState() => _PhotoViewerDialogState();
}

class _PhotoViewerDialogState extends State<_PhotoViewerDialog> {
  late PageController _pageController;
  late int _currentIndex;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
    _pageController = PageController(initialPage: widget.initialIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: EdgeInsets.zero,
      child: Stack(
        fit: StackFit.expand,
        children: [
          PageView.builder(
            controller: _pageController,
            itemCount: widget.photos.length,
            onPageChanged: (index) {
              setState(() {
                _currentIndex = index;
              });
            },
            itemBuilder: (context, index) {
              return InteractiveViewer(
                child: Center(
                  child: Image.network(
                    widget.photos[index].photoUrl,
                    fit: BoxFit.contain,
                    loadingBuilder: (context, child, loadingProgress) {
                      if (loadingProgress == null) return child;
                      return const Center(
                        child: CircularProgressIndicator(color: Colors.white),
                      );
                    },
                    errorBuilder: (context, error, stackTrace) {
                      return const Center(
                        child: Icon(
                          Icons.broken_image,
                          color: Colors.white54,
                          size: 64,
                        ),
                      );
                    },
                  ),
                ),
              );
            },
          ),
          Positioned(
            top: 40,
            left: 16,
            right: 16,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.black54,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    '${_currentIndex + 1} / ${widget.photos.length}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: Colors.white, size: 28),
                  onPressed: widget.onClose,
                ),
              ],
            ),
          ),
          if (_currentIndex > 0)
            Positioned(
              left: 8,
              top: 0,
              bottom: 0,
              child: Center(
                child: IconButton(
                  icon: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.black38,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.chevron_left,
                      color: Colors.white,
                      size: 32,
                    ),
                  ),
                  onPressed: () {
                    _pageController.previousPage(
                      duration: const Duration(milliseconds: 300),
                      curve: Curves.easeInOut,
                    );
                  },
                ),
              ),
            ),
          if (_currentIndex < widget.photos.length - 1)
            Positioned(
              right: 8,
              top: 0,
              bottom: 0,
              child: Center(
                child: IconButton(
                  icon: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.black38,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.chevron_right,
                      color: Colors.white,
                      size: 32,
                    ),
                  ),
                  onPressed: () {
                    _pageController.nextPage(
                      duration: const Duration(milliseconds: 300),
                      curve: Curves.easeInOut,
                    );
                  },
                ),
              ),
            ),
        ],
      ),
    );
  }
}
