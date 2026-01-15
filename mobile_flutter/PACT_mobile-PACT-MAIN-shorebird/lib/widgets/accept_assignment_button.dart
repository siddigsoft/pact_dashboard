import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/app_widgets.dart';
import '../providers/offline_provider.dart';
import '../models/site_visit.dart';
import '../models/pact_user_profile.dart';
import '../utils/site_visit_constraints.dart';

class AcceptAssignmentButton extends ConsumerStatefulWidget {
  final String siteEntryId;
  final String siteName;
  final PACTUserProfile? userProfile;
  final SiteVisit? siteVisit;
  final VoidCallback? onAcceptSuccess;
  final VoidCallback? onAcceptError;

  const AcceptAssignmentButton({
    super.key,
    required this.siteEntryId,
    required this.siteName,
    this.userProfile,
    this.siteVisit,
    this.onAcceptSuccess,
    this.onAcceptError,
  });

  @override
  ConsumerState<AcceptAssignmentButton> createState() =>
      _AcceptAssignmentButtonState();
}

class _AcceptAssignmentButtonState
    extends ConsumerState<AcceptAssignmentButton> {
  bool _isLoading = false;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
          width: double.infinity,
          height: 50,
          child: ElevatedButton.icon(
            onPressed: _isLoading ? null : _acceptAssignment,
            icon: _isLoading
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                    ),
                  )
                : const Icon(Icons.check_circle_outline),
            label: const Text('Accept Assignment'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.success,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
          ),
        )
        .animate(target: _isLoading ? 0 : 1)
        .scale(duration: const Duration(milliseconds: 300));
  }

  Future<void> _acceptAssignment() async {
    if (_isLoading) return; // Prevent double-click

    // Check constraints first
    if (widget.userProfile != null && widget.siteVisit != null) {
      final constraintCheck = SiteVisitConstraints.canAcceptSite(
        widget.siteVisit!,
        widget.userProfile!,
      );
      if (!constraintCheck.allowed) {
        widget.onAcceptError?.call();
        if (mounted) {
          AppSnackBar.show(
            context,
            message: constraintCheck.reason ?? 'Cannot accept this assignment',
            type: SnackBarType.error,
          );
        }
        return;
      }
    }

    // First, show cost acknowledgment dialog
    final confirmed = await _showCostAcknowledgmentDialog();

    if (!confirmed) {
      return; // User declined
    }

    setState(() {
      _isLoading = true;
    });

    try {
      // Check connectivity
      final connectivity = await Connectivity().checkConnectivity();
      final hasConnection = connectivity != ConnectivityResult.none;

      if (hasConnection) {
        await _acceptAssignmentOnline();
      } else {
        await _acceptAssignmentOffline();
      }

      widget.onAcceptSuccess?.call();

      if (mounted) {
        AppSnackBar.show(
          context,
          message: hasConnection
              ? 'Assignment accepted successfully! You can now start the visit.'
              : 'Assignment accepted offline - will sync when online',
          type: SnackBarType.success,
        );
      }
    } catch (e) {
      debugPrint('Error accepting assignment: $e');

      widget.onAcceptError?.call();

      if (mounted) {
        AppSnackBar.show(
          context,
          message: 'Failed to accept assignment. Please try again.',
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

  Future<bool> _showCostAcknowledgmentDialog() async {
    // Fetch site entry details to get fees
    final supabase = Supabase.instance.client;
    Map<String, dynamic>? siteData;

    try {
      final response = await supabase
          .from('mmp_site_entries')
          .select('enumerator_fee, transport_fee, cost, site_name')
          .eq('id', widget.siteEntryId)
          .single();
      siteData = response;
    } catch (e) {
      debugPrint('Error fetching site fees: $e');
    }

    if (!mounted) return false;

    final enumeratorFee = siteData?['enumerator_fee'] ?? 0.0;
    final transportFee = siteData?['transport_fee'] ?? 0.0;
    final totalCost =
        (enumeratorFee is num ? enumeratorFee.toDouble() : 0.0) +
        (transportFee is num ? transportFee.toDouble() : 0.0);

    return await showDialog<bool>(
          context: context,
          barrierDismissible: false,
          builder: (BuildContext context) {
            return AlertDialog(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              title: Row(
                children: [
                  Icon(Icons.attach_money, color: AppColors.primaryBlue),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'Review & Confirm Costs',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Please review the approved budget for this site visit:',
                    style: TextStyle(color: Colors.grey.shade700),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.blue.shade50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.blue.shade200),
                    ),
                    child: Column(
                      children: [
                        _buildFeeRow('Total Payment', totalCost, isBold: true),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.amber.shade50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.amber.shade300),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.info_outline,
                          size: 18,
                          color: Colors.amber.shade800,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'You must confirm within 2 days or this site will be auto-released.',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.amber.shade900,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('Decline'),
                ),
                ElevatedButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.success,
                    foregroundColor: Colors.white,
                  ),
                  child: const Text('Accept & Acknowledge'),
                ),
              ],
            );
          },
        ) ??
        false;
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
              fontSize: isBold ? 15 : 13,
              fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
              color: isBold ? AppColors.textDark : Colors.grey.shade700,
            ),
          ),
          Text(
            amount.toStringAsFixed(2),
            style: TextStyle(
              fontSize: isBold ? 15 : 13,
              fontWeight: isBold ? FontWeight.bold : FontWeight.w600,
              color: isBold ? AppColors.primaryBlue : Colors.grey.shade800,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _acceptAssignmentOnline() async {
    final supabase = Supabase.instance.client;
    final userId = supabase.auth.currentUser?.id;

    if (userId == null) {
      throw Exception('User not authenticated');
    }

    // Update site entry to mark as accepted by this user
    await supabase
        .from('mmp_site_entries')
        .update({
          'accepted_by': userId,
          'accepted_at': DateTime.now().toIso8601String(),
          'status': 'Accepted',
          'updated_at': DateTime.now().toIso8601String(),
        })
        .eq('id', widget.siteEntryId)
        .eq('claimed_by', userId); // Ensure only the claimer can accept

    debugPrint(
      '✅ Assignment accepted successfully for site: ${widget.siteEntryId}',
    );
  }

  Future<void> _acceptAssignmentOffline() async {
    // Queue for offline sync
    await ref.read(acceptAssignmentOfflineProvider(widget.siteEntryId).future);
  }
}
