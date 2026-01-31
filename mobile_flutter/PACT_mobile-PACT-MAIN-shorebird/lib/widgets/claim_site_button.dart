import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/app_widgets.dart';
import '../providers/offline_provider.dart';
import '../models/pact_user_profile.dart';
import '../models/site_visit.dart';
import '../utils/site_visit_constraints.dart';
import '../utils/geo_distance.dart';
import '../utils/confirmation_deadlines.dart';
import '../services/claim_fee_service.dart';
import '../services/notification_trigger_service.dart';

class ClaimSiteButton extends ConsumerStatefulWidget {
  final String siteEntryId;
  final String siteName;
  final PACTUserProfile? userProfile;
  final SiteVisit? siteVisit;
  final String? scheduledDate;
  final VoidCallback? onClaimSuccess;
  final VoidCallback? onClaimError;

  const ClaimSiteButton({
    super.key,
    required this.siteEntryId,
    required this.siteName,
    this.userProfile,
    this.siteVisit,
    this.scheduledDate,
    this.onClaimSuccess,
    this.onClaimError,
  });

  @override
  ConsumerState<ClaimSiteButton> createState() => _ClaimSiteButtonState();
}

class _ClaimSiteButtonState extends ConsumerState<ClaimSiteButton> {
  bool _isLoading = false;
  bool _isClaimed = false;
  bool _isCalculatingFee = false;
  ClaimFeeBreakdown? _feeBreakdown;
  final ClaimFeeService _feeService = ClaimFeeService();

  bool get _isFieldWorker {
    final role = widget.userProfile?.role.toLowerCase() ?? '';
    return role == 'datacollector' || 
           role == 'data_collector' || 
           role == 'coordinator';
  }

  bool get _canSeeBreakdown => !_isFieldWorker;

  @override
  Widget build(BuildContext context) {
    return ElevatedButton.icon(
      onPressed: _isLoading || _isClaimed || _isCalculatingFee 
          ? null 
          : _handleClaimInitiate,
      icon: _isLoading || _isCalculatingFee
          ? const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
              ),
            )
          : Icon(_isClaimed ? Icons.check_circle : Icons.add_task),
      label: Text(_getButtonText()),
      style: ElevatedButton.styleFrom(
        backgroundColor: _isClaimed ? AppColors.success : AppColors.primary,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      ),
    ).animate(target: _isClaimed ? 1 : 0)
        .scale(duration: const Duration(milliseconds: 300));
  }

  String _getButtonText() {
    if (_isCalculatingFee) return 'Calculating...';
    if (_isLoading) return 'Claiming...';
    if (_isClaimed) return 'Claimed';
    return 'Claim Site';
  }

  Future<void> _handleClaimInitiate() async {
    if (widget.userProfile == null || widget.siteVisit == null) {
      _showError('Unable to verify claim eligibility');
      return;
    }

    final constraintCheck = await SiteVisitConstraints.canClaimSiteWithGPS(
      widget.siteVisit!,
      widget.userProfile!,
    );

    if (!constraintCheck.allowed) {
      widget.onClaimError?.call();
      if (mounted) {
        AppSnackBar.show(
          context,
          message: constraintCheck.reason ?? 'Cannot claim this site',
          type: SnackBarType.error,
        );
      }
      return;
    }

    setState(() {
      _isCalculatingFee = true;
    });

    try {
      final supabase = Supabase.instance.client;
      final userId = supabase.auth.currentUser?.id;

      if (userId == null) {
        throw Exception('User not authenticated');
      }

      final feeBreakdown = await _feeService.calculateFeeForClaim(
        widget.siteEntryId,
        userId,
      );

      if (feeBreakdown == null) {
        _showError('Could not calculate fees. Please try again.');
        return;
      }

      setState(() {
        _feeBreakdown = feeBreakdown;
        _isCalculatingFee = false;
      });

      if (!mounted) return;
      _showFeeConfirmationDialog(feeBreakdown);
    } catch (e) {
      setState(() {
        _isCalculatingFee = false;
      });
      _showError('Error calculating fees: ${e.toString()}');
    }
  }

  void _showFeeConfirmationDialog(ClaimFeeBreakdown breakdown) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            Icon(Icons.assignment_turned_in, color: AppColors.primary),
            const SizedBox(width: 8),
            const Expanded(
              child: Text(
                'Confirm Site Claim',
                style: TextStyle(fontSize: 18),
              ),
            ),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.siteName,
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    if (widget.siteVisit?.state != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        '${widget.siteVisit!.state} - ${widget.siteVisit!.locality}',
                        style: TextStyle(
                          color: Colors.grey.shade600,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Payment Breakdown',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 8),
              _buildFeeRow(
                Icons.person,
                'Enumerator Fee',
                breakdown.formattedEnumeratorFee,
                breakdown.feeSource == 'classification'
                    ? 'Based on your classification'
                    : 'Default rate',
              ),
              const SizedBox(height: 8),
              _buildFeeRow(
                Icons.directions_car,
                'Transport Budget',
                breakdown.formattedTransportBudget,
                null,
              ),
              const Divider(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Total Payout',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.success.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      breakdown.formattedTotalPayout,
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 18,
                        color: AppColors.success,
                      ),
                    ),
                  ),
                ],
              ),
              if (breakdown.classificationLevel != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.blue.shade50,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.verified, size: 16, color: Colors.blue.shade700),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Classification: ${breakdown.classificationLevel}',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.blue.shade700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: Colors.orange.shade200),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.info_outline, size: 18, color: Colors.orange.shade700),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'By claiming this site, you commit to completing the visit. '
                        'Failure to confirm may result in auto-release.',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.orange.shade800,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton.icon(
            onPressed: () {
              Navigator.of(context).pop();
              _claimSite(breakdown);
            },
            icon: const Icon(Icons.check),
            label: const Text('Confirm Claim'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFeeRow(
    IconData icon,
    String label,
    String value,
    String? subtitle,
  ) {
    return Row(
      children: [
        Icon(icon, size: 20, color: Colors.grey.shade600),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(fontSize: 14)),
              if (subtitle != null)
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.grey.shade500,
                  ),
                ),
            ],
          ),
        ),
        Text(
          value,
          style: const TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 14,
          ),
        ),
      ],
    );
  }

  Future<void> _claimSite(ClaimFeeBreakdown breakdown) async {
    setState(() {
      _isLoading = true;
    });

    try {
      final connectivity = await Connectivity().checkConnectivity();
      final hasConnection = connectivity != ConnectivityResult.none;

      if (hasConnection) {
        await _claimSiteOnline(breakdown);
      } else {
        await _claimSiteOffline();
      }

      setState(() {
        _isClaimed = true;
      });

      widget.onClaimSuccess?.call();

      if (mounted) {
        final message = _isFieldWorker
            ? 'Site claimed! Total payout: ${breakdown.formattedTotalPayout}'
            : 'Site claimed! Fee: ${breakdown.formattedEnumeratorFee} + Transport: ${breakdown.formattedTransportBudget} = ${breakdown.formattedTotalPayout}';

        AppSnackBar.show(
          context,
          message: hasConnection
              ? message
              : 'Site claimed offline - will sync when online',
          type: SnackBarType.success,
        );
      }
    } catch (e) {
      debugPrint('Error claiming site: $e');
      widget.onClaimError?.call();

      if (mounted) {
        AppSnackBar.show(
          context,
          message: _getErrorMessage(e.toString()),
          type: SnackBarType.error,
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _claimSiteOnline(ClaimFeeBreakdown breakdown) async {
    final supabase = Supabase.instance.client;
    final userId = supabase.auth.currentUser?.id;

    if (userId == null) {
      throw Exception('User not authenticated');
    }

    final response = await supabase.rpc(
      'claim_site_visit',
      params: {
        'p_site_id': widget.siteEntryId,
        'p_user_id': userId,
        'p_enumerator_fee': breakdown.enumeratorFee,
        'p_total_cost': breakdown.totalPayout,
        'p_classification_level': breakdown.classificationLevel,
        'p_role_scope': breakdown.roleScope,
        'p_fee_source': breakdown.feeSource,
      },
    );

    if (response == null) {
      throw Exception('Failed to claim site - unexpected response from server');
    }

    final result = response as Map<String, dynamic>;

    if (result['success'] != true) {
      throw Exception(result['message'] ?? 'Failed to claim site');
    }

    await _setConfirmationDeadlines();

    final notificationService = NotificationTriggerService();
    
    await notificationService.siteAssigned(
      userId,
      widget.siteName,
      widget.siteEntryId,
      enumeratorFee: breakdown.enumeratorFee,
      transportFee: breakdown.transportBudget,
    );

    if (widget.userProfile != null) {
      await notificationService.siteClaimNotification(
        userId,
        widget.userProfile!.fullName,
        widget.userProfile!.role,
        widget.siteName,
        widget.siteEntryId,
        widget.userProfile!.hubId,
        null, // projectId
      );
    }

    debugPrint('Site claimed successfully: ${result['site_name']}');
    debugPrint(
      'Fee breakdown: ${result['enumerator_fee']} + ${result['transport_fee']} = ${result['total_payout']} SDG',
    );
  }

  Future<void> _setConfirmationDeadlines() async {
    try {
      DateTime? visitDate;
      
      if (widget.scheduledDate != null) {
        visitDate = DateTime.tryParse(widget.scheduledDate!);
      }

      if (visitDate == null && widget.siteVisit?.scheduledDate != null) {
        visitDate = DateTime.tryParse(widget.siteVisit!.scheduledDate!);
      }

      if (visitDate == null) {
        final supabase = Supabase.instance.client;
        final siteData = await supabase
            .from('site_visits')
            .select('due_date, visit_data')
            .eq('id', widget.siteEntryId)
            .maybeSingle();

        if (siteData != null) {
          final dueDate = siteData['due_date'] as String?;
          final visitDataRaw = siteData['visit_data'];
          if (dueDate != null) {
            visitDate = DateTime.tryParse(dueDate);
          } else if (visitDataRaw is Map && visitDataRaw['scheduledDate'] != null) {
            visitDate = DateTime.tryParse(visitDataRaw['scheduledDate'] as String);
          }
        }
      }

      if (visitDate != null) {
        final deadlines = await ConfirmationDeadlineUtils.calculateConfirmationDeadlinesAsync(visitDate);

        final supabase = Supabase.instance.client;
        
        // Try to update mmp_site_entries first (main table for site visits)
        final currentMmpData = await supabase
            .from('mmp_site_entries')
            .select('additional_data')
            .eq('id', widget.siteEntryId)
            .maybeSingle();

        if (currentMmpData != null) {
          final existingAdditionalData = (currentMmpData['additional_data'] as Map<String, dynamic>?) ?? {};

          final updatedAdditionalData = {
            ...existingAdditionalData,
            ...deadlines.toJson(),
          };

          await supabase
              .from('mmp_site_entries')
              .update({
                'additional_data': updatedAdditionalData,
                'updated_at': DateTime.now().toIso8601String(),
              })
              .eq('id', widget.siteEntryId);

          debugPrint('Confirmation deadlines set in mmp_site_entries: ${deadlines.toJson()}');
        } else {
          // Fallback to site_visits table
          final currentData = await supabase
              .from('site_visits')
              .select('visit_data')
              .eq('id', widget.siteEntryId)
              .maybeSingle();

          final existingVisitData = (currentData?['visit_data'] as Map<String, dynamic>?) ?? {};

          final updatedVisitData = {
            ...existingVisitData,
            ...deadlines.toJson(),
          };

          await supabase
              .from('site_visits')
              .update({
                'visit_data': updatedVisitData,
                'updated_at': DateTime.now().toIso8601String(),
              })
              .eq('id', widget.siteEntryId);

          debugPrint('Confirmation deadlines set in site_visits: ${deadlines.toJson()}');
        }
      }
    } catch (e) {
      debugPrint('Error setting confirmation deadlines: $e');
    }
  }

  Future<void> _claimSiteOffline() async {
    await ref.read(claimSiteOfflineProvider(widget.siteEntryId).future);
  }

  void _showError(String message) {
    if (mounted) {
      AppSnackBar.show(
        context,
        message: message,
        type: SnackBarType.error,
      );
    }
  }

  String _getErrorMessage(String error) {
    if (error.contains('already claimed') || error.contains('ALREADY_CLAIMED')) {
      return 'Site already claimed by another user';
    } else if (error.contains('not available') || error.contains('INVALID_STATUS')) {
      return 'Site is not available for claiming';
    } else if (error.contains('in progress') || error.contains('CLAIM_IN_PROGRESS')) {
      return 'Another claim is in progress';
    } else if (error.contains('proximity') || error.contains('km away')) {
      return error;
    } else if (error.contains('GPS') || error.contains('location')) {
      return error;
    } else {
      return 'Failed to claim site. Please try again.';
    }
  }
}
