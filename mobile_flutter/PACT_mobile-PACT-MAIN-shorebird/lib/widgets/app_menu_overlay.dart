// lib/widgets/app_menu_overlay.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../theme/app_colors.dart';
import '../providers/sync_provider.dart';

class AppMenuOverlay extends StatelessWidget {
  final Function() onClose;

  const AppMenuOverlay({super.key, required this.onClose});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onClose,
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: double.infinity,
        height: double.infinity,
        color: Colors.black.withOpacity(0.3),
        child: Stack(
          children: [
            Positioned(
              top: 70,
              right: 16,
              child: GestureDetector(
                onTap: () {}, // Prevents taps from closing the menu
                child: _buildMenuCard(context),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMenuCard(BuildContext context) {
    return Container(
          width: 280,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.15),
                blurRadius: 15,
                spreadRadius: 0,
                offset: const Offset(0, 5),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildHeader(),
              const Divider(height: 1, thickness: 1),
              _buildMenuItem(
                context,
                'App Settings',
                Icons.settings_rounded,
                AppColors.primaryBlue,
                onTap: () {
                  HapticFeedback.mediumImpact();
                  // Navigate to settings
                  Navigator.pop(context); // Close menu first
                  onClose();
                  // Navigator.pushNamed(context, '/settings');
                },
              ),
              _buildMenuItem(
                context,
                'Notifications',
                Icons.notifications_outlined,
                AppColors.accentYellow,
                badge: 3,
                onTap: () {
                  HapticFeedback.mediumImpact();
                  // Navigate to notifications
                  onClose();
                },
              ),
              _buildMenuItem(
                context,
                'Profile',
                Icons.person_outline_rounded,
                AppColors.primaryOrange,
                onTap: () {
                  HapticFeedback.mediumImpact();
                  // Navigate to profile
                  onClose();
                },
              ),
              _buildMenuItem(
                context,
                'Help & Support',
                Icons.help_outline_rounded,
                AppColors.accentGreen,
                onTap: () async {
                  HapticFeedback.mediumImpact();
                  await _sendFeedback(context);
                  onClose();
                },
              ),
              _buildMenuItem(
                context,
                'Sync Data',
                Icons.sync_rounded,
                AppColors.primaryBlue,
                onTap: () async {
                  HapticFeedback.mediumImpact();
                  await _performSync(context);
                  onClose();
                },
              ),
              _buildMenuItem(
                context,
                'About PACT',
                Icons.info_outline_rounded,
                AppColors.textLight,
                onTap: () async {
                  HapticFeedback.mediumImpact();
                  await _launchPactWebsite(context);
                  onClose();
                },
              ),
              const Divider(height: 1, thickness: 1),
              _buildMenuItem(
                context,
                'Sign Out',
                Icons.logout_rounded,
                AppColors.accentRed,
                onTap: () {
                  HapticFeedback.mediumImpact();
                  // Sign out
                  onClose();
                  _showSignOutDialog(context);
                },
              ),
            ],
          ),
        )
        .animate()
        .fadeIn(duration: 300.ms)
        .scale(
          begin: const Offset(0.9, 0.9),
          end: const Offset(1, 1),
          duration: 300.ms,
          curve: Curves.easeOutQuad,
        );
  }

  Future<void> _launchPactWebsite(BuildContext context) async {
    final url = Uri.parse('https://pactorg1.com/about/');
    try {
      if (await canLaunchUrl(url)) {
        await launchUrl(url, mode: LaunchMode.externalApplication);
      } else {
        // Fallback: try without checking
        await launchUrl(url, mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      // Show error message to user
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Unable to open website. Please check your internet connection.',
            ),
          ),
        );
      }
    }
  }

  Future<void> _sendFeedback(BuildContext context) async {
    // Get app info for the email
    PackageInfo packageInfo = await PackageInfo.fromPlatform();

    final String formattedBody =
        '''
PACT Mobile App Feedback
========================

Hello Francis,

A user would like to provide feedback about the PACT Mobile app.

Please share your thoughts, suggestions, or report any issues you've encountered:

[Your feedback here]


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
This feedback was submitted through the PACT Mobile app menu.
We appreciate your input to help improve the app!

Best regards,
PACT Mobile User
''';

    final Uri emailLaunchUri = Uri(
      scheme: 'mailto',
      path: 'francis.b.kaz@gmail.com',
      queryParameters: {
        'subject': 'PACT Mobile App Feedback',
        'body': formattedBody,
      },
    );

    try {
      if (await canLaunchUrl(emailLaunchUri)) {
        await launchUrl(emailLaunchUri);
      } else {
        // Fallback: try without checking
        await launchUrl(emailLaunchUri);
      }
    } catch (e) {
      // Show error message to user
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Unable to open email app. Please check if you have an email app installed.',
            ),
          ),
        );
      }
    }
  }

  Future<void> _performSync(BuildContext context) async {
    final syncProvider = Provider.of<SyncProvider>(context, listen: false);

    try {
      // Show initial sync message
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Starting data synchronization...'),
            duration: Duration(seconds: 2),
          ),
        );
      }

      // Perform full sync
      await syncProvider.performFullSync();

      // Show success message
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Data synchronization completed successfully!'),
            backgroundColor: Colors.green,
            duration: Duration(seconds: 3),
          ),
        );
      }
    } catch (e) {
      // Show error message
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Sync failed: ${e.toString()}'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    }
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Container(
            height: 40,
            width: 40,
            decoration: BoxDecoration(
              gradient: AppColors.blueGradient,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                  color: AppColors.primaryBlue.withOpacity(0.2),
                  blurRadius: 8,
                  spreadRadius: 0,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: Center(
              child: Text(
                "P",
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                "PACT Mobile",
                style: GoogleFonts.poppins(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textDark,
                ),
              ),
              Text(
                "Version 1.0.0",
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  fontWeight: FontWeight.w400,
                  color: AppColors.textLight,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMenuItem(
    BuildContext context,
    String title,
    IconData icon,
    Color color, {
    VoidCallback? onTap,
    int? badge,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: color, size: 22),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Text(
                  title,
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.w500,
                    color: AppColors.textDark,
                  ),
                ),
              ),
              if (badge != null)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.accentRed,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    badge.toString(),
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _showAboutDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          'About PACT Mobile',
          style: GoogleFonts.poppins(fontSize: 20, fontWeight: FontWeight.w600),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'PACT Mobile App',
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Version 1.0.0',
              style: GoogleFonts.poppins(
                fontSize: 14,
                fontWeight: FontWeight.w400,
                color: AppColors.textLight,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Developed by PACT Consultancy',
              style: GoogleFonts.poppins(
                fontSize: 14,
                fontWeight: FontWeight.w400,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '© 2025 PACT Consultancy. All rights reserved.',
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w400,
                color: AppColors.textLight,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _launchPactWebsite(context);
            },
            child: Text(
              'Visit Website',
              style: GoogleFonts.poppins(
                color: AppColors.primaryBlue,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'Close',
              style: GoogleFonts.poppins(
                color: AppColors.textLight,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    );
  }

  void _showSignOutDialog(BuildContext context) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppColors.accentRed.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                Icons.logout_rounded,
                color: AppColors.accentRed,
                size: 24,
              ),
            ),
            const SizedBox(width: 12),
            Text(
              'Sign Out',
              style: GoogleFonts.poppins(fontSize: 20, fontWeight: FontWeight.w600),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Are you sure you want to sign out?',
              style: GoogleFonts.poppins(fontSize: 16),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.amber.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.amber.withOpacity(0.3)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, color: Colors.amber, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Any unsaved data will be lost. Make sure to sync your data before signing out.',
                      style: GoogleFonts.poppins(fontSize: 12, color: Colors.amber[800]),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(
              'Cancel',
              style: GoogleFonts.poppins(
                color: AppColors.textLight,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(dialogContext);
              await _performSignOut(context);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.accentRed,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            child: Text(
              'Sign Out',
              style: GoogleFonts.poppins(
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    );
  }
  
  Future<void> _performSignOut(BuildContext context) async {
    try {
      // Show loading indicator
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => const Center(
          child: CircularProgressIndicator(color: AppColors.primaryOrange),
        ),
      );
      
      // Perform sign out
      await Supabase.instance.client.auth.signOut();
      
      // Clear local data
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('auth_token');
      await prefs.remove('refresh_token');
      await prefs.remove('user_id');
      await prefs.remove('user_email');
      await prefs.remove('user_name');
      await prefs.setBool('is_logged_in', false);
      await prefs.remove('token_expires_at');
      
      // Close loading dialog and navigate to login
      if (context.mounted) {
        Navigator.of(context).pop(); // Close loading
        Navigator.of(context).pushNamedAndRemoveUntil('/login', (route) => false);
      }
    } catch (e) {
      // Close loading dialog
      if (context.mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to sign out: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}
