import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:pinput/pinput.dart';
import '../theme/app_colors.dart';
import '../widgets/app_widgets.dart';
import '../services/auth_service.dart';

class ResetPasswordScreen extends StatefulWidget {
  final String email;

  const ResetPasswordScreen({super.key, required this.email});

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final _otpController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  bool _isLoading = false;
  bool _otpVerified = false;
  String _otpValue = '';

  @override
  void dispose() {
    _otpController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  String? _validatePassword(String? value) {
    if (value == null || value.isEmpty) {
      return 'Please enter a password';
    }
    if (value.length < 8) {
      return 'Password must be at least 8 characters';
    }
    if (!RegExp(r'(?=.*[a-z])').hasMatch(value)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!RegExp(r'(?=.*[A-Z])').hasMatch(value)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!RegExp(r'(?=.*\d)').hasMatch(value)) {
      return 'Password must contain at least one number';
    }
    return null;
  }

  String? _validateConfirmPassword(String? value) {
    if (value == null || value.isEmpty) {
      return 'Please confirm your password';
    }
    if (value != _passwordController.text) {
      return 'Passwords do not match';
    }
    return null;
  }

  Future<void> _verifyOTP() async {
    if (_otpValue.length != 6) {
      AppSnackBar.show(
        context,
        message: 'Please enter the complete 6-digit code',
        type: SnackBarType.warning,
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final authService = AuthService();
      await authService.verifyPasswordResetOTP(widget.email, _otpValue);

      setState(() {
        _otpVerified = true;
      });

      AppSnackBar.show(
        context,
        message: 'Verification code confirmed',
        type: SnackBarType.success,
      );
    } catch (e) {
      AppSnackBar.show(
        context,
        message: e.toString(),
        type: SnackBarType.error,
      );
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _resetPassword() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final authService = AuthService();
      await authService.resetPasswordWithOTP(
        widget.email,
        _otpValue,
        _passwordController.text,
      );

      AppSnackBar.show(
        context,
        message:
            'Password reset successfully! You can now log in with your new password.',
        type: SnackBarType.success,
      );

      // Navigate back to login after a delay
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) {
          Navigator.of(
            context,
          ).pushNamedAndRemoveUntil('/login', (route) => false);
        }
      });
    } catch (e) {
      AppSnackBar.show(
        context,
        message: e.toString(),
        type: SnackBarType.error,
      );
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    final screenWidth = MediaQuery.of(context).size.width;

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: SingleChildScrollView(
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: screenWidth * 0.08,
              vertical: 20,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Back button
                Align(
                  alignment: Alignment.centerLeft,
                  child: IconButton(
                    icon: const Icon(Icons.arrow_back_ios),
                    onPressed: () => Navigator.pop(context),
                    color: AppColors.textDark,
                  ),
                ),

                SizedBox(height: screenHeight * 0.02),

                // Title
                Text(
                  'Reset Password',
                  style: GoogleFonts.poppins(
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                    color: AppColors.textDark,
                    letterSpacing: -0.5,
                  ),
                ),

                const SizedBox(height: 8),

                Text(
                  'Enter the verification code sent to\n${widget.email}',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.poppins(
                    fontSize: 15,
                    color: AppColors.textLight,
                    letterSpacing: 0.2,
                  ),
                ),

                SizedBox(height: screenHeight * 0.06),

                // OTP Input Section
                if (!_otpVerified) ...[
                  Center(
                    child: Container(
                      width: 120,
                      height: 120,
                      decoration: BoxDecoration(
                        color: AppColors.primaryOrange.withOpacity(0.1),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        Icons.lock_reset_rounded,
                        size: 60,
                        color: AppColors.primaryOrange,
                      ),
                    ),
                  ),

                  SizedBox(height: screenHeight * 0.04),

                  Text(
                    'Enter Verification Code',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.poppins(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textDark,
                    ),
                  ),

                  const SizedBox(height: 24),

                  // OTP Input Field
                  Center(
                    child: Pinput(
                      length: 6,
                      controller: _otpController,
                      onChanged: (value) {
                        setState(() {
                          _otpValue = value;
                        });
                      },
                      defaultPinTheme: PinTheme(
                        width: 50,
                        height: 50,
                        textStyle: GoogleFonts.poppins(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textDark,
                        ),
                        decoration: BoxDecoration(
                          border: Border.all(
                            color: AppColors.textLight.withOpacity(0.3),
                          ),
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      focusedPinTheme: PinTheme(
                        width: 50,
                        height: 50,
                        textStyle: GoogleFonts.poppins(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primaryOrange,
                        ),
                        decoration: BoxDecoration(
                          border: Border.all(
                            color: AppColors.primaryOrange,
                            width: 2,
                          ),
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      submittedPinTheme: PinTheme(
                        width: 50,
                        height: 50,
                        textStyle: GoogleFonts.poppins(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primaryOrange,
                        ),
                        decoration: BoxDecoration(
                          border: Border.all(color: AppColors.primaryOrange),
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: 32),

                  // Verify OTP Button
                  ElevatedButton(
                    onPressed: _isLoading ? null : _verifyOTP,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primaryOrange,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      minimumSize: const Size(double.infinity, 50),
                    ),
                    child: _isLoading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(
                                Colors.white,
                              ),
                            ),
                          )
                        : Text(
                            'Verify Code',
                            style: GoogleFonts.poppins(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                  ),

                  const SizedBox(height: 16),

                  // Resend Code
                  Center(
                    child: TextButton(
                      onPressed: () async {
                        try {
                          final authService = AuthService();
                          await authService.requestPasswordReset(widget.email);
                          AppSnackBar.show(
                            context,
                            message: 'New verification code sent',
                            type: SnackBarType.success,
                          );
                        } catch (e) {
                          AppSnackBar.show(
                            context,
                            message: 'Failed to resend code',
                            type: SnackBarType.error,
                          );
                        }
                      },
                      child: Text(
                        'Resend Code',
                        style: GoogleFonts.poppins(
                          color: AppColors.primaryOrange,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ] else ...[
                  // Password Reset Form
                  Center(
                    child: Container(
                      width: 120,
                      height: 120,
                      decoration: BoxDecoration(
                        color: Colors.green.withOpacity(0.1),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        Icons.check_circle_rounded,
                        size: 60,
                        color: Colors.green,
                      ),
                    ),
                  ),

                  SizedBox(height: screenHeight * 0.04),

                  Text(
                    'Create New Password',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.poppins(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textDark,
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Password Form
                  Form(
                    key: _formKey,
                    child: Column(
                      children: [
                        TextFormField(
                          controller: _passwordController,
                          obscureText: true,
                          validator: _validatePassword,
                          decoration: InputDecoration(
                            labelText: 'New Password',
                            hintText: 'Enter your new password',
                            prefixIcon: const Icon(Icons.lock_rounded),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: BorderSide(
                                color: AppColors.textLight.withOpacity(0.3),
                              ),
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

                        const SizedBox(height: 16),

                        TextFormField(
                          controller: _confirmPasswordController,
                          obscureText: true,
                          validator: _validateConfirmPassword,
                          decoration: InputDecoration(
                            labelText: 'Confirm Password',
                            hintText: 'Confirm your new password',
                            prefixIcon: const Icon(Icons.lock_outline_rounded),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: BorderSide(
                                color: AppColors.textLight.withOpacity(0.3),
                              ),
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

                        const SizedBox(height: 24),

                        // Reset Password Button
                        ElevatedButton(
                          onPressed: _isLoading ? null : _resetPassword,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primaryOrange,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            minimumSize: const Size(double.infinity, 50),
                          ),
                          child: _isLoading
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    valueColor: AlwaysStoppedAnimation<Color>(
                                      Colors.white,
                                    ),
                                  ),
                                )
                              : Text(
                                  'Reset Password',
                                  style: GoogleFonts.poppins(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                        ),
                      ],
                    ),
                  ),
                ],

                const SizedBox(height: 32),

                // Back to Login
                Center(
                  child: TextButton(
                    onPressed: () => Navigator.of(
                      context,
                    ).pushNamedAndRemoveUntil('/login', (route) => false),
                    child: Text(
                      'Back to Login',
                      style: GoogleFonts.poppins(
                        color: AppColors.primaryOrange,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
