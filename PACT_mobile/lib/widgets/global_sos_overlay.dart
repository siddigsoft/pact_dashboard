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
        content: Text('Long-press and hold SOS to trigger emergency action.'),
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

    final requireLongPress = _isLongPressRequired;
    final isTestMode = _sosEmergencyService.isSosTestModeEnabled();

    const rightInset = 12.0;
    const dragHandleHeight = 24.0;
    const badgeHeight = 30.0;
    const buttonHeight = 56.0;
    const stackVerticalGap = 8.0;
    const minTop = 80.0;

    final screenHeight = MediaQuery.sizeOf(context).height;
    final totalHeight =
        dragHandleHeight +
        (isTestMode ? badgeHeight + stackVerticalGap : 0) +
        buttonHeight;
    final maxTop = (screenHeight - totalHeight - 16).clamp(minTop, 2000.0);

    _buttonTop ??= (screenHeight * 0.62).clamp(minTop, maxTop);
    _buttonTop = _buttonTop!.clamp(minTop, maxTop);

    return SafeArea(
      child: Stack(
        children: [
          Positioned(
            right: rightInset,
            top: _buttonTop,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
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
                  child: Container(
                    height: dragHandleHeight,
                    width: 52,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.35),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: const Icon(
                      Icons.drag_indicator,
                      size: 18,
                      color: Colors.white,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                if (isTestMode)
                  Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.orange.shade700,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: const Text(
                      'TEST MODE',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                Tooltip(
                  message: requireLongPress
                      ? 'Long-press SOS to trigger emergency action'
                      : 'Tap SOS to trigger emergency action',
                  child: GestureDetector(
                    onLongPress: _isTriggering ? null : _triggerSos,
                    child: FloatingActionButton.extended(
                      heroTag: 'global_sos_button',
                      onPressed: _isTriggering
                          ? null
                          : (requireLongPress
                                ? _showLongPressHint
                                : _triggerSos),
                      icon: _isTriggering
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.sos),
                      label: Text(requireLongPress ? 'Hold SOS' : 'SOS'),
                      backgroundColor: Colors.red,
                      foregroundColor: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
