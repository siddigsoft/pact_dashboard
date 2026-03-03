import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../theme/app_colors.dart';

/// Onboarding service to manage first-time user experience
class OnboardingService {
  static final OnboardingService _instance = OnboardingService._internal();
  static const String _hasSeenOnboardingKey = 'has_seen_onboarding';

  factory OnboardingService() {
    return _instance;
  }

  OnboardingService._internal();

  /// Check if user has seen onboarding
  static Future<bool> hasSeenOnboarding() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_hasSeenOnboardingKey) ?? false;
  }

  /// Mark onboarding as seen
  static Future<void> markOnboardingAsComplete() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_hasSeenOnboardingKey, true);
  }

  /// Reset onboarding (for testing)
  static Future<void> resetOnboarding() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_hasSeenOnboardingKey);
  }
}

/// Onboarding Screen Model
class OnboardingPageModel {
  final String title;
  final String description;
  final IconData icon;
  final Color iconColor;

  OnboardingPageModel({
    required this.title,
    required this.description,
    required this.icon,
    required this.iconColor,
  });
}

/// Full-Screen Onboarding Flow
class OnboardingScreen extends StatefulWidget {
  final VoidCallback? onComplete;

  const OnboardingScreen({super.key, this.onComplete});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  late PageController _pageController;
  int _currentPage = 0;

  final List<OnboardingPageModel> _pages = [
    OnboardingPageModel(
      title: 'Welcome to PACT Mobile',
      description:
          'Your comprehensive field operations and cost management platform. '
          'Manage your field visits, track expenses, and stay connected wherever you are.',
      icon: Icons.location_on_outlined,
      iconColor: AppColors.primaryOrange,
    ),
    OnboardingPageModel(
      title: 'Field Operations',
      description:
          'Create and complete field visits with detailed cost submissions. '
          'Track site assignments, equipment, and safety compliance in real-time.',
      icon: Icons.assignment_outlined,
      iconColor: AppColors.primaryBlue,
    ),
    OnboardingPageModel(
      title: 'Cost Management',
      description:
          'Submit operational costs and track your earnings. '
          'View approvals, rejections, and manage your financial claims with ease.',
      icon: Icons.account_balance_wallet_outlined,
      iconColor: Colors.green,
    ),
    OnboardingPageModel(
      title: 'Real-Time Communication',
      description:
          'Chat with team members, receive instant notifications for calls and messages. '
          'Stay updated on approvals and important system announcements.',
      icon: Icons.chat_bubble_outline,
      iconColor: Colors.purple,
    ),
    OnboardingPageModel(
      title: 'Offline Support',
      description:
          'Work offline without interruption. Your data syncs automatically '
          'when you regain connection. No data loss ever.',
      icon: Icons.cloud_done_outlined,
      iconColor: Colors.cyan,
    ),
  ];

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _nextPage() {
    if (_currentPage < _pages.length - 1) {
      _pageController.nextPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
    } else {
      _completeOnboarding();
    }
  }

  void _skipOnboarding() {
    _completeOnboarding();
  }

  Future<void> _completeOnboarding() async {
    await OnboardingService.markOnboardingAsComplete();
    if (widget.onComplete != null) {
      widget.onComplete!();
    } else {
      // If no callback provided, navigate back to main
      if (context.mounted) {
        Navigator.of(context).pushReplacementNamed('/main');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.primaryWhite,
      body: SafeArea(
        child: Column(
          children: [
            // Skip button
            Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: TextButton(
                  onPressed: _skipOnboarding,
                  child: Text(
                    'Skip',
                    style: GoogleFonts.poppins(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.primaryOrange,
                    ),
                  ),
                ),
              ),
            ),

            // Page content
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                onPageChanged: (index) {
                  setState(() {
                    _currentPage = index;
                  });
                },
                itemCount: _pages.length,
                itemBuilder: (context, index) {
                  final page = _pages[index];
                  return _buildOnboardingPage(page);
                },
              ),
            ),

            // Indicators and navigation
            Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  // Dots indicator
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(
                      _pages.length,
                      (index) => Container(
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        width: _currentPage == index ? 28 : 8,
                        height: 8,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(4),
                          color: _currentPage == index
                              ? AppColors.primaryOrange
                              : AppColors.primaryOrange.withOpacity(0.3),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Next/Complete button
                  SizedBox(
                    width: double.infinity,
                    height: 56,
                    child: ElevatedButton(
                      onPressed: _nextPage,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryOrange,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: Text(
                        _currentPage == _pages.length - 1
                            ? 'Get Started'
                            : 'Next',
                        style: GoogleFonts.poppins(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),

                  // Back navigation for previous pages
                  if (_currentPage > 0)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: TextButton(
                        onPressed: () {
                          _pageController.previousPage(
                            duration: const Duration(milliseconds: 300),
                            curve: Curves.easeInOut,
                          );
                        },
                        child: Text(
                          'Back',
                          style: GoogleFonts.poppins(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textLight,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOnboardingPage(OnboardingPageModel page) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Icon container
          Container(
            width: 120,
            height: 120,
            decoration: BoxDecoration(
              color: page.iconColor.withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(page.icon, size: 60, color: page.iconColor),
          ),
          const SizedBox(height: 32),

          // Title
          Text(
            page.title,
            style: GoogleFonts.poppins(
              fontSize: 24,
              fontWeight: FontWeight.w700,
              color: AppColors.textDark,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),

          // Description
          Text(
            page.description,
            style: GoogleFonts.poppins(
              fontSize: 15,
              fontWeight: FontWeight.w400,
              color: AppColors.textLight,
              height: 1.6,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}
