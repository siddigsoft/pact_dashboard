import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../theme/app_colors.dart';

class SOSButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final List<String> emergencyContacts;

  const SOSButton({super.key, this.onPressed, required this.emergencyContacts});

  Future<void> _makeEmergencyCall(String number) async {
    final Uri url = Uri.parse('tel:$number');
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
    }
  }

  Future<void> _showEmergencyOptions(BuildContext context) async {
    HapticFeedback.heavyImpact();

    await showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          titlePadding: const EdgeInsets.fromLTRB(24, 24, 24, 0),
          title: Row(
            children: [
              Icon(Icons.warning_amber_rounded, color: AppColors.accentRed),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Emergency Contact',
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          contentPadding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
          content: SizedBox(
            width: double.maxFinite,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Who would you like to contact?',
                  style: GoogleFonts.poppins(),
                ),
                const SizedBox(height: 16),
                ...emergencyContacts.map((contact) {
                  final parts = contact.split(':');
                  final name = parts[0];
                  final number = parts[1];

                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: AppColors.accentRed.withOpacity(0.1),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(Icons.phone, color: AppColors.accentRed),
                    ),
                    title: Text(
                      name,
                      style: GoogleFonts.poppins(fontWeight: FontWeight.w500),
                    ),
                    subtitle: Text(
                      number,
                      style: GoogleFonts.poppins(color: AppColors.textLight),
                    ),
                    onTap: () {
                      Navigator.pop(context);
                      _makeEmergencyCall(number);
                    },
                  );
                }),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => _showEmergencyOptions(context),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.accentRed.withOpacity(0.1),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.accentRed, width: 2),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.emergency, color: AppColors.accentRed, size: 28),
              const SizedBox(width: 8),
              Text(
                'SOS',
                style: GoogleFonts.poppins(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                  color: AppColors.accentRed,
                ),
              ),
            ],
          ),
        ),
      ),
    ).animate(onPlay: (controller) => controller.repeat()).shimmer(
          duration: const Duration(milliseconds: 2000),
          color: AppColors.accentRed.withOpacity(0.3),
        );
  }
}
