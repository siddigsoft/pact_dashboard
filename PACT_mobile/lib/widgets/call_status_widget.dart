import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/call_state.dart';

/// Enhanced call status widget showing call state and connection progress
class CallStatusWidget extends StatelessWidget {
  final CallState callState;
  final Duration callDuration;
  final bool isVideoEnabled;

  const CallStatusWidget({
    super.key,
    required this.callState,
    required this.callDuration,
    required this.isVideoEnabled,
  });

  @override
  Widget build(BuildContext context) {
    final statusText = _getStatusText();
    final statusColor = _getStatusColor();
    final statusIcon = _getStatusIcon();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: statusColor.withOpacity(0.15),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: statusColor.withOpacity(0.5)),
      ),
      child: Row(
        children: [
          Icon(statusIcon, color: statusColor, size: 24),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  statusText,
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: statusColor,
                  ),
                ),
                if (callState.status == CallStatus.connected)
                  Text(
                    'Duration: ${_formatDuration(callDuration)}',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
              ],
            ),
          ),
          if (callState.status == CallStatus.calling ||
              callState.status == CallStatus.ringing)
            SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(statusColor),
                strokeWidth: 2,
              ),
            ),
        ],
      ),
    );
  }

  String _getStatusText() {
    switch (callState.status) {
      case CallStatus.idle:
        return 'Ready for calls';
      case CallStatus.calling:
        return 'Calling...';
      case CallStatus.ringing:
        return 'Incoming call';
      case CallStatus.connected:
        return 'Call connected';
      case CallStatus.reconnecting:
        return 'Reconnecting...';
      case CallStatus.ended:
        return 'Call ended';
      case CallStatus.rejected:
        return 'Call rejected';
      default:
        return 'Unknown status';
    }
  }

  Color _getStatusColor() {
    switch (callState.status) {
      case CallStatus.calling:
      case CallStatus.ringing:
        return Colors.orange;
      case CallStatus.connected:
        return Colors.green;
      case CallStatus.reconnecting:
        return Colors.purple;
      case CallStatus.ended:
      case CallStatus.rejected:
        return Colors.red;
      case CallStatus.idle:
        return Colors.blue;
      default:
        return Colors.grey;
    }
  }

  IconData _getStatusIcon() {
    switch (callState.status) {
      case CallStatus.calling:
        return Icons.call_made;
      case CallStatus.ringing:
        return Icons.call_received;
      case CallStatus.connected:
        return Icons.call;
      case CallStatus.reconnecting:
        return Icons.sync;
      case CallStatus.ended:
        return Icons.call_end;
      case CallStatus.rejected:
        return Icons.block;
      default:
        return Icons.phone;
    }
  }

  String _formatDuration(Duration duration) {
    final hours = duration.inHours;
    final minutes = duration.inMinutes % 60;
    final seconds = duration.inSeconds % 60;

    if (hours > 0) {
      return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
    } else {
      return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
    }
  }
}

/// Call connection status toast notification
class CallConnectionStatusToast extends StatefulWidget {
  final String message;
  final bool isError;
  final Duration duration;

  const CallConnectionStatusToast({
    super.key,
    required this.message,
    this.isError = false,
    this.duration = const Duration(seconds: 3),
  });

  @override
  State<CallConnectionStatusToast> createState() =>
      _CallConnectionStatusToastState();
}

class _CallConnectionStatusToastState extends State<CallConnectionStatusToast>
    with SingleTickerProviderStateMixin {
  late AnimationController _animationController;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );

    _fadeAnimation = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeIn),
    );

    _animationController.forward();

    Future.delayed(widget.duration, () {
      if (mounted) {
        _animationController.reverse();
      }
    });
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _fadeAnimation,
      child: Container(
        margin: const EdgeInsets.all(16),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: widget.isError ? Colors.red[600] : Colors.green[600],
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.2),
              blurRadius: 8,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            Icon(
              widget.isError ? Icons.error_outline : Icons.check_circle,
              color: Colors.white,
              size: 24,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                widget.message,
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  color: Colors.white,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
