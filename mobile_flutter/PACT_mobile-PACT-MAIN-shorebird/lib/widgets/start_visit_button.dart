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
  String? _statusMessage;

  @override
  Widget build(BuildContext context) {
    final hasActiveVisit = ref.watch(hasActiveVisitProvider);
    final currentVisit = ref.watch(currentActiveVisitProvider);
    final isCapturingGPS = ref.watch(isCapturingGPSProvider);

    // Always show the button so the workflow can continue.
    // If another visit is active, starting this one will switch the active visit.
    final isCurrentVisit = currentVisit?.id == widget.visit.id;

    return Column(
      children: [
        SizedBox(
          width: double.infinity,
          height: 50,
          child: ElevatedButton.icon(
            onPressed: (_isLoading || isCapturingGPS) ? null : _startVisit,
            icon: (_isLoading || isCapturingGPS)
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                    ),
                  )
                : Icon(isCurrentVisit ? Icons.play_arrow : Icons.play_circle_fill),
            label: Text(_getButtonText(isCurrentVisit, isCapturingGPS)),
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
        ),
        // Show GPS capture status
        if (_statusMessage != null) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.blue.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.blue.withOpacity(0.3)),
            ),
            child: Row(
              children: [
                const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.blue),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _statusMessage!,
                    style: const TextStyle(
                      fontSize: 12,
                      color: Colors.blue,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  String _getButtonText(bool isCurrentVisit, bool isCapturingGPS) {
    if (isCapturingGPS) return 'Capturing GPS...';
    if (_isLoading) return 'Starting...';
    if (isCurrentVisit) return 'Visit Active';
    return 'Start Visit';
  }

  Future<void> _startVisit() async {
    setState(() {
      _isLoading = true;
      _statusMessage = 'Requesting GPS location (≤10m accuracy)...';
    });

    try {
      // Check connectivity
      final connectivity = await Connectivity().checkConnectivity();
      final hasConnection = connectivity != ConnectivityResult.none;

      // Start active visit tracking - this will capture GPS with ≤10m accuracy
      await ref.read(activeVisitProvider.notifier).startVisit(widget.visit);
      
      // Wait a moment for GPS capture to complete
      await Future.delayed(const Duration(milliseconds: 500));
      
      // Get the locked GPS from the provider
      final lockedGPS = ref.read(lockedGPSProvider);
      final gpsError = ref.read(gpsErrorProvider);
      
      if (lockedGPS != null) {
        setState(() {
          _statusMessage = 'GPS captured: ${lockedGPS['accuracy']?.toStringAsFixed(1)}m accuracy';
        });
        
        // Small delay to show success message
        await Future.delayed(const Duration(milliseconds: 500));
      } else if (gpsError != null) {
        debugPrint('GPS Error: $gpsError');
      }

      if (hasConnection) {
        // Online start - save with locked GPS
        await _startVisitOnline(lockedGPS);
      } else {
        // Offline start - save with locked GPS
        await _startVisitOffline(lockedGPS);
      }

      widget.onStartSuccess?.call();

      if (mounted) {
        final accuracyText = lockedGPS != null 
            ? ' (GPS: ${lockedGPS['accuracy']?.toStringAsFixed(1)}m)'
            : ' (GPS pending)';
        AppSnackBar.show(
          context,
          message: hasConnection
              ? 'Visit started successfully!$accuracyText'
              : 'Visit started offline - will sync when online$accuracyText',
          type: SnackBarType.success,
        );
      }
    } catch (e) {
      debugPrint('Error starting visit: $e');
      
      // Check if this is a network error - if so, try offline fallback
      final errorStr = e.toString().toLowerCase();
      final isNetworkError = errorStr.contains('socket') ||
          errorStr.contains('host lookup') ||
          errorStr.contains('network') ||
          errorStr.contains('connection') ||
          errorStr.contains('timeout') ||
          errorStr.contains('unreachable');
      
      if (isNetworkError) {
        debugPrint('Network error detected, attempting offline start...');
        try {
          // Get the locked GPS that was already captured
          final lockedGPS = ref.read(lockedGPSProvider);
          await _startVisitOffline(lockedGPS);
          
          widget.onStartSuccess?.call();
          
          if (mounted) {
            AppSnackBar.show(
              context,
              message: 'Visit started offline - will sync when online',
              type: SnackBarType.success,
            );
          }
          return; // Exit early - success!
        } catch (offlineError) {
          debugPrint('Offline fallback also failed: $offlineError');
        }
      }

      widget.onStartError?.call();

      if (mounted) {
        // Show a more user-friendly message for network errors
        final message = isNetworkError
            ? 'No internet connection. Please check your network and try again.'
            : 'Failed to start visit: ${e.toString()}';
        AppSnackBar.show(
          context,
          message: message,
          type: SnackBarType.error,
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _statusMessage = null;
        });
      }
    }
  }

  Future<void> _startVisitOnline(Map<String, dynamic>? lockedGPS) async {
    final supabase = Supabase.instance.client;
    final userId = supabase.auth.currentUser?.id;

    if (userId == null) {
      throw Exception('User not authenticated');
    }

    // Build additional_data with locked GPS
    Map<String, dynamic> additionalData = widget.visit.additionalData ?? {};
    
    // Store the locked GPS in start_location - this will NEVER change
    if (lockedGPS != null) {
      additionalData['start_location'] = {
        'latitude': lockedGPS['latitude'],
        'longitude': lockedGPS['longitude'],
        'accuracy': lockedGPS['accuracy'],
        'timestamp': lockedGPS['timestamp'],
        'locked': true, // Mark as locked - should never be modified
        'captured_at': DateTime.now().toIso8601String(),
      };
    }

    // Update site visit status in database
    await supabase
        .from('mmp_site_entries')
        .update({
          'status': 'in_progress',
          'visit_started_at': DateTime.now().toIso8601String(),
          'visit_started_by': userId,
          'additional_data': additionalData,
        })
        .eq('id', widget.visit.id);
        
    debugPrint('✅ Visit started online with locked GPS: $lockedGPS');
  }

  Future<void> _startVisitOffline(Map<String, dynamic>? lockedGPS) async {
    // Use offline provider to queue the start with locked GPS
    await ref.read(
      startSiteVisitOfflineProvider((
        siteEntryId: widget.visit.id,
        siteName: widget.visit.siteName,
        siteCode: widget.visit.siteCode,
        state: widget.visit.state,
        locality: widget.visit.locality,
        startLocation: lockedGPS, // Pass the locked GPS
      )).future,
    );
    
    debugPrint('✅ Visit started offline with locked GPS: $lockedGPS');
  }
}
