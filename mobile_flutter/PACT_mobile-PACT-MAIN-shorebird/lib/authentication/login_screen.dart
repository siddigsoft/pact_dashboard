// lib/authentication/login_screen.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../theme/app_colors.dart';
import '../widgets/app_widgets.dart';
import '../services/auth_service.dart';
import '../services/biometric_auth_service.dart';
import '../services/realtime_notification_service.dart';
import '../services/user_notification_service.dart';
import '../widgets/biometric_setup_dialog.dart';
import '../l10n/app_localizations.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with SingleTickerProviderStateMixin {
  // Controllers for text fields - manages the text input
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  // Form key for validation
  final _formKey = GlobalKey<FormState>();

  // Animation controller for smooth animations
  late AnimationController _animationController;
  late Animation<double> _fadeAnimation;

  // Boolean to toggle password visibility
  bool _isPasswordVisible = false;

  // Boolean to track loading state
  bool _isLoading = false;

  // Biometric state
  bool _isBiometricAvailable = false;
  bool _isBiometricEnabled = false;
  String _biometricType = 'Biometric';

  // Services
  final _authService = AuthService();
  final _biometricService = BiometricAuthService();

  @override
  void initState() {
    super.initState();
    // Initialize animation controller with 1.8 second duration for smoother animations
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 1800),
      vsync:
          this, // vsync prevents animations from running when screen is not visible
    );

    // Create fade animation from 0 (invisible) to 1 (fully visible)
    // Using a custom curve for more modern feel
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _animationController,
        curve: const Interval(0.1, 1.0, curve: Curves.fastOutSlowIn),
      ),
    );

    // Start the animation with a slight delay for a more natural feel
    Future.delayed(const Duration(milliseconds: 100), () {
      _animationController.forward();
    });

    // Check biometric availability
    _checkBiometricAvailability();
  }

  /// Check if biometric authentication is available and enabled
  Future<void> _checkBiometricAvailability() async {
    try {
      final isAvailable = await _biometricService.isBiometricAvailable();
      final isEnabled = await _biometricService.isBiometricEnabled();
      final hasEnrolled = await _biometricService.hasEnrolledBiometrics();
      // Note: Device credentials are automatically checked as part of isBiometricAvailable()

      debugPrint('📱 Biometric Check Results:');
      debugPrint('  Available: $isAvailable');
      debugPrint('  Enabled: $isEnabled');
      debugPrint('  Has Enrolled: $hasEnrolled');
      debugPrint(
        '  Device Credentials: Available via fallback in authentication',
      );

      if (isAvailable) {
        final biometrics = await _biometricService.getAvailableBiometrics();
        final typeName = _biometricService.getBiometricTypeName(biometrics);
        debugPrint('  Biometric Types: $biometrics');
        debugPrint('  Type Name: $typeName');

        setState(() {
          _isBiometricAvailable = isAvailable;
          _isBiometricEnabled = isEnabled;
          _biometricType = typeName;
        });

        // Auto-attempt biometric login if enabled
        if (isEnabled) {
          Future.delayed(const Duration(milliseconds: 500), () {
            _attemptBiometricLogin();
          });
        }
      } else {
        debugPrint('❌ Biometrics not available on this device');
        setState(() {
          _isBiometricAvailable = false;
          _isBiometricEnabled = false;
        });
      }
    } catch (e) {
      debugPrint('❌ Error checking biometric availability: $e');
      setState(() {
        _isBiometricAvailable = false;
        _isBiometricEnabled = false;
      });
    }
  }

  /// Attempt biometric login
  Future<void> _attemptBiometricLogin() async {
    if (!_isBiometricEnabled || _isLoading) return;

    debugPrint('🔐 Attempting biometric login...');

    try {
      final authenticated = await _biometricService.authenticate(
        reason: 'Login to PACT Mobile',
      );

      if (!authenticated) {
        debugPrint('❌ Biometric authentication failed or cancelled');
        return;
      }

      debugPrint('✅ Biometric authentication successful');

      setState(() => _isLoading = true);

      // Get stored credentials
      final credentials = await _biometricService.getStoredCredentials();
      final email = credentials['email'];
      final password = credentials['password'];

      debugPrint(
        '📧 Retrieved stored credentials: email=${email != null ? 'present' : 'null'}, password=${password != null ? 'present' : 'null'}',
      );

      if (email == null || password == null) {
        // Credentials not found, disable biometric
        debugPrint('❌ Stored credentials not found, disabling biometric');
        await _biometricService.disableBiometric();
        setState(() {
          _isBiometricEnabled = false;
          _isLoading = false;
        });
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Please login with your email and password'),
              backgroundColor: Colors.orange,
            ),
          );
        }
        return;
      }

      // Check connectivity first - if offline, use cached session
      final connectivityResult = await Connectivity().checkConnectivity();
      final isOnline = !connectivityResult.contains(ConnectivityResult.none);
      
      if (!isOnline) {
        // OFFLINE MODE: Check if we have a valid cached session
        debugPrint('📴 Device is offline - checking cached session...');
        final localAuthData = await _authService.getLocalAuthData();
        
        if (localAuthData != null && localAuthData['user_id'] != null) {
          debugPrint('✅ Cached session found - proceeding offline');
          HapticFeedback.mediumImpact();
          
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Row(
                  children: [
                    Icon(Icons.wifi_off, color: Colors.white, size: 18),
                    SizedBox(width: 8),
                    Text('Offline mode - using cached data'),
                  ],
                ),
                backgroundColor: Color(0xFF6B7280),
                duration: Duration(seconds: 2),
              ),
            );
            Navigator.pushReplacementNamed(context, '/main');
          }
          return;
        } else {
          // No cached session - need network to login
          debugPrint('❌ No cached session and device is offline');
          setState(() => _isLoading = false);
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('No internet connection. Please connect to login for the first time.'),
                backgroundColor: Colors.orange,
              ),
            );
          }
          return;
        }
      }

      // ONLINE MODE: Attempt login with stored credentials
      debugPrint('🔑 Attempting online login with stored credentials...');
      final response = await _authService.signIn(
        email: email,
        password: password,
      );

      if (mounted) {
        if (response.user != null) {
          debugPrint('✅ Biometric login successful');
          HapticFeedback.mediumImpact();

          await RealtimeNotificationService().initialize();
          await UserNotificationService().initialize();

          if (mounted) {
            Navigator.pushReplacementNamed(context, '/main');
          }
        } else {
          debugPrint('❌ Login failed with stored credentials');
          // Disable biometric if login fails
          await _biometricService.disableBiometric();
          setState(() {
            _isBiometricEnabled = false;
            _isLoading = false;
          });
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Login failed. Please try again.'),
                backgroundColor: Colors.red,
              ),
            );
          }
        }
      }
    } catch (e) {
      debugPrint('❌ Error during biometric login: $e');
      
      // If network error, try offline mode
      if (e.toString().contains('SocketException') || 
          e.toString().contains('Failed host lookup') ||
          e.toString().contains('No address associated')) {
        debugPrint('📴 Network error detected - attempting offline login...');
        final localAuthData = await _authService.getLocalAuthData();
        
        if (localAuthData != null && localAuthData['user_id'] != null) {
          debugPrint('✅ Cached session found - proceeding offline');
          HapticFeedback.mediumImpact();
          
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Row(
                  children: [
                    Icon(Icons.wifi_off, color: Colors.white, size: 18),
                    SizedBox(width: 8),
                    Text('Offline mode - using cached data'),
                  ],
                ),
                backgroundColor: Color(0xFF6B7280),
                duration: Duration(seconds: 2),
              ),
            );
            Navigator.pushReplacementNamed(context, '/main');
          }
          return;
        }
      }
      
      setState(() => _isLoading = false);
      if (mounted) {
        String errorMessage = 'Biometric login error';
        if (e.toString().contains('SocketException') || 
            e.toString().contains('Failed host lookup')) {
          errorMessage = 'No internet connection. Please try again when online.';
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(errorMessage),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  void dispose() {
    // Clean up controllers when widget is removed
    _emailController.dispose();
    _passwordController.dispose();
    _animationController.dispose();
    super.dispose();
  }

  // Email validation function
  String? _validateEmail(String? value) {
    if (value == null || value.isEmpty) {
      return 'Please enter your email';
    }
    // Regular expression for email validation
    final emailRegex = RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$');
    if (!emailRegex.hasMatch(value)) {
      return 'Please enter a valid email';
    }
    return null; // null means validation passed
  }

  // Password validation function
  String? _validatePassword(String? value) {
    if (value == null || value.isEmpty) {
      return 'Please enter your password';
    }
    if (value.length < 6) {
      return 'Password must be at least 6 characters';
    }
    return null;
  }

  /// Get user-friendly error message based on authentication error
  String _getLoginErrorMessage(String error) {
    final errorLower = error.toLowerCase();

    if (errorLower.contains('invalid login credentials') ||
        errorLower.contains('invalid_credentials')) {
      return 'Invalid email or password. Please check your credentials and try again.';
    }

    if (errorLower.contains('email not confirmed') ||
        errorLower.contains('email_not_confirmed')) {
      return 'Please check your email and click the verification link before logging in.';
    }

    if (errorLower.contains('too many requests') ||
        errorLower.contains('rate limit')) {
      return 'Too many login attempts. Please wait a few minutes before trying again.';
    }

    if (errorLower.contains('user not found') ||
        errorLower.contains('user_not_found')) {
      return 'No account found with this email address. Please sign up first.';
    }

    if (errorLower.contains('account disabled') ||
        errorLower.contains('user_disabled')) {
      return 'Your account has been disabled. Please contact support.';
    }

    if (errorLower.contains('network') || errorLower.contains('connection')) {
      return 'Network connection error. Please check your internet connection and try again.';
    }

    // Default fallback for any other errors
    return 'Login failed. Please try again or contact support if the problem persists.';
  }

  // Handle login logic with improved animations and role check
  Future<void> _handleLogin() async {
    // Validate form fields
    if (_formKey.currentState!.validate()) {
      setState(() {
        _isLoading = true;
      });

      setState(() {
        _isLoading = true; // Show loading indicator
      });

      try {
        final authService = AuthService();
        final response = await authService.signIn(
          email: _emailController.text.trim(),
          password: _passwordController.text,
        );

        // Check if user is a data collector
        final userId = response.user?.id;
        if (userId != null) {
          final dataCollectorCheck = await authService.supabase
              .from('user_roles')
              .select()
              .eq('user_id', userId)
              .eq('role', 'worker')
              .maybeSingle();

          if (dataCollectorCheck != null) {
            // User has the role, proceed to main screen
            if (mounted) {
              // Haptic feedback for successful login
              HapticFeedback.mediumImpact();

              // Show biometric setup dialog if not already enabled
              if (_isBiometricAvailable && !_isBiometricEnabled) {
                await showDialog(
                  context: context,
                  barrierDismissible: false,
                  builder: (context) => BiometricSetupDialog(
                    email: _emailController.text.trim(),
                    password: _passwordController.text,
                    biometricType: _biometricType,
                  ),
                );
              }

              // Initialize realtime notifications after successful login
              await RealtimeNotificationService().initialize();
              await UserNotificationService().initialize();

              // Navigate to main screen
              Navigator.pushReplacementNamed(context, '/main');
            }
          } else {
            // User doesn't have the role, assign it and proceed
            try {
              await authService.supabase.from('user_roles').insert({
                'user_id': userId,
                'role': 'worker',
              });
              if (mounted) {
                // Haptic feedback for successful login
                HapticFeedback.mediumImpact();

                // Show biometric setup dialog if not already enabled
                if (_isBiometricAvailable && !_isBiometricEnabled) {
                  await showDialog(
                    context: context,
                    barrierDismissible: false,
                    builder: (context) => BiometricSetupDialog(
                      email: _emailController.text.trim(),
                      password: _passwordController.text,
                      biometricType: _biometricType,
                    ),
                  );
                }

                // Initialize realtime notifications after successful login
                await RealtimeNotificationService().initialize();
                await UserNotificationService().initialize();

                // Navigate to main screen
                Navigator.pushReplacementNamed(context, '/main');
              }
            } catch (roleError) {
              // If role assignment fails, still allow login but show warning
              debugPrint('Failed to assign worker role: $roleError');
              if (mounted) {
                HapticFeedback.mediumImpact();

                // Show biometric setup dialog if not already enabled
                if (_isBiometricAvailable && !_isBiometricEnabled) {
                  await showDialog(
                    context: context,
                    barrierDismissible: false,
                    builder: (context) => BiometricSetupDialog(
                      email: _emailController.text.trim(),
                      password: _passwordController.text,
                      biometricType: _biometricType,
                    ),
                  );
                }

                Navigator.pushReplacementNamed(context, '/main');
              }
            }
          }
        }
      } catch (e) {
        // Show user-friendly error message based on error type
        String errorMessage = _getLoginErrorMessage(e.toString());
        if (mounted) {
          AppSnackBar.show(
            context,
            message: errorMessage,
            type: SnackBarType.error,
          );
        }
      } finally {
        if (mounted) {
          setState(() {
            _isLoading = false;
          });
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // Get screen dimensions for responsive design
    final screenHeight = MediaQuery.of(context).size.height;
    final screenWidth = MediaQuery.of(context).size.width;

    return Scaffold(
      // Container with gradient background and pattern
      body: Container(
        height: screenHeight,
        width: screenWidth,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              AppColors.primaryWhite,
              AppColors.backgroundGray.withOpacity(0.8),
              AppColors.backgroundGray,
            ],
            stops: const [0.0, 0.6, 1.0],
          ),
        ),
        child: SafeArea(
          bottom: false,
          child: SingleChildScrollView(
            // Allows scrolling when keyboard appears
            physics: const BouncingScrollPhysics(),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 30.0),
              child: FadeTransition(
                opacity: _fadeAnimation,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    SizedBox(height: screenHeight * 0.05),

                    // Company Logo/Icon Section
                    Container(
                          width: 150,
                          height: 150,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(
                              colors: [
                                Colors.white,
                                AppColors.backgroundGray.withOpacity(0.8),
                              ],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: AppColors.primaryOrange.withOpacity(
                                  0.15,
                                ),
                                blurRadius: 30,
                                offset: const Offset(0, 15),
                                spreadRadius: -5,
                              ),
                              BoxShadow(
                                color: Colors.black.withOpacity(0.03),
                                blurRadius: 10,
                                offset: const Offset(0, 5),
                                spreadRadius: 0,
                              ),
                            ],
                            border: Border.all(
                              color: Colors.white.withOpacity(0.95),
                              width: 6,
                            ),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.all(4.0),
                            child: ClipOval(
                              child: Image.asset(
                                'assets/images/pact_consultancy_pact_cover.jpg',
                                fit: BoxFit.contain,
                              ),
                            ),
                          ),
                        )
                        .animate()
                        .fadeIn(duration: 800.ms, delay: 200.ms)
                        .slideY(
                          begin: 0.2,
                          end: 0,
                          duration: 800.ms,
                          curve: Curves.easeOutQuint,
                        )
                        .shimmer(
                          duration: 1800.ms,
                          delay: 400.ms,
                          color: Colors.white.withOpacity(0.8),
                        ),

                    SizedBox(height: screenHeight * 0.03),

                    // Welcome Text
                    Text(
                          AppLocalizations.of(context)!.welcomeBack,
                          style: GoogleFonts.poppins(
                            fontSize: 34,
                            fontWeight: FontWeight.w700,
                            color: AppColors.textDark,
                            letterSpacing: 0.5,
                            height: 1.1,
                          ),
                        )
                        .animate()
                        .fadeIn(duration: 800.ms, delay: 300.ms)
                        .slideY(begin: 0.3, end: 0, duration: 600.ms)
                        .shimmer(
                          duration: 1200.ms,
                          delay: 700.ms,
                          color: AppColors.primaryOrange.withOpacity(0.2),
                        ),

                    SizedBox(height: screenHeight * 0.018),

                    // Subtitle
                    Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.primaryOrange.withOpacity(0.08),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            AppLocalizations.of(context)!.signInToAccount,
                            style: GoogleFonts.poppins(
                              fontSize: 15,
                              fontWeight: FontWeight.w500,
                              color: AppColors.textLight,
                              letterSpacing: 0.2,
                            ),
                          ),
                        )
                        .animate()
                        .fadeIn(duration: 800.ms, delay: 400.ms)
                        .slideY(begin: 0.3, end: 0, duration: 500.ms),

                    SizedBox(height: screenHeight * 0.04),

                    // Biometric Login Button (if available)
                    if (_isBiometricAvailable && _isBiometricEnabled)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 24),
                        child:
                            InkWell(
                                  onTap: _isLoading
                                      ? null
                                      : _attemptBiometricLogin,
                                  borderRadius: BorderRadius.circular(20),
                                  child: Container(
                                    padding: const EdgeInsets.all(20),
                                    decoration: BoxDecoration(
                                      gradient: LinearGradient(
                                        colors: [
                                          AppColors.primaryOrange,
                                          AppColors.primaryOrange.withOpacity(
                                            0.8,
                                          ),
                                        ],
                                        begin: Alignment.topLeft,
                                        end: Alignment.bottomRight,
                                      ),
                                      borderRadius: BorderRadius.circular(20),
                                      boxShadow: [
                                        BoxShadow(
                                          color: AppColors.primaryOrange
                                              .withOpacity(0.3),
                                          blurRadius: 20,
                                          offset: const Offset(0, 10),
                                          spreadRadius: -5,
                                        ),
                                      ],
                                    ),
                                    child: Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        Icon(
                                          _biometricType.toLowerCase().contains(
                                                'face',
                                              )
                                              ? Icons.face
                                              : Icons.fingerprint,
                                          color: Colors.white,
                                          size: 28,
                                        ),
                                        const SizedBox(width: 12),
                                        Text(
                                          'Login with $_biometricType',
                                          style: GoogleFonts.poppins(
                                            fontSize: 16,
                                            fontWeight: FontWeight.w600,
                                            color: Colors.white,
                                            letterSpacing: 0.5,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                )
                                .animate()
                                .fadeIn(duration: 600.ms, delay: 300.ms)
                                .slideY(begin: 0.2, end: 0, duration: 500.ms),
                      ),

                    // Form Section
                    Form(
                      key: _formKey,
                      child: Column(
                        children: [
                          // Email Input Field
                          Container(
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(20),
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.black.withOpacity(0.03),
                                      blurRadius: 20,
                                      offset: const Offset(0, 10),
                                      spreadRadius: -5,
                                    ),
                                  ],
                                ),
                                child: TextFormField(
                                  controller: _emailController,
                                  keyboardType: TextInputType.emailAddress,
                                  validator: _validateEmail,
                                  style: GoogleFonts.poppins(
                                    fontSize: 16,
                                    color: AppColors.textDark,
                                    fontWeight: FontWeight.w500,
                                  ),
                                  decoration: InputDecoration(
                                    labelText: 'Email',
                                    hintText: 'Enter your email',
                                    contentPadding: const EdgeInsets.symmetric(
                                      horizontal: 24,
                                      vertical: 22,
                                    ),
                                    prefixIcon: Container(
                                      margin: const EdgeInsets.only(
                                        left: 16,
                                        right: 12,
                                      ),
                                      child: const Icon(
                                        Icons.email_outlined,
                                        color: AppColors.primaryOrange,
                                        size: 22,
                                      ),
                                    ),
                                    floatingLabelBehavior:
                                        FloatingLabelBehavior.auto,
                                    labelStyle: TextStyle(
                                      color: AppColors.textLight.withOpacity(
                                        0.8,
                                      ),
                                      fontWeight: FontWeight.w500,
                                      fontSize: 15,
                                    ),
                                  ),
                                ),
                              )
                              .animate()
                              .fadeIn(duration: 600.ms, delay: 500.ms)
                              .slideY(begin: 0.3, end: 0, duration: 400.ms),

                          SizedBox(height: screenHeight * 0.025),

                          // Password Input Field
                          Container(
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(20),
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.black.withOpacity(0.03),
                                      blurRadius: 20,
                                      offset: const Offset(0, 10),
                                      spreadRadius: -5,
                                    ),
                                  ],
                                ),
                                child: TextFormField(
                                  controller: _passwordController,
                                  obscureText:
                                      !_isPasswordVisible, // Hide/show password
                                  validator: _validatePassword,
                                  style: GoogleFonts.poppins(
                                    fontSize: 16,
                                    color: AppColors.textDark,
                                    fontWeight: FontWeight.w500,
                                  ),
                                  decoration: InputDecoration(
                                    labelText: 'Password',
                                    hintText: 'Enter your password',
                                    contentPadding: const EdgeInsets.symmetric(
                                      horizontal: 24,
                                      vertical: 22,
                                    ),
                                    prefixIcon: Container(
                                      margin: const EdgeInsets.only(
                                        left: 16,
                                        right: 12,
                                      ),
                                      child: const Icon(
                                        Icons.lock_outline,
                                        color: AppColors.primaryOrange,
                                        size: 22,
                                      ),
                                    ),
                                    suffixIcon: Container(
                                      margin: const EdgeInsets.only(right: 8),
                                      child: IconButton(
                                        icon: Icon(
                                          _isPasswordVisible
                                              ? Icons.visibility_off
                                              : Icons.visibility,
                                          color: AppColors.textLight,
                                          size: 22,
                                        ),
                                        splashRadius: 20,
                                        onPressed: () {
                                          setState(() {
                                            _isPasswordVisible =
                                                !_isPasswordVisible;
                                          });
                                        },
                                      ),
                                    ),
                                    labelStyle: TextStyle(
                                      color: AppColors.textLight.withOpacity(
                                        0.8,
                                      ),
                                      fontWeight: FontWeight.w500,
                                      fontSize: 15,
                                    ),
                                  ),
                                ),
                              )
                              .animate()
                              .fadeIn(duration: 600.ms, delay: 600.ms)
                              .slideY(begin: 0.3, end: 0, duration: 400.ms),

                          SizedBox(height: screenHeight * 0.015),

                          // Forgot Password Link
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton(
                              onPressed: () {
                                HapticFeedback.selectionClick();
                                Navigator.pushNamed(
                                  context,
                                  '/forgot-password',
                                );
                              },
                              style: TextButton.styleFrom(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                ),
                                foregroundColor: AppColors.primaryOrange,
                              ),
                              child: Text(
                                AppLocalizations.of(context)!.forgotPassword,
                                style: GoogleFonts.poppins(
                                  fontWeight: FontWeight.w500,
                                  fontSize: 14,
                                ),
                              ),
                            ),
                          ).animate().fadeIn(duration: 600.ms, delay: 700.ms),

                          SizedBox(height: screenHeight * 0.035),

                          // Login Button
                          Container(
                                width: double.infinity,
                                height: 60,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(20),
                                  gradient: const LinearGradient(
                                    colors: [
                                      AppColors.primaryOrange,
                                      AppColors.lightOrange,
                                    ],
                                    begin: Alignment.centerLeft,
                                    end: Alignment.centerRight,
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: AppColors.primaryOrange
                                          .withOpacity(0.25),
                                      blurRadius: 20,
                                      offset: const Offset(0, 10),
                                      spreadRadius: -5,
                                    ),
                                  ],
                                ),
                                child: ElevatedButton(
                                  onPressed: _isLoading ? null : _handleLogin,
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Colors.transparent,
                                    foregroundColor: Colors.white,
                                    disabledBackgroundColor: Colors.transparent,
                                    disabledForegroundColor: Colors.white
                                        .withOpacity(0.8),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(20),
                                    ),
                                    elevation: 0,
                                    shadowColor: Colors.transparent,
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 16,
                                    ),
                                  ),
                                  child: _isLoading
                                      ? SizedBox(
                                          width: 24,
                                          height: 24,
                                          child: CircularProgressIndicator(
                                            color: Colors.white,
                                            strokeWidth: 2,
                                          ),
                                        )
                                      : Row(
                                          mainAxisAlignment:
                                              MainAxisAlignment.center,
                                          children: [
                                            Text(
                                              AppLocalizations.of(
                                                context,
                                              )!.signInCaps,
                                              style: GoogleFonts.poppins(
                                                fontSize: 16,
                                                fontWeight: FontWeight.w600,
                                                letterSpacing: 1.2,
                                              ),
                                            ),
                                            const SizedBox(width: 10),
                                            const Icon(
                                              Icons.arrow_forward_rounded,
                                              size: 20,
                                            ),
                                          ],
                                        ),
                                ),
                              )
                              .animate()
                              .fadeIn(duration: 600.ms, delay: 800.ms)
                              .slideY(
                                begin: 0.3,
                                end: 0,
                                duration: 400.ms,
                                curve: Curves.easeOutQuint,
                              ),

                          SizedBox(height: screenHeight * 0.035),

                          SizedBox(height: screenHeight * 0.07),

                          // Sign Up Link
                          Container(
                            margin: const EdgeInsets.only(bottom: 20),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  AppLocalizations.of(context)!.dontHaveAccount,
                                  style: GoogleFonts.poppins(
                                    color: AppColors.textLight,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w400,
                                  ),
                                ),
                                TextButton(
                                  onPressed: () {
                                    HapticFeedback.selectionClick();
                                    Navigator.pushNamed(context, '/register');
                                  },
                                  style: TextButton.styleFrom(
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 5,
                                    ),
                                    foregroundColor: AppColors.primaryOrange,
                                  ),
                                  child: Text(
                                    AppLocalizations.of(context)!.signUp,
                                    style: GoogleFonts.poppins(
                                      color: AppColors.primaryOrange,
                                      fontWeight: FontWeight.w600,
                                      fontSize: 15,
                                      decoration: TextDecoration.underline,
                                      decorationThickness: 2,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ).animate().fadeIn(duration: 600.ms, delay: 1100.ms),

                          const SizedBox(height: 16),

                          // Trouble Signing In Link
                          TextButton.icon(
                            onPressed: () => _showLoginHelpDialog(),
                            icon: Icon(
                              Icons.help_outline,
                              color: Colors.grey.shade600,
                              size: 18,
                            ),
                            label: Text(
                              'Having trouble signing in?',
                              style: GoogleFonts.poppins(
                                color: Colors.grey.shade600,
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ).animate().fadeIn(duration: 600.ms, delay: 1200.ms),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _showLoginHelpDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            Icon(Icons.help_outline, color: AppColors.primaryOrange),
            const SizedBox(width: 12),
            const Expanded(
              child: Text(
                'Login Troubleshooting',
                style: TextStyle(fontSize: 18),
              ),
            ),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildHelpItem(
                'Cannot login with correct credentials',
                '• Check your internet connection\n'
                    '• Ensure email is typed correctly\n'
                    '• Password is case-sensitive\n'
                    '• Try resetting your password',
              ),
              const Divider(height: 24),
              _buildHelpItem(
                'Account not found',
                '• Verify you\'re using the right email\n'
                    '• Contact your supervisor to ensure your account was created\n'
                    '• Check if you registered with a different email',
              ),
              const Divider(height: 24),
              _buildHelpItem(
                'Biometric login not working',
                '• Ensure biometrics are enabled in phone settings\n'
                    '• Try adding fingerprint/face again\n'
                    '• Use password login as fallback',
              ),
              const Divider(height: 24),
              _buildHelpItem(
                'App keeps crashing',
                '• Update the app to latest version\n'
                    '• Clear app cache in phone settings\n'
                    '• Restart your device',
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.primaryOrange.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(Icons.email_outlined, color: AppColors.primaryOrange),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'Still need help? Contact:\nkazibwe@pactorg.org',
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          color: AppColors.textDark,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Widget _buildHelpItem(String title, String content) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: GoogleFonts.poppins(
            fontWeight: FontWeight.w600,
            fontSize: 14,
            color: AppColors.textDark,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          content,
          style: GoogleFonts.poppins(
            fontSize: 13,
            color: Colors.grey.shade700,
            height: 1.4,
          ),
        ),
      ],
    );
  }
}
