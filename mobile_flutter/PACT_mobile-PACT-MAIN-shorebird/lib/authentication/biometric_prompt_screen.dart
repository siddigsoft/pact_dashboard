// lib/authentication/biometric_prompt_screen.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';
import '../services/biometric_auth_service.dart';
import '../services/auth_service.dart';
import '../services/realtime_notification_service.dart';
import '../services/user_notification_service.dart';
import 'login_screen.dart';

class BiometricPromptScreen extends StatefulWidget {
  const BiometricPromptScreen({super.key});

  @override
  State<BiometricPromptScreen> createState() => _BiometricPromptScreenState();
}

class _BiometricPromptScreenState extends State<BiometricPromptScreen>
    with SingleTickerProviderStateMixin {
  final BiometricAuthService _biometricService = BiometricAuthService();
  final AuthService _authService = AuthService();
  late AnimationController _animationController;
  late Animation<double> _fadeAnimation;
  bool _isAuthenticating = false;
  String _biometricType = 'Biometric';

  @override
  void initState() {
    super.initState();

    // Initialize animation controller
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    );

    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _animationController,
        curve: Curves.easeInOut,
      ),
    );

    _animationController.forward();

    // Get biometric type
    _getBiometricType();

    // Auto-attempt biometric authentication after a short delay
    Future.delayed(const Duration(milliseconds: 500), () {
      _attemptBiometricLogin();
    });
  }

  Future<void> _getBiometricType() async {
    final biometrics = await _biometricService.getAvailableBiometrics();
    final typeName = _biometricService.getBiometricTypeName(biometrics);
    setState(() {
      _biometricType = typeName;
    });
  }

  Future<void> _attemptBiometricLogin() async {
    if (_isAuthenticating) return;

    setState(() => _isAuthenticating = true);

    try {
      final authenticated = await _biometricService.authenticate(
        reason: 'Use $_biometricType to sign in',
      );

      if (!authenticated) {
        // Authentication failed, go to login screen
        if (mounted) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (context) => const LoginScreen()),
          );
        }
        return;
      }

      // Authentication successful, get stored credentials
      final credentials = await _biometricService.getStoredCredentials();
      final email = credentials['email'];
      final password = credentials['password'];

      if (email == null || password == null) {
        // Credentials not found, disable biometric and go to login
        await _biometricService.disableBiometric();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Login credentials not found. Please login with email and password.'),
              backgroundColor: Colors.orange,
            ),
          );
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (context) => const LoginScreen()),
          );
        }
        return;
      }

      // Attempt login with Supabase using stored credentials
      debugPrint('🔑 Attempting Supabase login with stored credentials...');
      try {
        final response = await _authService.signIn(email: email, password: password);

        if (response.user == null) {
          // Login failed, disable biometric and go to login
          debugPrint('❌ Supabase login failed with stored credentials');
          await _biometricService.disableBiometric();
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Login failed. Please login with email and password.'),
                backgroundColor: Colors.red,
              ),
            );
            Navigator.pushReplacement(
              context,
              MaterialPageRoute(builder: (context) => const LoginScreen()),
            );
          }
          return;
        }

        debugPrint('✅ Biometric login successful');

        // Initialize services
        await RealtimeNotificationService().initialize();
        await UserNotificationService().initialize();

        // Navigate to main screen
        if (mounted) {
          HapticFeedback.mediumImpact();
          Navigator.pushReplacementNamed(context, '/main');
        }
      } catch (e) {
        debugPrint('❌ Error during Supabase login: $e');
        // Login failed, disable biometric and go to login
        await _biometricService.disableBiometric();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Login error: $e'),
              backgroundColor: Colors.red,
            ),
          );
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (context) => const LoginScreen()),
          );
        }
      }
    } catch (e) {
      debugPrint('Biometric authentication error: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Authentication failed: $e'),
            backgroundColor: Colors.red,
          ),
        );
        // Go to login screen on error
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => const LoginScreen()),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isAuthenticating = false);
      }
    }
  }

  void _usePasswordLogin() {
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (context) => const LoginScreen()),
    );
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              AppColors.primaryOrange.withOpacity(0.1),
              AppColors.primaryBlue.withOpacity(0.1),
            ],
          ),
        ),
        child: SafeArea(
          child: FadeTransition(
            opacity: _fadeAnimation,
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Logo/Icon
                  Container(
                    width: 120,
                    height: 120,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: AppColors.primaryGradient,
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.primaryOrange.withOpacity(0.3),
                          blurRadius: 20,
                          offset: const Offset(0, 10),
                        ),
                      ],
                    ),
                    child: const Icon(
                      Icons.fingerprint,
                      size: 60,
                      color: Colors.white,
                    ),
                  ),

                  const SizedBox(height: 40),

                  // Title
                  Text(
                    'Welcome Back',
                    style: GoogleFonts.poppins(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color: AppColors.textDark,
                    ),
                    textAlign: TextAlign.center,
                  ),

                  const SizedBox(height: 16),

                  // Subtitle
                  Text(
                    'Use $_biometricType to sign in quickly',
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      color: AppColors.textLight,
                    ),
                    textAlign: TextAlign.center,
                  ),

                  const SizedBox(height: 60),

                  // Biometric Button
                  if (_isAuthenticating)
                    const CircularProgressIndicator()
                  else
                    ElevatedButton.icon(
                      onPressed: _attemptBiometricLogin,
                      icon: const Icon(Icons.fingerprint, size: 28),
                      label: Text('Use $_biometricType'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryOrange,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 40,
                          vertical: 16,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(30),
                        ),
                        elevation: 8,
                        shadowColor: AppColors.primaryOrange.withOpacity(0.3),
                      ),
                    ),

                  const SizedBox(height: 30),

                  // Alternative login option
                  TextButton(
                    onPressed: _usePasswordLogin,
                    child: Text(
                      'Use Email & Password',
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        color: AppColors.primaryBlue,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),

                  const SizedBox(height: 40),

                  // Info text
                  Text(
                    'Your biometric data is stored securely on your device and is not shared with anyone.',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: AppColors.textLight,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}