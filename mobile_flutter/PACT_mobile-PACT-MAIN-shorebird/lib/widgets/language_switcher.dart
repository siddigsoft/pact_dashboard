// lib/widgets/language_switcher.dart

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../theme/app_colors.dart';
import '../providers/locale_provider.dart';

class LanguageSwitcher extends StatelessWidget {
  const LanguageSwitcher({super.key});

  @override
  Widget build(BuildContext context) {
    final currentLocale = Localizations.localeOf(context);
    final isEnglish = currentLocale.languageCode == 'en';

    return PopupMenuButton<Locale>(
      onSelected: (Locale locale) {
        context.read<LocaleProvider>().setLocale(locale);
      },
      itemBuilder: (BuildContext context) => [
        PopupMenuItem<Locale>(
          value: const Locale('en', ''),
          child: Row(
            children: [
              Text(
                '🇺🇸',
                style: const TextStyle(fontSize: 18),
              ),
              const SizedBox(width: 8),
              Text(
                'English',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: isEnglish ? FontWeight.w600 : FontWeight.w400,
                  color: isEnglish ? AppColors.primaryBlue : Colors.black87,
                ),
              ),
            ],
          ),
        ),
        PopupMenuItem<Locale>(
          value: const Locale('ar', ''),
          child: Row(
            children: [
              Text(
                '🇸🇦',
                style: const TextStyle(fontSize: 18),
              ),
              const SizedBox(width: 8),
              Text(
                'العربية',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: !isEnglish ? FontWeight.w600 : FontWeight.w400,
                  color: !isEnglish ? AppColors.primaryBlue : Colors.black87,
                ),
              ),
            ],
          ),
        ),
      ],
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: Colors.grey.shade300),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              isEnglish ? '🇺🇸' : '🇸🇦',
              style: const TextStyle(fontSize: 16),
            ),
            const SizedBox(width: 4),
            Text(
              isEnglish ? 'EN' : 'عر',
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: AppColors.primaryBlue,
              ),
            ),
            const SizedBox(width: 4),
            Icon(
              Icons.keyboard_arrow_down,
              size: 16,
              color: Colors.grey.shade600,
            ),
          ],
        ),
      ),
    );
  }
}
