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

  bool get _isArabic => Localizations.localeOf(context).languageCode == 'ar';

  @override
  Widget build(BuildContext context) {
    final hasActiveVisit = ref.watch(hasActiveVisitProvider);
    final currentVisit = ref.watch(currentActiveVisitProvider);
    final isCapturingGPS = ref.watch(isCapturingGPSProvider);

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
                : Icon(
                    isCurrentVisit ? Icons.play_arrow : Icons.play_circle_fill,
                  ),
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
                    style: const TextStyle(fontSize: 12, color: Colors.blue),
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
    if (isCapturingGPS) {
      return _isArabic ? 'جاري التقاط GPS...' : 'Capturing GPS...';
    }
    if (_isLoading) return _isArabic ? 'جاري البدء...' : 'Starting...';
    if (isCurrentVisit) return _isArabic ? 'الزيارة نشطة' : 'Visit Active';
    return _isArabic ? 'بدء الزيارة' : 'Start Visit';
  }

  Future<void> _startVisit() async {
    setState(() {
      _isLoading = true;
      _statusMessage = _isArabic
          ? 'جاري طلب موقع GPS (دقة ≤10م)...'
          : 'Requesting GPS location (≤10m accuracy)...';
    });

    try {
      final connectivity = await Connectivity().checkConnectivity();
      final hasConnection = connectivity != ConnectivityResult.none;

      await ref.read(activeVisitProvider.notifier).startVisit(widget.visit);

      await Future.delayed(const Duration(milliseconds: 500));

      final lockedGPS = ref.read(lockedGPSProvider);
      final gpsError = ref.read(gpsErrorProvider);

      if (lockedGPS != null) {
        setState(() {
          _statusMessage = _isArabic
              ? 'تم التقاط GPS: دقة ${lockedGPS['accuracy']?.toStringAsFixed(1)}م'
              : 'GPS captured: ${lockedGPS['accuracy']?.toStringAsFixed(1)}m accuracy';
        });

        await Future.delayed(const Duration(milliseconds: 500));
      } else if (gpsError != null) {
        debugPrint('GPS Error: $gpsError');
      }

      if (hasConnection) {
        await _startVisitOnline(lockedGPS);
      } else {
        await _startVisitOffline(lockedGPS);
      }

      widget.onStartSuccess?.call();

      if (mounted) {
        final accuracyText = lockedGPS != null
            ? ' (GPS: ${lockedGPS['accuracy']?.toStringAsFixed(1)}m)'
            : (_isArabic ? ' (GPS قيد الانتظار)' : ' (GPS pending)');
        AppSnackBar.show(
          context,
          message: hasConnection
              ? (_isArabic
                    ? 'تم بدء الزيارة بنجاح!$accuracyText'
                    : 'Visit started successfully!$accuracyText')
              : (_isArabic
                    ? 'تم بدء الزيارة بدون اتصال - ستتم المزامنة عند الاتصال$accuracyText'
                    : 'Visit started offline - will sync when online$accuracyText'),
          type: SnackBarType.success,
        );
      }
    } catch (e) {
      debugPrint('Error starting visit: $e');

      final errorStr = e.toString().toLowerCase();
      final isNetworkError =
          errorStr.contains('socket') ||
          errorStr.contains('host lookup') ||
          errorStr.contains('network') ||
          errorStr.contains('connection') ||
          errorStr.contains('timeout') ||
          errorStr.contains('unreachable');

      if (isNetworkError) {
        debugPrint('Network error detected, attempting offline start...');
        try {
          final lockedGPS = ref.read(lockedGPSProvider);
          await _startVisitOffline(lockedGPS);

          widget.onStartSuccess?.call();

          if (mounted) {
            AppSnackBar.show(
              context,
              message: _isArabic
                  ? 'تم بدء الزيارة بدون اتصال - ستتم المزامنة عند الاتصال'
                  : 'Visit started offline - will sync when online',
              type: SnackBarType.success,
            );
          }
          return;
        } catch (offlineError) {
          debugPrint('Offline fallback also failed: $offlineError');
        }
      }

      widget.onStartError?.call();

      if (mounted) {
        final message = isNetworkError
            ? (_isArabic
                  ? 'لا يوجد اتصال بالإنترنت. يرجى التحقق من الشبكة والمحاولة مرة أخرى.'
                  : 'No internet connection. Please check your network and try again.')
            : (_isArabic
                  ? 'فشل بدء الزيارة: ${e.toString()}'
                  : 'Failed to start visit: ${e.toString()}');
        AppSnackBar.show(context, message: message, type: SnackBarType.error);
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

    Map<String, dynamic> additionalData = widget.visit.additionalData ?? {};

    if (lockedGPS != null) {
      additionalData['start_location'] = {
        'latitude': lockedGPS['latitude'],
        'longitude': lockedGPS['longitude'],
        'accuracy': lockedGPS['accuracy'],
        'timestamp': lockedGPS['timestamp'],
        'locked': true,
        'captured_at': DateTime.now().toIso8601String(),
      };
    }

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
    await ref.read(
      startSiteVisitOfflineProvider((
        siteEntryId: widget.visit.id,
        siteName: widget.visit.siteName,
        siteCode: widget.visit.siteCode,
        state: widget.visit.state,
        locality: widget.visit.locality,
        startLocation: lockedGPS,
      )).future,
    );

    debugPrint('✅ Visit started offline with locked GPS: $lockedGPS');
  }
}
