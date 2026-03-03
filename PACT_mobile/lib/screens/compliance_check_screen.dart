import 'package:flutter/material.dart';
import '../services/compliance_service.dart';

/// Screen that shows the Terms and Privacy Dialog for compliance
class ComplianceCheckScreen extends StatelessWidget {
  const ComplianceCheckScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: TermsAndPrivacyDialog(
          onAccept: () {
            // User accepted terms and privacy
            // Navigate to next screen (onboarding or login)
            Navigator.of(context).pushReplacementNamed('/login');
          },
          onDecline: () {
            // User declined - close the app or go back
            Navigator.of(context).pop();
          },
        ),
      ),
    );
  }
}
