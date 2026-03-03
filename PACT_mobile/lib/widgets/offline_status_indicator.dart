import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

/// Offline Status Manager
class OfflineStatusManager {
  static final OfflineStatusManager _instance =
      OfflineStatusManager._internal();

  factory OfflineStatusManager() {
    return _instance;
  }

  OfflineStatusManager._internal();

  final _connectivity = Connectivity();
  late Stream<List<ConnectivityResult>> _connectionStream;
  int _pendingSyncCount = 0;

  /// Initialize offline status monitoring
  Future<void> initialize() async {
    _connectionStream = _connectivity.onConnectivityChanged;
    debugPrint('📡 Offline status manager initialized');
  }

  /// Get current connectivity status
  Future<bool> isOnline() async {
    try {
      final result = await _connectivity.checkConnectivity();
      return result.isNotEmpty && !result.contains(ConnectivityResult.none);
    } catch (e) {
      debugPrint('Error checking connectivity: $e');
      return false;
    }
  }

  /// Get connectivity stream
  Stream<List<ConnectivityResult>> getConnectivityStream() {
    return _connectionStream;
  }

  /// Update pending sync count
  void setPendingSyncCount(int count) {
    _pendingSyncCount = count;
    debugPrint('📤 Pending syncs: $_pendingSyncCount');
  }

  /// Get pending sync count
  int getPendingSyncCount() => _pendingSyncCount;

  /// Increment pending sync count
  void incrementPendingSync() {
    _pendingSyncCount++;
  }

  /// Decrement pending sync count
  void decrementPendingSync() {
    if (_pendingSyncCount > 0) {
      _pendingSyncCount--;
    }
  }
}

/// Offline Status Indicator Widget
class OfflineStatusIndicator extends StatefulWidget {
  final Widget child;
  final Duration hideDuration;

  const OfflineStatusIndicator({
    super.key,
    required this.child,
    this.hideDuration = const Duration(seconds: 4),
  });

  @override
  State<OfflineStatusIndicator> createState() => _OfflineStatusIndicatorState();
}

class _OfflineStatusIndicatorState extends State<OfflineStatusIndicator> {
  late final OfflineStatusManager _offlineManager;
  late Stream<List<ConnectivityResult>> _connectionStream;
  bool _isOnline = true;
  bool _showIndicator = false;
  final int _pendingSyncCount = 0;

  @override
  void initState() {
    super.initState();
    _offlineManager = OfflineStatusManager();
    _connectionStream = _offlineManager.getConnectivityStream();
    _checkInitialStatus();
  }

  Future<void> _checkInitialStatus() async {
    final isOnline = await _offlineManager.isOnline();
    if (mounted) {
      setState(() {
        _isOnline = isOnline;
        _showIndicator = !isOnline;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<ConnectivityResult>>(
      stream: _connectionStream,
      builder: (context, snapshot) {
        if (snapshot.hasData) {
          final isOnline =
              snapshot.data!.isNotEmpty &&
              !snapshot.data!.contains(ConnectivityResult.none);

          if (isOnline && _isOnline == false) {
            // Came back online
            _showOfflineMessage('Back Online', Colors.green);
          } else if (!isOnline && _isOnline == true) {
            // Went offline
            _showOfflineMessage('You\'re Offline', Colors.red);
          }

          _isOnline = isOnline;
        }

        return Stack(
          alignment: Alignment.topLeft,
          textDirection: TextDirection.ltr,
          children: [
            widget.child,
            if (_showIndicator)
              Positioned(top: 0, left: 0, right: 0, child: _buildOfflineBar()),
          ],
        );
      },
    );
  }

  Widget _buildOfflineBar() {
    return SafeArea(
      bottom: false,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: _isOnline ? Colors.green.shade600 : Colors.red.shade600,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.1),
              blurRadius: 4,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          children: [
            Icon(
              _isOnline ? Icons.cloud_done_outlined : Icons.cloud_off_outlined,
              color: Colors.white,
              size: 20,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _isOnline ? 'Connection Restored' : 'No Connection',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                  if (_pendingSyncCount > 0 && !_isOnline)
                    Text(
                      '$_pendingSyncCount pending changes',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        fontWeight: FontWeight.w400,
                        color: Colors.white70,
                      ),
                    ),
                  if (_pendingSyncCount > 0 && _isOnline)
                    Text(
                      'Syncing $_pendingSyncCount changes...',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        fontWeight: FontWeight.w400,
                        color: Colors.white70,
                      ),
                    ),
                ],
              ),
            ),
            if (_isOnline)
              Icon(Icons.check_circle_outline, color: Colors.white, size: 18),
          ],
        ),
      ),
    );
  }

  void _showOfflineMessage(String message, Color color) {
    if (mounted) {
      setState(() {
        _showIndicator = true;
      });

      if (_isOnline) {
        // Auto-hide after duration when coming back online
        Future.delayed(widget.hideDuration, () {
          if (mounted) {
            setState(() {
              _showIndicator = false;
            });
          }
        });
      }
    }
  }
}
