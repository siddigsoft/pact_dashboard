import 'dart:async';
import 'package:shorebird_code_push/shorebird_code_push.dart';
import 'notification_service.dart';

class UpdateService {
  static final UpdateService _instance = UpdateService._internal();
  factory UpdateService() => _instance;
  UpdateService._internal();

  final ShorebirdCodePush _codePush = ShorebirdCodePush();
  Timer? _updateCheckTimer;
  bool _isCheckingForUpdate = false;

  // Check for updates on app start
  Future<void> checkForUpdatesOnStartup() async {
    try {
      // Check if Shorebird is available
      final isAvailable = _codePush.isShorebirdAvailable();
      if (!isAvailable) {
        print('Shorebird is not available on this platform');
        return;
      }

      // Check if an update is available
      final updateAvailable = await _codePush.isNewPatchAvailableForDownload();

      if (updateAvailable) {
        // Get current patch info
        final currentPatchNumber = await _codePush.currentPatchNumber();

        // Show notification to user
        await NotificationService.showAppUpdateNotification(
          version: 'Patch ${currentPatchNumber ?? 'latest'}',
          description:
              'A new update is available. Tap to download and install.',
        );
      }
    } catch (e) {
      print('Error checking for updates: $e');
    }
  }

  // Download and install update
  Future<bool> downloadAndInstallUpdate() async {
    try {
      // Check if Shorebird is available
      final isAvailable = _codePush.isShorebirdAvailable();
      if (!isAvailable) {
        print('Shorebird is not available on this platform');
        return false;
      }

      // Check if an update is available
      final updateAvailable = await _codePush.isNewPatchAvailableForDownload();

      if (!updateAvailable) {
        print('No update available');
        return false;
      }

      // Show downloading notification
      await NotificationService.showUpdateDownloadingNotification();

      // Download the patch
      await _codePush.downloadUpdateIfAvailable();

      // Show success notification
      await NotificationService.showUpdateInstalledNotification();

      return true;
    } catch (e) {
      print('Error downloading update: $e');
      return false;
    }
  }

  // Start periodic update checks (every 30 minutes)
  void startPeriodicUpdateCheck(
      {Duration interval = const Duration(minutes: 30)}) {
    _updateCheckTimer?.cancel();
    _updateCheckTimer = Timer.periodic(interval, (_) async {
      if (!_isCheckingForUpdate) {
        _isCheckingForUpdate = true;
        await checkForUpdatesOnStartup();
        _isCheckingForUpdate = false;
      }
    });
  }

  // Stop periodic update checks
  void stopPeriodicUpdateCheck() {
    _updateCheckTimer?.cancel();
    _updateCheckTimer = null;
  }

  // Get current patch number
  Future<int?> getCurrentPatchNumber() async {
    try {
      return await _codePush.currentPatchNumber();
    } catch (e) {
      print('Error getting current patch number: $e');
      return null;
    }
  }

  // Check if a new patch is ready to install (already downloaded)
  Future<bool> isNewPatchReadyToInstall() async {
    try {
      return await _codePush.isNewPatchReadyToInstall();
    } catch (e) {
      print('Error checking if patch is ready: $e');
      return false;
    }
  }

  void dispose() {
    stopPeriodicUpdateCheck();
  }
}
