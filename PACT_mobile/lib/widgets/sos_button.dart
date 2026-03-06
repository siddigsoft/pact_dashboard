import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../theme/app_colors.dart';

class EmergencyContactOption {
  final String? id;
  final String name;
  final String number;
  final String? subtitle;

  const EmergencyContactOption({
    this.id,
    required this.name,
    required this.number,
    this.subtitle,
  });
}

class SOSButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final List<String> emergencyContacts;
  final List<EmergencyContactOption> contacts;
  final Future<void> Function(EmergencyContactOption contact, String action)?
  onContactAction;
  final bool showSmsAction;

  const SOSButton({
    super.key,
    this.onPressed,
    this.emergencyContacts = const [],
    this.contacts = const [],
    this.onContactAction,
    this.showSmsAction = true,
  });

  List<EmergencyContactOption> _resolvedContacts() {
    if (contacts.isNotEmpty) {
      return contacts.where((c) => c.number.trim().isNotEmpty).toList();
    }

    return emergencyContacts
        .map((contact) {
          final separator = contact.indexOf(':');
          if (separator <= 0 || separator >= contact.length - 1) {
            return null;
          }
          final name = contact.substring(0, separator).trim();
          final number = contact.substring(separator + 1).trim();
          if (name.isEmpty || number.isEmpty) {
            return null;
          }
          return EmergencyContactOption(name: name, number: number);
        })
        .whereType<EmergencyContactOption>()
        .toList();
  }

  Future<void> _makeEmergencyCall(EmergencyContactOption contact) async {
    final number = contact.number.trim();
    final Uri url = Uri.parse('tel:$number');
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
      await onContactAction?.call(contact, 'call');
    }
  }

  Future<void> _sendEmergencySms(EmergencyContactOption contact) async {
    final number = contact.number.trim();
    final Uri url = Uri.parse('sms:$number');
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
      await onContactAction?.call(contact, 'sms');
    }
  }

  Future<void> _showEmergencyOptions(BuildContext context) async {
    HapticFeedback.heavyImpact();
    final contactOptions = _resolvedContacts();

    if (contactOptions.isEmpty) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No emergency contacts available')),
      );
      return;
    }

    await showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          titlePadding: const EdgeInsets.fromLTRB(24, 24, 24, 0),
          title: Row(
            children: [
              const Icon(
                Icons.warning_amber_rounded,
                color: AppColors.accentRed,
              ),
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
                ...contactOptions.map((contact) {
                  final name = contact.name;
                  final number = contact.number;

                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: AppColors.accentRed.withOpacity(0.1),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.phone,
                        color: AppColors.accentRed,
                      ),
                    ),
                    title: Text(
                      name,
                      style: GoogleFonts.poppins(fontWeight: FontWeight.w500),
                    ),
                    subtitle: Text(
                      contact.subtitle?.trim().isNotEmpty == true
                          ? '${contact.subtitle} • $number'
                          : number,
                      style: GoogleFonts.poppins(color: AppColors.textLight),
                    ),
                    trailing: showSmsAction
                        ? IconButton(
                            tooltip: 'SMS',
                            onPressed: () {
                              Navigator.pop(context);
                              _sendEmergencySms(contact);
                            },
                            icon: const Icon(
                              Icons.sms_outlined,
                              color: AppColors.accentRed,
                            ),
                          )
                        : null,
                    onTap: () {
                      Navigator.pop(context);
                      _makeEmergencyCall(contact);
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
                  const Icon(
                    Icons.emergency,
                    color: AppColors.accentRed,
                    size: 28,
                  ),
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
        )
        .animate(onPlay: (controller) => controller.repeat())
        .shimmer(
          duration: const Duration(milliseconds: 2000),
          color: AppColors.accentRed.withOpacity(0.3),
        );
  }
}
