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

class ClaimSiteButton extends ConsumerStatefulWidget {
  final String siteEntryId;
  final String siteName;
  final PACTUserProfile? userProfile;
  final SiteVisit? siteVisit;
  final VoidCallback? onClaimSuccess;
  final VoidCallback? onClaimError;

  const ClaimSiteButton({
    super.key,
    required this.siteEntryId,
    required this.siteName,
    this.userProfile,
    this.siteVisit,
    this.onClaimSuccess,
    this.onClaimError,
  });

  @override
  ConsumerState<ClaimSiteButton> createState() => _ClaimSiteButtonState();
}

class _ClaimSiteButtonState extends ConsumerState<ClaimSiteButton> {
  bool _isLoading = false;
  bool _isClaimed = false;

  @override
  Widget build(BuildContext context) {
    return ElevatedButton.icon(
          onPressed: _isLoading || _isClaimed ? null : _claimSite,
          icon: _isLoading
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
        )
        .animate(target: _isClaimed ? 1 : 0)
        .scale(duration: const Duration(milliseconds: 300));
  }

  String _getButtonText() {
    if (_isLoading) return 'Claiming...';
    if (_isClaimed) return 'Claimed';
    return 'Claim Site';
  }

  Future<void> _claimSite() async {
    // Check constraints first
    if (widget.userProfile != null && widget.siteVisit != null) {
      final constraintCheck = SiteVisitConstraints.canClaimSite(
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
    }

    setState(() {
      _isLoading = true;
    });

    try {
      // Check connectivity
      final connectivity = await Connectivity().checkConnectivity();
      final hasConnection = connectivity != ConnectivityResult.none;

      if (hasConnection) {
        // Online claim
        await _claimSiteOnline();
      } else {
        // Offline claim
        await _claimSiteOffline();
      }

      setState(() {
        _isClaimed = true;
      });

      widget.onClaimSuccess?.call();

      if (mounted) {
        AppSnackBar.show(
          context,
          message: hasConnection
              ? 'Site claimed successfully!'
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

  Future<void> _claimSiteOnline() async {
    final supabase = Supabase.instance.client;
    final userId = supabase.auth.currentUser?.id;

    if (userId == null) {
      throw Exception('User not authenticated');
    }

    // Call atomic claim_site_visit RPC function instead of direct update
    // This ensures race condition protection and fee calculation
    final response = await supabase.rpc(
      'claim_site_visit',
      params: {
        'p_site_id': widget.siteEntryId,
        'p_user_id': userId,
        // Note: enumerator_fee will be calculated from user's classification
        // if not provided. Fee source defaults to 'classification'
      },
    );

    if (response == null) {
      throw Exception('Failed to claim site - unexpected response from server');
    }

    final result = response as Map<String, dynamic>;

    if (result['success'] != true) {
      throw Exception(result['message'] ?? 'Failed to claim site');
    }

    // Successfully claimed
    debugPrint('✅ Site claimed successfully: ${result['site_name']}');
    debugPrint(
      'Fee breakdown: ${result['enumerator_fee']} + ${result['transport_fee']} = ${result['total_payout']} SDG',
    );
  }

  Future<void> _claimSiteOffline() async {
    // Use offline provider to queue the claim
    await ref.read(claimSiteOfflineProvider(widget.siteEntryId).future);
  }

  String _getErrorMessage(String error) {
    if (error.contains('already claimed') ||
        error.contains('ALREADY_CLAIMED')) {
      return 'Site already claimed by another user';
    } else if (error.contains('not available') ||
        error.contains('INVALID_STATUS')) {
      return 'Site is not available for claiming';
    } else if (error.contains('in progress') ||
        error.contains('CLAIM_IN_PROGRESS')) {
      return 'Another claim is in progress';
    } else {
      return 'Failed to claim site. Please try again.';
    }
  }
}
