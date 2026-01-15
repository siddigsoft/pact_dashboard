import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import '../theme/app_colors.dart';

class RegionalSupervisor {
  final String name;
  final String region;
  final String phone;
  final String email;
  final String? role;

  const RegionalSupervisor({
    required this.name,
    required this.region,
    required this.phone,
    required this.email,
    this.role,
  });
}

class HelplineScreen extends StatelessWidget {
  HelplineScreen({super.key});

  // Sample data - Replace with actual supervisors' data
  final List<RegionalSupervisor> supervisors = [
    const RegionalSupervisor(
      name: 'John Doe',
      region: 'Central Region',
      phone: '+256 700 123 456',
      email: 'john.doe@pact.org',
      role: 'Regional Safety Supervisor',
    ),
    const RegionalSupervisor(
      name: 'Jane Smith',
      region: 'Eastern Region',
      phone: '+256 700 234 567',
      email: 'jane.smith@pact.org',
      role: 'Regional Manager',
    ),
    const RegionalSupervisor(
      name: 'Robert Johnson',
      region: 'Western Region',
      phone: '+256 700 345 678',
      email: 'robert.johnson@pact.org',
      role: 'Safety Coordinator',
    ),
    const RegionalSupervisor(
      name: 'Sarah Williams',
      region: 'Northern Region',
      phone: '+256 700 456 789',
      email: 'sarah.williams@pact.org',
      role: 'Regional Supervisor',
    ),
  ];

  Future<void> _makeCall(String number) async {
    final Uri url = Uri.parse('tel:$number');
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
    }
  }

  Future<void> _sendEmail(String email) async {
    final Uri url = Uri.parse('mailto:$email');
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.backgroundGray,
      appBar: AppBar(
        title: Text(
          'Regional Helplines',
          style: GoogleFonts.poppins(
            fontWeight: FontWeight.w600,
            color: AppColors.textDark,
          ),
        ),
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          color: AppColors.textDark,
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: supervisors.length,
        itemBuilder: (context, index) {
          final supervisor = supervisors[index];
          return Card(
            margin: const EdgeInsets.only(bottom: 16),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.primaryOrange.withOpacity(0.1),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          Icons.person,
                          color: AppColors.primaryOrange,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              supervisor.name,
                              style: GoogleFonts.poppins(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textDark,
                              ),
                            ),
                            Text(
                              supervisor.region,
                              style: GoogleFonts.poppins(
                                fontSize: 14,
                                color: AppColors.textLight,
                              ),
                            ),
                            if (supervisor.role != null)
                              Text(
                                supervisor.role!,
                                style: GoogleFonts.poppins(
                                  fontSize: 14,
                                  color: AppColors.primaryOrange,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  const Divider(),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: TextButton.icon(
                          onPressed: () {
                            HapticFeedback.mediumImpact();
                            _makeCall(supervisor.phone);
                          },
                          icon: Icon(
                            Icons.phone,
                            color: AppColors.primaryOrange,
                            size: 20,
                          ),
                          label: Text(
                            supervisor.phone,
                            style: GoogleFonts.poppins(
                              color: AppColors.primaryOrange,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          style: TextButton.styleFrom(
                            padding: const EdgeInsets.all(12),
                            backgroundColor: AppColors.primaryOrange
                                .withOpacity(0.1),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton(
                        onPressed: () {
                          HapticFeedback.mediumImpact();
                          _sendEmail(supervisor.email);
                        },
                        icon: Icon(Icons.email, color: AppColors.primaryOrange),
                        style: IconButton.styleFrom(
                          backgroundColor: AppColors.primaryOrange.withOpacity(
                            0.1,
                          ),
                          padding: const EdgeInsets.all(12),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ).animate().fadeIn(duration: 300.ms, delay: (100 * index).ms);
        },
      ),
    );
  }
}
