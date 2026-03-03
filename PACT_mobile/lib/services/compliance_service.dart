import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../theme/app_colors.dart';

/// Compliance Service for handling privacy policy and terms acceptance
class ComplianceService {
  static final ComplianceService _instance = ComplianceService._internal();
  static const String _hasAcceptedTermsKey = 'has_accepted_terms';
  static const String _hasAcceptedPrivacyKey = 'has_accepted_privacy';

  factory ComplianceService() {
    return _instance;
  }

  ComplianceService._internal();

  /// Check if user has accepted terms
  static Future<bool> hasAcceptedTerms() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_hasAcceptedTermsKey) ?? false;
  }

  /// Check if user has accepted privacy policy
  static Future<bool> hasAcceptedPrivacy() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_hasAcceptedPrivacyKey) ?? false;
  }

  /// Mark terms as accepted
  static Future<void> acceptTerms() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_hasAcceptedTermsKey, true);
  }

  /// Mark privacy as accepted
  static Future<void> acceptPrivacy() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_hasAcceptedPrivacyKey, true);
  }

  /// Reset compliance (for testing)
  static Future<void> resetCompliance() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_hasAcceptedTermsKey);
    await prefs.remove(_hasAcceptedPrivacyKey);
  }
}

/// Terms and Privacy Acceptance Dialog
class TermsAndPrivacyDialog extends StatefulWidget {
  final VoidCallback onAccept;
  final VoidCallback? onDecline;

  const TermsAndPrivacyDialog({
    super.key,
    required this.onAccept,
    this.onDecline,
  });

  @override
  State<TermsAndPrivacyDialog> createState() => _TermsAndPrivacyDialogState();
}

class _TermsAndPrivacyDialogState extends State<TermsAndPrivacyDialog> {
  bool _acceptedTerms = false;
  bool _acceptedPrivacy = false;
  bool _expandedTerms = false;
  bool _expandedPrivacy = false;

  @override
  Widget build(BuildContext context) {
    final canAccept = _acceptedTerms && _acceptedPrivacy;

    return Dialog(
      backgroundColor: AppColors.primaryWhite,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Text(
                'Legal Information',
                style: GoogleFonts.poppins(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textDark,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Please review and accept our terms and privacy policy',
                style: GoogleFonts.poppins(
                  fontSize: 13,
                  fontWeight: FontWeight.w400,
                  color: AppColors.textLight,
                ),
              ),
              const SizedBox(height: 24),

              // Terms of Service
              _buildComplianceSection(
                title: 'Terms of Service',
                isExpanded: _expandedTerms,
                onTap: () {
                  setState(() {
                    _expandedTerms = !_expandedTerms;
                  });
                },
                onAccepted: (value) {
                  setState(() {
                    _acceptedTerms = value;
                  });
                },
                isAccepted: _acceptedTerms,
                content: _termsOfServiceContent,
              ),
              const SizedBox(height: 16),

              // Privacy Policy
              _buildComplianceSection(
                title: 'Privacy Policy',
                isExpanded: _expandedPrivacy,
                onTap: () {
                  setState(() {
                    _expandedPrivacy = !_expandedPrivacy;
                  });
                },
                onAccepted: (value) {
                  setState(() {
                    _acceptedPrivacy = value;
                  });
                },
                isAccepted: _acceptedPrivacy,
                content: _privacyPolicyContent,
              ),
              const SizedBox(height: 24),

              // Buttons
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () {
                        Navigator.pop(context);
                        widget.onDecline?.call();
                      },
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        side: const BorderSide(color: AppColors.primaryOrange),
                      ),
                      child: Text(
                        'Decline',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w600,
                          color: AppColors.primaryOrange,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: canAccept
                          ? () async {
                              await ComplianceService.acceptTerms();
                              await ComplianceService.acceptPrivacy();
                              if (mounted) {
                                Navigator.pop(context);
                                widget.onAccept();
                              }
                            }
                          : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryOrange,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: Text(
                        'Accept All',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildComplianceSection({
    required String title,
    required bool isExpanded,
    required VoidCallback onTap,
    required ValueChanged<bool> onAccepted,
    required bool isAccepted,
    required String content,
  }) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.textLight.withOpacity(0.2)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          GestureDetector(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: GoogleFonts.poppins(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textDark,
                      ),
                    ),
                  ),
                  Icon(
                    isExpanded
                        ? Icons.expand_less_outlined
                        : Icons.expand_more_outlined,
                    color: AppColors.primaryOrange,
                  ),
                ],
              ),
            ),
          ),
          if (isExpanded) ...[
            Divider(height: 1, color: AppColors.textLight.withOpacity(0.2)),
            Container(
              padding: const EdgeInsets.all(16),
              color: AppColors.backgroundGray.withOpacity(0.3),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    content,
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      fontWeight: FontWeight.w400,
                      color: AppColors.textLight,
                      height: 1.6,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Checkbox(
                        value: isAccepted,
                        onChanged: (value) {
                          onAccepted(value ?? false);
                        },
                        activeColor: AppColors.primaryOrange,
                      ),
                      Expanded(
                        child: Text(
                          'I agree to the $title',
                          style: GoogleFonts.poppins(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: AppColors.textDark,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  static const String _termsOfServiceContent = '''
TERMS OF SERVICE

1. ACCEPTANCE OF TERMS
By accessing and using the PACT Mobile application, you accept and agree to be bound by the terms and provision of this agreement.

2. USE LICENSE
Permission is granted to temporarily download one copy of the materials (information or software) on PACT Mobile for personal, non-commercial transitory viewing only.

3. DISCLAIMER
The materials on PACT Mobile are provided on an 'as is' basis. PACT makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.

4. LIMITATIONS
In no event shall PACT or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on PACT Mobile.

5. ACCURACY OF MATERIALS
The materials appearing on PACT Mobile could include technical, typographical, or photographic errors. PACT does not warrant that any of the materials on PACT Mobile are accurate, complete, or current. PACT may make changes to the materials contained on PACT Mobile at any time without notice.

6. MODIFICATIONS
PACT may revise these terms of service for PACT Mobile at any time without notice. By using this application, you are agreeing to be bound by the then current version of these terms of service.

7. GOVERNING LAW
These terms and conditions are governed by and construed in accordance with the laws of Sudan and you irrevocably submit to the exclusive jurisdiction of the courts located in Sudan.
''';

  static const String _privacyPolicyContent = '''
PRIVACY POLICY

1. INFORMATION WE COLLECT
We collect information you provide directly to us, such as when you create an account, complete a profile, or communicate with us. This may include your name, email address, phone number, and geographic location.

2. HOW WE USE DATA
We use the information we collect to provide, maintain, and improve our services, process transactions, send transactional and promotional communications, and comply with legal obligations.

3. DATA SECURITY
We implement appropriate technical and organizational measures to protect your personal data against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet is 100% secure.

4. THIRD-PARTY SHARING
We do not sell, trade, or rent your personal data to third parties. We may share information with service providers who assist us in operating our website and conducting our business, subject to confidentiality agreements.

5. COOKIES AND TRACKING
We use cookies and similar tracking technologies to track activity on our application and hold certain information to understand how you interact with our services.

6. YOUR RIGHTS
You have the right to access, correct, or delete your personal data. You can contact us at any time for questions about our privacy practices.

7. CONTACT US
If you have questions about this Privacy Policy or our privacy practices, please contact us through the application or via email.
''';
}
