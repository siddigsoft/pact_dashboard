import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../theme/app_colors.dart';
import '../widgets/reusable_app_bar.dart';
import '../widgets/custom_drawer_menu.dart';
import '../widgets/app_widgets.dart';

class SupportScreen extends StatefulWidget {
  const SupportScreen({super.key});

  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final _subjectController = TextEditingController();
  final _messageController = TextEditingController();

  @override
  void dispose() {
    _subjectController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _sendEmail() async {
    if (_subjectController.text.isEmpty || _messageController.text.isEmpty) {
      AppSnackBar.show(
        context,
        message: 'Please fill in both subject and message',
        type: SnackBarType.warning,
      );
      return;
    }

    // Get app info for the email
    PackageInfo packageInfo = await PackageInfo.fromPlatform();

    final String formattedBody =
        '''
PACT Mobile Support Request
===========================

Hello Francis,

A user has submitted a support request through the PACT Mobile app.

SUBJECT: ${_subjectController.text}

MESSAGE:
${_messageController.text}

---
APP INFORMATION:
• App Version: ${packageInfo.version} (${packageInfo.buildNumber})
• Package Name: ${packageInfo.packageName}
• App Name: ${packageInfo.appName}
• Platform: ${Theme.of(context).platform == TargetPlatform.android
            ? 'Android'
            : Theme.of(context).platform == TargetPlatform.iOS
            ? 'iOS'
            : 'Unknown'}

TIMESTAMP: ${DateTime.now().toString()}

---
This email was generated automatically from the PACT Mobile app.
Please respond to the user directly if needed.

Best regards,
PACT Mobile Support System
''';

    final Uri emailLaunchUri = Uri(
      scheme: 'mailto',
      path: 'francis.b.kaz@gmail.com',
      queryParameters: {
        'subject': '[PACT Mobile Support] ${_subjectController.text}',
        'body': formattedBody,
      },
    );

    try {
      if (await canLaunchUrl(emailLaunchUri)) {
        await launchUrl(emailLaunchUri);
        AppSnackBar.show(
          context,
          message: 'Email client opened successfully',
          type: SnackBarType.success,
        );
      } else {
        AppSnackBar.show(
          context,
          message:
              'No email app found. Please send email to francis.b.kaz@gmail.com',
          type: SnackBarType.error,
        );
      }
    } catch (e) {
      AppSnackBar.show(
        context,
        message:
            'Unable to open email app. Please send email to francis.b.kaz@gmail.com',
        type: SnackBarType.error,
      );
    }
  }

  Future<void> _makePhoneCall() async {
    final Uri phoneUri = Uri(scheme: 'tel', path: '+211912345678');
    try {
      if (await canLaunchUrl(phoneUri)) {
        await launchUrl(phoneUri);
      } else {
        AppSnackBar.show(
          context,
          message: 'Unable to make phone call',
          type: SnackBarType.error,
        );
      }
    } catch (e) {
      AppSnackBar.show(
        context,
        message: 'Unable to make phone call',
        type: SnackBarType.error,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _scaffoldKey,
      drawer: CustomDrawerMenu(
        currentUser: null, // Will be set by parent
        onClose: () => _scaffoldKey.currentState?.closeDrawer(),
      ),
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              AppColors.primaryWhite,
              AppColors.backgroundGray.withOpacity(0.3),
            ],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              ReusableAppBar(title: 'Support', scaffoldKey: _scaffoldKey),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Contact Support',
                        style: GoogleFonts.poppins(
                          fontSize: 28,
                          fontWeight: FontWeight.bold,
                          color: AppColors.textDark,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Get in touch with our support team',
                        style: GoogleFonts.poppins(
                          fontSize: 16,
                          color: AppColors.textLight,
                        ),
                      ),
                      const SizedBox(height: 32),

                      // Contact Methods
                      Text(
                        'Contact Methods',
                        style: GoogleFonts.poppins(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textDark,
                        ),
                      ),
                      const SizedBox(height: 16),

                      _buildContactCard(
                        icon: Icons.email_rounded,
                        title: 'Email Support',
                        subtitle: 'francis.b.kaz@gmail.com',
                        description:
                            'Send us a detailed message about your issue',
                        buttonText: 'Send Email',
                        onTap: _sendEmail,
                      ),

                      _buildContactCard(
                        icon: Icons.phone_rounded,
                        title: 'Phone Support',
                        subtitle: '+211 912 345 678',
                        description: 'Call us for immediate assistance',
                        buttonText: 'Call Now',
                        onTap: _makePhoneCall,
                      ),

                      _buildContactCard(
                        icon: Icons.schedule_rounded,
                        title: 'Business Hours',
                        subtitle: 'Mon - Fri, 8:00 AM - 5:00 PM',
                        description:
                            'Our support team is available during business hours',
                        buttonText: null,
                        onTap: () {},
                      ),

                      const SizedBox(height: 32),

                      // Quick Contact Form
                      Text(
                        'Send us a Message',
                        style: GoogleFonts.poppins(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textDark,
                        ),
                      ),
                      const SizedBox(height: 16),

                      Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.05),
                              blurRadius: 10,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Subject',
                              style: GoogleFonts.poppins(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textDark,
                              ),
                            ),
                            const SizedBox(height: 8),
                            TextField(
                              controller: _subjectController,
                              decoration: InputDecoration(
                                hintText: 'Brief description of your issue',
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 12,
                                ),
                              ),
                            ),
                            const SizedBox(height: 16),
                            Text(
                              'Message',
                              style: GoogleFonts.poppins(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textDark,
                              ),
                            ),
                            const SizedBox(height: 8),
                            TextField(
                              controller: _messageController,
                              maxLines: 5,
                              decoration: InputDecoration(
                                hintText: 'Describe your issue in detail...',
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 12,
                                ),
                              ),
                            ),
                            const SizedBox(height: 20),
                            SizedBox(
                              width: double.infinity,
                              child: ElevatedButton.icon(
                                onPressed: _sendEmail,
                                icon: const Icon(Icons.send_rounded),
                                label: const Text('Send Message'),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.primaryOrange,
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 16,
                                  ),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 32),

                      // FAQ Section
                      Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.05),
                              blurRadius: 10,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Before contacting support...',
                              style: GoogleFonts.poppins(
                                fontSize: 18,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textDark,
                              ),
                            ),
                            const SizedBox(height: 12),
                            _buildFAQItem(
                              'Check our Help section',
                              'Visit the Help screen for common questions and guides',
                            ),
                            _buildFAQItem(
                              'Restart the app',
                              'Try closing and reopening the app to resolve temporary issues',
                            ),
                            _buildFAQItem(
                              'Check your connection',
                              'Ensure you have a stable internet connection',
                            ),
                            _buildFAQItem(
                              'Update the app',
                              'Make sure you have the latest version installed',
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildContactCard({
    required IconData icon,
    required String title,
    required String subtitle,
    required String description,
    required String? buttonText,
    required VoidCallback onTap,
  }) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, color: AppColors.primaryOrange, size: 24),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: GoogleFonts.poppins(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textDark,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          color: AppColors.textLight,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              description,
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: AppColors.textLight,
              ),
            ),
            if (buttonText != null) ...[
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: onTap,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryOrange,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: Text(buttonText),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildFAQItem(String title, String description) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.check_circle_rounded,
            color: AppColors.primaryOrange,
            size: 20,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textDark,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  description,
                  style: GoogleFonts.poppins(
                    fontSize: 13,
                    color: AppColors.textLight,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
