// lib/screens/components/visit_details_sheet.dart

import 'package:flutter/material.dart';
import 'dart:async'; // For TimeoutException
import '../../models/site_visit.dart';
import '../../theme/app_colors.dart';
import 'package:geolocator/geolocator.dart';
import '../../services/staff_tracking_service.dart';
import '../../services/location_tracking_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../services/offline_data_service.dart';
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
  final Future<void> Function(String)? onReject; // New callback for rejection
  final bool isTrackingJourney;
  final bool isNearDestination;
  final VoidCallback? onArrived;
  final VoidCallback? onGetDirections;
  // New: whether the visit's report has already been submitted
  final bool reportSubmitted;
  // Callback to request opening the report submission form
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

  @override
  void initState() {
    super.initState();
    _visit = widget.visit;
    // If already completed and we didn't get an explicit flag, probe for report existence
    if (_visit.status.toLowerCase() == 'completed' && !widget.reportSubmitted) {
      _probeReportExists();
    }
  }

  Future<void> _probeReportExists() async {
    try {
      final supabase = Supabase.instance.client;
      // Try online first
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

      // Fallback to offline cache
      final offline = OfflineDataService();
      final cached = await offline.getCachedReports();
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

    // Show small progress dialog
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const _ProgressDialog(
        title: 'Ending visit',
        message: 'Capturing site location and stopping tracking...',
      ),
    );

    try {
      // 1) Get precise current location
      final hasService = await Geolocator.isLocationServiceEnabled();
      if (!hasService) {
        throw Exception('Location services are disabled');
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw Exception('Location permission not granted');
      }
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.best,
      );

      // 2) Persist actual site coordinates in dedicated table
      // Reuse StaffTrackingService API which writes to `site_locations`
      // Acquire Supabase client explicitly (web build needs direct import) and record site location
      final staffService = StaffTrackingService(Supabase.instance.client);
      final ok = await staffService.recordSiteLocation(
        siteId: _visit.id,
        position: position,
        notes: 'Captured at end of visit',
      );

      if (!ok) {
        throw Exception('Failed to save site location');
      }

      // Optional: verify row exists (depends on RLS policies)
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

      // 3) Stop ongoing user location tracking
      await LocationTrackingService().stopJourneyTracking();

      if (mounted) {
        Navigator.of(context).pop(); // Close progress dialog
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Site location saved and tracking stopped.'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        Navigator.of(context).pop(); // Close dialog
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to end visit: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isEndingVisit = false);
    }
  }

  void _updateVisitStatus(String newStatus) async {
    if (_isUpdating) return; // Guard against re-entry
    setState(() => _isUpdating = true);
    // Show a small progress dialog while updating
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const _ProgressDialog(
        title: 'Please wait',
        message: 'Updating visit status...',
      ),
    );

    try {
      bool shouldCloseSheet = false;
      // Ensure we don't hang forever if backend is slow
      await widget
          .onStatusChanged(newStatus)
          .timeout(const Duration(seconds: 20));

      // Update local state to reflect the change immediately
      if (mounted) {
        setState(() {
          _visit = _visit.copyWith(status: newStatus);
        });
      }

      // If we successfully marked as completed, close this bottom sheet so the parent can show the report form cleanly
      if (newStatus.toLowerCase() == 'completed') {
        shouldCloseSheet = true;
      }
    } on TimeoutException {
      // Inform and proceed to close the dialog anyway
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Updating took too long. Please check network and try again.',
            ),
            backgroundColor: Colors.orange,
          ),
        );
      }
    } catch (e) {
      // Surface error
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: const [
                Icon(Icons.error, color: Colors.white),
                SizedBox(width: 8),
                Expanded(child: Text('Failed to update visit status')),
              ],
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      // Always close the progress dialog if it's still open
      if (mounted) {
        try {
          Navigator.of(context, rootNavigator: true).pop();
        } catch (_) {
          // ignore if already closed
        }
        // If we marked completed, also close this sheet so the parent can present the report form without flicker
        try {
          // Using maybePop prevents exceptions if already closed
          Navigator.of(context).maybePop();
        } catch (_) {}
      }
      if (mounted) setState(() => _isUpdating = false);
    }
  }

  Future<void> _updateVisitStatusAndShowReport() async {
    // 1. Update status to Completed
    // We can't easily await _updateVisitStatus because it returns void.
    // But we can replicate its logic or just call it and hope for the best,
    // OR better, we can use the widget.onStatusChanged directly which returns Future<void>.

    if (_isUpdating) return;
    setState(() => _isUpdating = true);

    // Show progress
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const _ProgressDialog(
        title: 'Updating',
        message: 'Completing visit...',
      ),
    );

    try {
      // Call the parent callback directly to await it
      await widget.onStatusChanged('Completed');

      // Also stop tracking if needed (logic usually in parent, but let's be safe)
      // The parent _handleVisitStatusChanged handles stopTracking for 'Completed'.

      if (mounted) {
        Navigator.pop(context); // Close progress dialog
        setState(() => _isUpdating = false);

        // 2. Show Report Form immediately
        _showReportForm();
      }
    } catch (e) {
      if (mounted) {
        Navigator.pop(context); // Close progress dialog
        setState(() => _isUpdating = false);
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error completing visit: $e')));
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
          // Optionally close the details sheet too, or just let user see "View Report"
        },
      ),
    );
  }

  void _showReportDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Submit Visit Report'),
        content: const Text(
          'Would you like to submit a report for this visit now?',
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
            },
            child: const Text('Later'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(context).pop();
              // Navigate to report submission screen
              // TODO: Implement navigation to report screen
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryBlue,
            ),
            child: const Text('Submit Report'),
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
          // Handle and header
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

          // Visit title and status badge
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

          // Visit details
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Site Code & Location
                  _buildInfoSection(
                    icon: Icons.qr_code,
                    iconColor: Colors.purple.shade400,
                    title: 'Site Code',
                    content: _visit.siteCode.isNotEmpty
                        ? _visit.siteCode
                        : 'N/A',
                  ),
                  const Divider(),

                  // Address section
                  _buildInfoSection(
                    icon: Icons.location_on,
                    iconColor: Colors.red.shade400,
                    title: 'Location',
                    content: _visit.locationString.isNotEmpty
                        ? _visit.locationString
                        : '${_visit.locality}, ${_visit.state}',
                  ),

                  // GPS Coordinates (if available)
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

                  // Hub Office
                  if (_visit.additionalData?['hub_office'] != null) ...[
                    _buildInfoSection(
                      icon: Icons.business,
                      iconColor: Colors.teal.shade400,
                      title: 'Hub Office',
                      content: _visit.additionalData!['hub_office'].toString(),
                    ),
                    const Divider(),
                  ],

                  // Main Activity
                  if (_visit.mainActivity.isNotEmpty) ...[
                    _buildInfoSection(
                      icon: Icons.work,
                      iconColor: Colors.orange.shade400,
                      title: 'Main Activity',
                      content: _visit.mainActivity,
                    ),
                    const Divider(),
                  ],

                  // Activity at Site
                  if (_visit.activity.isNotEmpty) ...[
                    _buildInfoSection(
                      icon: Icons.task_alt,
                      iconColor: Colors.green.shade400,
                      title: 'Activity at Site',
                      content: _visit.activity,
                    ),
                    const Divider(),
                  ],

                  // Date/time section
                  _buildInfoSection(
                    icon: Icons.calendar_today,
                    iconColor: Colors.blue.shade400,
                    title: 'Scheduled Date',
                    content: _visit.dueDate != null
                        ? '${_visit.dueDate!.day}/${_visit.dueDate!.month}/${_visit.dueDate!.year}'
                        : 'Flexible Timing',
                  ),
                  const Divider(),

                  // Monitoring Information
                  if (_visit.additionalData?['monitoring_by'] != null) ...[
                    _buildInfoSection(
                      icon: Icons.visibility,
                      iconColor: Colors.indigo.shade400,
                      title: 'Monitoring By',
                      content: _visit.additionalData!['monitoring_by']
                          .toString(),
                    ),
                    const Divider(),
                  ],

                  // Survey Tool
                  if (_visit.additionalData?['survey_tool'] != null) ...[
                    _buildInfoSection(
                      icon: Icons.analytics,
                      iconColor: Colors.cyan.shade400,
                      title: 'Survey Tool',
                      content: _visit.additionalData!['survey_tool'].toString(),
                    ),
                    const Divider(),
                  ],

                  // CP Name (Cooperation Partner)
                  if (_visit.additionalData?['cp_name'] != null) ...[
                    _buildInfoSection(
                      icon: Icons.person_outline,
                      iconColor: Colors.brown.shade400,
                      title: 'Cooperation Partner',
                      content: _visit.additionalData!['cp_name'].toString(),
                    ),
                    const Divider(),
                  ],

                  // Fee Breakdown
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
                                'Fee Breakdown',
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
                            'Total Payment',
                            (_visit.enumeratorFee ?? 0) +
                                (_visit.transportFee ?? 0),
                            isBold: true,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],

                  // Notes section
                  if (_visit.notes.isNotEmpty) ...[
                    _buildInfoSection(
                      icon: Icons.notes,
                      iconColor: Colors.amber.shade700,
                      title: 'Notes',
                      content: _visit.notes,
                    ),
                    const Divider(),
                  ],

                  // Action buttons based on current status
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
        statusText = 'Pending';
        break;
      case 'available':
      case 'dispatched': // New status
        badgeColor = Colors.blue.shade400;
        statusText = 'Dispatched';
        break;
      case 'assigned':
      case 'accept': // New status
      case 'accepted':
        badgeColor = Colors.blue.shade400;
        statusText = 'Accepted';
        break;
      case 'claimed':
        badgeColor = Colors.orange.shade400;
        statusText = 'Claimed - Awaiting Acceptance';
        break;
      case 'in_progress':
      case 'ongoing': // New status
        badgeColor = Colors.amber.shade700;
        statusText = 'Ongoing';
        break;
      case 'completed':
      case 'complete': // New status
        badgeColor = Colors.green.shade500;
        statusText = 'Completed';
        break;
      case 'cancelled':
        badgeColor = Colors.red.shade400;
        statusText = 'Cancelled';
        break;
      case 'rejected':
        badgeColor = Colors.red.shade700;
        statusText = 'Rejected';
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
        style: TextStyle(color: badgeColor, fontWeight: FontWeight.bold),
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
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: iconColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: iconColor, size: 20),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: Colors.grey.shade600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  content,
                  style: const TextStyle(
                    fontSize: 16,
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
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: isBold ? 16 : 14,
              fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
              color: Colors.grey.shade700,
            ),
          ),
          Text(
            amount.toStringAsFixed(2),
            style: TextStyle(
              fontSize: isBold ? 16 : 14,
              fontWeight: isBold ? FontWeight.bold : FontWeight.w500,
              color: isBold ? Colors.blue.shade700 : Colors.grey.shade800,
            ),
          ),
        ],
      ),
    );
  }

  String _getTimeRemainingText(DateTime claimedAt) {
    final deadline = claimedAt.add(const Duration(days: 2));
    final now = DateTime.now();
    final remaining = deadline.difference(now);

    if (remaining.isNegative) {
      return 'Deadline passed - site may be auto-released';
    }

    if (remaining.inHours < 24) {
      return 'Confirm within ${remaining.inHours} hours or site will be released';
    }

    final days = remaining.inDays;
    final hours = remaining.inHours % 24;
    return 'Confirm within $days day(s) $hours hour(s) to keep this assignment';
  }

  String _formatDateTime(DateTime dateTime) {
    final day = dateTime.day.toString().padLeft(2, '0');
    final month = dateTime.month.toString().padLeft(2, '0');
    final year = dateTime.year;
    final hour = dateTime.hour.toString().padLeft(2, '0');
    final minute = dateTime.minute.toString().padLeft(2, '0');
    return '$day/$month/$year at $hour:$minute';
  }

  Widget _buildButton({
    required String label,
    required IconData icon,
    required Color color,
    required VoidCallback onPressed,
    bool filled = true,
  }) {
    return SizedBox(
      width: double.infinity,
      height: 50,
      child: filled
          ? ElevatedButton.icon(
              onPressed: onPressed,
              icon: Icon(icon),
              label: Text(label),
              style: ElevatedButton.styleFrom(
                backgroundColor: color,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            )
          : OutlinedButton.icon(
              onPressed: onPressed,
              icon: Icon(icon, color: color),
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

  Widget _buildActionButtons() {
    // IMPORTANT: Journey tracking must not hide the workflow buttons.
    // We show tracking-related UI as a prefix, then always show status actions.
    final prefixWidgets = <Widget>[];

    if (widget.isTrackingJourney) {
      if (widget.isNearDestination && widget.onArrived != null) {
        prefixWidgets.addAll([
          _buildButton(
            label: 'Arrived at Destination',
            icon: Icons.location_on,
            color: AppColors.primaryOrange,
            onPressed: widget.onArrived!,
          ),
          const SizedBox(height: 8),
          Text(
            'You are within 50 meters of the destination',
            style: TextStyle(
              fontSize: 12,
              color: Colors.grey.shade600,
              fontStyle: FontStyle.italic,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
        ]);
      } else {
        prefixWidgets.addAll([
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.primaryOrange.withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: AppColors.primaryOrange.withOpacity(0.3),
              ),
            ),
            child: Row(
              children: [
                Icon(Icons.navigation, color: AppColors.primaryOrange),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Journey in Progress',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: AppColors.textDark,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Your route is being tracked. Keep going and complete the workflow below.',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ]);
      }
    }

    // Default button if status doesn't match any case
    final defaultButton = _buildButton(
      label: 'View Details',
      icon: Icons.info_outline,
      color: Colors.grey,
      onPressed: () {},
      filled: false,
    );

    // Different buttons based on current status
    final visitStatus = (_visit.status ?? '').toString().trim().toLowerCase();
    final currentUserId = Supabase.instance.client.auth.currentUser?.id;
    final isAccepted =
        _visit.acceptedBy != null && _visit.acceptedBy == currentUserId;
    final isCompleted = visitStatus == 'completed';
    final isInProgress = visitStatus == 'in_progress';

    debugPrint(
      '🔍 Visit Details - Status: $visitStatus, claimedBy: ${_visit.claimedBy}, acceptedBy: ${_visit.acceptedBy}, isAccepted: $isAccepted, isCompleted: $isCompleted, currentUser: $currentUserId',
    );

    final actionWidgets = <Widget>[];

    // If completed, show completed state - no action buttons needed
    if (isCompleted) {
      debugPrint('✅ Visit is completed - showing completion message');
      actionWidgets.add(
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.success.withOpacity(0.1),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.success.withOpacity(0.3)),
          ),
          child: Row(
            children: [
              Icon(Icons.check_circle, color: AppColors.success, size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Visit Completed',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: AppColors.success,
                      ),
                    ),
                    if (_visit.visitCompletedAt != null)
                      Text(
                        'Completed on ${_formatDateTime(_visit.visitCompletedAt!)}',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade600,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }
    // If in progress, show the timer overlay message (actual timer is in ActiveVisitOverlay)
    else if (isInProgress) {
      debugPrint('✅ Visit is in progress - showing in-progress message');
      actionWidgets.add(
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.primaryOrange.withOpacity(0.1),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.primaryOrange.withOpacity(0.3)),
          ),
          child: Row(
            children: [
              Icon(Icons.timer, color: AppColors.primaryOrange, size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Visit in progress - use the timer overlay to complete',
                  style: TextStyle(
                    fontSize: 14,
                    color: AppColors.primaryOrange,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }
    // If accepted but not started or completed, show Start Visit button
    else if (isAccepted) {
      debugPrint('✅ Showing Start Visit button (already accepted)');
      actionWidgets.add(
        StartVisitButton(
          visit: _visit,
          onStartSuccess: () {
            setState(() {
              _visit = _visit.copyWith(status: 'in_progress');
            });
            widget.onStatusChanged('in_progress');
          },
          onStartError: () {
            // Error handling is done in the button
          },
        ),
      );
    } else {
      switch (visitStatus) {
        case 'dispatched':
        case 'available':
        case 'pending': // Add more status variants
          final isClaimedByCurrentUser =
              _visit.claimedBy == currentUserId && currentUserId != null;

          // If already claimed by current user, show Accept button
          // Otherwise show Claim button
          if (isClaimedByCurrentUser) {
            // PHASE 2: Accept assignment with cost acknowledgment
            debugPrint(
              '✅ Showing Accept button (site already claimed by user)',
            );
            actionWidgets.addAll([
              // Time limit warning for claimed sites
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
                              'Confirmation Required',
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
                onAcceptError: () {
                  // Error handling is done in the button
                },
              ),
              const SizedBox(height: 12),
              _buildButton(
                label: 'Reject',
                icon: Icons.close,
                color: Colors.red,
                onPressed: _showRejectionDialog,
                filled: false,
              ),
            ]);
          } else {
            // PHASE 1: Claim the site first (or Accept directly if no claim required)
            debugPrint('✅ Showing Claim/Accept buttons');
            actionWidgets.addAll([
              // For now, show BOTH Claim and Accept buttons to ensure user can proceed
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
                onClaimError: () {
                  // Error handling is done in the button
                },
              ),
              const SizedBox(height: 8),
              // Also show Accept button as backup
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
                  // Trigger reload and close sheet after short delay
                  await Future.delayed(const Duration(milliseconds: 300));
                  await widget.onStatusChanged('Accepted');
                },
                onAcceptError: () {
                  // Error handling is done in the button
                },
              ),
              const SizedBox(height: 12),
              _buildButton(
                label: 'Reject',
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
          // PHASE 2: Accept assignment with cost acknowledgment
          // Site has been claimed, now show Accept Assignment button
          actionWidgets.addAll([
            // Time limit warning for claimed sites
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
                            'Confirmation Required',
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
              onAcceptError: () {
                // Error handling is done in the button
              },
            ),
          ]);
          break;

        case 'accept':
        case 'accepted':
          // PHASE 3: Start the visit
          // Assignment accepted, show Start Visit button
          actionWidgets.addAll([
            StartVisitButton(
              visit: _visit,
              onStartSuccess: () {
                setState(() {
                  _visit = _visit.copyWith(status: 'in_progress');
                });
                widget.onStatusChanged('in_progress');
              },
              onStartError: () {
                // Error handling is done in the button
              },
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
              onCompleteError: () {
                // Error handling is done in the button
              },
            ),
          ]);
          break;
        case 'completed':
        case 'complete':
          actionWidgets.add(
            _buildButton(
              label: _hasReport ? 'View Report' : 'Submit Report',
              icon: _hasReport ? Icons.description : Icons.assignment,
              color: _hasReport ? Colors.grey : Colors.green,
              onPressed: () {
                if (_hasReport) {
                  // View report logic (maybe open PDF or details)
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Report already submitted')),
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

    // Always append Get Directions at the bottom (if provided)
    if (widget.onGetDirections != null) {
      if (actionWidgets.isNotEmpty) {
        actionWidgets.add(const SizedBox(height: 16));
      }
      actionWidgets.add(
        _buildButton(
          label: 'Get Directions',
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
        title: const Text('Reject Visit'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Please provide a reason for rejecting this visit:'),
            const SizedBox(height: 16),
            TextField(
              controller: reasonController,
              decoration: const InputDecoration(
                hintText: 'Reason for rejection',
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              if (reasonController.text.isNotEmpty) {
                Navigator.pop(context, reasonController.text);
              }
            },
            child: const Text('Reject'),
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
          ).showSnackBar(SnackBar(content: Text('Error rejecting visit: $e')));
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
