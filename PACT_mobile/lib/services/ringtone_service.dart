import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Service for managing ringtones for calls and messages
class RingtoneService {
  static final RingtoneService _instance = RingtoneService._internal();

  factory RingtoneService() => _instance;
  RingtoneService._internal();

  final AudioPlayer _audioPlayer = AudioPlayer();
  late SharedPreferences _prefs;

  // Ringtone types
  static const String INCOMING_CALL_RINGTONE = 'incoming_call';
  static const String MESSAGE_RINGTONE = 'message';
  static const String NOTIFICATION_RINGTONE = 'notification';

  // Sound file paths - using the actual file available in assets
  // NOTE: For production, consider using higher quality ringtones:
  // - Call ringtone: Use a clear, attention-grabbing tone
  // - Message ringtone: Use a subtle, non-intrusive tone
  // - Add these as assets: assets/sounds/call_ringtone.mp3, assets/sounds/message_ringtone.mp3
  static const String _CALL_SOUND_PATH =
      'sounds/Phone Dial Tone - Sound Effect (HD).mp3';
  static const String _MESSAGE_SOUND_PATH =
      'sounds/Phone Dial Tone - Sound Effect (HD).mp3';
  static const String _NOTIFICATION_SOUND_PATH =
      'sounds/Phone Dial Tone - Sound Effect (HD).mp3';

  // Preference keys
  static const String _callRingtoneEnabledKey = 'call_ringtone_enabled';
  static const String _messageRingtoneEnabledKey = 'message_ringtone_enabled';
  static const String _notificationRingtoneEnabledKey =
      'notification_ringtone_enabled';
  static const String _ringtoneVolumeKey = 'ringtone_volume';

  bool _isInitialized = false;
  bool _isPlayingCallRingtone = false;
  StreamSubscription? _playerCompleteSubscription;

  /// Initialize the ringtone service
  Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      _prefs = await SharedPreferences.getInstance();

      // Set default preferences if not set
      if (!_prefs.containsKey(_callRingtoneEnabledKey)) {
        await _prefs.setBool(_callRingtoneEnabledKey, true);
      }
      if (!_prefs.containsKey(_messageRingtoneEnabledKey)) {
        await _prefs.setBool(_messageRingtoneEnabledKey, true);
      }
      if (!_prefs.containsKey(_notificationRingtoneEnabledKey)) {
        await _prefs.setBool(_notificationRingtoneEnabledKey, true);
      }
      if (!_prefs.containsKey(_ringtoneVolumeKey)) {
        await _prefs.setDouble(_ringtoneVolumeKey, 1.0);
      }

      _isInitialized = true;
      debugPrint('[Ringtone] Service initialized');
    } catch (e) {
      debugPrint('[Ringtone] Initialization error: $e');
    }
  }

  /// Play incoming call ringtone (loops until stopped)
  Future<void> playIncomingCallRingtone() async {
    if (!_isInitialized) await initialize();

    if (!_isCallRingtoneEnabled()) {
      debugPrint('[Ringtone] Call ringtone is disabled');
      return;
    }

    try {
      _isPlayingCallRingtone = true;
      final volume = _getRingtoneVolume();

      // Set volume
      await _audioPlayer.setVolume(volume);

      // Play the ringtone on loop
      await _audioPlayer.setReleaseMode(ReleaseMode.loop);
      await _audioPlayer.play(AssetSource(_CALL_SOUND_PATH));

      debugPrint('[Ringtone] Playing incoming call ringtone');
    } catch (e) {
      debugPrint('[Ringtone] Error playing call ringtone: $e');
    }
  }

  /// Play message notification ringtone (single play)
  Future<void> playMessageRingtone() async {
    if (!_isInitialized) await initialize();

    if (!_isMessageRingtoneEnabled()) {
      debugPrint('[Ringtone] Message ringtone is disabled');
      return;
    }

    try {
      final volume = _getRingtoneVolume();

      // Set volume
      await _audioPlayer.setVolume(volume);

      // Play the ringtone once
      await _audioPlayer.setReleaseMode(ReleaseMode.stop);
      await _audioPlayer.play(AssetSource(_MESSAGE_SOUND_PATH));

      debugPrint('[Ringtone] Playing message ringtone');
    } catch (e) {
      debugPrint('[Ringtone] Error playing message ringtone: $e');
    }
  }

  /// Play notification ringtone (single play)
  Future<void> playNotificationRingtone() async {
    if (!_isInitialized) await initialize();

    if (!_isNotificationRingtoneEnabled()) {
      debugPrint('[Ringtone] Notification ringtone is disabled');
      return;
    }

    try {
      final volume = _getRingtoneVolume();

      // Set volume
      await _audioPlayer.setVolume(volume);

      // Play the ringtone once
      await _audioPlayer.setReleaseMode(ReleaseMode.stop);
      await _audioPlayer.play(AssetSource(_NOTIFICATION_SOUND_PATH));

      debugPrint('[Ringtone] Playing notification ringtone');
    } catch (e) {
      debugPrint('[Ringtone] Error playing notification ringtone: $e');
    }
  }

  /// Stop the currently playing ringtone with timeout safety
  Future<void> stopRingtone({
    Duration timeout = const Duration(seconds: 2),
  }) async {
    try {
      // Add timeout safety to prevent indefinite hanging
      await _audioPlayer.stop().timeout(
        timeout,
        onTimeout: () {
          debugPrint(
            '[Ringtone] Stop operation timed out after ${timeout.inSeconds}s',
          );
        },
      );
      _isPlayingCallRingtone = false;
      debugPrint('[Ringtone] Ringtone stopped');
    } catch (e) {
      debugPrint('[Ringtone] Error stopping ringtone: $e');
      // Ensure state is cleared even if stop fails
      _isPlayingCallRingtone = false;
    }
  }

  /// Check if a ringtone is currently playing
  bool isPlayingRingtone() {
    return _isPlayingCallRingtone;
  }

  /// Get the public state of playing call ringtone (alias for clarity)
  bool get isPlayingCallRingtone => _isPlayingCallRingtone;

  /// Get if call ringtone is enabled
  bool _isCallRingtoneEnabled() {
    return _prefs.getBool(_callRingtoneEnabledKey) ?? true;
  }

  /// Get if message ringtone is enabled
  bool _isMessageRingtoneEnabled() {
    return _prefs.getBool(_messageRingtoneEnabledKey) ?? true;
  }

  /// Get if notification ringtone is enabled
  bool _isNotificationRingtoneEnabled() {
    return _prefs.getBool(_notificationRingtoneEnabledKey) ?? true;
  }

  /// Set call ringtone enabled state
  Future<void> setCallRingtoneEnabled(bool enabled) async {
    await _prefs.setBool(_callRingtoneEnabledKey, enabled);
    debugPrint('[Ringtone] Call ringtone enabled: $enabled');
  }

  /// Set message ringtone enabled state
  Future<void> setMessageRingtoneEnabled(bool enabled) async {
    await _prefs.setBool(_messageRingtoneEnabledKey, enabled);
    debugPrint('[Ringtone] Message ringtone enabled: $enabled');
  }

  /// Set notification ringtone enabled state
  Future<void> setNotificationRingtoneEnabled(bool enabled) async {
    await _prefs.setBool(_notificationRingtoneEnabledKey, enabled);
    debugPrint('[Ringtone] Notification ringtone enabled: $enabled');
  }

  /// Get ringtone volume (0.0 - 1.0)
  double _getRingtoneVolume() {
    return _prefs.getDouble(_ringtoneVolumeKey) ?? 1.0;
  }

  /// Set ringtone volume (0.0 - 1.0)
  Future<void> setRingtoneVolume(double volume) async {
    if (volume < 0.0 || volume > 1.0) {
      debugPrint('[Ringtone] Invalid volume: $volume');
      return;
    }
    await _prefs.setDouble(_ringtoneVolumeKey, volume);
    await _audioPlayer.setVolume(volume);
    debugPrint('[Ringtone] Volume set to: $volume');
  }

  /// Dispose resources
  Future<void> dispose() async {
    await _playerCompleteSubscription?.cancel();
    await _audioPlayer.dispose();
    debugPrint('[Ringtone] Service disposed');
  }
}
