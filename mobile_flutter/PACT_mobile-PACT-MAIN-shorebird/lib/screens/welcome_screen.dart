// lib/screens/welcome_screen.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

class WelcomeScreen extends StatefulWidget {
  final String fullName;
  final String? avatarUrl;
  final VoidCallback onContinue;

  const WelcomeScreen({
    super.key,
    required this.fullName,
    this.avatarUrl,
    required this.onContinue,
  });

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _animationController;
  bool _showContinue = false;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 2000),
      vsync: this,
    );
    _animationController.forward();

    Future.delayed(const Duration(milliseconds: 2500), () {
      if (mounted) {
        setState(() => _showContinue = true);
      }
    });

    Future.delayed(const Duration(seconds: 5), () {
      if (mounted) {
        widget.onContinue();
      }
    });
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  String _getGreetingEnglish() {
    final hour = DateTime.now().hour;
    if (hour >= 5 && hour < 12) {
      return 'Good Morning';
    } else if (hour >= 12 && hour < 17) {
      return 'Good Afternoon';
    } else if (hour >= 17 && hour < 21) {
      return 'Good Evening';
    } else {
      return 'Good Night';
    }
  }

  String _getGreetingArabic() {
    final hour = DateTime.now().hour;
    if (hour >= 5 && hour < 12) {
      return 'صباح الخير';
    } else if (hour >= 12 && hour < 17) {
      return 'مساء الخير';
    } else if (hour >= 17 && hour < 21) {
      return 'مساء النور';
    } else {
      return ' ليله سعيدة ';
    }
  }

  IconData _getGreetingIcon() {
    final hour = DateTime.now().hour;
    if (hour >= 5 && hour < 12) {
      return Icons.wb_sunny_rounded;
    } else if (hour >= 12 && hour < 17) {
      return Icons.wb_sunny_outlined;
    } else if (hour >= 17 && hour < 21) {
      return Icons.nightlight_round;
    } else {
      return Icons.nights_stay_rounded;
    }
  }

  Color _getGreetingColor() {
    final hour = DateTime.now().hour;
    if (hour >= 5 && hour < 12) {
      return const Color(0xFFFFA726);
    } else if (hour >= 12 && hour < 17) {
      return const Color(0xFFFFB74D);
    } else if (hour >= 17 && hour < 21) {
      return const Color(0xFF7E57C2);
    } else {
      return const Color(0xFF5C6BC0);
    }
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    final screenWidth = MediaQuery.of(context).size.width;
    final greetingColor = _getGreetingColor();

    return Scaffold(
      body: Container(
        height: screenHeight,
        width: screenWidth,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              AppColors.primaryWhite,
              greetingColor.withValues(alpha: 0.1),
              AppColors.backgroundGray.withValues(alpha: 0.9),
              greetingColor.withValues(alpha: 0.15),
            ],
            stops: const [0.0, 0.3, 0.7, 1.0],
          ),
        ),
        child: SafeArea(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Spacer(flex: 2),

              Icon(_getGreetingIcon(), size: 80, color: greetingColor)
                  .animate()
                  .fadeIn(duration: 600.ms, delay: 200.ms)
                  .scale(begin: const Offset(0.5, 0.5), duration: 800.ms)
                  .shimmer(duration: 1500.ms, delay: 800.ms),

              const SizedBox(height: 30),

              Container(
                    width: 120,
                    height: 120,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(
                        colors: [Colors.white, greetingColor.withValues(alpha: 0.2)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: greetingColor.withValues(alpha: 0.3),
                          blurRadius: 30,
                          offset: const Offset(0, 10),
                        ),
                      ],
                      border: Border.all(color: Colors.white, width: 4),
                    ),
                    child: ClipOval(
                      child:
                          widget.avatarUrl != null &&
                              widget.avatarUrl!.isNotEmpty
                          ? Image.network(
                              widget.avatarUrl!,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => _buildInitials(),
                            )
                          : _buildInitials(),
                    ),
                  )
                  .animate()
                  .fadeIn(duration: 800.ms, delay: 400.ms)
                  .slideY(begin: 0.3, end: 0, duration: 600.ms),

              const SizedBox(height: 40),

              Text(
                    _getGreetingArabic(),
                    textDirection: TextDirection.rtl,
                    style: GoogleFonts.cairo(
                      fontSize: 32,
                      fontWeight: FontWeight.w700,
                      color: greetingColor,
                      letterSpacing: 1,
                    ),
                  )
                  .animate()
                  .fadeIn(duration: 800.ms, delay: 600.ms)
                  .slideX(begin: 0.3, end: 0, duration: 600.ms),

              const SizedBox(height: 8),

              Text(
                    _getGreetingEnglish(),
                    style: GoogleFonts.poppins(
                      fontSize: 28,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textDark.withValues(alpha: 0.85),
                      letterSpacing: 0.5,
                    ),
                  )
                  .animate()
                  .fadeIn(duration: 800.ms, delay: 800.ms)
                  .slideX(begin: -0.3, end: 0, duration: 600.ms),

              const SizedBox(height: 30),

              Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 24,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.9),
                      borderRadius: BorderRadius.circular(30),
                      boxShadow: [
                        BoxShadow(
                          color: greetingColor.withValues(alpha: 0.15),
                          blurRadius: 20,
                          offset: const Offset(0, 5),
                        ),
                      ],
                    ),
                    child: Text(
                      widget.fullName,
                      style: GoogleFonts.poppins(
                        fontSize: 24,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textDark,
                        letterSpacing: 0.3,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  )
                  .animate()
                  .fadeIn(duration: 800.ms, delay: 1000.ms)
                  .slideY(begin: 0.3, end: 0, duration: 600.ms)
                  .shimmer(
                    duration: 1500.ms,
                    delay: 1500.ms,
                    color: greetingColor.withValues(alpha: 0.3),
                  ),

              const SizedBox(height: 20),

              Text(
                'أهلاً وسهلاً بك في PACT',
                textDirection: TextDirection.rtl,
                style: GoogleFonts.cairo(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: AppColors.textLight,
                ),
              ).animate().fadeIn(duration: 600.ms, delay: 1200.ms),

              const SizedBox(height: 6),

              Text(
                'Welcome to PACT Command Center',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: AppColors.textLight,
                  letterSpacing: 0.3,
                ),
              ).animate().fadeIn(duration: 600.ms, delay: 1400.ms),

              const Spacer(flex: 2),

              if (_showContinue)
                GestureDetector(
                      onTap: () {
                        HapticFeedback.lightImpact();
                        widget.onContinue();
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 40,
                          vertical: 16,
                        ),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [
                              greetingColor,
                              greetingColor.withValues(alpha: 0.8),
                            ],
                          ),
                          borderRadius: BorderRadius.circular(30),
                          boxShadow: [
                            BoxShadow(
                              color: greetingColor.withValues(alpha: 0.4),
                              blurRadius: 15,
                              offset: const Offset(0, 5),
                            ),
                          ],
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              'Continue',
                              style: GoogleFonts.poppins(
                                fontSize: 18,
                                fontWeight: FontWeight.w600,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(width: 8),
                            const Icon(
                              Icons.arrow_forward_rounded,
                              color: Colors.white,
                              size: 22,
                            ),
                          ],
                        ),
                      ),
                    )
                    .animate()
                    .fadeIn(duration: 500.ms)
                    .slideY(begin: 0.5, end: 0, duration: 400.ms),

              const SizedBox(height: 16),

              if (_showContinue)
                Text(
                  'Tap to continue or wait...',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: AppColors.textLight.withValues(alpha: 0.7),
                  ),
                ).animate().fadeIn(duration: 400.ms, delay: 200.ms),

              const SizedBox(height: 40),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInitials() {
    final names = widget.fullName.split(' ');
    String initials = '';
    if (names.isNotEmpty) {
      initials = names[0].isNotEmpty ? names[0][0].toUpperCase() : '';
      if (names.length > 1 && names[1].isNotEmpty) {
        initials += names[1][0].toUpperCase();
      }
    }

    return Container(
      color: _getGreetingColor().withValues(alpha: 0.2),
      child: Center(
        child: Text(
          initials,
          style: GoogleFonts.poppins(
            fontSize: 42,
            fontWeight: FontWeight.w700,
            color: _getGreetingColor(),
          ),
        ),
      ),
    );
  }
}

Future<void> showWelcomeScreen({
  required BuildContext context,
  required String fullName,
  String? avatarUrl,
  required VoidCallback onContinue,
}) async {
  await Navigator.of(context).push(
    PageRouteBuilder(
      opaque: true,
      barrierDismissible: false,
      pageBuilder: (context, animation, secondaryAnimation) {
        return WelcomeScreen(
          fullName: fullName,
          avatarUrl: avatarUrl,
          onContinue: () {
            Navigator.of(context).pop();
            onContinue();
          },
        );
      },
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        return FadeTransition(opacity: animation, child: child);
      },
      transitionDuration: const Duration(milliseconds: 500),
    ),
  );
}
