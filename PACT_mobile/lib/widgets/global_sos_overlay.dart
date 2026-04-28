import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart'
    show kIsWeb, defaultTargetPlatform, TargetPlatform;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../screens/safety_hub_screen.dart';
import '../services/local_storage_service.dart';
import '../services/sos_emergency_service.dart';
import '../services/android_volume_button_service.dart';
import 'sos_countdown_dialog.dart';
import 'package:flutter_animate/flutter_animate.dart';

// Global ValueNotifier to track current screen index from MainLayout
final ValueNotifier<int> currentScreenIndex = ValueNotifier<int>(0);

class GlobalSosOverlay extends StatefulWidget {
  const GlobalSosOverlay({super.key});

  @override
  State<GlobalSosOverlay> createState() => _GlobalSosOverlayState();
}

class _GlobalSosOverlayState extends State<GlobalSosOverlay> {
  static const String _sosOverlayTopSettingKey = 'global_sos_overlay_top';

  final SosEmergencyService _sosEmergencyService = SosEmergencyService();
  final AndroidVolumeButtonService _androidVolumeButtonService =
      AndroidVolumeButtonService();
  final LocalStorageService _localStorageService = LocalStorageService();

  bool _isTriggering = false;
  double? _buttonTop;
  StreamSubscription<Map<String, dynamic>>? _volumeEventSub;
  DateTime? _lastHardwareTriggerAt;

  @override
  void initState() {
    super.initState();
    _loadSavedPosition();
    _startAndroidVolumeListener();
  }

  void _loadSavedPosition() {
    final stored = _localStorageService.getAppSetting(_sosOverlayTopSettingKey);
    if (stored is num) {
      _buttonTop = stored.toDouble();
    }
  }

  Future<void> _savePosition() async {
    if (_buttonTop == null) return;
    await _localStorageService.saveAppSetting(
      _sosOverlayTopSettingKey,
      _buttonTop,
    );
  }

  @override
  void dispose() {
    _volumeEventSub?.cancel();
    super.dispose();
  }

  bool get _isLongPressRequired {
    return _sosEmergencyService.isSosLongPressRequired();
  }

  bool get _isAndroidVolumeHoldSupported {
    if (kIsWeb) return false;
    return defaultTargetPlatform == TargetPlatform.android;
  }

  void _startAndroidVolumeListener() {
    if (!_isAndroidVolumeHoldSupported) return;

    _volumeEventSub = _androidVolumeButtonService.events.listen((event) async {
      if (!mounted || _isTriggering) return;
      if (!_sosEmergencyService.isSosVolumeUpHoldEnabled()) return;

      final eventName = (event['event'] ?? '').toString().toLowerCase().trim();
      if (eventName != 'volume_up_hold_3s') return;

      final now = DateTime.now();
      final lastAt = _lastHardwareTriggerAt;
      if (lastAt != null && now.difference(lastAt).inSeconds < 2) {
        return;
      }
      _lastHardwareTriggerAt = now;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('SOS triggered from volume button hold.'),
          duration: Duration(seconds: 2),
        ),
      );

      await _triggerSos();
    });
  }

  Future<void> _triggerSos() async {
    if (_isTriggering) return;

    setState(() => _isTriggering = true);

    try {
      final isTestMode = _sosEmergencyService.isSosTestModeEnabled();
      final countdownSeconds = _sosEmergencyService.getSosCountdownSeconds();
      final enableWarningHaptic = _sosEmergencyService
          .isSosHapticWarningEnabled();
      final previewContact = await _sosEmergencyService
          .getNextQuickSosContactPreview();
      Map<String, String>? alternateContact;
      if (previewContact != null) {
        alternateContact = await _sosEmergencyService
            .getEmergencyFallbackContactPreview();
      }

      if (!mounted) return;

      final selectedContact = await showSosCountdownDialog(
        context,
        seconds: countdownSeconds,
        preferredContact: previewContact,
        alternateContact: alternateContact,
        enableWarningHaptic: enableWarningHaptic,
      );

      if (selectedContact == null) return;

      if (isTestMode) {
        final contactName = (selectedContact['name'] ?? '').trim().isEmpty
            ? 'selected emergency contact'
            : selectedContact['name']!.trim();

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'SOS test mode: trigger captured for $contactName. No real call was placed.',
            ),
            duration: const Duration(seconds: 3),
          ),
        );
        return;
      }

      final result = await _sosEmergencyService.triggerQuickSosCall(
        preferredContact: selectedContact,
      );

      if (!mounted) return;

      if (result.shouldOpenSafetyHub) {
        Navigator.of(
          context,
          rootNavigator: true,
        ).push(MaterialPageRoute(builder: (_) => const SafetyHubScreen()));
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result.message),
          duration: const Duration(seconds: 3),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _isTriggering = false);
      }
    }
  }

  void _showLongPressHint() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          '⚠️ SOS button is active. Tap to trigger emergency action immediately.',
        ),
        duration: Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isLoggedIn = Supabase.instance.client.auth.currentUser != null;
    if (!isLoggedIn) {
      return const SizedBox.shrink();
    }

    // Hide SOS button from home/dashboard screen (index 0)
    return ValueListenableBuilder<int>(
      valueListenable: currentScreenIndex,
      builder: (context, currentIndex, _) {
        // Hide on home screen (index 0)
        if (currentIndex == 0) {
          return const SizedBox.shrink();
        }

        return _buildSosOverlay(context);
      },
    );
  }

  Widget _buildSosOverlay(BuildContext context) {
    final isTestMode = _sosEmergencyService.isSosTestModeEnabled();
    const minTop = 80.0;
    final screenHeight = MediaQuery.sizeOf(context).height;
    final totalHeight = 60.0 + (isTestMode ? 30.0 : 0.0);
    final maxTop = (screenHeight - totalHeight - 16).clamp(minTop, 2000.0);

    _buttonTop ??= (screenHeight * 0.62).clamp(minTop, maxTop);
    _buttonTop = _buttonTop!.clamp(minTop, maxTop);

    return SafeArea(
      child: Stack(
        children: [
          Positioned(
            right: 12.0,
            top: _buttonTop,
            child: GestureDetector(
              behavior: HitTestBehavior.translucent,
              onPanUpdate: (details) {
                setState(() {
                  _buttonTop = (_buttonTop! + details.delta.dy).clamp(
                    minTop,
                    maxTop,
                  );
                });
              },
              onPanEnd: (_) {
                unawaited(_savePosition());
              },
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (isTestMode)
                    Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.orange.shade700,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Text(
                        'TEST',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  Tooltip(
                    message: 'Emergency SOS',
                    child: GestureDetector(
                      onTap: _isTriggering ? null : _triggerSos,
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          // Pulse animation background
                          if (!_isTriggering)
                            Container(
                                  width: 64,
                                  height: 64,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: Colors.red.withValues(alpha: 0.3),
                                  ),
                                )
                                .animate(
                                  onPlay: (controller) => controller.repeat(),
                                )
                                .scale(
                                  begin: const Offset(1, 1),
                                  end: const Offset(1.3, 1.3),
                                  duration: const Duration(milliseconds: 1500),
                                )
                                .fade(
                                  begin: 1.0,
                                  end: 0.0,
                                  duration: const Duration(milliseconds: 1500),
                                ),
                          // Main button
                          Container(
                            width: 52,
                            height: 52,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: LinearGradient(
                                colors: [
                                  Colors.red.shade400,
                                  Colors.red.shade700,
                                ],
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                              ),
                              boxShadow: const [
                                BoxShadow(
                                  color: Colors.black26,
                                  blurRadius: 8,
                                  offset: Offset(0, 4),
                                ),
                              ],
                            ),
                            child: _isTriggering
                                ? const Padding(
                                    padding: EdgeInsets.all(14.0),
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.5,
                                      valueColor: AlwaysStoppedAnimation<Color>(
                                        Colors.white,
                                      ),
                                    ),
                                  )
                                : const Icon(
                                    Icons.sos_rounded,
                                    size: 28,
                                    color: Colors.white,
                                  ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
