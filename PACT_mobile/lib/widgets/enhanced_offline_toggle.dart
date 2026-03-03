// lib/widgets/enhanced_offline_toggle.dart

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'dart:async';
import '../theme/app_colors.dart';

/// Enhanced Offline Status Toggle Widget
/// Features:
/// - Modern toggle/bubble design
/// - Bilingual support (English/Arabic)
/// - Smooth animations
/// - Connectivity retry functionality
/// - Auto-dismiss when online
/// - Persistent offline state indicator
class EnhancedOfflineToggle extends StatefulWidget {
  final bool showInHeader;
  final VoidCallback? onRetryPressed;
  final bool autoHideWhenOnline;

  const EnhancedOfflineToggle({
    super.key,
    this.showInHeader = true,
    this.onRetryPressed,
    this.autoHideWhenOnline = true,
  });

  @override
  State<EnhancedOfflineToggle> createState() => _EnhancedOfflineToggleState();
}

class _EnhancedOfflineToggleState extends State<EnhancedOfflineToggle>
    with SingleTickerProviderStateMixin {
  final Connectivity _connectivity = Connectivity();
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;

  bool _isOnline = true;
  bool _isDismissed = false;
  bool _isChecking = false;
  late AnimationController _animationController;
  late Animation<double> _scaleAnimation;
  late Animation<double> _fadeAnimation;

  int _offlineSeconds = 0;
  Timer? _countdownTimer;

  final Duration _autoHideDuration = const Duration(seconds: 5);

  @override
  void initState() {
    super.initState();
    _initializeAnimations();
    _checkInitialConnectivity();
    _setupConnectivityListener();
  }

  void _initializeAnimations() {
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 600),
      vsync: this,
    );

    _scaleAnimation = Tween<double>(begin: 0.8, end: 1.0).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.elasticOut),
    );

    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeIn),
    );
  }

  Future<void> _checkInitialConnectivity() async {
    try {
      final result = await _connectivity.checkConnectivity();
      final isOnline = !result.contains(ConnectivityResult.none);
      if (mounted) {
        setState(() {
          _isOnline = isOnline;
        });
      }
    } catch (e) {
      debugPrint('[EnhancedOfflineToggle] Error checking connectivity: $e');
    }
  }

  void _setupConnectivityListener() {
    _connectivitySubscription = _connectivity.onConnectivityChanged.listen((
      result,
    ) {
      final wasOnline = _isOnline;
      final isOnlineNow = !result.contains(ConnectivityResult.none);

      if (mounted) {
        setState(() {
          _isOnline = isOnlineNow;
          _isDismissed = false; // Clear dismissed state on connectivity change
          if (isOnlineNow && !wasOnline) {
            _startAutoHideTimer();
          }
          if (!isOnlineNow) {
            _offlineSeconds = 0;
          }
        });

        if (!isOnlineNow && wasOnline) {
          _playAnimation();
          _startCountdownTimer();
        } else if (isOnlineNow && !wasOnline) {
          _playAnimation();
        }
      }
    });
  }

  void _playAnimation() {
    _animationController.forward(from: 0.0);
  }

  void _startCountdownTimer() {
    _countdownTimer?.cancel();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          _offlineSeconds++;
        });
      }
    });
  }

  void _startAutoHideTimer() {
    Future.delayed(_autoHideDuration, () {
      if (mounted && _isOnline && !_isDismissed) {
        setState(() {
          _isDismissed = true;
        });
      }
    });
  }

  Future<void> _retryConnectivity() async {
    if (_isChecking) return;

    setState(() => _isChecking = true);

    try {
      final result = await _connectivity.checkConnectivity();
      final isOnline = !result.contains(ConnectivityResult.none);

      if (mounted) {
        setState(() => _isChecking = false);

        if (isOnline) {
          // Show success feedback
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                _getLocalizedText('back_online'),
                style: GoogleFonts.poppins(color: Colors.white),
              ),
              backgroundColor: Colors.green,
              duration: const Duration(seconds: 2),
            ),
          );
        } else {
          // Show still offline feedback
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                _getLocalizedText('still_offline'),
                style: GoogleFonts.poppins(color: Colors.white),
              ),
              backgroundColor: Colors.orange,
              duration: const Duration(seconds: 2),
            ),
          );
        }
      }

      widget.onRetryPressed?.call();
    } catch (e) {
      debugPrint('[EnhancedOfflineToggle] Error during retry: $e');
      if (mounted) {
        setState(() => _isChecking = false);
      }
    }
  }

  String _getLocalizedText(String key) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';

    final texts = {
      'offline': isArabic ? 'غير متصل' : 'Offline',
      'online': isArabic ? 'متصل' : 'Online',
      'time_to_go_online': isArabic ? 'حان الوقت للاتصال' : 'Time to go online',
      'you_are_offline': isArabic ? 'أنت غير متصل' : 'You\'re Offline',
      'attempting_to_sync': isArabic
          ? 'محاولة المزامنة...'
          : 'Attempting to sync...',
      'back_online': isArabic ? 'عاد الاتصال' : 'Back Online',
      'still_offline': isArabic ? 'لا يزال بدون اتصال' : 'Still Offline',
      'retry': isArabic ? 'إعادة محاولة' : 'Retry',
      'offline_for': isArabic ? 'بلا اتصال منذ' : 'Offline for',
      'seconds': isArabic ? 'ثانية' : 'seconds',
    };

    return texts[key] ?? '';
  }

  @override
  void dispose() {
    _connectivitySubscription?.cancel();
    _countdownTimer?.cancel();
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_isOnline && _isDismissed) {
      return const SizedBox.shrink();
    }

    final isArabic = Localizations.localeOf(context).languageCode == 'ar';

    if (_isOnline) {
      return ScaleTransition(
        scale: _scaleAnimation,
        child: FadeTransition(
          opacity: _fadeAnimation,
          child: _buildOnlineBubble(isArabic),
        ),
      );
    } else {
      return ScaleTransition(
        scale: _scaleAnimation,
        child: FadeTransition(
          opacity: _fadeAnimation,
          child: _buildOfflineBubble(isArabic),
        ),
      );
    }
  }

  Widget _buildOfflineBubble(bool isArabic) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.accentRed.withOpacity(0.9),
            AppColors.accentRed.withOpacity(0.7),
          ],
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: AppColors.accentRed.withOpacity(0.3),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
        border: Border.all(color: Colors.white.withOpacity(0.2), width: 1.5),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header row
          Row(
            children: [
              _buildAnimatedIcon(),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _getLocalizedText('you_are_offline'),
                      style: GoogleFonts.poppins(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                      textDirection: isArabic
                          ? TextDirection.rtl
                          : TextDirection.ltr,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${_getLocalizedText('offline_for')} $_offlineSeconds ${_getLocalizedText('seconds')}',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        fontWeight: FontWeight.w400,
                        color: Colors.white70,
                      ),
                      textDirection: isArabic
                          ? TextDirection.rtl
                          : TextDirection.ltr,
                    ),
                  ],
                ),
              ),
              GestureDetector(
                onTap: () {
                  if (mounted) {
                    setState(() => _isDismissed = true);
                  }
                },
                child: Icon(Icons.close, color: Colors.white, size: 20),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Action button
          SizedBox(
            width: double.infinity,
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: _isChecking ? null : _retryConnectivity,
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: Colors.white.withOpacity(0.3),
                      width: 1,
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (_isChecking)
                        SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            valueColor: AlwaysStoppedAnimation<Color>(
                              Colors.white,
                            ),
                            strokeWidth: 2,
                          ),
                        )
                      else
                        Icon(Icons.refresh, color: Colors.white, size: 16),
                      const SizedBox(width: 8),
                      Text(
                        _getLocalizedText('retry'),
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOnlineBubble(bool isArabic) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.green.withOpacity(0.9),
            Colors.green.withOpacity(0.7),
          ],
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.green.withOpacity(0.3),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
        border: Border.all(color: Colors.white.withOpacity(0.2), width: 1.5),
      ),
      child: Row(
        children: [
          Icon(Icons.cloud_done_outlined, color: Colors.white, size: 24),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _getLocalizedText('online'),
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                  textDirection: isArabic
                      ? TextDirection.rtl
                      : TextDirection.ltr,
                ),
                const SizedBox(height: 4),
                Text(
                  _getLocalizedText('attempting_to_sync'),
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    fontWeight: FontWeight.w400,
                    color: Colors.white70,
                  ),
                  textDirection: isArabic
                      ? TextDirection.rtl
                      : TextDirection.ltr,
                ),
              ],
            ),
          ),
          Icon(Icons.check_circle_outline, color: Colors.white, size: 20),
        ],
      ),
    );
  }

  Widget _buildAnimatedIcon() {
    return SizedBox(
      width: 24,
      height: 24,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Pulsing background circle
          ScaleTransition(
            scale: Tween<double>(begin: 0.8, end: 1.2).animate(
              CurvedAnimation(
                parent: _animationController,
                curve: Curves.elasticInOut,
              ),
            ),
            child: Container(
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withOpacity(0.2),
              ),
            ),
          ),
          // Icon
          Icon(Icons.cloud_off_outlined, color: Colors.white, size: 20),
        ],
      ),
    );
  }
}
