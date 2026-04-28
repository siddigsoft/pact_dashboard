import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../theme/app_colors.dart';

String _bi(String en, String ar) =>
    '\u2066$en\u2069 \u200B|\u200B \u2067$ar\u2069';

Future<Map<String, String>?> showSosCountdownDialog(
  BuildContext context, {
  int seconds = 3,
  Map<String, String>? preferredContact,
  Map<String, String>? alternateContact,
  bool enableWarningHaptic = true,
}) async {
  int remaining = seconds;
  Map<String, String>? currentContact = preferredContact;
  final int safeSeconds = seconds <= 0 ? 1 : seconds;
  final isArabic = Localizations.localeOf(context).languageCode == 'ar';

  String label(String en, String ar) => isArabic ? _bi(ar, en) : _bi(en, ar);

  Future<bool> confirmImmediateCall(
    BuildContext dialogContext,
    Map<String, String> contact,
  ) async {
    final confirmed = await showDialog<bool>(
      context: dialogContext,
      builder: (context) {
        return AlertDialog(
          title: Text(label('Confirm Immediate Call', 'تأكيد الاتصال الفوري')),
          content: Text(
            label(
              'Call ${contact['name'] ?? 'selected contact'} now without waiting?',
              'الاتصال الآن بـ ${contact['name'] ?? 'جهة الاتصال المحددة'} دون انتظار؟',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: Text(label('Back', 'رجوع')),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: Text(label('Call Now', 'اتصال الآن')),
            ),
          ],
        );
      },
    );

    return confirmed ?? false;
  }

  String sourceTag(String? sourceKey) {
    switch ((sourceKey ?? '').toLowerCase().trim()) {
      case 'supervisor':
        return label('Supervisor', 'مشرف');
      case 'coordinator':
        return label('Coordinator', 'منسق');
      case 'support_contact':
      default:
        return label('Emergency Contact', 'جهة اتصال طوارئ');
    }
  }

  String callButtonLabel(Map<String, String> contact) {
    switch ((contact['source_key'] ?? '').toLowerCase().trim()) {
      case 'supervisor':
        return label('Call Supervisor', 'اتصال بالمشرف');
      case 'coordinator':
        return label('Call Coordinator', 'اتصال بالمنسق');
      case 'support_contact':
      default:
        return label('Call Emergency Contact', 'اتصال بجهة الطوارئ');
    }
  }

  List<Map<String, String>> buildContactOptions() {
    final options = <Map<String, String>>[];
    if (preferredContact != null &&
        (preferredContact['number'] ?? '').trim().isNotEmpty) {
      options.add(preferredContact);
    }
    if (alternateContact != null &&
        (alternateContact['number'] ?? '').trim().isNotEmpty) {
      final alreadyAdded = options.any(
        (option) => option['number'] == alternateContact['number'],
      );
      if (!alreadyAdded) {
        options.add(alternateContact);
      }
    }
    return options;
  }

  Timer? timer;
  bool timerStarted = false;

  final selectedContact = await showDialog<Map<String, String>?>(
    context: context,
    barrierDismissible: false,
    builder: (dialogContext) {
      return StatefulBuilder(
        builder: (context, setState) {
          final contactOptions = buildContactOptions();
          final hasContact = currentContact != null;
          final progressValue = remaining / safeSeconds;
          final selectedName = (currentContact?['name'] ?? '').trim();
          final selectedSource = sourceTag(currentContact?['source_key']);
          final selectedNumber = (currentContact?['number'] ?? '').trim();

          if (currentContact == null && contactOptions.isNotEmpty) {
            currentContact = contactOptions.first;
          }

          if (!timerStarted) {
            timerStarted = true;
            timer = Timer.periodic(const Duration(seconds: 1), (t) {
              if (!dialogContext.mounted) {
                t.cancel();
                return;
              }

              if (remaining <= 1) {
                t.cancel();
                Navigator.of(dialogContext).pop(currentContact);
                return;
              }

              if (enableWarningHaptic && remaining == 2) {
                HapticFeedback.lightImpact();
              }

              setState(() {
                remaining -= 1;
              });
            });
          }

          return PopScope(
            canPop: false,
            child: Dialog.fullscreen(
              backgroundColor: const Color(0xFF0A0A0A),
              child: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24.0,
                    vertical: 16.0,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      const SizedBox(height: 32),
                      // SOS PULSING ICON
                      Stack(
                        alignment: Alignment.center,
                        children: [
                          Container(
                                width: 140,
                                height: 140,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: AppColors.accentRed.withOpacity(0.15),
                                ),
                              )
                              .animate(onPlay: (c) => c.repeat())
                              .scale(
                                begin: const Offset(1, 1),
                                end: const Offset(1.3, 1.3),
                                duration: 1200.ms,
                              )
                              .fade(begin: 1.0, end: 0.0, duration: 1200.ms),
                          Container(
                            width: 100,
                            height: 100,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: AppColors.accentRed,
                              boxShadow: [
                                BoxShadow(
                                  color: AppColors.accentRed.withOpacity(0.6),
                                  blurRadius: 30,
                                  spreadRadius: 10,
                                ),
                              ],
                            ),
                            child: const Center(
                              child: Icon(
                                Icons.sos_rounded,
                                color: Colors.white,
                                size: 54,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 48),

                      // HUGE COUNTDOWN
                      Text(
                            '$remaining',
                            style: GoogleFonts.manrope(
                              fontSize: 96,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                              height: 1.0,
                            ),
                          )
                          .animate(key: ValueKey(remaining))
                          .scale(
                            begin: const Offset(1.5, 1.5),
                            end: const Offset(1, 1),
                            duration: 300.ms,
                          ),

                      const SizedBox(height: 16),
                      Text(
                        label('EMERGENCY SOS', 'طوارئ SOS'),
                        style: GoogleFonts.poppins(
                          fontSize: 24,
                          fontWeight: FontWeight.w700,
                          color: AppColors.accentRed,
                          letterSpacing: 2,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        label(
                          'Calling emergency contact automatically...',
                          'جاري الاتصال بجهة الطوارئ تلقائياً...',
                        ),
                        textAlign: TextAlign.center,
                        style: GoogleFonts.poppins(
                          fontSize: 16,
                          color: Colors.white70,
                        ),
                      ),

                      const SizedBox(height: 48),

                      // CONTACT SELECTOR CARDS
                      if (contactOptions.length > 1) ...[
                        Align(
                          alignment: Alignment.centerLeft,
                          child: Text(
                            label('SELECT CONTACT', 'اختر جهة الاتصال'),
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: Colors.white54,
                              letterSpacing: 1.5,
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        ...contactOptions.map((contact) {
                          final isSelected =
                              currentContact?['number'] == contact['number'];
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 12.0),
                            child: InkWell(
                              onTap: () {
                                setState(() {
                                  currentContact = contact;
                                  remaining = seconds; // Reset timer on switch
                                });
                              },
                              borderRadius: BorderRadius.circular(16),
                              child: Container(
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: isSelected
                                      ? AppColors.accentRed.withOpacity(0.15)
                                      : Colors.white.withOpacity(0.05),
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(
                                    color: isSelected
                                        ? AppColors.accentRed
                                        : Colors.white12,
                                    width: 2,
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.all(8),
                                      decoration: BoxDecoration(
                                        color: isSelected
                                            ? AppColors.accentRed
                                            : Colors.white12,
                                        shape: BoxShape.circle,
                                      ),
                                      child: Icon(
                                        Icons.person,
                                        color: isSelected
                                            ? Colors.white
                                            : Colors.white70,
                                        size: 20,
                                      ),
                                    ),
                                    const SizedBox(width: 16),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            callButtonLabel(contact),
                                            style: GoogleFonts.poppins(
                                              fontWeight: FontWeight.w600,
                                              fontSize: 15,
                                              color: isSelected
                                                  ? Colors.white
                                                  : Colors.white70,
                                            ),
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            contact['name'] ?? '',
                                            style: GoogleFonts.poppins(
                                              fontSize: 13,
                                              color: Colors.white54,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    if (isSelected)
                                      const Icon(
                                        Icons.check_circle_rounded,
                                        color: AppColors.accentRed,
                                      ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        }),
                      ] else ...[
                        // SINGLE CONTACT DISPLAY
                        Container(
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.05),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            children: [
                              const Icon(
                                Icons.contact_phone_rounded,
                                color: Colors.white54,
                                size: 32,
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      currentContact?['name'] ?? '',
                                      style: GoogleFonts.poppins(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 18,
                                        color: Colors.white,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      sourceTag(currentContact?['source_key']),
                                      style: GoogleFonts.poppins(
                                        fontSize: 14,
                                        color: AppColors.accentRed,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],

                      const Spacer(),

                      // GIANT CALL NOW BUTTON
                      if (hasContact)
                        SizedBox(
                          width: double.infinity,
                          height: 64,
                          child: ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.accentRed,
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(24),
                              ),
                              elevation: 8,
                              shadowColor: AppColors.accentRed.withOpacity(0.5),
                            ),
                            onPressed: () async {
                              HapticFeedback.heavyImpact();
                              final contact = currentContact;
                              if (contact == null) return;
                              final confirmed = await confirmImmediateCall(
                                dialogContext,
                                contact,
                              );
                              if (!confirmed || !dialogContext.mounted) return;
                              HapticFeedback.mediumImpact();
                              Navigator.of(dialogContext).pop(contact);
                            },
                            child: Text(
                              label('CALL IMMEDIATELY', 'اتصال فوراً'),
                              style: GoogleFonts.poppins(
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 1.5,
                              ),
                            ),
                          ),
                        ),

                      const SizedBox(height: 24),

                      // DISCRETE CANCEL BUTTON
                      TextButton(
                        onPressed: () {
                          HapticFeedback.lightImpact();
                          Navigator.of(dialogContext).pop(null);
                        },
                        style: TextButton.styleFrom(
                          minimumSize: const Size(double.infinity, 60),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(24),
                          ),
                        ),
                        child: Text(
                          label('CANCEL', 'إلغاء'),
                          style: GoogleFonts.poppins(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: Colors.white54,
                            letterSpacing: 2,
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      );
    },
  );

  timer?.cancel();
  return selectedContact;
}
