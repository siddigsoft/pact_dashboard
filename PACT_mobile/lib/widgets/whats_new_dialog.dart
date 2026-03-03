// lib/widgets/whats_new_dialog.dart

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/changelog_service.dart';
import '../theme/app_colors.dart';
import '../l10n/app_localizations.dart';
import '../l10n/app_localizations_extension.dart';

class WhatsNewDialog extends StatelessWidget {
  final ChangelogEntry _changelog;
  final VoidCallback _onDismiss;

  const WhatsNewDialog({
    super.key,
    required ChangelogEntry changelog,
    required VoidCallback onDismiss,
  }) : _changelog = changelog,
       _onDismiss = onDismiss;

  static Future<void> showIfNeeded(BuildContext context) async {
    final changelogService = ChangelogService();
    await changelogService.initialize();

    final hasNew = await changelogService.hasNewVersion();
    if (hasNew && context.mounted) {
      final changelog = changelogService.getCurrentChangelog();

      await showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => WhatsNewDialog(
          changelog: changelog,
          onDismiss: () async {
            await changelogService.markVersionAsSeen();
            if (context.mounted) {
              Navigator.of(context).pop();
            }
          },
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    // Build feature list from localization - bilingual (English & Arabic)
    final features = <Map<String, String>>[
      {
        'en': l10n?.translate('whatsNewFeature1') ?? '',
        'ar':
            l10n?.translate('whatsNewFeature1') ??
            '', // This will be the Arabic version from ARB
      },
      {
        'en': l10n?.translate('whatsNewFeature2') ?? '',
        'ar': l10n?.translate('whatsNewFeature2') ?? '',
      },
      {
        'en': l10n?.translate('whatsNewFeature3') ?? '',
        'ar': l10n?.translate('whatsNewFeature3') ?? '',
      },
      {
        'en': l10n?.translate('whatsNewFeature4') ?? '',
        'ar': l10n?.translate('whatsNewFeature4') ?? '',
      },
    ].where((item) => item['en']!.isNotEmpty).toList();

    // Build fixes list from localization - bilingual
    final fixes = <Map<String, String>>[
      {
        'en': l10n?.translate('whatsNewFix1') ?? '',
        'ar': l10n?.translate('whatsNewFix1') ?? '',
      },
      {
        'en': l10n?.translate('whatsNewFix2') ?? '',
        'ar': l10n?.translate('whatsNewFix2') ?? '',
      },
      {
        'en': l10n?.translate('whatsNewFix3') ?? '',
        'ar': l10n?.translate('whatsNewFix3') ?? '',
      },
    ].where((item) => item['en']!.isNotEmpty).toList();

    // Build improvements list from localization - bilingual
    final improvements = <Map<String, String>>[
      {
        'en': l10n?.translate('whatsNewImprovement1') ?? '',
        'ar': l10n?.translate('whatsNewImprovement1') ?? '',
      },
      {
        'en': l10n?.translate('whatsNewImprovement2') ?? '',
        'ar': l10n?.translate('whatsNewImprovement2') ?? '',
      },
      {
        'en': l10n?.translate('whatsNewImprovement3') ?? '',
        'ar': l10n?.translate('whatsNewImprovement3') ?? '',
      },
    ].where((item) => item['en']!.isNotEmpty).toList();

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 400, maxHeight: 600),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Colors.white, Colors.grey.shade50],
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildHeader(),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (features.isNotEmpty) ...[
                      _buildSection(
                        icon: Icons.star_rounded,
                        title: l10n?.translate('newFeatures') ?? 'New Features',
                        items: features,
                        color: AppColors.primaryOrange,
                      ),
                      const SizedBox(height: 16),
                    ],
                    if (fixes.isNotEmpty) ...[
                      _buildSection(
                        icon: Icons.bug_report_rounded,
                        title: l10n?.translate('bugFixes') ?? 'Bug Fixes',
                        items: fixes,
                        color: Colors.green,
                      ),
                      const SizedBox(height: 16),
                    ],
                    if (improvements.isNotEmpty) ...[
                      _buildSection(
                        icon: Icons.trending_up_rounded,
                        title:
                            l10n?.translate('improvements') ?? 'Improvements',
                        items: improvements,
                        color: AppColors.primaryBlue,
                      ),
                    ],
                    const SizedBox(height: 8),
                  ],
                ),
              ),
            ),
            _buildFooter(context),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Builder(
      builder: (context) {
        final l10n = AppLocalizations.of(context);
        return Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: const BoxDecoration(
            gradient: AppColors.primaryGradient,
            borderRadius: BorderRadius.only(
              topLeft: Radius.circular(20),
              topRight: Radius.circular(20),
            ),
          ),
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.celebration_rounded,
                  color: Colors.white,
                  size: 32,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                l10n?.translate('whatsNew') ?? "What's New",
                style: GoogleFonts.poppins(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  _changelog.fullVersion,
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildSection({
    required IconData icon,
    required String title,
    required List<Map<String, String>> items,
    required Color color,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, color: color, size: 18),
            ),
            const SizedBox(width: 10),
            Text(
              title,
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: Colors.grey.shade800,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        ...items.map(
          (item) => Padding(
            padding: const EdgeInsets.only(left: 8, bottom: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      margin: const EdgeInsets.only(top: 6),
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: color,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        item['en'] ?? '',
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          color: Colors.grey.shade700,
                          height: 1.4,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
                // Display Arabic translation below English
                if ((item['ar'] ?? '').isNotEmpty &&
                    item['ar'] != item['en']) ...[
                  Padding(
                    padding: const EdgeInsets.only(left: 16, top: 4),
                    child: Text(
                      item['ar'] ?? '',
                      style: GoogleFonts.poppins(
                        fontSize: 13,
                        color: Colors.grey.shade600,
                        height: 1.4,
                        fontStyle: FontStyle.italic,
                      ),
                      textDirection: TextDirection.rtl,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildFooter(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      child: ElevatedButton(
        onPressed: _onDismiss,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primaryOrange,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          elevation: 0,
        ),
        child: Text(
          l10n?.translate('gotIt') ?? 'Got it!',
          style: GoogleFonts.poppins(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}
