// lib/widgets/onboarding_tour.dart

import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../theme/app_colors.dart';

class OnboardingStep {
  final String titleEn;
  final String titleAr;
  final String descriptionEn;
  final String descriptionAr;
  final IconData icon;
  final Color color;

  const OnboardingStep({
    required this.titleEn,
    required this.titleAr,
    required this.descriptionEn,
    required this.descriptionAr,
    required this.icon,
    required this.color,
  });

  String getTitle(bool isArabic) => isArabic ? titleAr : titleEn;
  String getDescription(bool isArabic) => isArabic ? descriptionAr : descriptionEn;
}

class OnboardingTour extends StatefulWidget {
  final VoidCallback onComplete;
  final bool isArabic;

  const OnboardingTour({
    super.key,
    required this.onComplete,
    this.isArabic = false,
  });

  static const String _hasSeenOnboardingKey = 'has_seen_onboarding';
  static const String _settingsBoxName = 'app_settings';

  static Future<bool> shouldShow() async {
    try {
      if (!Hive.isBoxOpen(_settingsBoxName)) {
        await Hive.openBox(_settingsBoxName);
      }
      final box = Hive.box(_settingsBoxName);
      return !(box.get(_hasSeenOnboardingKey, defaultValue: false) as bool);
    } catch (e) {
      return true;
    }
  }

  static Future<void> markAsSeen() async {
    try {
      if (!Hive.isBoxOpen(_settingsBoxName)) {
        await Hive.openBox(_settingsBoxName);
      }
      final box = Hive.box(_settingsBoxName);
      await box.put(_hasSeenOnboardingKey, true);
    } catch (e) {
      debugPrint('Error marking onboarding as seen: $e');
    }
  }

  static Future<void> reset() async {
    try {
      if (!Hive.isBoxOpen(_settingsBoxName)) {
        await Hive.openBox(_settingsBoxName);
      }
      final box = Hive.box(_settingsBoxName);
      await box.put(_hasSeenOnboardingKey, false);
    } catch (e) {
      debugPrint('Error resetting onboarding: $e');
    }
  }

  @override
  State<OnboardingTour> createState() => _OnboardingTourState();
}

class _OnboardingTourState extends State<OnboardingTour> {
  final PageController _pageController = PageController();
  int _currentPage = 0;

  static const List<OnboardingStep> _steps = [
    OnboardingStep(
      titleEn: 'Welcome to PACT',
      titleAr: 'مرحباً بك في PACT',
      descriptionEn: 'Your comprehensive field operations command center for managing site visits, monitoring activities, and coordinating field teams.',
      descriptionAr: 'مركز قيادة العمليات الميدانية الشامل لإدارة زيارات المواقع ومراقبة الأنشطة وتنسيق الفرق الميدانية.',
      icon: Icons.dashboard,
      color: AppColors.primaryBlue,
    ),
    OnboardingStep(
      titleEn: 'Site Visits',
      titleAr: 'زيارات المواقع',
      descriptionEn: 'Claim and complete site visits with GPS tracking, photo capture, and digital signatures. Works offline too!',
      descriptionAr: 'اطلب وأكمل زيارات المواقع مع تتبع GPS والتقاط الصور والتوقيعات الرقمية. يعمل بدون اتصال أيضاً!',
      icon: Icons.location_on,
      color: AppColors.primaryOrange,
    ),
    OnboardingStep(
      titleEn: 'Real-time Sync',
      titleAr: 'المزامنة الفورية',
      descriptionEn: 'Your data syncs automatically when you have internet. Offline work is queued and uploaded later.',
      descriptionAr: 'تتم مزامنة بياناتك تلقائياً عند الاتصال بالإنترنت. العمل بدون اتصال يُحفظ ويُرفع لاحقاً.',
      icon: Icons.sync,
      color: Colors.green,
    ),
    OnboardingStep(
      titleEn: 'Permits & Documents',
      titleAr: 'التصاريح والوثائق',
      descriptionEn: 'Upload and manage state and locality permits. Track document status and approvals easily.',
      descriptionAr: 'ارفع وأدر تصاريح الولايات والمحليات. تتبع حالة الوثائق والموافقات بسهولة.',
      icon: Icons.description,
      color: Colors.purple,
    ),
    OnboardingStep(
      titleEn: 'Communication',
      titleAr: 'التواصل',
      descriptionEn: 'Chat with your team, make voice calls, and stay connected with real-time presence indicators.',
      descriptionAr: 'تواصل مع فريقك وأجرِ مكالمات صوتية وابقَ على اتصال مع مؤشرات الحضور الفوري.',
      icon: Icons.chat,
      color: AppColors.primaryBlue,
    ),
  ];

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _nextPage() {
    if (_currentPage < _steps.length - 1) {
      _pageController.nextPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
    } else {
      _complete();
    }
  }

  void _complete() {
    OnboardingTour.markAsSeen();
    widget.onComplete();
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: widget.isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
      child: Scaffold(
        backgroundColor: Colors.white,
        body: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    TextButton(
                      onPressed: _complete,
                      child: Text(
                        widget.isArabic ? 'تخطي' : 'Skip',
                        style: TextStyle(color: Colors.grey.shade600),
                      ),
                    ),
                    Row(
                      children: List.generate(
                        _steps.length,
                        (index) => Container(
                          width: _currentPage == index ? 24 : 8,
                          height: 8,
                          margin: const EdgeInsets.symmetric(horizontal: 4),
                          decoration: BoxDecoration(
                            color: _currentPage == index
                                ? _steps[_currentPage].color
                                : Colors.grey.shade300,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 60),
                  ],
                ),
              ),
              Expanded(
                child: PageView.builder(
                  controller: _pageController,
                  onPageChanged: (page) => setState(() => _currentPage = page),
                  itemCount: _steps.length,
                  itemBuilder: (context, index) => _buildPage(_steps[index]),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(24),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _nextPage,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _steps[_currentPage].color,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: Text(
                      _currentPage == _steps.length - 1
                          ? (widget.isArabic ? 'ابدأ الآن' : 'Get Started')
                          : (widget.isArabic ? 'التالي' : 'Next'),
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPage(OnboardingStep step) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 120,
            height: 120,
            decoration: BoxDecoration(
              color: step.color.withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(
              step.icon,
              size: 60,
              color: step.color,
            ),
          ),
          const SizedBox(height: 48),
          Text(
            step.getTitle(widget.isArabic),
            style: GoogleFonts.poppins(
              fontSize: 28,
              fontWeight: FontWeight.bold,
              color: Colors.grey.shade800,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          Text(
            step.getDescription(widget.isArabic),
            style: GoogleFonts.poppins(
              fontSize: 16,
              color: Colors.grey.shade600,
              height: 1.6,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}
