import 'dart:async';
import 'package:flutter/material.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

/// Network status indicator widget
/// Shows current connection status with badge
class NetworkStatusIndicator extends StatefulWidget {
  final bool showLabel;
  final bool compact;

  const NetworkStatusIndicator({
    super.key,
    this.showLabel = true,
    this.compact = false,
  });

  @override
  State<NetworkStatusIndicator> createState() => _NetworkStatusIndicatorState();
}

class _NetworkStatusIndicatorState extends State<NetworkStatusIndicator> {
  bool _isOnline = true;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;

  @override
  void initState() {
    super.initState();
    _checkConnectivity();
    _setupConnectivityListener();
  }

  @override
  void dispose() {
    _connectivitySubscription?.cancel();
    super.dispose();
  }

  Future<void> _checkConnectivity() async {
    final connectivityResult = await Connectivity().checkConnectivity();
    if (mounted) {
      setState(() {
        _isOnline = !connectivityResult.contains(ConnectivityResult.none);
      });
    }
  }

  void _setupConnectivityListener() {
    _connectivitySubscription = Connectivity()
        .onConnectivityChanged
        .listen((List<ConnectivityResult> results) {
      if (mounted) {
        setState(() {
          _isOnline = !results.contains(ConnectivityResult.none);
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isOnline && !widget.compact) {
      return const SizedBox.shrink();
    }

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: widget.compact ? 8 : 12,
        vertical: widget.compact ? 4 : 6,
      ),
      decoration: BoxDecoration(
        color: _isOnline
            ? Colors.green.withOpacity(0.1)
            : Colors.red.withOpacity(0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: _isOnline
              ? Colors.green.withOpacity(0.3)
              : Colors.red.withOpacity(0.3),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            _isOnline ? Icons.wifi : Icons.wifi_off,
            size: widget.compact ? 14 : 16,
            color: _isOnline ? Colors.green : Colors.red,
          ),
          if (widget.showLabel) ...[
            const SizedBox(width: 6),
            Text(
              _isOnline ? 'Online' : 'Offline',
              style: TextStyle(
                fontSize: widget.compact ? 11 : 12,
                fontWeight: FontWeight.w600,
                color: _isOnline ? Colors.green[700] : Colors.red[700],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Offline mode banner shown at top of screen when offline
class OfflineModeBanner extends StatefulWidget {
  const OfflineModeBanner({super.key});

  @override
  State<OfflineModeBanner> createState() => _OfflineModeBannerState();
}

class _OfflineModeBannerState extends State<OfflineModeBanner> {
  bool _isOnline = true;
  bool _isDismissed = false;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;

  @override
  void initState() {
    super.initState();
    _checkConnectivity();
    _setupConnectivityListener();
  }

  @override
  void dispose() {
    _connectivitySubscription?.cancel();
    super.dispose();
  }

  Future<void> _checkConnectivity() async {
    final connectivityResult = await Connectivity().checkConnectivity();
    if (mounted) {
      setState(() {
        _isOnline = !connectivityResult.contains(ConnectivityResult.none);
      });
    }
  }

  void _setupConnectivityListener() {
    _connectivitySubscription = Connectivity()
        .onConnectivityChanged
        .listen((List<ConnectivityResult> results) {
      final wasOnline = _isOnline;
      final isOnlineNow = !results.contains(ConnectivityResult.none);

      if (mounted) {
        setState(() {
          _isOnline = isOnlineNow;
          // Reset dismissed state when connectivity changes
          if (!isOnlineNow) {
            _isDismissed = false;
          }
        });

        // Show snackbar when coming back online
        if (!wasOnline && isOnlineNow) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Row(
                children: [
                  Icon(Icons.cloud_done, color: Colors.white),
                  SizedBox(width: 12),
                  Text('Back online - Syncing your data...'),
                ],
              ),
              backgroundColor: Colors.green,
              duration: Duration(seconds: 3),
            ),
          );
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    // Don't show if online or dismissed
    if (_isOnline || _isDismissed) return const SizedBox.shrink();

    return Material(
      elevation: 8,
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: () {
          setState(() {
            _isDismissed = true;
          });
        },
        borderRadius: BorderRadius.circular(12),
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [Colors.orange[700]!, Colors.orange[600]!],
            ),
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.2),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Row(
            children: [
              const Icon(Icons.cloud_off, color: Colors.white, size: 18),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  'Offline - Changes will sync when connected',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w500,
                    fontSize: 13,
                  ),
                ),
              ),
              GestureDetector(
                onTap: _checkConnectivity,
                child: const Icon(Icons.refresh, color: Colors.white, size: 20),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: () {
                  setState(() {
                    _isDismissed = true;
                  });
                },
                child: const Icon(Icons.close, color: Colors.white, size: 18),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
