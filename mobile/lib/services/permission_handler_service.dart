// lib/services/permission_handler_service.dart

import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';

class PermissionHandlerService {
  static final PermissionHandlerService _instance =
      PermissionHandlerService._internal();
  factory PermissionHandlerService() => _instance;
  PermissionHandlerService._internal();

  Future<Map<Permission, PermissionStatus>> requestAllPermissions() async {
    final permissions = <Permission>[
      Permission.camera,
      Permission.microphone,
      Permission.location,
      Permission.locationWhenInUse,
      Permission.storage,
      Permission.photos,
      Permission.notification,
    ];

    if (Platform.isAndroid) {
      permissions.addAll([
        Permission.phone,
        Permission.bluetooth,
        Permission.bluetoothConnect,
        Permission.bluetoothScan,
      ]);
    }

    final statuses = await permissions.request();

    for (final entry in statuses.entries) {
      debugPrint('[Permissions] ${entry.key}: ${entry.value}');
    }

    return statuses;
  }

  Future<bool> requestCameraPermission() async {
    final status = await Permission.camera.request();
    debugPrint('[Permissions] Camera: $status');
    return status.isGranted;
  }

  Future<bool> requestMicrophonePermission() async {
    final status = await Permission.microphone.request();
    debugPrint('[Permissions] Microphone: $status');
    return status.isGranted;
  }

  Future<bool> requestCallPermissions() async {
    final micStatus = await Permission.microphone.request();
    debugPrint('[Permissions] Microphone for call: $micStatus');

    if (!micStatus.isGranted) {
      return false;
    }

    if (Platform.isAndroid) {
      final phoneStatus = await Permission.phone.request();
      debugPrint('[Permissions] Phone: $phoneStatus');

      final bluetoothStatus = await Permission.bluetoothConnect.request();
      debugPrint('[Permissions] Bluetooth: $bluetoothStatus');
    }

    return true;
  }

  Future<bool> requestLocationPermission() async {
    final status = await Permission.locationWhenInUse.request();
    debugPrint('[Permissions] Location: $status');
    return status.isGranted;
  }

  Future<bool> requestStoragePermission() async {
    if (Platform.isAndroid) {
      final storageStatus = await Permission.storage.request();
      final photosStatus = await Permission.photos.request();
      debugPrint(
        '[Permissions] Storage: $storageStatus, Photos: $photosStatus',
      );
      return storageStatus.isGranted || photosStatus.isGranted;
    } else {
      final status = await Permission.photos.request();
      debugPrint('[Permissions] Photos: $status');
      return status.isGranted;
    }
  }

  Future<bool> requestNotificationPermission() async {
    final status = await Permission.notification.request();
    debugPrint('[Permissions] Notification: $status');
    return status.isGranted;
  }

  Future<bool> hasCameraPermission() async {
    return await Permission.camera.isGranted;
  }

  Future<bool> hasMicrophonePermission() async {
    return await Permission.microphone.isGranted;
  }

  Future<bool> hasLocationPermission() async {
    return await Permission.locationWhenInUse.isGranted;
  }

  Future<bool> hasStoragePermission() async {
    if (Platform.isAndroid) {
      return await Permission.storage.isGranted ||
          await Permission.photos.isGranted;
    }
    return await Permission.photos.isGranted;
  }

  Future<bool> openSystemSettings() async {
    return await openAppSettings();
  }

  Future<Map<String, bool>> checkAllPermissions() async {
    return {
      'camera': await Permission.camera.isGranted,
      'microphone': await Permission.microphone.isGranted,
      'location': await Permission.locationWhenInUse.isGranted,
      'storage':
          await Permission.storage.isGranted ||
          await Permission.photos.isGranted,
      'notification': await Permission.notification.isGranted,
      'phone': Platform.isAndroid ? await Permission.phone.isGranted : true,
      'bluetooth': Platform.isAndroid
          ? await Permission.bluetoothConnect.isGranted
          : true,
    };
  }
}
