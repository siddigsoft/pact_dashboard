// lib/widgets/bilingual_whats_new_dialog.dart

import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/remote_changelog_service.dart';
import '../theme/app_colors.dart';

class BilingualWhatsNewDialog extends StatefulWidget {
  final ChangelogEntry changelog;
  final VoidCallback onDismiss;
  final String initialLocale;

  const BilingualWhatsNewDialog({
    super.key,
    required this.changelog,
    required this.onDismiss,
    this.initialLocale = 'en',
  });

  static Future<void> showIfNeeded(BuildContext context, {String locale = 'en'}) async {
    final changelogService = RemoteChangelogService();
    await changelogService.initialize();

    final hasNew = await changelogService.hasNewVersion();
    if (hasNew && context.mounted) {
      final changelog = changelogService.getCurrentChangelog();
      if (changelog != null) {
        await showDialog(
          context: context,
          barrierDismissible: false,
          builder: (context) => BilingualWhatsNewDialog(
            changelog: changelog,
            initialLocale: locale,
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
  }

  @override
  State<BilingualWhatsNewDialog> createState() => _BilingualWhatsNewDialogState();
}

class _BilingualWhatsNewDialogState extends State<BilingualWhatsNewDialog> {
  late String _currentLocale;

  @override
  void initState() {
    super.initState();
    _currentLocale = widget.initialLocale;
  }

  bool get isArabic => _currentLocale == 'ar';

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
      child: Dialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
        child: Container(
          constraints: const BoxConstraints(maxWidth: 420, maxHeight: 650),
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
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (widget.changelog.hasBreakingChanges) ...[
                        _buildSection(
                          icon: Icons.warning_rounded,
                          title: isArabic ? 'تغييرات مهمة' : 'Breaking Changes',
                          items: widget.changelog.getBreakingChanges(_currentLocale) ?? [],
                          color: Colors.red,
                        ),
                        const SizedBox(height: 16),
                      ],
                      if (widget.changelog.getFeatures(_currentLocale).isNotEmpty) ...[
                        _buildSection(
                          icon: Icons.star_rounded,
                          title: isArabic ? 'ميزات جديدة' : 'New Features',
                          items: widget.changelog.getFeatures(_currentLocale),
                          color: AppColors.primaryOrange,
                        ),
                        const SizedBox(height: 16),
                      ],
                      if (widget.changelog.getFixes(_currentLocale).isNotEmpty) ...[
                        _buildSection(
                          icon: Icons.bug_report_rounded,
                          title: isArabic ? 'إصلاحات' : 'Bug Fixes',
                          items: widget.changelog.getFixes(_currentLocale),
                          color: Colors.green,
                        ),
                        const SizedBox(height: 16),
                      ],
                      if (widget.changelog.getImprovements(_currentLocale).isNotEmpty) ...[
                        _buildSection(
                          icon: Icons.trending_up_rounded,
                          title: isArabic ? 'تحسينات' : 'Improvements',
                          items: widget.changelog.getImprovements(_currentLocale),
                          color: AppColors.primaryBlue,
                        ),
                      ],
                      const SizedBox(height: 8),
                    ],
                  ),
                ),
              ),
              _buildFooter(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: AppColors.primaryGradient,
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(20),
          topRight: Radius.circular(20),
        ),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const SizedBox(width: 40),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.celebration_rounded,
                  color: Colors.white,
                  size: 32,
                ),
              ),
              _buildLanguageToggle(),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            isArabic ? "ما الجديد" : "What's New",
            style: GoogleFonts.poppins(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 4),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              widget.changelog.fullVersion,
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
  }

  Widget _buildLanguageToggle() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.2),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildLangButton('EN', 'en'),
          _buildLangButton('عربي', 'ar'),
        ],
      ),
    );
  }

  Widget _buildLangButton(String label, String locale) {
    final isSelected = _currentLocale == locale;
    return GestureDetector(
      onTap: () => setState(() => _currentLocale = locale),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Text(
          label,
          style: GoogleFonts.poppins(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: isSelected ? AppColors.primaryBlue : Colors.white,
          ),
        ),
      ),
    );
  }

  Widget _buildSection({
    required IconData icon,
    required String title,
    required List<String> items,
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
                color: color.withOpacity(0.1),
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
        ...items.map((item) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                margin: EdgeInsets.only(top: 6, left: isArabic ? 0 : 8, right: isArabic ? 8 : 0),
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
                  item,
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    color: Colors.grey.shade700,
                    height: 1.4,
                  ),
                ),
              ),
            ],
          ),
        )),
      ],
    );
  }

  Widget _buildFooter() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      child: ElevatedButton(
        onPressed: widget.onDismiss,
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
          isArabic ? 'فهمت!' : 'Got it!',
          style: GoogleFonts.poppins(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

class ChangelogHistorySheet extends StatelessWidget {
  final String locale;

  const ChangelogHistorySheet({
    super.key,
    this.locale = 'en',
  });

  bool get isArabic => locale == 'ar';

  @override
  Widget build(BuildContext context) {
    final changelogService = RemoteChangelogService();
    final changelogs = changelogService.getAllChangelogs();

    return Directionality(
      textDirection: isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
      child: DraggableScrollableSheet(
        initialChildSize: 0.7,
        maxChildSize: 0.95,
        minChildSize: 0.5,
        builder: (context, scrollController) {
          return Container(
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
            ),
            child: Column(
              children: [
                Container(
                  margin: const EdgeInsets.only(top: 12),
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    isArabic ? 'سجل التحديثات' : 'Update History',
                    style: GoogleFonts.poppins(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const Divider(),
                Expanded(
                  child: ListView.builder(
                    controller: scrollController,
                    itemCount: changelogs.length,
                    itemBuilder: (context, index) {
                      final changelog = changelogs[index];
                      return _buildChangelogTile(changelog);
                    },
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildChangelogTile(ChangelogEntry changelog) {
    return ExpansionTile(
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: AppColors.primaryBlue.withOpacity(0.1),
          shape: BoxShape.circle,
        ),
        child: const Icon(Icons.update, color: AppColors.primaryBlue),
      ),
      title: Text(
        changelog.fullVersion,
        style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
      ),
      subtitle: Text(
        _formatDate(changelog.releaseDate),
        style: GoogleFonts.poppins(fontSize: 12, color: Colors.grey),
      ),
      children: [
        if (changelog.getFeatures(locale).isNotEmpty)
          _buildMiniSection(
            isArabic ? 'ميزات جديدة' : 'Features',
            changelog.getFeatures(locale),
            AppColors.primaryOrange,
          ),
        if (changelog.getFixes(locale).isNotEmpty)
          _buildMiniSection(
            isArabic ? 'إصلاحات' : 'Fixes',
            changelog.getFixes(locale),
            Colors.green,
          ),
        if (changelog.getImprovements(locale).isNotEmpty)
          _buildMiniSection(
            isArabic ? 'تحسينات' : 'Improvements',
            changelog.getImprovements(locale),
            AppColors.primaryBlue,
          ),
      ],
    );
  }

  Widget _buildMiniSection(String title, List<String> items, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: GoogleFonts.poppins(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
          const SizedBox(height: 4),
          ...items.map((item) => Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('• ', style: TextStyle(fontWeight: FontWeight.bold)),
                Expanded(
                  child: Text(
                    item,
                    style: GoogleFonts.poppins(fontSize: 13),
                  ),
                ),
              ],
            ),
          )),
        ],
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }
}
