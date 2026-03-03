// lib/screens/calls/professional_incoming_call_screen.dart
// Professional-grade incoming call screen with verification, call context, and enterprise features

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/call_state.dart';
import '../../providers/call_provider.dart';

class ProfessionalIncomingCallScreen extends ConsumerStatefulWidget {
  final String callerId;
  final String callerName;
  final String? callerAvatar;
  final String? callerDepartment;
  final bool isVerified;
  final CallType callType;
  final CallPriority priority;
  final String? callReason;
  final DateTime? scheduledTime;
  final Map<String, dynamic>? callContext;

  const ProfessionalIncomingCallScreen({
    super.key,
    required this.callerId,
    required this.callerName,
    this.callerAvatar,
    this.callerDepartment,
    this.isVerified = false,
    this.callType = CallType.audio,
    this.priority = CallPriority.normal,
    this.callReason,
    this.scheduledTime,
    this.callContext,
  });

  @override
  ConsumerState<ProfessionalIncomingCallScreen> createState() =>
      _ProfessionalIncomingCallScreenState();
}

class _ProfessionalIncomingCallScreenState
    extends ConsumerState<ProfessionalIncomingCallScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;
  bool _isDeciding = false;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 0.95, end: 1.08).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  void _acceptCall() {
    if (_isDeciding) return;
    setState(() => _isDeciding = true);

    ref.read(callStateProvider.notifier).acceptCall();

    // Navigate to active call with transition animation
    Navigator.of(context).pushReplacementNamed(
      '/active-call',
      arguments: {
        'callerId': widget.callerId,
        'callerName': widget.callerName,
        'callerAvatar': widget.callerAvatar,
        'isVideoCall': widget.callType == CallType.video,
      },
    );
  }

  void _rejectCall() {
    if (_isDeciding) return;
    setState(() => _isDeciding = true);

    ref.read(callStateProvider.notifier).rejectCall();
    Navigator.of(context).pop();
  }

  void _rejectWithMessage() {
    showDialog(
      context: context,
      builder: (context) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Colors.grey[100]!, Colors.white],
            ),
          ),
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Send Message',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 16),
              ...[
                'I\'m in a meeting',
                'I\'ll call you back',
                'Call me later',
                'Not available now',
              ].map(
                (msg) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: SizedBox(
                    width: double.infinity,
                    child: TextButton(
                      onPressed: () {
                        // Send auto-reply message
                        _rejectCall();
                        Navigator.pop(context);
                      },
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                          vertical: 12,
                          horizontal: 16,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: Text(msg),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _scheduleCallback() {
    showDatePicker(
      context: context,
      initialDate: DateTime.now().add(const Duration(hours: 1)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 30)),
    ).then((date) {
      if (date != null) {
        showTimePicker(context: context, initialTime: TimeOfDay.now()).then((
          time,
        ) {
          if (time != null) {
            // Schedule callback
            _rejectCall();
          }
        });
      }
    });
  }

  String _getInitials(String name) {
    return name.split(' ').take(2).map((s) => s[0].toUpperCase()).join();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: _isDeciding
          ? const Center(child: CircularProgressIndicator())
          : Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    theme.primaryColor.withValues(alpha: 0.8),
                    theme.primaryColor.withValues(alpha: 0.9),
                  ],
                ),
              ),
              child: SafeArea(
                child: Column(
                  children: [
                    // Header with minimal info
                    Padding(
                      padding: const EdgeInsets.only(top: 20),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          // Decline info
                          Padding(
                            padding: const EdgeInsets.only(left: 16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  'Incoming Call',
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: Colors.white70,
                                  ),
                                ),
                                if (widget.priority != CallPriority.normal)
                                  Text(
                                    widget.priority.name.toUpperCase(),
                                    style: theme.textTheme.labelSmall?.copyWith(
                                      color: _getPriorityColor(),
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          // Close button
                          Padding(
                            padding: const EdgeInsets.only(right: 16),
                            child: IconButton(
                              icon: const Icon(
                                Icons.close,
                                color: Colors.white70,
                              ),
                              onPressed: _rejectCall,
                              tooltip: 'Decline',
                            ),
                          ),
                        ],
                      ),
                    ),

                    const Spacer(flex: 1),

                    // Caller Avatar with Pulse Effect
                    ScaleTransition(
                      scale: _pulseAnimation,
                      child: Container(
                        width: 140,
                        height: 140,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.3),
                              blurRadius: 20,
                              spreadRadius: 5,
                            ),
                          ],
                        ),
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            CircleAvatar(
                              radius: 70,
                              backgroundImage: widget.callerAvatar != null
                                  ? NetworkImage(widget.callerAvatar!)
                                  : null,
                              backgroundColor: theme.primaryColor.withValues(
                                alpha: 0.3,
                              ),
                              child: widget.callerAvatar == null
                                  ? Text(
                                      _getInitials(widget.callerName),
                                      style: theme.textTheme.headlineLarge
                                          ?.copyWith(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w500,
                                          ),
                                    )
                                  : null,
                            ),
                            // Verification Badge
                            if (widget.isVerified)
                              Positioned(
                                bottom: 0,
                                right: 0,
                                child: Container(
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: Colors.blue[600],
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.blue.withValues(
                                          alpha: 0.5,
                                        ),
                                        blurRadius: 12,
                                        spreadRadius: 2,
                                      ),
                                    ],
                                  ),
                                  padding: const EdgeInsets.all(8),
                                  child: const Icon(
                                    Icons.verified,
                                    color: Colors.white,
                                    size: 28,
                                  ),
                                ),
                              ),
                            // Call Type Badge
                            Positioned(
                              bottom: 0,
                              left: 0,
                              child: Container(
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: widget.callType == CallType.video
                                      ? Colors.blue
                                      : Colors.grey[700],
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.black.withValues(
                                        alpha: 0.3,
                                      ),
                                      blurRadius: 8,
                                    ),
                                  ],
                                ),
                                padding: const EdgeInsets.all(8),
                                child: Icon(
                                  widget.callType == CallType.video
                                      ? Icons.videocam
                                      : Icons.phone,
                                  color: Colors.white,
                                  size: 24,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 32),

                    // Caller Information
                    Text(
                      widget.callerName,
                      style: theme.textTheme.headlineSmall?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.5,
                      ),
                      textAlign: TextAlign.center,
                    ),

                    if (widget.callerDepartment != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        widget.callerDepartment!,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: Colors.white70,
                        ),
                      ),
                    ],

                    if (widget.callReason != null) ...[
                      const SizedBox(height: 8),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 32),
                        child: Text(
                          'Subject: ${widget.callReason}',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: Colors.white60,
                            fontStyle: FontStyle.italic,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ],

                    if (widget.scheduledTime != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        'Scheduled call',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: Colors.yellow[100],
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],

                    const Spacer(flex: 2),

                    // Call Context (recent history)
                    if (widget.callContext != null &&
                        widget.callContext!['lastCall'] != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 24),
                        child: Container(
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: 0.2),
                            ),
                          ),
                          padding: const EdgeInsets.all(12),
                          child: Row(
                            children: [
                              Icon(
                                Icons.history,
                                color: Colors.white70,
                                size: 20,
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      'Last call ${widget.callContext!['lastCallDuration']}',
                                      style: theme.textTheme.bodySmall
                                          ?.copyWith(color: Colors.white70),
                                    ),
                                    Text(
                                      widget.callContext!['lastCallTime'] ??
                                          '2 days ago',
                                      style: theme.textTheme.labelSmall
                                          ?.copyWith(color: Colors.white60),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),

                    const SizedBox(height: 32),

                    // Action Buttons
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: Column(
                        children: [
                          // Primary Action: Accept Call
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 32),
                            child: Container(
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(20),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.white.withValues(alpha: 0.3),
                                    blurRadius: 20,
                                    spreadRadius: 2,
                                  ),
                                ],
                              ),
                              child: ElevatedButton(
                                onPressed: _acceptCall,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.green[400],
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 14,
                                    horizontal: 48,
                                  ),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(20),
                                  ),
                                  elevation: 8,
                                ),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(
                                      widget.callType == CallType.video
                                          ? Icons.videocam
                                          : Icons.call,
                                      size: 24,
                                    ),
                                    const SizedBox(width: 12),
                                    Text(
                                      widget.callType == CallType.video
                                          ? 'Accept Video'
                                          : 'Accept Call',
                                      style: theme.textTheme.labelLarge
                                          ?.copyWith(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w600,
                                            letterSpacing: 0.5,
                                          ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),

                          const SizedBox(height: 16),

                          // Secondary Actions Row
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                            children: [
                              // Reject
                              _buildSecondaryButton(
                                icon: Icons.call_end,
                                label: 'Decline',
                                onPressed: _rejectCall,
                                color: Colors.red[300],
                              ),

                              // Reply with Message
                              _buildSecondaryButton(
                                icon: Icons.message,
                                label: 'Message',
                                onPressed: _rejectWithMessage,
                                color: Colors.amber[300],
                              ),

                              // Schedule Callback
                              _buildSecondaryButton(
                                icon: Icons.schedule,
                                label: 'Callback',
                                onPressed: _scheduleCallback,
                                color: Colors.blue[300],
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 16),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildSecondaryButton({
    required IconData icon,
    required String label,
    required VoidCallback onPressed,
    required Color? color,
  }) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.white.withValues(alpha: 0.2),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.1),
                blurRadius: 8,
              ),
            ],
          ),
          child: IconButton(
            onPressed: onPressed,
            icon: Icon(icon, color: Colors.white),
            iconSize: 24,
            padding: const EdgeInsets.all(12),
            constraints: const BoxConstraints(minWidth: 56, minHeight: 56),
            tooltip: label,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          label,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: Colors.white70,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }

  Color _getPriorityColor() {
    switch (widget.priority) {
      case CallPriority.urgent:
        return Colors.red;
      case CallPriority.high:
        return Colors.orange;
      default:
        return Colors.green;
    }
  }
}
