import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

class IncomingCallOverlay extends StatelessWidget {
  final String callerName;
  final String? callerAvatar;
  final VoidCallback onAccept;
  final VoidCallback onDecline;
  final bool isVideoCall;

  const IncomingCallOverlay({
    super.key,
    required this.callerName,
    this.callerAvatar,
    required this.onAccept,
    required this.onDecline,
    this.isVideoCall = false,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black87,
      child: SafeArea(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Spacer(),
            CircleAvatar(
              radius: 60,
              backgroundColor: AppColors.primaryBlue.withOpacity(0.2),
              backgroundImage: callerAvatar != null ? NetworkImage(callerAvatar!) : null,
              child: callerAvatar == null
                  ? Text(
                      callerName.isNotEmpty ? callerName[0].toUpperCase() : '?',
                      style: GoogleFonts.poppins(
                        fontSize: 48,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    )
                  : null,
            ),
            const SizedBox(height: 24),
            Text(
              callerName,
              style: GoogleFonts.poppins(
                fontSize: 28,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              isVideoCall ? 'Incoming video call...' : 'Incoming call...',
              style: GoogleFonts.poppins(
                fontSize: 16,
                color: Colors.white70,
              ),
            ),
            const Spacer(),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _buildCallButton(
                  icon: Icons.call_end,
                  color: Colors.red,
                  label: 'Decline',
                  onTap: onDecline,
                ),
                _buildCallButton(
                  icon: isVideoCall ? Icons.videocam : Icons.call,
                  color: Colors.green,
                  label: 'Accept',
                  onTap: onAccept,
                ),
              ],
            ),
            const SizedBox(height: 48),
          ],
        ),
      ),
    );
  }

  Widget _buildCallButton({
    required IconData icon,
    required Color color,
    required String label,
    required VoidCallback onTap,
  }) {
    return Column(
      children: [
        GestureDetector(
          onTap: onTap,
          child: Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: Colors.white, size: 32),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: GoogleFonts.poppins(
            color: Colors.white70,
            fontSize: 14,
          ),
        ),
      ],
    );
  }
}
