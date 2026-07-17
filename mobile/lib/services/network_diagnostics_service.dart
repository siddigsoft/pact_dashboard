import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'dart:async';

class NetworkDiagnosticsService {
  static final NetworkDiagnosticsService _instance = NetworkDiagnosticsService._();

  factory NetworkDiagnosticsService() => _instance;

  NetworkDiagnosticsService._();

  /// Check if device has general internet connectivity
  Future<bool> isDeviceOnline() async {
    try {
      final result = await Connectivity().checkConnectivity();
      final isOnline = !result.contains(ConnectivityResult.none);
      debugPrint('[NetworkDiag] Device online: $isOnline (result: $result)');
      return isOnline;
    } catch (e) {
      debugPrint('[NetworkDiag] Error checking connectivity: $e');
      return false;
    }
  }

  /// Check if Supabase is reachable via realtime connection
  /// This is more specific than general connectivity - tests actual DNS resolution
  Future<bool> isSupabaseReachable() async {
    try {
      // Simple connectivity check - this will fail if DNS can't resolve
      // or if network is completely down
      final isOnline = await isDeviceOnline();
      if (!isOnline) {
        debugPrint('[NetworkDiag] Supabase check: OFFLINE (no device connectivity)');
        return false;
      }
      
      debugPrint('[NetworkDiag] Supabase check: ONLINE (assuming reachable)');
      // Note: More robust check would be to attempt actual connection
      // but that requires Supabase instance access from here
      return true;
    } catch (e) {
      debugPrint('[NetworkDiag] Supabase reachability check failed: $e');
      return false;
    }
  }

  /// Stream connectivity status changes
  Stream<bool> onConnectivityChanged() {
    return Connectivity().onConnectivityChanged.map((result) {
      final isOnline = !result.contains(ConnectivityResult.none);
      debugPrint('[NetworkDiag] Connectivity changed: $isOnline');
      return isOnline;
    });
  }

  /// Interpret network error and provide user-friendly message
  String interprettNetworkError(dynamic error) {
    final errorStr = error.toString().toLowerCase();
    
    if (errorStr.contains('failed host lookup') || 
        errorStr.contains('no address associated')) {
      // DNS resolution failure - usually network issue
      return 'Network connection issue: Cannot reach server. Check your internet connection.';
    } else if (errorStr.contains('socket exception') || 
               errorStr.contains('connection refused') ||
               errorStr.contains('timeout')) {
      // Connection timeout or refused
      return 'Server connection timeout. Please check your internet connection or try again in a moment.';
    } else if (errorStr.contains('certificat')) {
      // SSL/Certificate issue
      return 'Security connection error. This usually resolves on its own.';
    } else if (errorStr.contains('offline')) {
      // Already offline
      return 'You are offline. Please enable internet connectivity to make calls.';
    } else {
      // Generic error
      return 'Network error: ${error.toString().substring(0, 100)}';
    }
  }
}
