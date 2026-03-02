// lib/screens/forms_screen.dart
// This screen has been removed from navigation
// MMP code is frozen - uncomment if you need to re-enable

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
// import '../models/mmp_file.dart'; // MMP code frozen
// import '../services/mmp_file_service.dart'; // MMP code frozen
import '../services/auth_service.dart';
import '../theme/app_colors.dart';
import '../widgets/modern_app_header.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
// import '../widgets/mmp_preview_bottom_sheet.dart'; // MMP code frozen

class FormsScreen extends StatefulWidget {
  const FormsScreen({super.key});

  @override
  State<FormsScreen> createState() => _FormsScreenState();
}

class _FormsScreenState extends State<FormsScreen> {
  // final MMPFileService _mmpFileService = MMPFileService(); // MMP code frozen
  final AuthService _authService = AuthService();
  final List<dynamic> _mmpFiles =
      []; // MMP code frozen - using dynamic to avoid type errors
  bool _isLoading = true;
  bool _isAuthenticated = false;

  @override
  void initState() {
    super.initState();
    _checkAuthAndLoadFiles();
  }

  Future<void> _checkAuthAndLoadFiles() async {
    final user = _authService.currentUser;
    if (mounted) {
      setState(() {
        _isAuthenticated = user != null;
      });
    }

    if (_isAuthenticated) {
      await _loadMMPFiles();
    } else {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
        // Show a message that user needs to log in
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Please log in to view MMP files')),
        );
      }
    }

    // Listen for auth state changes
    _authService.authStateChanges.listen((event) {
      if (mounted) {
        final isNowAuthenticated = event.session != null;
        setState(() {
          _isAuthenticated = isNowAuthenticated;
        });
        if (isNowAuthenticated) {
          _loadMMPFiles();
        }
      }
    });
  }

  Future<void> _loadMMPFiles() async {
    try {
      // MMP functionality is frozen - load returns empty
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    } catch (e, stackTrace) {
      debugPrint('Error loading MMP files: $e');
      debugPrint('Stack trace: $stackTrace');
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.backgroundGray,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            Expanded(
              child: SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildSectionTitle(
                        AppLocalizations.of(context)!.mmpFiles,
                      ),
                      const SizedBox(height: 12),
                      if (_isLoading)
                        const Center(child: CircularProgressIndicator())
                      else if (!_isAuthenticated)
                        Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                AppLocalizations.of(
                                  context,
                                )!.pleaseLogInToViewMMPFiles,
                                style: GoogleFonts.poppins(
                                  fontSize: 16,
                                  color: AppColors.textLight,
                                ),
                              ),
                              const SizedBox(height: 16),
                              ElevatedButton(
                                onPressed: () {
                                  // Navigate to login screen
                                  Navigator.pushNamed(context, '/login');
                                },
                                child: Text(
                                  AppLocalizations.of(context)!.logIn,
                                ),
                              ),
                            ],
                          ),
                        )
                      else if (_mmpFiles.isEmpty)
                        Center(
                          child: Text(
                            AppLocalizations.of(context)!.noMMPFilesAvailable,
                            style: GoogleFonts.poppins(
                              fontSize: 16,
                              color: AppColors.textLight,
                            ),
                          ),
                        )
                      else
                        _buildMMPFilesList(),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return ModernAppHeader(
      title: 'Forms',
      centerTitle: true,
      showBackButton: true,
      onLeadingIconPressed: () {
        HapticFeedback.lightImpact();
        Navigator.pop(context);
      },
      actions: [
        HeaderActionButton(
          icon: Icons.filter_list_rounded,
          tooltip: 'Filter Forms',
          onPressed: () {
            HapticFeedback.lightImpact();
            // Search functionality would go here
          },
        ),
      ],
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0, horizontal: 4.0),
      child: Text(
        title,
        style: GoogleFonts.poppins(
          fontSize: 22,
          fontWeight: FontWeight.w600,
          color: AppColors.textDark,
        ),
      ),
    ).animate().fadeIn(duration: 500.ms, delay: 100.ms);
  }

  Widget _buildMMPFilesList() {
    // MMP functionality is frozen - return empty
    return Center(
      child: Text(
        AppLocalizations.of(context)!.noMMPFilesAvailable,
        style: GoogleFonts.poppins(fontSize: 16, color: AppColors.textLight),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'pending':
        return AppColors.accentYellow;
      case 'approved':
        return AppColors.accentGreen;
      case 'verified':
        return AppColors.primaryBlue;
      case 'rejected':
        return AppColors.errorRed;
      default:
        return AppColors.textLight;
    }
  }

  Future<void> _handleFileTap(dynamic file) async {
    // MMP functionality is frozen
    if (mounted) {
      final errorMessage = AppLocalizations.of(context)!.couldNotOpenFile;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(errorMessage),
          duration: const Duration(seconds: 3),
        ),
      );
    }
  }

  Widget _buildFormItem({
    required IconData icon,
    required String title,
    required String status,
    required Color statusColor,
    required VoidCallback onTap,
    required Duration delay,
  }) {
    return Container(
          margin: const EdgeInsets.only(bottom: 16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.05),
                blurRadius: 10,
                offset: const Offset(0, 2),
                spreadRadius: 0,
              ),
            ],
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () {
                HapticFeedback.mediumImpact();
                onTap();
              },
              borderRadius: BorderRadius.circular(16),
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.backgroundGray,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(icon, color: AppColors.textDark, size: 28)
                          .animate(
                            onPlay: (controller) =>
                                controller.repeat(reverse: true),
                          )
                          .scale(
                            begin: const Offset(1, 1),
                            end: const Offset(1.15, 1.15),
                            duration: 2.seconds,
                            curve: Curves.easeInOut,
                          ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            style: GoogleFonts.poppins(
                              fontSize: 18,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textDark,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              Container(
                                    width: 8,
                                    height: 8,
                                    decoration: BoxDecoration(
                                      color: statusColor,
                                      shape: BoxShape.circle,
                                    ),
                                  )
                                  .animate(
                                    onPlay: (controller) => controller.repeat(),
                                  )
                                  .shimmer(
                                    duration: 1.5.seconds,
                                    color: Colors.white.withValues(alpha: 0.6),
                                  )
                                  .animate() // Add a second animation
                                  .scaleXY(
                                    begin: 0.8,
                                    end: 1.2,
                                    duration: 1.seconds,
                                  )
                                  .then()
                                  .scaleXY(
                                    begin: 1.2,
                                    end: 0.8,
                                    duration: 1.seconds,
                                  ),
                              const SizedBox(width: 6),
                              Text(
                                status,
                                style: GoogleFonts.poppins(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w500,
                                  color: statusColor,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const Icon(
                      Icons.chevron_right,
                      color: AppColors.textLight,
                      size: 28,
                    ),
                  ],
                ),
              ),
            ),
          ),
        )
        .animate(delay: delay)
        .fadeIn(duration: 600.ms)
        .slideX(begin: 0.2, end: 0, duration: 500.ms, curve: Curves.easeOut)
        .scale(begin: const Offset(0.95, 0.95), end: const Offset(1, 1));
  }
}
