import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/call_provider.dart';

class IncomingCallScreen extends ConsumerStatefulWidget {
  final String callerId;
  final String callerName;
  final String? callerAvatar;
  final bool isVideoCall;

  const IncomingCallScreen({
    super.key,
    required this.callerId,
    required this.callerName,
    this.callerAvatar,
    this.isVideoCall = false,
  });

  @override
  ConsumerState<IncomingCallScreen> createState() => _IncomingCallScreenState();
}

class _IncomingCallScreenState extends ConsumerState<IncomingCallScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      duration: const Duration(seconds: 2),
      vsync: this,
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.3).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  void _acceptCall() {
    ref.read(callStateProvider.notifier).acceptCall();
    Navigator.of(context).pushReplacementNamed(
      '/active-call',
      arguments: {
        'callerId': widget.callerId,
        'callerName': widget.callerName,
        'callerAvatar': widget.callerAvatar,
        'isVideoCall': widget.isVideoCall,
      },
    );
  }

  void _rejectCall() {
    ref.read(callStateProvider.notifier).rejectCall();
    Navigator.of(context).pop();
  }

  String _getInitials(String name) {
    final parts = name.split(' ');
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return name.isNotEmpty ? name[0].toUpperCase() : '?';
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Theme.of(context).primaryColor.withValues(alpha: 0.8),
              Theme.of(context).primaryColor.withValues(alpha: 0.95),
              Theme.of(context).primaryColor,
            ],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              const Spacer(flex: 2),

              ScaleTransition(
                scale: _pulseAnimation,
                child: Container(
                  width: 140,
                  height: 140,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withValues(alpha: 0.2),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.2),
                        blurRadius: 20,
                        spreadRadius: 5,
                      ),
                    ],
                  ),
                  child: Center(
                    child: Container(
                      width: 120,
                      height: 120,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white,
                        image: widget.callerAvatar != null
                            ? DecorationImage(
                                image: NetworkImage(widget.callerAvatar!),
                                fit: BoxFit.cover,
                              )
                            : null,
                      ),
                      child: widget.callerAvatar == null
                          ? Center(
                              child: Text(
                                _getInitials(widget.callerName),
                                style: TextStyle(
                                  fontSize: 48,
                                  fontWeight: FontWeight.bold,
                                  color: Theme.of(context).primaryColor,
                                ),
                              ),
                            )
                          : null,
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 32),

              Text(
                widget.callerName,
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),

              const SizedBox(height: 12),

              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    widget.isVideoCall ? Icons.videocam : Icons.phone,
                    color: Colors.white70,
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    widget.isVideoCall
                        ? (isArabic
                              ? 'مكالمة فيديو واردة'
                              : 'Incoming Video Call')
                        : (isArabic
                              ? 'مكالمة صوتية واردة'
                              : 'Incoming Voice Call'),
                    style: const TextStyle(fontSize: 16, color: Colors.white70),
                  ),
                ],
              ),

              const Spacer(flex: 3),

              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _CallActionButton(
                    onPressed: _rejectCall,
                    icon: Icons.call_end,
                    backgroundColor: Colors.red,
                    label: isArabic ? 'رفض' : 'Decline',
                  ),
                  _CallActionButton(
                    onPressed: _acceptCall,
                    icon: Icons.call,
                    backgroundColor: Colors.green,
                    label: isArabic ? 'قبول' : 'Accept',
                  ),
                ],
              ),

              const SizedBox(height: 48),
            ],
          ),
        ),
      ),
    );
  }
}

class _CallActionButton extends StatelessWidget {
  final VoidCallback onPressed;
  final IconData icon;
  final Color backgroundColor;
  final String label;

  const _CallActionButton({
    required this.onPressed,
    required this.icon,
    required this.backgroundColor,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 70,
          height: 70,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: backgroundColor,
            boxShadow: [
              BoxShadow(
                color: backgroundColor.withValues(alpha: 0.4),
                blurRadius: 15,
                spreadRadius: 2,
              ),
            ],
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onPressed,
              borderRadius: BorderRadius.circular(35),
              child: Center(child: Icon(icon, size: 32, color: Colors.white)),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}
