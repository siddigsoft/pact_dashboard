import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

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
        (preferredContact!['number'] ?? '').trim().isNotEmpty) {
      options.add(preferredContact!);
    }
    if (alternateContact != null &&
        (alternateContact!['number'] ?? '').trim().isNotEmpty) {
      final alreadyAdded = options.any(
        (option) => option['number'] == alternateContact!['number'],
      );
      if (!alreadyAdded) {
        options.add(alternateContact!);
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
            child: AlertDialog(
              title: Row(
                children: [
                  const Icon(Icons.warning_amber_rounded, color: Colors.red),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(label('Emergency SOS', 'نداء استغاثة طارئ')),
                  ),
                ],
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (contactOptions.length > 1)
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: contactOptions.map((contact) {
                        final isSelected =
                            currentContact?['number'] == contact['number'];
                        return OutlinedButton.icon(
                          onPressed: () {
                            setState(() {
                              currentContact = contact;
                              remaining = seconds;
                            });
                          },
                          icon: Icon(
                            isSelected
                                ? Icons.radio_button_checked
                                : Icons.radio_button_unchecked,
                            size: 16,
                          ),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: isSelected
                                ? Colors.white
                                : Theme.of(context).colorScheme.primary,
                            backgroundColor: isSelected
                                ? Colors.red
                                : Colors.transparent,
                            side: BorderSide(
                              color: isSelected
                                  ? Colors.red
                                  : Theme.of(context).dividerColor,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          label: Text(
                            isSelected
                                ? '${callButtonLabel(contact)} ${label('(Selected)', '(محدد)')}'
                                : callButtonLabel(contact),
                          ),
                        );
                      }).toList(),
                    ),
                  if (contactOptions.length > 1) const SizedBox(height: 12),
                  if (!hasContact)
                    Text(
                      label(
                        'No emergency contact selected. You can cancel and open Safety Hub to choose manually.',
                        'لم يتم تحديد جهة اتصال طوارئ. يمكنك الإلغاء وفتح مركز السلامة للاختيار يدويًا.',
                      ),
                      style: const TextStyle(color: Colors.red),
                    ),
                  if (!hasContact) const SizedBox(height: 8),
                  Text(
                    [
                      if (selectedName.isNotEmpty)
                        label(
                          'Calling: ${currentContact!['name']!.trim()} [${sourceTag(currentContact!['source_key'])}]${(currentContact!['number'] ?? '').trim().isNotEmpty ? ' (${currentContact!['number']!.trim()})' : ''}',
                          'سيتم الاتصال بـ: ${currentContact!['name']!.trim()} [${sourceTag(currentContact!['source_key'])}]${(currentContact!['number'] ?? '').trim().isNotEmpty ? ' (${currentContact!['number']!.trim()})' : ''}',
                        ),
                      label(
                        'Starting emergency call in $remaining second${remaining == 1 ? '' : 's'}...',
                        'بدء الاتصال بالطوارئ خلال $remaining ${remaining == 1 ? 'ثانية' : 'ثوانٍ'}...',
                      ),
                    ].join('\n\n'),
                  ),
                  const SizedBox(height: 10),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: progressValue.clamp(0, 1),
                      minHeight: 6,
                      backgroundColor: Colors.grey.shade300,
                      valueColor: const AlwaysStoppedAnimation<Color>(
                        Colors.red,
                      ),
                    ),
                  ),
                ],
              ),
              actions: [
                if (hasContact)
                  TextButton(
                    onPressed: () {
                      HapticFeedback.selectionClick();
                      final messenger = ScaffoldMessenger.maybeOf(
                        dialogContext,
                      );
                      messenger?.showSnackBar(
                        SnackBar(
                          content: Text(
                            label(
                              'Long press to call immediately.',
                              'اضغط مطولاً لإجراء الاتصال فورًا.',
                            ),
                          ),
                          duration: const Duration(seconds: 2),
                        ),
                      );
                    },
                    onLongPress: () async {
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
                      label('Long Press: Call Now', 'اضغط مطولاً: اتصال الآن'),
                    ),
                  ),
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(null),
                  child: Text(label('Cancel', 'إلغاء')),
                ),
              ],
            ),
          );
        },
      );
    },
  );

  timer?.cancel();
  return selectedContact;
}
