import 'package:flutter/foundation.dart';
import 'dart:developer' as developer;
import 'dart:js' as js;
import 'dart:html' as html;

class WebNotificationService {
  static const String debugTag = '[WebNotificationService]';
  static final WebNotificationService _instance =
      WebNotificationService._internal();
  factory WebNotificationService() => _instance;
  WebNotificationService._internal();

  bool _isSupported = false;
  bool _permissionGranted = false;

  Future<void> initialize() async {
    if (!kIsWeb) {
      developer.log(
        '$debugTag Not web platform, skipping initialization',
        name: debugTag,
      );
      return;
    }
    try {
      _isSupported = _checkNotificationSupport();
      developer.log(
        '$debugTag Notifications supported: $_isSupported',
        name: debugTag,
      );
      if (_isSupported) {
        _permissionGranted = await _checkPermission();
        developer.log(
          '$debugTag Permission granted: $_permissionGranted',
          name: debugTag,
        );
        if (!_permissionGranted) {
          await requestPermission();
        }
      }
    } catch (e) {
      developer.log(
        '$debugTag Error initializing: $e',
        name: debugTag,
        error: e,
      );
    }
  }

  Future<void> showMissedCallNotification({
    required String callerId,
    required String callerName,
  }) async {
    if (!_isSupported || !_permissionGranted) return;
    try {
      html.Notification(
        'Missed Call',
        body: 'You missed a call from $callerName',
        tag: callerId,
      );
    } catch (e) {
      developer.log(
        '$debugTag Error showing missed call notification: $e',
        name: debugTag,
        error: e,
      );
    }
  }

  bool _checkNotificationSupport() {
    try {
      return js.context['Notification'] != null;
    } catch (e) {
      return false;
    }
  }

  Future<bool> _checkPermission() async {
    try {
      if (!_isSupported) return false;
      final permission = js.context['Notification']['permission'];
      return permission == 'granted';
    } catch (e) {
      return false;
    }
  }

  Future<void> requestPermission() async {
    try {
      if (!_isSupported) return;
      final permission = await js.context['Notification'].callMethod(
        'requestPermission',
      );
      _permissionGranted = permission == 'granted';
    } catch (e) {
      developer.log(
        '$debugTag Error requesting permission: $e',
        name: debugTag,
        error: e,
      );
    }
  }

  Future<void> showCallNotification({
    required String callId,
    required String callerName,
    required String callType,
    String? callIcon,
  }) async {
    if (!_isSupported || !_permissionGranted) return;
    try {
      html.Notification(
        'Incoming ${callType == 'video' ? 'Video' : 'Voice'} Call',
        body: '$callerName is calling...',
        icon: callIcon,
        tag: callId,
      );
    } catch (e) {
      developer.log(
        '$debugTag Error showing call notification: $e',
        name: debugTag,
        error: e,
      );
    }
  }

  Future<void> showMessageNotification({
    required String messageId,
    required String senderId,
    required String senderName,
    required String messagePreview,
    String? senderAvatar,
  }) async {
    if (!_isSupported || !_permissionGranted) return;
    try {
      html.Notification(
        senderName,
        body: messagePreview.length > 100
            ? messagePreview.substring(0, 100) + '...'
            : messagePreview,
        icon: senderAvatar,
        tag: messageId,
      );
    } catch (e) {
      developer.log(
        '$debugTag Error showing message notification: $e',
        name: debugTag,
        error: e,
      );
    }
  }
}
