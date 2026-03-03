import 'package:flutter/material.dart';

class NetworkWarningBanner extends StatefulWidget {
  final String message;
  final Duration duration;
  final VoidCallback? onDismiss;

  const NetworkWarningBanner({
    super.key,
    required this.message,
    this.duration = const Duration(seconds: 5),
    this.onDismiss,
  });

  @override
  State<NetworkWarningBanner> createState() => _NetworkWarningBannerState();
}

class _NetworkWarningBannerState extends State<NetworkWarningBanner>
    with SingleTickerProviderStateMixin {
  late AnimationController _animationController;
  late Animation<Offset> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );

    _slideAnimation =
        Tween<Offset>(begin: const Offset(0, -1), end: Offset.zero).animate(
          CurvedAnimation(parent: _animationController, curve: Curves.easeOut),
        );

    _animationController.forward();

    // Auto-dismiss after duration
    Future.delayed(widget.duration, () {
      if (mounted) {
        _animationController.reverse().then((_) {
          widget.onDismiss?.call();
        });
      }
    });
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  Color _getWarningColor(String message) {
    if (message.contains('🌐')) {
      return Colors.orange; // Network degrading
    } else if (message.contains('latency')) {
      return Colors.deepOrange; // High latency
    } else if (message.contains('loss')) {
      return Colors.red; // Packet loss
    }
    return Colors.orange; // Default
  }

  IconData _getWarningIcon(String message) {
    if (message.contains('🌐')) {
      return Icons.signal_cellular_nodata;
    } else if (message.contains('latency')) {
      return Icons.speed;
    } else if (message.contains('loss')) {
      return Icons.warning;
    }
    return Icons.info;
  }

  @override
  Widget build(BuildContext context) {
    final color = _getWarningColor(widget.message);
    final icon = _getWarningIcon(widget.message);

    return SlideTransition(
      position: _slideAnimation,
      child: Container(
        color: color.withOpacity(0.95),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Icon(icon, color: Colors.white, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                widget.message,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            GestureDetector(
              onTap: () {
                _animationController.reverse().then((_) {
                  widget.onDismiss?.call();
                });
              },
              child: const Icon(Icons.close, color: Colors.white, size: 20),
            ),
          ],
        ),
      ),
    );
  }
}
