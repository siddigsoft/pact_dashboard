import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class StartVisitDialog extends StatelessWidget {
  final Map<String, dynamic> site;
  const StartVisitDialog({super.key, required this.site});

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final siteName =
        site['site_name'] ??
        site['siteName'] ??
        (isArabic ? 'موقع غير معروف' : 'Unknown Site');
    final siteCode =
        site['site_code'] ??
        site['siteCode'] ??
        site['id']?.toString().substring(0, 8) ??
        '';
    final state = site['state'] ?? '';
    final locality = site['locality'] ?? '';
    final status = site['status'] ?? (isArabic ? 'معلق' : 'Pending');
    final activityType = site['activity_type'] ?? site['main_activity'] ?? '';
    final isDM = [
      'GFA',
      'CBT',
      'EBSFP',
    ].contains(activityType.toString().toUpperCase());

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 450, maxHeight: 780),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.15),
              blurRadius: 30,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Professional Header with Gradient
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF1976D2), Color(0xFF1565C0)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(24),
                  topRight: Radius.circular(24),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: const BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.play_arrow,
                          color: Color(0xFF1976D2),
                          size: 28,
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              isArabic
                                  ? 'بدء زيارة الموقع'
                                  : 'Start Site Visit',
                              style: GoogleFonts.poppins(
                                fontSize: 22,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              siteName,
                              style: GoogleFonts.poppins(
                                fontSize: 12,
                                color: Colors.white70,
                                fontWeight: FontWeight.w500,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Site Details Card
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF8F9FA),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.grey.withOpacity(0.1)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            isArabic ? 'معلومات الموقع' : 'SITE INFORMATION',
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: const Color(0xFF666666),
                              letterSpacing: 1,
                            ),
                          ),
                          const SizedBox(height: 16),
                          _buildDetailRow(
                            icon: Icons.location_on,
                            iconColor: const Color(0xFF1976D2),
                            label: isArabic ? 'الموقع' : 'Location',
                            value: locality.isNotEmpty
                                ? '$locality, $state'
                                : state.isNotEmpty
                                ? state
                                : (isArabic ? 'غير متوفر' : 'N/A'),
                          ),
                          const SizedBox(height: 14),
                          _buildDetailRow(
                            icon: Icons.business,
                            iconColor: const Color(0xFF1976D2),
                            label: isArabic ? 'اسم الموقع' : 'Site Name',
                            value: siteName,
                          ),
                          if (activityType.toString().isNotEmpty) ...[
                            const SizedBox(height: 14),
                            _buildDetailRow(
                              icon: isDM
                                  ? Icons.trending_down
                                  : Icons.trending_up,
                              iconColor: isDM
                                  ? const Color(0xFF1976D2)
                                  : const Color(0xFFFF9800),
                              label: isArabic ? 'نوع المشروع' : 'Project Type',
                              value: isDM
                                  ? (isArabic
                                        ? 'رصد التوزيع'
                                        : 'Distribution Monitoring')
                                  : (isArabic
                                        ? 'رصد ما بعد التوزيع'
                                        : 'Post-Dist. Monitoring'),
                            ),
                          ],
                          const SizedBox(height: 14),
                          Row(
                            children: [
                              Expanded(
                                child: _buildChip(
                                  isArabic ? 'رمز الموقع' : 'Site Code',
                                  siteCode,
                                  const Color(0xFF1976D2),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: _buildChip(
                                  isArabic ? 'الحالة' : 'Status',
                                  status,
                                  const Color(0xFFFF9800),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 24),

                    // What Happens Next
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF7E0),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: const Color(0xFFFFD166).withOpacity(0.3),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            isArabic
                                ? 'ماذا سيحدث بعد ذلك؟'
                                : 'WHAT HAPPENS NEXT?',
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: const Color(0xFF666666),
                              letterSpacing: 1,
                            ),
                          ),
                          const SizedBox(height: 16),
                          _buildStepItem(
                            '1',
                            isArabic
                                ? 'سيبدأ احتساب مدة الزيارة'
                                : 'Visit duration timer will start',
                          ),
                          const SizedBox(height: 12),
                          _buildStepItem(
                            '2',
                            isArabic
                                ? 'مراقبة الموقع لتتبع الدقة'
                                : 'Location monitoring begins',
                          ),
                          const SizedBox(height: 12),
                          _buildStepItem(
                            '3',
                            isArabic
                                ? 'إضافة الصور والملاحظات'
                                : 'Add photos & observations',
                          ),
                          const SizedBox(height: 12),
                          _buildStepItem(
                            '4',
                            isArabic
                                ? 'إكمال التقرير عند الانتهاء'
                                : 'Complete report when done',
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Action Buttons
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                border: Border(
                  top: BorderSide(color: Colors.grey.withOpacity(0.1)),
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(false),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        side: BorderSide(
                          color: Colors.grey.withOpacity(0.3),
                          width: 1.5,
                        ),
                      ),
                      child: Text(
                        isArabic ? 'إلغاء' : 'Cancel',
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFF333333),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => Navigator.of(context).pop(true),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF1976D2),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 2,
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.play_arrow, size: 20),
                          const SizedBox(width: 8),
                          Text(
                            isArabic ? 'بدء الزيارة' : 'Start Visit',
                            style: GoogleFonts.poppins(
                              fontSize: 14,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailRow({
    required IconData icon,
    required Color iconColor,
    required String label,
    required String value,
  }) {
    return Row(
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: iconColor.withOpacity(0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, color: iconColor, size: 18),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: GoogleFonts.poppins(
                  fontSize: 10,
                  color: const Color(0xFF999999),
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: GoogleFonts.poppins(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFF333333),
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildChip(String label, String value, Color color) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: GoogleFonts.poppins(
            fontSize: 10,
            color: const Color(0xFF999999),
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 4),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: color.withOpacity(0.1),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: color.withOpacity(0.3)),
          ),
          child: Text(
            value,
            style: GoogleFonts.poppins(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: color,
            ),
            textAlign: TextAlign.center,
          ),
        ),
      ],
    );
  }

  Widget _buildStepItem(String number, String text) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: const BoxDecoration(
            color: Color(0xFFFF9800),
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Text(
              number,
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            text,
            style: GoogleFonts.poppins(
              fontSize: 12,
              color: const Color(0xFF333333),
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}
