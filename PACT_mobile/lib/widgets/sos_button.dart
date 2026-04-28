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

  /// Only show SOS button when this condition is true (e.g., high-risk transaction)
  final bool isVisible;

  /// Title for the confirmation dialog
  final String confirmTitle;

  /// Message for the confirmation dialog
  final String confirmMessage;

  const SOSButton({
    super.key,
    this.onPressed,
    this.emergencyContacts = const [],
    this.contacts = const [],
    this.onContactAction,
    this.showSmsAction = true,
    this.isVisible = false,
    this.confirmTitle = 'Contact Emergency Services?',
    this.confirmMessage =
        'Are you sure you want to contact emergency services? This will initiate an emergency call or message.',
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

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
          child: SafeArea(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Drag handle
                Center(
                  child: Container(
                    width: 40,
                    height: 5,
                    decoration: BoxDecoration(
                      color: Colors.grey.shade300,
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                // Header
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.accentRed.withOpacity(0.1),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.warning_amber_rounded,
                        color: AppColors.accentRed,
                        size: 28,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Emergency Action',
                            style: GoogleFonts.poppins(
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Text(
                            'Select an action below to proceed immediately.',
                            style: GoogleFonts.poppins(
                              fontSize: 13,
                              color: AppColors.textLight,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 32),

                ...contactOptions.map((contact) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 16.0),
                    child: Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.grey.shade200),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.03),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Column(
                        children: [
                          Padding(
                            padding: const EdgeInsets.all(16),
                            child: Row(
                              children: [
                                CircleAvatar(
                                  backgroundColor: AppColors.primaryBlue
                                      .withOpacity(0.1),
                                  child: const Icon(
                                    Icons.person,
                                    color: AppColors.primaryBlue,
                                  ),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        contact.name,
                                        style: GoogleFonts.poppins(
                                          fontWeight: FontWeight.w600,
                                          fontSize: 16,
                                        ),
                                      ),
                                      if (contact.subtitle?.trim().isNotEmpty ==
                                          true)
                                        Text(
                                          contact.subtitle!,
                                          style: GoogleFonts.poppins(
                                            color: AppColors.textLight,
                                            fontSize: 13,
                                          ),
                                        ),
                                      Text(
                                        contact.number,
                                        style: GoogleFonts.poppins(
                                          color: AppColors.textLight,
                                          fontSize: 13,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Divider(height: 1),
                          Row(
                            children: [
                              Expanded(
                                child: InkWell(
                                  onTap: () {
                                    Navigator.pop(context);
                                    _makeEmergencyCall(contact);
                                  },
                                  borderRadius: const BorderRadius.only(
                                    bottomLeft: Radius.circular(16),
                                  ),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 12,
                                    ),
                                    child: Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        const Icon(
                                          Icons.call,
                                          color: AppColors.accentRed,
                                          size: 20,
                                        ),
                                        const SizedBox(width: 8),
                                        Text(
                                          'Call',
                                          style: GoogleFonts.poppins(
                                            color: AppColors.accentRed,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                              if (showSmsAction) ...[
                                Container(
                                  width: 1,
                                  height: 24,
                                  color: Colors.grey.shade300,
                                ),
                                Expanded(
                                  child: InkWell(
                                    onTap: () {
                                      Navigator.pop(context);
                                      _sendEmergencySms(contact);
                                    },
                                    borderRadius: const BorderRadius.only(
                                      bottomRight: Radius.circular(16),
                                    ),
                                    child: Padding(
                                      padding: const EdgeInsets.symmetric(
                                        vertical: 12,
                                      ),
                                      child: Row(
                                        mainAxisAlignment:
                                            MainAxisAlignment.center,
                                        children: [
                                          const Icon(
                                            Icons.sms_outlined,
                                            color: AppColors.accentRed,
                                            size: 20,
                                          ),
                                          const SizedBox(width: 8),
                                          Text(
                                            'SMS',
                                            style: GoogleFonts.poppins(
                                              color: AppColors.accentRed,
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                }),

                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  style: TextButton.styleFrom(
                    minimumSize: const Size(double.infinity, 50),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: Text(
                    'Cancel',
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    // Only show button when isVisible is true
    if (!isVisible) {
      return const SizedBox.shrink();
    }

    return Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () {
              onPressed?.call();
              _showEmergencyOptions(context);
            },
            borderRadius: BorderRadius.circular(16),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    AppColors.accentRed.withOpacity(0.15),
                    AppColors.accentRed.withOpacity(0.05),
                  ],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: AppColors.accentRed.withOpacity(0.5),
                  width: 1.5,
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.accentRed.withOpacity(0.1),
                    blurRadius: 15,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.accentRed.withOpacity(0.2),
                      shape: BoxShape.circle,
                    ),
                    child:
                        const Icon(
                              Icons.emergency_rounded,
                              color: AppColors.accentRed,
                              size: 26,
                            )
                            .animate(onPlay: (c) => c.repeat())
                            .rotate(
                              duration: 2000.ms,
                              begin: -0.05,
                              end: 0.05,
                              curve: Curves.easeInOutSine,
                            ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Emergency Support',
                          style: GoogleFonts.poppins(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: AppColors.accentRed,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Tap here to contact emergency services',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: AppColors.textLight,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Icon(
                    Icons.arrow_forward_ios_rounded,
                    color: AppColors.accentRed,
                    size: 16,
                  ),
                ],
              ),
            ),
          ),
        )
        .animate(onPlay: (controller) => controller.repeat())
        .shimmer(
          duration: const Duration(milliseconds: 3000),
          color: AppColors.accentRed.withOpacity(0.2),
        );
  }
}
