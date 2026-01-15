import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/app_widgets.dart';
import '../providers/offline_provider.dart';
import '../providers/active_visit_provider.dart';
import '../models/site_visit.dart';

class StartVisitButton extends ConsumerStatefulWidget {
  final SiteVisit visit;
  final VoidCallback? onStartSuccess;
  final VoidCallback? onStartError;

  const StartVisitButton({
    super.key,
    required this.visit,
    this.onStartSuccess,
    this.onStartError,
  });

  @override
  ConsumerState<StartVisitButton> createState() => _StartVisitButtonState();
}

class _StartVisitButtonState extends ConsumerState<StartVisitButton> {
  bool _isLoading = false;

  @override
  Widget build(BuildContext context) {
    final hasActiveVisit = ref.watch(hasActiveVisitProvider);
    final currentVisit = ref.watch(currentActiveVisitProvider);

    // Always show the button so the workflow can continue.
    // If another visit is active, starting this one will switch the active visit.
    final isCurrentVisit = currentVisit?.id == widget.visit.id;

    return SizedBox(
      width: double.infinity,
      height: 50,
      child: ElevatedButton.icon(
        onPressed: _isLoading ? null : _startVisit,
        icon: _isLoading
            ? const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                ),
              )
            : Icon(isCurrentVisit ? Icons.play_arrow : Icons.play_circle_fill),
        label: Text(_getButtonText(isCurrentVisit)),
        style: ElevatedButton.styleFrom(
          backgroundColor: isCurrentVisit
              ? AppColors.success
              : AppColors.primaryOrange,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }

  String _getButtonText(bool isCurrentVisit) {
    if (_isLoading) return 'Starting...';
    if (isCurrentVisit) return 'Visit Active';
    return 'Start Visit';
  }

  Future<void> _startVisit() async {
    setState(() {
      _isLoading = true;
    });

    try {
      // Check connectivity
      final connectivity = await Connectivity().checkConnectivity();
      final hasConnection = connectivity != ConnectivityResult.none;

      if (hasConnection) {
        // Online start
        await _startVisitOnline();
      } else {
        // Offline start
        await _startVisitOffline();
      }

      // Start active visit tracking
      await ref.read(activeVisitProvider.notifier).startVisit(widget.visit);

      widget.onStartSuccess?.call();

      if (mounted) {
        AppSnackBar.show(
          context,
          message: hasConnection
              ? 'Visit started successfully!'
              : 'Visit started offline - will sync when online',
          type: SnackBarType.success,
        );
      }
    } catch (e) {
      debugPrint('Error starting visit: $e');

      widget.onStartError?.call();

      if (mounted) {
        AppSnackBar.show(
          context,
          message: 'Failed to start visit: ${e.toString()}',
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

  Future<void> _startVisitOnline() async {
    final supabase = Supabase.instance.client;
    final userId = supabase.auth.currentUser?.id;

    if (userId == null) {
      throw Exception('User not authenticated');
    }

    // Update site visit status in database
    await supabase
        .from('mmp_site_entries')
        .update({
          'status': 'in_progress',
          'visit_started_at': DateTime.now().toIso8601String(),
          'visit_started_by': userId,
          'additional_data': {
            'start_location': {
              'latitude': null, // Will be updated by GPS tracking
              'longitude': null,
            },
          },
        })
        .eq('id', widget.visit.id);
  }

  Future<void> _startVisitOffline() async {
    // Use offline provider to queue the start
    await ref.read(
      startSiteVisitOfflineProvider((
        siteEntryId: widget.visit.id,
        siteName: widget.visit.siteName,
        siteCode: widget.visit.siteCode,
        state: widget.visit.state,
        locality: widget.visit.locality,
      )).future,
    );
  }
}
