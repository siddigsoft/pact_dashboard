// lib/widgets/optimized_splash_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/initialization_service.dart';
import '../theme/app_colors.dart';

class OptimizedSplashScreen extends StatefulWidget {
  final InitializationService initService;
  final Widget nextScreen;

  const OptimizedSplashScreen({
    super.key,
    required this.initService,
    required this.nextScreen,
  });

  @override
  State<OptimizedSplashScreen> createState() => _OptimizedSplashScreenState();
}

class _OptimizedSplashScreenState extends State<OptimizedSplashScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Future<void> _initFuture;

  @override
  void initState() {
    super.initState();

    _controller = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat();

    // Start deferred initialization in background
    _initFuture = widget.initService.initializeDeferred().then((_) {
      // Deferred init complete
      return Future.delayed(const Duration(milliseconds: 300));
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: FutureBuilder<void>(
        future: _initFuture,
        builder: (context, snapshot) {
          // If error, still show the screen (deferred init is non-critical)
          if (snapshot.connectionState == ConnectionState.done) {
            return widget.nextScreen;
          }

          return Center(
            child: SingleChildScrollView(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24.0),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Logo with animation
                    ScaleTransition(
                      scale: Tween<double>(begin: 0.7, end: 1.0).animate(
                        CurvedAnimation(
                          parent: _controller,
                          curve: Curves.easeInOutCubic,
                        ),
                      ),
                      child: Container(
                        width: 100,
                        height: 100,
                        decoration: BoxDecoration(
                          color: AppColors.primaryOrange.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Icon(
                          Icons.check_circle,
                          size: 60,
                          color: AppColors.primaryOrange,
                        ),
                      ),
                    ).animate().fadeIn(duration: 400.ms, curve: Curves.easeOut),
                    const SizedBox(height: 36),

                    // App title
                    Text(
                          'PACT Consultancy',
                          textAlign: TextAlign.center,
                          style: GoogleFonts.poppins(
                            fontSize: 28,
                            fontWeight: FontWeight.w700,
                            color: AppColors.textDark,
                          ),
                        )
                        .animate()
                        .fadeIn(delay: 100.ms, duration: 400.ms)
                        .slideY(begin: 0.3, duration: 400.ms),

                    const SizedBox(height: 12),

                    // Status message
                    ValueListenableBuilder<String>(
                      valueListenable: widget.initService.statusNotifier,
                      builder: (context, status, _) {
                        return Text(
                          status,
                          textAlign: TextAlign.center,
                          style: GoogleFonts.poppins(
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                            color: AppColors.textLight,
                          ),
                        );
                      },
                    ),

                    const SizedBox(height: 32),

                    // Progress indicator
                    ValueListenableBuilder<double>(
                      valueListenable: widget.initService.progressNotifier,
                      builder: (context, progress, _) {
                        return Column(
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(6),
                              child: LinearProgressIndicator(
                                minHeight: 4,
                                value: progress,
                                backgroundColor: AppColors.backgroundGray,
                                valueColor: AlwaysStoppedAnimation<Color>(
                                  AppColors.primaryOrange,
                                ),
                              ),
                            ),
                            const SizedBox(height: 12),
                            Text(
                              '${(progress * 100).toStringAsFixed(0)}%',
                              style: GoogleFonts.poppins(
                                fontSize: 12,
                                fontWeight: FontWeight.w500,
                                color: AppColors.textLight,
                              ),
                            ),
                          ],
                        );
                      },
                    ),

                    const SizedBox(height: 48),

                    // Bottom message
                    Text(
                      'Setting up your workspace...',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        fontWeight: FontWeight.w400,
                        color: AppColors.textLight,
                      ),
                    ).animate().fadeIn(delay: 200.ms, duration: 400.ms),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
