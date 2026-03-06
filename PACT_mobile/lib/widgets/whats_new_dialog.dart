// lib/widgets/whats_new_dialog.dart

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/changelog_service.dart';
import '../theme/app_colors.dart';

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

  /// Zip English and Arabic lists into paired maps.
  /// If Arabic list is shorter, falls back to English text for missing entries.
  List<Map<String, String>> _zipBilingual(List<String> en, List<String> ar) {
    final result = <Map<String, String>>[];
    for (int i = 0; i < en.length; i++) {
      result.add({'en': en[i], 'ar': i < ar.length ? ar[i] : en[i]});
    }
    return result;
  }

  @override
  Widget build(BuildContext context) {
    final features = _zipBilingual(_changelog.features, _changelog.featuresAr);
    final fixes = _zipBilingual(_changelog.fixes, _changelog.fixesAr);
    final improvements = _zipBilingual(
      _changelog.improvements,
      _changelog.improvementsAr,
    );

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 420, maxHeight: 640),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          color: Colors.white,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildHeader(),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (features.isNotEmpty) ...[
                      _buildSection(
                        icon: Icons.star_rounded,
                        titleEn: 'New Features',
                        titleAr: 'مميزات جديدة',
                        items: features,
                        color: AppColors.primaryOrange,
                      ),
                      const SizedBox(height: 14),
                    ],
                    if (fixes.isNotEmpty) ...[
                      _buildSection(
                        icon: Icons.bug_report_rounded,
                        titleEn: 'Bug Fixes',
                        titleAr: 'إصلاح الأخطاء',
                        items: fixes,
                        color: Colors.green.shade600,
                      ),
                      const SizedBox(height: 14),
                    ],
                    if (improvements.isNotEmpty) ...[
                      _buildSection(
                        icon: Icons.trending_up_rounded,
                        titleEn: 'Improvements',
                        titleAr: 'تحسينات',
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
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
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
              size: 30,
            ),
          ),
          const SizedBox(height: 10),
          // Bilingual title
          Text(
            "What's New  •  ما الجديد",
            textAlign: TextAlign.center,
            style: GoogleFonts.poppins(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              _changelog.fullVersion,
              style: GoogleFonts.poppins(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSection({
    required IconData icon,
    required String titleEn,
    required String titleAr,
    required List<Map<String, String>> items,
    required Color color,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Bilingual section header
        Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, color: color, size: 17),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: RichText(
                text: TextSpan(
                  children: [
                    TextSpan(
                      text: titleEn,
                      style: GoogleFonts.poppins(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: Colors.grey.shade800,
                      ),
                    ),
                    TextSpan(
                      text: '  •  $titleAr',
                      style: GoogleFonts.poppins(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: Colors.grey.shade500,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        // Items — each shows English then Arabic below
        ...items.map(
          (item) => Padding(
            padding: const EdgeInsets.only(left: 8, bottom: 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 5),
                  child: Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: color,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // English
                      Text(
                        item['en'] ?? '',
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: Colors.grey.shade800,
                          height: 1.4,
                        ),
                      ),
                      // Arabic — only shown when different from English
                      if ((item['ar'] ?? '').isNotEmpty &&
                          item['ar'] != item['en']) ...[
                        const SizedBox(height: 3),
                        Directionality(
                          textDirection: TextDirection.rtl,
                          child: Align(
                            alignment: Alignment.centerRight,
                            child: Text(
                              item['ar'] ?? '',
                              style: GoogleFonts.poppins(
                                fontSize: 12,
                                fontWeight: FontWeight.w400,
                                color: Colors.grey.shade500,
                                height: 1.4,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildFooter(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
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
          'Got it!  •  حسناً',
          style: GoogleFonts.poppins(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}
