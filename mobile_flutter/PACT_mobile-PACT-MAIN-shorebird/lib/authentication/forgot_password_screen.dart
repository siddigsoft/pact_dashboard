import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../widgets/app_widgets.dart';
import '../services/auth_service.dart';
import 'reset_password_screen.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen>
    with SingleTickerProviderStateMixin {
  // Controller for email input
  final _emailController = TextEditingController();

  // Form key for validation
  final _formKey = GlobalKey<FormState>();

  // Animation controller
  late AnimationController _animationController;
  late Animation<double> _scaleAnimation;

  // State variables
  bool _isLoading = false;
  bool _emailSent = false; // Track if email has been sent

  @override
  void initState() {
    super.initState();

    // Initialize animation controller
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );

    // Create scale animation for button press effect
    _scaleAnimation = Tween<double>(begin: 1.0, end: 0.95).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _emailController.dispose();
    _animationController.dispose();
    super.dispose();
  }

  // Email validation
  String? _validateEmail(String? value) {
    if (value == null || value.isEmpty) {
      return 'Please enter your email';
    }
    final emailRegex = RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$');
    if (!emailRegex.hasMatch(value)) {
      return 'Please enter a valid email address';
    }
    return null;
  }

  // Handle password reset
  Future<void> _handlePasswordReset() async {
    if (_formKey.currentState!.validate()) {
      // Trigger button animation
      _animationController.forward().then((_) {
        _animationController.reverse();
      });

      setState(() {
        _isLoading = true;
      });

      try {
        final authService = AuthService();
        await authService.requestPasswordReset(_emailController.text.trim());

        setState(() {
          _isLoading = false;
          _emailSent = true; // Mark email as sent
        });

        // Navigate to reset password screen instead of showing dialog
        if (mounted) {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) =>
                  ResetPasswordScreen(email: _emailController.text.trim()),
            ),
          );
        }
      } catch (e) {
        setState(() {
          _isLoading = false;
        });

        AppSnackBar.show(
          context,
          message: e.toString(),
          type: SnackBarType.error,
        );
      }
    }
  }

  // Show success dialog after email is sent
  void _showSuccessDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) {
        return Dialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          child: Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Colors.white, AppColors.backgroundGray],
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Success icon with animation
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: Colors.green.withOpacity(0.1),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.check_circle,
                    color: Colors.green,
                    size: 50,
                  ),
                ),

                const SizedBox(height: 20),

                // Success title
                const Text(
                  'Email Sent!',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    color: AppColors.textDark,
                  ),
                ),

                const SizedBox(height: 12),

                // Success message
                Text(
                  'We have sent a password recovery link to ${_emailController.text}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 14,
                    color: AppColors.textLight,
                  ),
                ),

                const SizedBox(height: 24),

                // OK button
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {
                      Navigator.of(context).pop(); // Close dialog
                      Navigator.of(context).pop(); // Go back to login
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primaryBlue,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    child: const Text(
                      'OK',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  // Resend email function
  Future<void> _resendEmail() async {
    setState(() {
      _isLoading = true;
    });

    try {
      final authService = AuthService();
      await authService.requestPasswordReset(_emailController.text.trim());

      setState(() {
        _isLoading = false;
      });

      AppSnackBar.show(
        context,
        message: 'New verification code sent to your email',
        type: SnackBarType.success,
      );
    } catch (e) {
      setState(() {
        _isLoading = false;
      });

      AppSnackBar.show(
        context,
        message: 'Failed to resend code',
        type: SnackBarType.error,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;

    return Scaffold(
      backgroundColor: AppColors.backgroundGray,
      body: Container(
        height: screenHeight,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              AppColors.primaryWhite,
              AppColors.backgroundGray.withOpacity(0.5),
            ],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              // Custom App Bar
              Container(
                padding: const EdgeInsets.all(16.0),
                child: Row(
                  children: [
                    // Back button
                    Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.05),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: IconButton(
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(
                          Icons.arrow_back_ios_new,
                          color: AppColors.textDark,
                          size: 20,
                        ),
                      ),
                    ),
                    const Expanded(
                      child: Text(
                        'Forgot Password',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: AppColors.textDark,
                        ),
                      ),
                    ),
                    const SizedBox(width: 48), // Balance the layout
                  ],
                ),
              ),

              // Main content
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 24.0),
                  child: Column(
                    children: [
                      const SizedBox(height: 40),

                      // Illustration
                      Container(
                        width: 200,
                        height: 200,
                        decoration: BoxDecoration(
                          color: AppColors.primaryOrange.withOpacity(0.1),
                          shape: BoxShape.circle,
                        ),
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            // Outer circle decoration
                            Container(
                              width: 150,
                              height: 150,
                              decoration: BoxDecoration(
                                color: AppColors.primaryOrange.withOpacity(0.2),
                                shape: BoxShape.circle,
                              ),
                            ),
                            // Lock icon in center
                            Container(
                              width: 100,
                              height: 100,
                              decoration: BoxDecoration(
                                gradient: AppColors.primaryGradient,
                                shape: BoxShape.circle,
                                boxShadow: [
                                  BoxShadow(
                                    color: AppColors.primaryOrange.withOpacity(
                                      0.3,
                                    ),
                                    blurRadius: 20,
                                    offset: const Offset(0, 10),
                                  ),
                                ],
                              ),
                              child: const Icon(
                                Icons.lock_reset,
                                size: 50,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 40),

                      // Title
                      const Text(
                        'Reset Your Password',
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: AppColors.textDark,
                        ),
                      ),

                      const SizedBox(height: 12),

                      // Description
                      const Text(
                        'Enter your email address and we\'ll send you a link to reset your password.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 14,
                          color: AppColors.textLight,
                          height: 1.5,
                        ),
                      ),

                      const SizedBox(height: 40),

                      // Email input form
                      Form(
                        key: _formKey,
                        child: Column(
                          children: [
                            // Email field with custom styling
                            Container(
                              decoration: BoxDecoration(
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withOpacity(0.05),
                                    blurRadius: 15,
                                    offset: const Offset(0, 5),
                                  ),
                                ],
                              ),
                              child: TextFormField(
                                controller: _emailController,
                                keyboardType: TextInputType.emailAddress,
                                validator: _validateEmail,
                                enabled:
                                    !_emailSent, // Disable if email is sent
                                decoration: InputDecoration(
                                  labelText: 'Email Address',
                                  hintText: 'Enter your registered email',
                                  prefixIcon: const Icon(
                                    Icons.email_outlined,
                                    color: AppColors.primaryOrange,
                                  ),
                                  filled: true,
                                  fillColor: Colors.white,
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    borderSide: BorderSide.none,
                                  ),
                                  enabledBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    borderSide: BorderSide.none,
                                  ),
                                  focusedBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    borderSide: const BorderSide(
                                      color: AppColors.primaryOrange,
                                      width: 2,
                                    ),
                                  ),
                                ),
                              ),
                            ),

                            const SizedBox(height: 30),

                            // Send Email Button
                            ScaleTransition(
                              scale: _scaleAnimation,
                              child: SizedBox(
                                width: double.infinity,
                                height: 56,
                                child: ElevatedButton(
                                  onPressed: (_isLoading || _emailSent)
                                      ? null
                                      : _handlePasswordReset,
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: AppColors.primaryOrange,
                                    disabledBackgroundColor: Colors.grey[300],
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    elevation: _emailSent ? 0 : 4,
                                  ),
                                  child: _isLoading
                                      ? const CircularProgressIndicator(
                                          color: Colors.white,
                                          strokeWidth: 2,
                                        )
                                      : Text(
                                          _emailSent
                                              ? 'EMAIL SENT'
                                              : 'SEND RESET LINK',
                                          style: const TextStyle(
                                            fontSize: 16,
                                            fontWeight: FontWeight.bold,
                                            letterSpacing: 1.2,
                                            color: Colors.white,
                                          ),
                                        ),
                                ),
                              ),
                            ),

                            // Show resend option if email was sent
                            if (_emailSent) ...[
                              const SizedBox(height: 20),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  const Text(
                                    "Didn't receive the email?",
                                    style: TextStyle(
                                      color: AppColors.textLight,
                                      fontSize: 14,
                                    ),
                                  ),
                                  TextButton(
                                    onPressed: _isLoading ? null : _resendEmail,
                                    child: const Text(
                                      'Resend',
                                      style: TextStyle(
                                        color: AppColors.primaryBlue,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 14,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],

                            const SizedBox(height: 30),

                            // Additional help text
                            Container(
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: AppColors.primaryBlue.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    Icons.info_outline,
                                    color: AppColors.primaryBlue,
                                    size: 20,
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Text(
                                      'Check your spam folder if you don\'t see the email in your inbox.',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: AppColors.primaryBlue,
                                        height: 1.4,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),

                            const SizedBox(height: 40),

                            // Back to login link
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Text(
                                  'Remember your password?',
                                  style: TextStyle(
                                    color: AppColors.textLight,
                                    fontSize: 14,
                                  ),
                                ),
                                TextButton(
                                  onPressed: () {
                                    Navigator.pushReplacementNamed(
                                      context,
                                      '/login',
                                    );
                                  },
                                  child: const Text(
                                    'Sign In',
                                    style: TextStyle(
                                      color: AppColors.primaryOrange,
                                      fontWeight: FontWeight.bold,
                                      fontSize: 14,
                                    ),
                                  ),
                                ),
                              ],
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
}
