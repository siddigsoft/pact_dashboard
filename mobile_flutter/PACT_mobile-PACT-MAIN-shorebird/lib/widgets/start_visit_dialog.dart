import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

class StartVisitDialog extends StatelessWidget {
  final Map<String, dynamic> site;
  const StartVisitDialog({
    super.key,
    required this.site,
  });

  @override
  Widget build(BuildContext context) {
    final siteName = site['site_name'] ?? site['siteName'] ?? 'Unknown Site';
    final siteCode = site['site_code'] ?? site['siteCode'] ?? site['id']?.toString().substring(0, 8) ?? '';
    final state = site['state'] ?? '';
    final locality = site['locality'] ?? '';
    final status = site['status'] ?? 'Pending';

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      child: Container(
        constraints: const BoxConstraints(maxHeight: 600),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header - Black background
            Container(
              padding: const EdgeInsets.all(24),
              decoration: const BoxDecoration(
                color: Colors.black,
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(24),
                  topRight: Radius.circular(24),
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.directions_car, color: Colors.black, size: 20),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Start Site Visit',
                      style: GoogleFonts.poppins(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Content
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Site Details Card
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: AppColors.backgroundGray,
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.05),
                            blurRadius: 10,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'SITE DETAILS',
                            style: GoogleFonts.poppins(
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                              color: AppColors.textLight,
                              letterSpacing: 1.2,
                            ),
                          ),
                          const SizedBox(height: 16),
                          _buildInfoRow(
                            icon: Icons.location_on,
                            label: 'Location',
                            value: locality.isNotEmpty ? '$locality, $state' : state.isNotEmpty ? state : 'N/A',
                          ),
                          const SizedBox(height: 16),
                          _buildInfoRow(
                            icon: Icons.navigation,
                            label: 'Site Name',
                            value: siteName,
                          ),
                          const SizedBox(height: 16),
                          Row(
                            children: [
                              Expanded(
                                child: _buildInfoChip(
                                  label: 'Site ID',
                                  value: siteCode,
                                  isHighlighted: true,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: _buildInfoChip(
                                  label: 'Status',
                                  value: status.toUpperCase(),
                                  isHighlighted: false,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 20),

                    // What Happens Next Card
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: AppColors.backgroundGray,
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.05),
                            blurRadius: 10,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'WHAT HAPPENS NEXT?',
                            style: GoogleFonts.poppins(
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                              color: AppColors.textLight,
                              letterSpacing: 1.2,
                            ),
                          ),
                          const SizedBox(height: 16),
                          _buildNextStepItem('Visit duration will start counting automatically'),
                          const SizedBox(height: 12),
                          _buildNextStepItem('Location monitoring will begin for accuracy tracking'),
                          const SizedBox(height: 12),
                          _buildNextStepItem('You can add photos and observations during the visit'),
                          const SizedBox(height: 12),
                          _buildNextStepItem('Complete the detailed visit report when finished'),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Footer - Action Buttons
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                border: Border(
                  top: BorderSide(color: AppColors.backgroundGray),
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(false),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(24),
                        ),
                        side: BorderSide(color: Colors.black.withOpacity(0.2)),
                      ),
                      child: Text(
                        'Cancel',
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.of(context).pop(true);
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.black,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(24),
                        ),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.play_arrow, size: 20),
                          const SizedBox(width: 8),
                          Text(
                            'Start Visit',
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

  Widget _buildInfoRow({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Row(
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: Colors.black,
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: Colors.white, size: 20),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label.toUpperCase(),
                style: GoogleFonts.poppins(
                  fontSize: 10,
                  color: AppColors.textLight,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                value,
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textDark,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildInfoChip({
    required String label,
    required String value,
    required bool isHighlighted,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: GoogleFonts.poppins(
            fontSize: 10,
            color: AppColors.textLight,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: isHighlighted ? Colors.black : Colors.black.withOpacity(0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            value,
            style: GoogleFonts.poppins(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: isHighlighted ? Colors.white : AppColors.textDark,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildNextStepItem(String text) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(
          Icons.check_circle,
          size: 16,
          color: Colors.black,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            text,
            style: GoogleFonts.poppins(
              fontSize: 13,
              color: AppColors.textDark.withOpacity(0.7),
            ),
          ),
        ),
      ],
    );
  }
}

