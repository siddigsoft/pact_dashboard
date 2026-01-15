import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

class ConnectivityService {
  final Connectivity _connectivity;
  bool _isOnline = false;
  final StreamController<bool> _connectivityController = StreamController<bool>.broadcast();

  ConnectivityService(this._connectivity);

  bool get isOnline => _isOnline;
  Stream<bool> get connectivityStream => _connectivityController.stream;

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
    final hasConnection = results.any((result) =>
      result != ConnectivityResult.none &&
      result != ConnectivityResult.bluetooth);

    _isOnline = hasConnection;
    _connectivityController.add(_isOnline);
    debugPrint('Connectivity changed: $_isOnline');
  }

  Future<bool> checkConnectivity() async {
    try {
      final result = await _connectivity.checkConnectivity();
      return result != ConnectivityResult.none;
    } catch (e) {
      return false;
    }
  }
}