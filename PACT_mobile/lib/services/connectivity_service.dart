import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

class ConnectivityService {
  final Connectivity _connectivity;
  bool _isOnline = false;
  final StreamController<bool> _connectivityController =
      StreamController<bool>.broadcast();
  final StreamController<String> _networkTypeController =
      StreamController<String>.broadcast();

  String _currentNetworkType = 'unknown';

  ConnectivityService(this._connectivity);

  bool get isOnline => _isOnline;
  String get networkType => _currentNetworkType;
  Stream<bool> get connectivityStream => _connectivityController.stream;
  Stream<String> get networkTypeStream => _networkTypeController.stream;

  Future<void> initialize() async {
    // Check initial connectivity
    try {
      final result = await _connectivity.checkConnectivity();
      _updateConnectionStatus(result);
    } catch (e) {
      debugPrint('Failed to get connectivity: $e');
      _isOnline = false;
    }

    // Listen for connectivity changes
    _connectivity.onConnectivityChanged.listen(_updateConnectionStatus);
  }

  void _updateConnectionStatus(List<ConnectivityResult> results) {
    // Check if any result indicates connectivity
    final hasConnection = results.any(
      (result) =>
          result != ConnectivityResult.none &&
          result != ConnectivityResult.bluetooth,
    );

    _isOnline = hasConnection;

    // Determine network type
    if (results.contains(ConnectivityResult.wifi)) {
      _currentNetworkType = 'WiFi';
    } else if (results.contains(ConnectivityResult.mobile)) {
      _currentNetworkType = 'Mobile';
    } else if (results.contains(ConnectivityResult.ethernet)) {
      _currentNetworkType = 'Ethernet';
    } else if (results.isNotEmpty && results.first != ConnectivityResult.none) {
      _currentNetworkType = results.first.toString().split('.').last;
    } else {
      _currentNetworkType = 'Offline';
    }

    _connectivityController.add(_isOnline);
    _networkTypeController.add(_currentNetworkType);

    debugPrint('Connectivity changed: $_isOnline ($_currentNetworkType)');
  }

  Future<bool> checkConnectivity() async {
    try {
      final results = await _connectivity.checkConnectivity();
      // Handle List<ConnectivityResult> from newer connectivity_plus
      return (results as List).any(
        (r) =>
            r != ConnectivityResult.none && r != ConnectivityResult.bluetooth,
      );
    } catch (e) {
      return false;
    }
  }

  /// Get current connection quality estimate
  Future<ConnectionQuality> getConnectionQuality() async {
    if (!_isOnline) return ConnectionQuality.offline;

    // Simulate connection quality based on network type
    if (_currentNetworkType == 'WiFi') {
      return ConnectionQuality.excellent;
    } else if (_currentNetworkType == 'Mobile') {
      return ConnectionQuality.good;
    } else if (_currentNetworkType == 'Ethernet') {
      return ConnectionQuality.excellent;
    } else {
      return ConnectionQuality.fair;
    }
  }

  /// Dispose resources
  Future<void> dispose() async {
    await _connectivityController.close();
    await _networkTypeController.close();
  }
}

/// Connection quality enum
enum ConnectionQuality { offline, poor, fair, good, excellent }

extension ConnectionQualityX on ConnectionQuality {
  String get displayName {
    switch (this) {
      case ConnectionQuality.offline:
        return 'Offline';
      case ConnectionQuality.poor:
        return 'Poor';
      case ConnectionQuality.fair:
        return 'Fair';
      case ConnectionQuality.good:
        return 'Good';
      case ConnectionQuality.excellent:
        return 'Excellent';
    }
  }

  bool get isOffline => this == ConnectionQuality.offline;
  bool get isGoodOrBetter => index >= ConnectionQuality.good.index;
}
