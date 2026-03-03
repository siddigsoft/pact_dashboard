// lib/services/permission_manager.dart
import 'package:permission_handler/permission_handler.dart';
import 'package:flutter/foundation.dart';

/// Manages permission requests on-demand instead of at startup.
/// This prevents the app from blocking for 2-5 seconds during initialization.
class PermissionManager {
  static final PermissionManager _instance = PermissionManager._();

  factory PermissionManager() => _instance;

  PermissionManager._();

  // Cache permission statuses
  final Map<Permission, PermissionStatus> _cachedStatus = {};

  /// Request location permission (on-demand)
  Future<bool> requestLocationPermission() async {
    debugPrint('📍 Requesting location permission...');
    final status = await Permission.location.request();
    _cachedStatus[Permission.location] = status;

    if (status.isDenied) {
      debugPrint('❌ Location permission denied');
      return false;
    } else if (status.isPermanentlyDenied) {
      debugPrint('⚠️ Location permission permanently denied');
      openAppSettings();
      return false;
    }

    debugPrint('✅ Location permission granted');
    return true;
  }

  /// Request camera permission (on-demand)
  Future<bool> requestCameraPermission() async {
    debugPrint('📷 Requesting camera permission...');
    final status = await Permission.camera.request();
    _cachedStatus[Permission.camera] = status;

    if (status.isDenied) {
      debugPrint('❌ Camera permission denied');
      return false;
    } else if (status.isPermanentlyDenied) {
      debugPrint('⚠️ Camera permission permanently denied');
      openAppSettings();
      return false;
    }

    debugPrint('✅ Camera permission granted');
    return true;
  }

  /// Request microphone permission (on-demand)
  Future<bool> requestMicrophonePermission() async {
    debugPrint('🎤 Requesting microphone permission...');
    final status = await Permission.microphone.request();
    _cachedStatus[Permission.microphone] = status;

    if (status.isDenied) {
      debugPrint('❌ Microphone permission denied');
      return false;
    } else if (status.isPermanentlyDenied) {
      debugPrint('⚠️ Microphone permission permanently denied');
      openAppSettings();
      return false;
    }

    debugPrint('✅ Microphone permission granted');
    return true;
  }

  /// Request storage permission (on-demand)
  Future<bool> requestStoragePermission() async {
    debugPrint('💾 Requesting storage permission...');
    final status = await Permission.storage.request();
    _cachedStatus[Permission.storage] = status;

    if (status.isDenied) {
      debugPrint('❌ Storage permission denied');
      return false;
    } else if (status.isPermanentlyDenied) {
      debugPrint('⚠️ Storage permission permanently denied');
      openAppSettings();
      return false;
    }

    debugPrint('✅ Storage permission granted');
    return true;
  }

  /// Request notification permission (on-demand)
  Future<bool> requestNotificationPermission() async {
    debugPrint('🔔 Requesting notification permission...');
    final status = await Permission.notification.request();
    _cachedStatus[Permission.notification] = status;

    if (status.isDenied) {
      debugPrint('❌ Notification permission denied');
      return false;
    } else if (status.isPermanentlyDenied) {
      debugPrint('⚠️ Notification permission permanently denied');
      openAppSettings();
      return false;
    }

    debugPrint('✅ Notification permission granted');
    return true;
  }

  /// Request calendar permission (on-demand)
  Future<bool> requestCalendarPermission() async {
    debugPrint('📅 Requesting calendar permission...');
    final status = await Permission.calendar.request();
    _cachedStatus[Permission.calendar] = status;

    if (status.isDenied) {
      debugPrint('❌ Calendar permission denied');
      return false;
    } else if (status.isPermanentlyDenied) {
      debugPrint('⚠️ Calendar permission permanently denied');
      openAppSettings();
      return false;
    }

    debugPrint('✅ Calendar permission granted');
    return true;
  }

  /// Request multiple permissions at once
  Future<Map<Permission, PermissionStatus>> requestMultiple(
    List<Permission> permissions,
  ) async {
    debugPrint('🔐 Requesting ${permissions.length} permissions...');
    final statuses = await permissions.request();

    for (final entry in statuses.entries) {
      _cachedStatus[entry.key] = entry.value;
    }

    debugPrint('✅ Multiple permissions requested');
    return statuses;
  }

  /// Check permission status without requesting
  Future<PermissionStatus> checkPermission(Permission permission) async {
    // Return cached status if available
    if (_cachedStatus.containsKey(permission)) {
      return _cachedStatus[permission]!;
    }

    final status = await permission.status;
    _cachedStatus[permission] = status;
    return status;
  }

  /// Check if permission is granted
  Future<bool> isPermissionGranted(Permission permission) async {
    final status = await checkPermission(permission);
    return status.isGranted;
  }

  /// Open app settings for manual permission management
  static Future<bool> openAppSettings() {
    debugPrint('⚙️ Opening app settings');
    return openAppSettings();
  }

  /// Get cached permission status
  PermissionStatus? getCachedStatus(Permission permission) {
    return _cachedStatus[permission];
  }

  /// Clear cached statuses (useful after user changes permissions in settings)
  void clearCache() {
    _cachedStatus.clear();
    debugPrint('🗑️ Permission cache cleared');
  }

  /// Get all cached permissions
  Map<Permission, PermissionStatus> get allCachedPermissions =>
      Map.from(_cachedStatus);
}
