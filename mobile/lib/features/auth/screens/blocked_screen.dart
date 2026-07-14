import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/constants/app_constants.dart';
import '../../permissions/permission_service.dart';

/// Displayed when a user tries to navigate to a page that has been explicitly
/// blocked via a page_access_override in the admin panel.
class BlockedScreen extends ConsumerWidget {
  const BlockedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: Colors.red.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: Colors.red.withOpacity(0.4), width: 1.5),
                  ),
                  child: const Icon(Icons.lock_outline, color: Colors.redAccent, size: 40),
                ),
                const SizedBox(height: 24),
                const Text(
                  'Access Restricted',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Your administrator has restricted access to this section. '
                  'Please contact your supervisor if you need access.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFF94A3B8), fontSize: 14, height: 1.5),
                ),
                const SizedBox(height: 32),
                ElevatedButton.icon(
                  onPressed: () {
                    final safe = PermissionService.getFirstAllowedRoute([
                      AppRoutes.dashboard,
                      AppRoutes.notifications,
                      AppRoutes.profile,
                    ]);
                    if (safe != null && context.mounted) context.go(safe);
                  },
                  icon: const Icon(Icons.home_outlined, size: 18),
                  label: const Text('Return to Dashboard'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
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
