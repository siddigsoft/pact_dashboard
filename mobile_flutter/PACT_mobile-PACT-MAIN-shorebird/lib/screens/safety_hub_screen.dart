// lib/screens/safety_hub_screen.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';
import '../widgets/modern_app_header.dart';
import '../widgets/sos_button.dart';
import 'comprehensive_monitoring_form_screen.dart';
import 'incident_report_screen.dart';
import 'helpline_screen.dart';
import '../l10n/app_localizations.dart';

class SafetyHubScreen extends StatelessWidget {
  const SafetyHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8F9FA), // Light background
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            Expanded(
              child: SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildSectionTitle(AppLocalizations.of(context)!.quickAccess),
                      const SizedBox(height: 16),
                      _buildQuickAccessItems(),
                      const SizedBox(height: 24),
                      _buildSafetyTips(),
                      const SizedBox(height: 24),
                      _buildEmergencyContact(),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Builder(
      builder: (context) => ModernAppHeader(
        title: AppLocalizations.of(context)!.safetyHub,
        showBackButton: false,
        centerTitle: true,
        backgroundColor: const Color(0xFF1976D2), // Deep blue
        textColor: Colors.white,
        actions: [
          HeaderActionButton(
            icon: Icons.info_outline_rounded,
            tooltip: AppLocalizations.of(context)!.information,
            color: Colors.white,
            backgroundColor: Colors.white.withOpacity(0.2),
            onPressed: () {},
          ),
        ],
      ).animate().fadeIn(duration: 500.ms),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0, horizontal: 4.0),
      child: Text(
        title,
        style: const TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.w600,
          color: Color(0xFF263238), // Dark text
        ),
      ),
    ).animate().fadeIn(duration: 400.ms, delay: 100.ms);
  }

  Widget _buildQuickAccessItems() {
    return Builder(
      builder: (context) => Column(
        children: [
          _buildSafetyItem(
            context: context,
            icon: Icons.checklist_rounded,
            title: AppLocalizations.of(context)!.safetyChecklist,
            iconBackgroundColor: const Color(0xFFFF9800).withOpacity(0.15), // Orange background
            iconColor: const Color(0xFFFF9800), // Orange icon
          ),
          _buildSafetyItem(
            context: context,
            icon: Icons.warning_amber_rounded,
            title: AppLocalizations.of(context)!.incidentReport,
            iconBackgroundColor: const Color(0xFF1976D2).withOpacity(0.15), // Blue background
            iconColor: const Color(0xFF1976D2), // Blue icon
          ),
          _buildSafetyItem(
            context: context,
            icon: Icons.support_agent,
            title: AppLocalizations.of(context)!.regionalHelplines,
            iconBackgroundColor: const Color(0xFF4CAF50).withOpacity(0.15), // Green background
            iconColor: const Color(0xFF4CAF50), // Green icon
          ),
        ],
      ),
    ).animate().fadeIn(duration: 400.ms, delay: 200.ms);
  }

  Widget _buildSafetyItem({
    required BuildContext context,
    required IconData icon,
    required String title,
    required Color iconBackgroundColor,
    required Color iconColor,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.shade200,
            blurRadius: 6,
            offset: const Offset(0, 3),
          ),
        ],
        border: Border.all(
          color: const Color(0xFFFF9800).withOpacity(0.1), // Light orange border
          width: 1,
        ),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: () {
            HapticFeedback.mediumImpact();
            if (title == AppLocalizations.of(context)!.safetyChecklist) {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const ComprehensiveMonitoringFormScreen(),
                ),
              );
            } else if (title == AppLocalizations.of(context)!.incidentReport) {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const IncidentReportScreen(),
                ),
              );
            } else if (title == AppLocalizations.of(context)!.regionalHelplines) {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => HelplineScreen()),
              );
            }
          },
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: iconBackgroundColor,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, color: iconColor, size: 28),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF263238), // Dark text
                    ),
                  ),
                ),
                Icon(Icons.chevron_right, color: const Color(0xFFFF9800), size: 28), // Orange chevron
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSafetyTips() {
    return Builder(
      builder: (context) => Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Color(0xFF1976D2), // Deep blue
                Color(0xFF42A5F5), // Light blue
              ],
            ),
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF1976D2).withOpacity(0.3),
                blurRadius: 10,
                offset: const Offset(0, 5),
                spreadRadius: -2,
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(
                    Icons.tips_and_updates_outlined,
                    color: Colors.white,
                    size: 28,
                  ),
                  const SizedBox(width: 12),
                  Text(
                    AppLocalizations.of(context)!.safetyTipOfTheDay,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                AppLocalizations.of(context)!.ladderInspectionTip,
                style: const TextStyle(fontSize: 15, color: Colors.white),
              ),
              const SizedBox(height: 16),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () {
                    HapticFeedback.lightImpact();
                    // View more safety tips
                  },
                  style: TextButton.styleFrom(
                    backgroundColor: Colors.white.withOpacity(0.3),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: Text(
                    AppLocalizations.of(context)!.viewMoreTips,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ],
          ),
        )
        .animate()
        .fadeIn(duration: 400.ms, delay: 300.ms)
        .slideY(begin: 0.2, end: 0, duration: 400.ms)
    );
  }

  Widget _buildEmergencyContact() {
    return Builder(
      builder: (context) => SOSButton(
        emergencyContacts: [
          AppLocalizations.of(context)!.localPolice,
          AppLocalizations.of(context)!.pactEmergency,
          AppLocalizations.of(context)!.medicalEmergency,
        ],
      ),
    );
  }

  Widget _buildContactInfo(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: GoogleFonts.poppins(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: AppColors.textLight,
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
    );
  }
}
