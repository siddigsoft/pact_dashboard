// lib/screens/components/visit_details_sheet.dart

import 'package:flutter/material.dart';
import 'dart:async'; // For TimeoutException
import '../../models/site_visit.dart';
import '../../theme/app_colors.dart';
import 'package:geolocator/geolocator.dart';
import '../../services/staff_tracking_service.dart';
import '../../services/location_tracking_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../services/offline/offline_db.dart';
import 'report_form_sheet.dart';
import '../../widgets/claim_site_button.dart';
import '../../widgets/start_visit_button.dart';
import '../../widgets/complete_visit_button.dart';
import '../../widgets/accept_assignment_button.dart';
import '../../models/pact_user_profile.dart';

class VisitDetailsSheet extends StatefulWidget {
  final SiteVisit visit;
  final PACTUserProfile? userProfile;
  final Future<void> Function(String) onStatusChanged;
  final Future<void> Function(String)? onReject;
  final bool isTrackingJourney;
  final bool isNearDestination;
  final VoidCallback? onArrived;
  final VoidCallback? onGetDirections;
  final bool reportSubmitted;
  final VoidCallback? onSubmitReportRequested;

  const VisitDetailsSheet({
    super.key,
    required this.visit,
    this.userProfile,
    required this.onStatusChanged,
    this.onReject,
    this.isTrackingJourney = false,
    this.isNearDestination = false,
    this.onArrived,
    this.onGetDirections,
    this.reportSubmitted = false,
    this.onSubmitReportRequested,
  });

  @override
  State<VisitDetailsSheet> createState() => _VisitDetailsSheetState();
}

class _VisitDetailsSheetState extends State<VisitDetailsSheet> {
  late SiteVisit _visit;
  bool _isUpdating = false;
  bool _isEndingVisit = false;
  bool _hasReport = false;
  bool _checkedReport = false;

  bool get _isArabic => Localizations.localeOf(context).languageCode == 'ar';

  @override
  void initState() {
    super.initState();
    _visit = widget.visit;
    if (_visit.status.toLowerCase() == 'completed' && !widget.reportSubmitted) {
      _probeReportExists();
    }
  }

  Future<void> _probeReportExists() async {
    try {
      final supabase = Supabase.instance.client;
      try {
        final res = await supabase
            .from('reports')
            .select('id')
            .eq('site_visit_id', _visit.id)
            .limit(1);
        if (mounted) {
          setState(() {
            _hasReport = (res.isNotEmpty);
            _checkedReport = true;
          });
        }
        return;
      } catch (_) {}

      final offlineDb = OfflineDb();
      final cachedItem = offlineDb.getCachedItem(
        OfflineDb.reportsCacheBox,
        'reports_${_visit.id}',
      );
      final cachedData = cachedItem?.data as Map<String, dynamic>?;
      final cached = cachedData?['reports'] as List? ?? [];
      final exists = cached.any((r) => r['site_visit_id'] == _visit.id);
      if (mounted) {
        setState(() {
          _hasReport = exists;
          _checkedReport = true;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _checkedReport = true;
        });
      }
    }
  }

  Future<void> _onEndVisitCaptureLocation() async {
    if (_isEndingVisit) return;
    setState(() => _isEndingVisit = true);

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => _ProgressDialog(
        title: _isArabic ? 'إنهاء الزيارة' : 'Ending visit',
        message: _isArabic ? 'جاري التقاط موقع الموقع وإيقاف التتبع...' : 'Capturing site location and stopping tracking...',
      ),
    );

    try {
      final hasService = await Geolocator.isLocationServiceEnabled();
      if (!hasService) {
        throw Exception(_isArabic ? 'خدمات الموقع معطلة' : 'Location services are disabled');
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw Exception(_isArabic ? 'إذن الموقع غير ممنوح' : 'Location permission not granted');
      }
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.best,
      );

      final staffService = StaffTrackingService(Supabase.instance.client);
      final ok = await staffService.recordSiteLocation(
        siteId: _visit.id,
        position: position,
        notes: 'Captured at end of visit',
      );

      if (!ok) {
        throw Exception(_isArabic ? 'فشل حفظ موقع الموقع' : 'Failed to save site location');
      }

      try {
        final row = await Supabase.instance.client
            .from('site_locations')
            .select('site_id, latitude, longitude, accuracy, recorded_at')
            .eq('site_id', _visit.id)
            .single();
        debugPrint(
          '✅ Verified site location saved: lat=${row['latitude']}, lng=${row['longitude']}',
        );
      } catch (e) {
        debugPrint('⚠️ Verification read failed (may be blocked by RLS): $e');
      }

      await LocationTrackingService().stopJourneyTracking();

      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(_isArabic ? 'تم حفظ موقع الموقع وإيقاف التتبع.' : 'Site location saved and tracking stopped.'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${_isArabic ? 'فشل إنهاء الزيارة' : 'Failed to end visit'}: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isEndingVisit = false);
    }
  }

  void _updateVisitStatus(String newStatus) async {
    if (_isUpdating) return;
    setState(() => _isUpdating = true);
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => _ProgressDialog(
        title: _isArabic ? 'يرجى الانتظار' : 'Please wait',
        message: _isArabic ? 'جاري تحديث حالة الزيارة...' : 'Updating visit status...',
      ),
    );

    try {
      bool shouldCloseSheet = false;
      await widget
          .onStatusChanged(newStatus)
          .timeout(const Duration(seconds: 20));

      if (mounted) {
        setState(() {
          _visit = _visit.copyWith(status: newStatus);
        });
      }

      if (newStatus.toLowerCase() == 'completed') {
        shouldCloseSheet = true;
      }
    } on TimeoutException {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _isArabic ? 'استغرق التحديث وقتاً طويلاً. يرجى التحقق من الشبكة والمحاولة مرة أخرى.' : 'Updating took too long. Please check network and try again.',
            ),
            backgroundColor: Colors.orange,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.error, color: Colors.white),
                const SizedBox(width: 8),
                Expanded(child: Text(_isArabic ? 'فشل تحديث حالة الزيارة' : 'Failed to update visit status')),
              ],
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        try {
          Navigator.of(context, rootNavigator: true).pop();
        } catch (_) {}
        try {
          Navigator.of(context).maybePop();
        } catch (_) {}
      }
      if (mounted) setState(() => _isUpdating = false);
    }
  }

  Future<void> _updateVisitStatusAndShowReport() async {
    if (_isUpdating) return;
    setState(() => _isUpdating = true);

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => _ProgressDialog(
        title: _isArabic ? 'جاري التحديث' : 'Updating',
        message: _isArabic ? 'جاري إكمال الزيارة...' : 'Completing visit...',
      ),
    );

    try {
      await widget.onStatusChanged('Completed');

      if (mounted) {
        Navigator.pop(context);
        setState(() => _isUpdating = false);
        _showReportForm();
      }
    } catch (e) {
      if (mounted) {
        Navigator.pop(context);
        setState(() => _isUpdating = false);
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('${_isArabic ? 'خطأ في إكمال الزيارة' : 'Error completing visit'}: $e')));
      }
    }
  }

  void _showReportForm() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => ReportFormSheet(
        visit: _visit,
        onReportSubmitted: (report) {
          setState(() {
            _hasReport = true;
          });
        },
      ),
    );
  }

  void _showReportDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(_isArabic ? 'إرسال تقرير الزيارة' : 'Submit Visit Report'),
        content: Text(
          _isArabic ? 'هل ترغب في إرسال تقرير لهذه الزيارة الآن؟' : 'Would you like to submit a report for this visit now?',
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
            },
            child: Text(_isArabic ? 'لاحقاً' : 'Later'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(context).pop();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryBlue,
            ),
            child: Text(_isArabic ? 'إرسال التقرير' : 'Submit Report'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.75,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          Padding(
            padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    _visit.siteName,
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                _buildStatusBadge(_visit.status),
              ],
            ),
          ),

          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildInfoSection(
                    icon: Icons.qr_code,
                    iconColor: Colors.purple.shade400,
                    title: _isArabic ? 'رمز الموقع' : 'Site Code',
                    content:
                        _visit.siteCode.isNotEmpty ? _visit.siteCode : (_isArabic ? 'غير متوفر' : 'N/A'),
                  ),
                  const Divider(),

                  _buildInfoSection(
                    icon: Icons.location_on,
                    iconColor: Colors.red.shade400,
                    title: _isArabic ? 'الموقع' : 'Location',
                    content: _visit.locationString.isNotEmpty
                        ? _visit.locationString
                        : '${_visit.locality}, ${_visit.state}',
                  ),

                  if (_visit.latitude != null && _visit.longitude != null)
                    Padding(
                      padding: const EdgeInsets.only(
                        left: 44,
                        top: 4,
                        bottom: 8,
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.gps_fixed,
                            size: 14,
                            color: Colors.grey.shade600,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            'GPS: ${_visit.latitude!.toStringAsFixed(6)}, ${_visit.longitude!.toStringAsFixed(6)}',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                              fontStyle: FontStyle.italic,
                            ),
                          ),
                        ],
                      ),
                    ),
                  const Divider(),

                  if (_visit.additionalData?['hub_office'] != null) ...[
                    _buildInfoSection(
                      icon: Icons.business,
                      iconColor: Colors.teal.shade400,
                      title: _isArabic ? 'مكتب المحور' : 'Hub Office',
                      content: _visit.additionalData!['hub_office'].toString(),
                    ),
                    const Divider(),
                  ],

                  if (_visit.mainActivity.isNotEmpty) ...[
                    _buildInfoSection(
                      icon: Icons.work,
                      iconColor: Colors.orange.shade400,
                      title: _isArabic ? 'النشاط الرئيسي' : 'Main Activity',
                      content: _visit.mainActivity,
                    ),
                    const Divider(),
                  ],

                  if (_visit.activity.isNotEmpty) ...[
                    _buildInfoSection(
                      icon: Icons.task_alt,
                      iconColor: Colors.green.shade400,
                      title: _isArabic ? 'النشاط في الموقع' : 'Activity at Site',
                      content: _visit.activity,
                    ),
                    const Divider(),
                  ],

                  _buildInfoSection(
                    icon: Icons.calendar_today,
                    iconColor: Colors.blue.shade400,
                    title: _isArabic ? 'التاريخ المجدول' : 'Scheduled Date',
                    content: _visit.dueDate != null
                        ? '${_visit.dueDate!.day}/${_visit.dueDate!.month}/${_visit.dueDate!.year}'
                        : (_isArabic ? 'توقيت مرن' : 'Flexible Timing'),
                  ),
                  const Divider(),

                  if (_visit.additionalData?['monitoring_by'] != null) ...[
                    _buildInfoSection(
                      icon: Icons.visibility,
                      iconColor: Colors.indigo.shade400,
                      title: _isArabic ? 'المراقبة بواسطة' : 'Monitoring By',
                      content:
                          _visit.additionalData!['monitoring_by'].toString(),
                    ),
                    const Divider(),
                  ],

                  if (_visit.additionalData?['survey_tool'] != null) ...[
                    _buildInfoSection(
                      icon: Icons.analytics,
                      iconColor: Colors.cyan.shade400,
                      title: _isArabic ? 'أداة المسح' : 'Survey Tool',
                      content: _visit.additionalData!['survey_tool'].toString(),
                    ),
                    const Divider(),
                  ],

                  if (_visit.additionalData?['cp_name'] != null) ...[
                    _buildInfoSection(
                      icon: Icons.person_outline,
                      iconColor: Colors.brown.shade400,
                      title: _isArabic ? 'شريك التعاون' : 'Cooperation Partner',
                      content: _visit.additionalData!['cp_name'].toString(),
                    ),
                    const Divider(),
                  ],

                  if (_visit.enumeratorFee != null ||
                      _visit.transportFee != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.blue.shade50,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.blue.shade200),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(
                                Icons.attach_money,
                                color: Colors.blue.shade700,
                                size: 20,
                              ),
                              const SizedBox(width: 8),
                              Text(
                                _isArabic ? 'تفصيل الرسوم' : 'Fee Breakdown',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.blue.shade700,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          _buildFeeRow(
                            _isArabic ? 'إجمالي المبلغ' : 'Total Payment',
                            (_visit.enumeratorFee ?? 0) +
                                (_visit.transportFee ?? 0),
                            isBold: true,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],

                  if (_visit.notes.isNotEmpty) ...[
                    _buildInfoSection(
                      icon: Icons.notes,
                      iconColor: Colors.amber.shade700,
                      title: _isArabic ? 'ملاحظات' : 'Notes',
                      content: _visit.notes,
                    ),
                    const Divider(),
                  ],

                  _buildActionButtons(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    String statusText;

    switch (status.toLowerCase()) {
      case 'pending':
        badgeColor = Colors.grey.shade500;
        statusText = _isArabic ? 'معلق' : 'Pending';
        break;
      case 'available':
      case 'dispatched':
        badgeColor = Colors.blue.shade400;
        statusText = _isArabic ? 'مرسل' : 'Dispatched';
        break;
      case 'assigned':
      case 'accept':
      case 'accepted':
        badgeColor = Colors.blue.shade400;
        statusText = _isArabic ? 'مقبول' : 'Accepted';
        break;
      case 'claimed':
        badgeColor = Colors.orange.shade400;
        statusText = _isArabic ? 'محجوز - في انتظار القبول' : 'Claimed - Awaiting Acceptance';
        break;
      case 'in_progress':
      case 'ongoing':
        badgeColor = Colors.amber.shade700;
        statusText = _isArabic ? 'جارية' : 'Ongoing';
        break;
      case 'completed':
      case 'complete':
        badgeColor = Colors.green.shade500;
        statusText = _isArabic ? 'مكتملة' : 'Completed';
        break;
      case 'cancelled':
        badgeColor = Colors.red.shade400;
        statusText = _isArabic ? 'ملغاة' : 'Cancelled';
        break;
      case 'rejected':
        badgeColor = Colors.red.shade700;
        statusText = _isArabic ? 'مرفوضة' : 'Rejected';
        break;
      default:
        badgeColor = Colors.grey.shade500;
        statusText = status;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: badgeColor.withOpacity(0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: badgeColor, width: 1),
      ),
      child: Text(
        statusText,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: badgeColor,
        ),
      ),
    );
  }

  Widget _buildInfoSection({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String content,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: iconColor.withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: iconColor, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  content,
                  style: const TextStyle(
                    fontSize: 15,
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

  Widget _buildFeeRow(String label, double amount, {bool isBold = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 14,
            fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
          ),
        ),
        Text(
          '\$${amount.toStringAsFixed(2)}',
          style: TextStyle(
            fontSize: 14,
            fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
            color: Colors.blue.shade700,
          ),
        ),
      ],
    );
  }

  Widget _buildButton({
    required String label,
    required IconData icon,
    required Color color,
    required VoidCallback onPressed,
    bool filled = true,
  }) {
    if (filled) {
      return SizedBox(
        width: double.infinity,
        height: 48,
        child: ElevatedButton.icon(
          onPressed: onPressed,
          icon: Icon(icon, size: 20),
          label: Text(label),
          style: ElevatedButton.styleFrom(
            backgroundColor: color,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
      );
    }
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: OutlinedButton.icon(
        onPressed: onPressed,
        icon: Icon(icon, size: 20, color: color),
        label: Text(label, style: TextStyle(color: color)),
        style: OutlinedButton.styleFrom(
          side: BorderSide(color: color),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }

  String _getTimeRemainingText(DateTime claimedAt) {
    final elapsed = DateTime.now().difference(claimedAt);
    final remaining = const Duration(hours: 24) - elapsed;
    if (remaining.isNegative) {
      return _isArabic ? 'انتهت مهلة التأكيد' : 'Confirmation time expired';
    }
    final hours = remaining.inHours;
    final minutes = remaining.inMinutes % 60;
    return _isArabic
        ? 'متبقي $hours ساعة و $minutes دقيقة للتأكيد'
        : '$hours hours and $minutes minutes remaining to confirm';
  }

  Widget _buildActionButtons() {
    final currentUserId = Supabase.instance.client.auth.currentUser?.id;
    final status = _visit.status.toLowerCase();

    final List<Widget> prefixWidgets = [];
    final List<Widget> actionWidgets = [];

    final defaultButton = _buildButton(
      label: _isArabic ? 'تحديث الحالة' : 'Update Status',
      icon: Icons.update,
      color: AppColors.primaryBlue,
      onPressed: () {
        _updateVisitStatus('in_progress');
      },
    );

    if (currentUserId != null) {
      switch (status) {
        case 'dispatched':
        case 'available':
        case 'pending':
          final isClaimedByCurrentUser =
              _visit.claimedBy == currentUserId && currentUserId != null;

          if (isClaimedByCurrentUser) {
            debugPrint(
              '✅ Showing Accept button (site already claimed by user)',
            );
            actionWidgets.addAll([
              if (_visit.claimedAt != null)
                Container(
                  padding: const EdgeInsets.all(12),
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: Colors.orange.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.orange.shade300),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.access_time,
                        color: Colors.orange.shade700,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _isArabic ? 'مطلوب التأكيد' : 'Confirmation Required',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: Colors.orange.shade900,
                                fontSize: 13,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              _getTimeRemainingText(_visit.claimedAt!),
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.orange.shade800,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              AcceptAssignmentButton(
                siteEntryId: _visit.id,
                siteName: _visit.siteName,
                userProfile: widget.userProfile,
                siteVisit: widget.visit,
                onAcceptSuccess: () async {
                  setState(() {
                    _visit = _visit.copyWith(
                      acceptedBy: Supabase.instance.client.auth.currentUser?.id,
                      acceptedAt: DateTime.now(),
                      status: 'Accepted',
                    );
                  });
                  await Future.delayed(const Duration(milliseconds: 300));
                  await widget.onStatusChanged('Accepted');
                },
                onAcceptError: () {},
              ),
              const SizedBox(height: 12),
              _buildButton(
                label: _isArabic ? 'رفض' : 'Reject',
                icon: Icons.close,
                color: Colors.red,
                onPressed: _showRejectionDialog,
                filled: false,
              ),
            ]);
          } else {
            debugPrint('✅ Showing Claim/Accept buttons');
            actionWidgets.addAll([
              ClaimSiteButton(
                siteEntryId: _visit.id,
                siteName: _visit.siteName,
                userProfile: widget.userProfile,
                siteVisit: widget.visit,
                onClaimSuccess: () {
                  setState(() {
                    _visit = _visit.copyWith(
                      claimedBy: Supabase.instance.client.auth.currentUser?.id,
                      claimedAt: DateTime.now(),
                      status: 'Assigned',
                    );
                  });
                  widget.onStatusChanged('Assigned');
                },
                onClaimError: () {},
              ),
              const SizedBox(height: 8),
              AcceptAssignmentButton(
                siteEntryId: _visit.id,
                siteName: _visit.siteName,
                userProfile: widget.userProfile,
                siteVisit: widget.visit,
                onAcceptSuccess: () async {
                  setState(() {
                    _visit = _visit.copyWith(
                      acceptedBy: Supabase.instance.client.auth.currentUser?.id,
                      acceptedAt: DateTime.now(),
                      status: 'Accepted',
                    );
                  });
                  await Future.delayed(const Duration(milliseconds: 300));
                  await widget.onStatusChanged('Accepted');
                },
                onAcceptError: () {},
              ),
              const SizedBox(height: 12),
              _buildButton(
                label: _isArabic ? 'رفض' : 'Reject',
                icon: Icons.close,
                color: Colors.red,
                onPressed: _showRejectionDialog,
                filled: false,
              ),
            ]);
          }
          break;
        case 'assigned':
        case 'claimed':
          actionWidgets.addAll([
            if (_visit.claimedAt != null)
              Container(
                padding: const EdgeInsets.all(12),
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.orange.shade300),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.access_time,
                      color: Colors.orange.shade700,
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _isArabic ? 'مطلوب التأكيد' : 'Confirmation Required',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.orange.shade900,
                              fontSize: 13,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            _getTimeRemainingText(_visit.claimedAt!),
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.orange.shade800,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            AcceptAssignmentButton(
              siteEntryId: _visit.id,
              siteName: _visit.siteName,
              userProfile: widget.userProfile,
              siteVisit: widget.visit,
              onAcceptSuccess: () async {
                setState(() {
                  _visit = _visit.copyWith(
                    acceptedBy: Supabase.instance.client.auth.currentUser?.id,
                    acceptedAt: DateTime.now(),
                    status: 'Accepted',
                  );
                });
                await Future.delayed(const Duration(milliseconds: 300));
                await widget.onStatusChanged('Accepted');
              },
              onAcceptError: () {},
            ),
          ]);
          break;

        case 'accept':
        case 'accepted':
          actionWidgets.addAll([
            StartVisitButton(
              visit: _visit,
              onStartSuccess: () {
                setState(() {
                  _visit = _visit.copyWith(status: 'in_progress');
                });
                widget.onStatusChanged('in_progress');
              },
              onStartError: () {},
            ),
          ]);
          break;
        case 'ongoing':
        case 'in_progress':
          actionWidgets.addAll([
            CompleteVisitButton(
              visit: _visit,
              onCompleteSuccess: () {
                setState(() {
                  _visit = _visit.copyWith(status: 'completed');
                });
                widget.onStatusChanged('completed');
              },
              onCompleteError: () {},
            ),
          ]);
          break;
        case 'completed':
        case 'complete':
          actionWidgets.add(
            _buildButton(
              label: _hasReport
                  ? (_isArabic ? 'عرض التقرير' : 'View Report')
                  : (_isArabic ? 'إرسال التقرير' : 'Submit Report'),
              icon: _hasReport ? Icons.description : Icons.assignment,
              color: _hasReport ? Colors.grey : Colors.green,
              onPressed: () {
                if (_hasReport) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(_isArabic ? 'تم إرسال التقرير بالفعل' : 'Report already submitted')),
                  );
                } else {
                  _showReportForm();
                }
              },
              filled: !_hasReport,
            ),
          );
          break;
        default:
          actionWidgets.add(defaultButton);
          break;
      }
    }

    if (widget.onGetDirections != null) {
      if (actionWidgets.isNotEmpty) {
        actionWidgets.add(const SizedBox(height: 16));
      }
      actionWidgets.add(
        _buildButton(
          label: _isArabic ? 'الحصول على الاتجاهات' : 'Get Directions',
          icon: Icons.directions,
          color: Colors.blue,
          onPressed: widget.onGetDirections!,
          filled: false,
        ),
      );
    }

    return Column(children: [...prefixWidgets, ...actionWidgets]);
  }

  Future<void> _showRejectionDialog() async {
    final reasonController = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(_isArabic ? 'رفض الزيارة' : 'Reject Visit'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_isArabic ? 'يرجى تقديم سبب لرفض هذه الزيارة:' : 'Please provide a reason for rejecting this visit:'),
            const SizedBox(height: 16),
            TextField(
              controller: reasonController,
              decoration: InputDecoration(
                hintText: _isArabic ? 'سبب الرفض' : 'Reason for rejection',
                border: const OutlineInputBorder(),
              ),
              maxLines: 3,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(_isArabic ? 'إلغاء' : 'Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              if (reasonController.text.isNotEmpty) {
                Navigator.pop(context, reasonController.text);
              }
            },
            child: Text(_isArabic ? 'رفض' : 'Reject'),
          ),
        ],
      ),
    );

    if (reason != null && widget.onReject != null) {
      setState(() => _isUpdating = true);
      try {
        await widget.onReject!(reason);
        if (mounted) Navigator.pop(context);
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text('${_isArabic ? 'خطأ في رفض الزيارة' : 'Error rejecting visit'}: $e')));
        }
      } finally {
        if (mounted) setState(() => _isUpdating = false);
      }
    }
  }
}

class _ProgressDialog extends StatelessWidget {
  final String title;
  final String message;
  const _ProgressDialog({required this.title, required this.message});

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 16),
            Text(
              title,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              style: TextStyle(fontSize: 14, color: Colors.grey.shade700),
            ),
          ],
        ),
      ),
    );
  }
}
