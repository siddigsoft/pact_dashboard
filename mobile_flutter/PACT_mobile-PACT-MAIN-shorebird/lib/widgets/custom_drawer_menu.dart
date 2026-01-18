import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shorebird_code_push/shorebird_code_push.dart';
import '../services/auth_service.dart';
import '../providers/sync_provider.dart';
import '../providers/profile_provider.dart';
import '../theme/app_design_system.dart';
import '../theme/app_colors.dart';
import '../widgets/app_widgets.dart';
import '../screens/profile_screen.dart';
import '../screens/settings_screen.dart';
import '../screens/field_operations_enhanced_screen.dart';
import '../screens/dashboard_screen.dart';
import '../screens/wallet_screen.dart';
import '../screens/site_verification_screen.dart';
// Chats screen disabled - using Communications only
// import '../screens/chats_screen.dart';
import '../screens/help_screen.dart';
import '../screens/support_screen.dart';
import '../screens/help_support_screen.dart';
import '../screens/admin_dashboard_screen.dart';
import '../screens/super_admin_screen.dart';
import '../screens/communications_screen.dart';

class CustomDrawerMenu extends ConsumerStatefulWidget {
  final User? currentUser;
  final VoidCallback onClose;

  const CustomDrawerMenu({
    super.key,
    required this.currentUser,
    required this.onClose,
  });

  @override
  ConsumerState<CustomDrawerMenu> createState() => _CustomDrawerMenuState();
}

class _CustomDrawerMenuState extends ConsumerState<CustomDrawerMenu> {
  String _userRole = 'Loading...';
  String _appVersion = '';
  String _buildNumber = '';
  int? _patchNumber;

  @override
  void initState() {
    super.initState();
    _userRole = widget.currentUser?.userMetadata?['role'] ?? 'User';
    _fetchUserRole();
    _fetchAppVersion();
    // Load profile data
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(profileProvider.notifier).loadProfile();
    });
  }

  Future<void> _fetchAppVersion() async {
    try {
      final packageInfo = await PackageInfo.fromPlatform();
      
      // Get Shorebird patch number
      int? patchNumber;
      try {
        final codePush = ShorebirdCodePush();
        final isAvailable = await codePush.isShorebirdAvailable();
        if (isAvailable) {
          patchNumber = await codePush.currentPatchNumber();
        }
      } catch (e) {
        debugPrint('Error getting Shorebird patch number: $e');
      }
      
      if (mounted) {
        setState(() {
          _appVersion = packageInfo.version;
          _buildNumber = packageInfo.buildNumber;
          _patchNumber = patchNumber;
        });
      }
    } catch (e) {
      debugPrint('Error fetching app version: $e');
    }
  }

  Future<void> _fetchUserRole() async {
    if (widget.currentUser == null) return;
    try {
      final response = await Supabase.instance.client
          .from('user_roles')
          .select('role')
          .eq('user_id', widget.currentUser!.id)
          .maybeSingle();

      if (response != null && mounted) {
        setState(() {
          _userRole = response['role'] as String;
        });
      }
    } catch (e) {
      debugPrint('Error fetching role: $e');
    }
  }

  Future<void> _launchUrl(
    BuildContext context,
    String urlString,
    String errorMessage,
  ) async {
    final url = Uri.parse(urlString);
    try {
      if (await canLaunchUrl(url)) {
        await launchUrl(url, mode: LaunchMode.externalApplication);
      } else {
        // Fallback: try without checking
        await launchUrl(url, mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      // Show error message to user
      if (context.mounted) {
        AppSnackBar.show(
          context,
          message: errorMessage,
          type: SnackBarType.error,
        );
      }
    }
  }

  Future<void> _launchPactWebsite(BuildContext context) async {
    await _launchUrl(
      context,
      'https://pactorg1.com/about/',
      'Unable to open website. Please check your internet connection.',
    );
  }

  Future<void> _launchPactDashboard(BuildContext context) async {
    await _launchUrl(
      context,
      'https://app.pactorg.com/',
      'Unable to open PACT Dashboard. Please check your internet connection.',
    );
  }

  Future<void> _sendFeedback(BuildContext context) async {
    final Uri emailLaunchUri = Uri(
      scheme: 'mailto',
      path: 'kazibwe@pactorg.org',
      queryParameters: {
        'subject': 'PACT Mobile App Feedback',
        'body':
            'Dear Developer,\n\nI would like to provide feedback about the PACT Mobile app:\n\n',
      },
    );

    try {
      if (await canLaunchUrl(emailLaunchUri)) {
        await launchUrl(emailLaunchUri);
      } else {
        // Fallback: try without checking
        await launchUrl(emailLaunchUri);
      }
    } catch (e) {
      // Show error message to user
      if (context.mounted) {
        AppSnackBar.show(
          context,
          message:
              'Unable to open email app. Please check if you have an email app installed.',
          type: SnackBarType.error,
        );
      }
    }
  }

  Future<void> _performSync(BuildContext context) async {
    final syncProvider = context.read<SyncProvider>();

    try {
      // Show initial sync message
      if (context.mounted) {
        AppSnackBar.show(
          context,
          message: 'Starting data synchronization...',
          type: SnackBarType.info,
        );
      }

      // Perform full sync
      await syncProvider.performFullSync();

      // Show success message
      if (context.mounted) {
        AppSnackBar.show(
          context,
          message: 'Data synchronization completed successfully!',
          type: SnackBarType.success,
        );
      }
    } catch (e) {
      // Show error message
      if (context.mounted) {
        AppSnackBar.show(
          context,
          message: 'Sync failed: ${e.toString()}',
          type: SnackBarType.error,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // Get profile data from Riverpod provider
    final profile = ref.watch(currentUserProfileProvider);

    // Use profile data if available, fallback to auth metadata
    final userName =
        profile?.displayName ??
        widget.currentUser?.userMetadata?['full_name'] ??
        'User';
    final userEmail = profile?.email ?? widget.currentUser?.email ?? '';
    final userInitial =
        profile?.initials ??
        (userName.isNotEmpty ? userName[0].toUpperCase() : 'U');
    final avatarUrl = profile?.avatarUrl;

    return Drawer(
      width: MediaQuery.of(context).size.width * 0.75, // 75% of screen width
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Colors.white, AppColors.primaryWhite],
          ),
        ),
        child: Column(
          children: [
            // Enhanced Header with Gradient
            Container(
              width: double.infinity,
              decoration: BoxDecoration(
                gradient: AppColors.primaryGradient,
                boxShadow: AppDesignSystem.shadowMD,
              ),
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          // User Avatar with Ring
                          // Container(
                          //   decoration: BoxDecoration(
                          //     shape: BoxShape.circle,
                          //     border: Border.all(
                          //       color: Colors.white,
                          //       width: 3,
                          //     ),
                          //     boxShadow: [
                          //       BoxShadow(
                          //         color: Colors.black.withOpacity(0.2),
                          //         blurRadius: 8,
                          //         offset: const Offset(0, 4),
                          //       ),
                          //     ],
                          //   ),
                          //   child: CircleAvatar(
                          //     radius: 32,
                          //     backgroundColor: Colors.white,
                          //     backgroundImage: avatarUrl != null && avatarUrl.isNotEmpty
                          //         ? NetworkImage(avatarUrl)
                          //         : null,
                          //     child: avatarUrl == null || avatarUrl.isEmpty
                          //         ? Text(
                          //             userInitial,
                          //             style: TextStyle(
                          //               fontSize: 32,
                          //               fontWeight: FontWeight.bold,
                          //               color: AppColors.primaryOrange,
                          //             ),
                          //           )
                          //         : null,
                          //   ),
                          // ),
                          // const Spacer(),
                          // PACT Logo Badge
                          // Container(
                          //   padding: const EdgeInsets.symmetric(
                          //     horizontal: 12,
                          //     vertical: 6,
                          //   ),
                          //   decoration: BoxDecoration(
                          //     color: Colors.white.withOpacity(0.2),
                          //     borderRadius: BorderRadius.circular(20),
                          //     border: Border.all(
                          //       color: Colors.white.withOpacity(0.3),
                          //     ),
                          //   ),
                          //   // child: const Text(
                          //   //   'PACT',
                          //   //   style: TextStyle(
                          //   //     color: Colors.white,
                          //   //     fontWeight: FontWeight.bold,
                          //   //     fontSize: 16,
                          //   //     letterSpacing: 1.5,
                          //   //   ),
                          //   // ),
                          // ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      // User Name
                      Text(
                        userName,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(height: 4),
                      // User Email
                      Text(
                        userEmail,
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.9),
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 8),
                      // User Role Badge
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          _userRole,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // Menu Items
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 8),
                children: [
                  _buildMenuSection(
                    context,
                    title: 'Quick Access',
                    items: [
                      _MenuItemData(
                        icon: Icons.dashboard_rounded,
                        title: 'PACT Dashboard',
                        subtitle: 'View dashboard',
                        iconColor: AppColors.primaryOrange,
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => const DashboardScreen(),
                            ),
                          );
                          widget.onClose();
                        },
                      ),

                      _MenuItemData(
                        icon: Icons.assignment_rounded,
                        title: 'Site Management',
                        subtitle: 'Manage site visits and tasks',
                        iconColor: AppColors.primaryOrange,
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) =>
                                  FieldOperationsEnhancedScreen(),
                            ),
                          );
                          widget.onClose();
                        },
                      ),

                      // Site Verification - Only for Coordinators
                      if (_userRole.toLowerCase() == 'coordinator')
                        _MenuItemData(
                          icon: Icons.verified_user_rounded,
                          title: 'Site Verification',
                          subtitle: 'Verify and approve sites',
                          iconColor: Colors.purple,
                          onTap: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (context) =>
                                    const SiteVerificationScreen(),
                              ),
                            );
                            widget.onClose();
                          },
                        ),

                      _MenuItemData(
                        icon: Icons.account_balance_wallet_rounded,
                        title: 'My Wallet',
                        subtitle: 'View balance and transactions',
                        iconColor: Colors.green,
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => const WalletScreen(),
                            ),
                          );
                          widget.onClose();
                        },
                      ),

                      _MenuItemData(
                        icon: Icons.person_rounded,
                        title: 'My Profile',
                        subtitle: 'View and edit profile',
                        iconColor: Colors.teal,
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => const ProfileScreen(),
                            ),
                          );
                          widget.onClose();
                        },
                      ),
                      _MenuItemData(
                        icon: Icons.settings_rounded,
                        title: 'Settings',
                        subtitle: 'App preferences and account',
                        iconColor: AppColors.primaryBlue,
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => const SettingsScreen(),
                            ),
                          );
                          widget.onClose();
                        },
                      ),
                      // Chats screen disabled - using Communications only
                      // _MenuItemData(
                      //   icon: Icons.chat_rounded,
                      //   title: 'Chats',
                      //   subtitle: 'Messages and conversations',
                      //   iconColor: Colors.blue,
                      //   onTap: () {
                      //     Navigator.push(
                      //       context,
                      //       MaterialPageRoute(
                      //         builder: (context) => const ChatsScreen(),
                      //       ),
                      //     );
                      //     widget.onClose();
                      //   },
                      // ),
                      _MenuItemData(
                        icon: Icons.help_rounded,
                        title: 'Help & Support',
                        subtitle: 'Get help and find answers',
                        iconColor: Colors.purple,
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => const HelpSupportScreen(),
                            ),
                          );
                          widget.onClose();
                        },
                      ),
                      _MenuItemData(
                        icon: Icons.support_rounded,
                        title: 'Support',
                        subtitle: 'Contact support team',
                        iconColor: Colors.teal,
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => const SupportScreen(),
                            ),
                          );
                          widget.onClose();
                        },
                      ),
                      _MenuItemData(
                        icon: Icons.phone_in_talk_rounded,
                        title: 'Communications',
                        subtitle: 'Calls and messages',
                        iconColor: Colors.indigo,
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => const CommunicationsScreen(),
                            ),
                          );
                          widget.onClose();
                        },
                      ),
                      // Admin Dashboard - Only for admins
                      if (_userRole.toLowerCase() == 'admin' ||
                          _userRole.toLowerCase() == 'super_admin' ||
                          _userRole.toLowerCase() == 'superadmin')
                        _MenuItemData(
                          icon: Icons.admin_panel_settings_rounded,
                          title: 'Admin Dashboard',
                          subtitle: 'Manage contacts and users',
                          iconColor: Colors.deepPurple,
                          onTap: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (context) => const AdminDashboardScreen(),
                              ),
                            );
                            widget.onClose();
                          },
                        ),
                      // Super Admin - Only for super admins
                      if (_userRole.toLowerCase() == 'super_admin' ||
                          _userRole.toLowerCase() == 'superadmin')
                        _MenuItemData(
                          icon: Icons.security_rounded,
                          title: 'Super Admin',
                          subtitle: 'System administration',
                          iconColor: Colors.red,
                          onTap: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (context) => const SuperAdminScreen(),
                              ),
                            );
                            widget.onClose();
                          },
                        ),
                      // _MenuItemData(
                      //   icon: Icons.dashboard_rounded,
                      //   title: 'PACT Dashboard',
                      //   subtitle: 'View dashboard',
                      //   iconColor: AppColors.primaryOrange,
                      //   onTap: () {
                      //     Navigator.push(
                      //       context,
                      //       MaterialPageRoute(
                      //         builder: (context) => const DashboardScreen(),
                      //       ),
                      //     );
                      //     widget.onClose();
                      //   },
                      // ),
                      // _MenuItemData(
                      //   icon: Icons.account_balance_wallet_rounded,
                      //   title: 'My Wallet',
                      //   subtitle: 'View balance and transactions',
                      //   iconColor: Colors.green,
                      //   onTap: () {
                      //     Navigator.push(
                      //       context,
                      //       MaterialPageRoute(
                      //         builder: (context) => const WalletScreen(),
                      //       ),
                      //     );
                      //     widget.onClose();
                      //   },
                      // ),
                      _MenuItemData(
                        icon: Icons.sync_rounded,
                        title: 'Sync Data',
                        subtitle: 'Update local data',
                        iconColor: Colors.blue,
                        onTap: () async {
                          await _performSync(context);
                          widget.onClose();
                        },
                      ),
                    ],
                  ),
                  const Divider(height: 24, indent: 16, endIndent: 16),
                  // _buildMenuSection(
                  //   context,
                  //   title: 'Information',
                  //   items: [
                  //     _MenuItemData(
                  //       icon: Icons.info_rounded,
                  //       title: 'About PACT',
                  //       subtitle: 'Learn more about us',
                  //       iconColor: Colors.green,
                  //       onTap: () async {
                  //         await _launchPactWebsite(context);
                  //         widget.onClose();
                  //       },
                  //     ),
                  //     _MenuItemData(
                  //       icon: Icons.help_rounded,
                  //       title: 'Help & Support',
                  //       subtitle: 'Get help and find answers',
                  //       iconColor: Colors.purple,
                  //       onTap: () {
                  //         Navigator.push(
                  //           context,
                  //           MaterialPageRoute(
                  //             builder: (context) => const HelpScreen(),
                  //           ),
                  //         );
                  //         widget.onClose();
                  //       },
                  //     ),
                  //     _MenuItemData(
                  //       icon: Icons.feedback_rounded,
                  //       title: 'Send Feedback',
                  //       subtitle: 'Share your thoughts',
                  //       iconColor: Colors.teal,
                  //       onTap: () async {
                  //         await _sendFeedback(context);
                  //         widget.onClose();
                  //       },
                  //     ),
                  //   ],
                  // ),
                ],
              ),
            ),

            // Sign Out Button
            Container(
              margin: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [Colors.red.shade400, Colors.red.shade600],
                ),
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: Colors.red.withOpacity(0.3),
                    blurRadius: 8,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () async {
                    final shouldSignOut = await showDialog<bool>(
                      context: context,
                      builder: (context) => AlertDialog(
                        title: const Text('Sign Out'),
                        content: const Text(
                          'Are you sure you want to sign out?',
                        ),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(context, false),
                            child: const Text('Cancel'),
                          ),
                          ElevatedButton(
                            onPressed: () => Navigator.pop(context, true),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.red,
                              foregroundColor: Colors.white,
                            ),
                            child: const Text('Sign Out'),
                          ),
                        ],
                      ),
                    );

                    if (shouldSignOut == true) {
                      await AuthService().signOut();
                      if (context.mounted) {
                        Navigator.of(context).pushReplacementNamed('/login');
                      }
                    }
                  },
                  borderRadius: BorderRadius.circular(16),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.exit_to_app_rounded,
                          color: Colors.white,
                        ),
                        const SizedBox(width: 12),
                        const Text(
                          'Sign Out',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),

            // App Version
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Column(
                children: [
                  Text(
                    _appVersion.isNotEmpty
                        ? 'PACT Mobile v$_appVersion'
                        : 'PACT Mobile',
                    style: TextStyle(
                      color: Colors.grey.shade500,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  if (_buildNumber.isNotEmpty)
                    Text(
                      _patchNumber != null
                          ? 'Build $_buildNumber (Patch $_patchNumber)'
                          : 'Build $_buildNumber',
                      style: TextStyle(
                        color: Colors.grey.shade400,
                        fontSize: 10,
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

  Widget _buildMenuSection(
    BuildContext context, {
    required String title,
    required List<_MenuItemData> items,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Text(
            title,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: Colors.grey.shade600,
              letterSpacing: 1.2,
            ),
          ),
        ),
        ...items.map((item) => _buildMenuItem(context, item)),
      ],
    );
  }

  Widget _buildMenuItem(BuildContext context, _MenuItemData item) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: item.onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: item.iconColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(item.icon, color: item.iconColor, size: 24),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.title,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: Colors.black87,
                        ),
                      ),
                      if (item.subtitle != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          item.subtitle!,
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade600,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  color: Colors.grey.shade400,
                  size: 20,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MenuItemData {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Color iconColor;
  final VoidCallback onTap;

  _MenuItemData({
    required this.icon,
    required this.title,
    this.subtitle,
    required this.iconColor,
    required this.onTap,
  });
}
