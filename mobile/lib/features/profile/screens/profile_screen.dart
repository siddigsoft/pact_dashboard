import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../auth/services/auth_service.dart';
import '../../../core/constants/app_constants.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});
  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _signingOut = false;

  Future<void> _signOut() async {
    setState(() => _signingOut = true);
    await ref.read(authServiceProvider).signOut();
    ref.read(currentUserProvider.notifier).setUser(null);
    if (mounted) context.go(AppRoutes.login);
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    if (user == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    return Scaffold(
      appBar: AppBar(title: const Text('My Profile')),
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(
            child: ListView(
              children: [
                // Profile header
                Container(
                  padding: const EdgeInsets.all(32),
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      colors: AppColors.primaryGradient,
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                  ),
                  child: Column(children: [
                    CircleAvatar(
                      radius: 40,
                      backgroundColor: Colors.white.withOpacity(0.2),
                      child: Text(
                        user.displayName.isNotEmpty ? user.displayName[0].toUpperCase() : 'U',
                        style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w700),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(user.displayName, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text(user.email, style: const TextStyle(color: Colors.white70, fontSize: 14)),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(user.roleBadgeLabel, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 13)),
                    ),
                  ]),
                ),

                const SizedBox(height: 8),

                // Info section
                _Section('Account Information', [
                  _InfoRow(Icons.person_outline, 'Name', user.displayName),
                  _InfoRow(Icons.email_outlined, 'Email', user.email),
                  if (user.phone != null) _InfoRow(Icons.phone_outlined, 'Phone', user.phone!),
                  if (user.hub != null) _InfoRow(Icons.location_city_outlined, 'Hub', user.hub!),
                  if (user.state != null) _InfoRow(Icons.map_outlined, 'State', user.state!),
                ]),

                _Section('Role & Access', [
                  _InfoRow(Icons.badge_outlined, 'Role', user.roleBadgeLabel),
                  _InfoRow(Icons.shield_outlined, 'Status', user.status ?? 'Active'),
                ]),

                _Section('Location', [
                  if (user.location != null) ...[
                    _InfoRow(Icons.gps_fixed, 'Last GPS', '${user.location?['latitude']?.toStringAsFixed(4) ?? '—'}, ${user.location?['longitude']?.toStringAsFixed(4) ?? '—'}'),
                    if (user.locationUpdatedAt != null) _InfoRow(Icons.update, 'Updated', _fmt(user.locationUpdatedAt!)),
                  ] else
                    const Padding(padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8), child: Text('No location data', style: TextStyle(color: AppColors.textSecondary))),
                ]),

                const SizedBox(height: 8),

                // Settings
                Card(
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  child: Column(children: [
                    ListTile(
                      leading: const Icon(Icons.lock_outline, color: AppColors.primary),
                      title: const Text('Change Password'),
                      trailing: const Icon(Icons.arrow_forward_ios, size: 14, color: AppColors.textSecondary),
                      onTap: () {},
                    ),
                    const Divider(height: 1),
                    ListTile(
                      leading: const Icon(Icons.notifications_outlined, color: AppColors.primary),
                      title: const Text('Notification Preferences'),
                      trailing: const Icon(Icons.arrow_forward_ios, size: 14, color: AppColors.textSecondary),
                      onTap: () {},
                    ),
                    const Divider(height: 1),
                    ListTile(
                      leading: const Icon(Icons.language_outlined, color: AppColors.primary),
                      title: const Text('Language'),
                      trailing: const Text('English', style: TextStyle(color: AppColors.textSecondary)),
                      onTap: () {},
                    ),
                  ]),
                ),

                const SizedBox(height: 16),

                // Sign out
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: OutlinedButton.icon(
                      onPressed: _signingOut ? null : _signOut,
                      icon: _signingOut
                          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.logout, color: AppColors.error),
                      label: const Text('Sign Out', style: TextStyle(color: AppColors.error, fontWeight: FontWeight.w600)),
                      style: OutlinedButton.styleFrom(side: const BorderSide(color: AppColors.error)),
                    ),
                  ),
                ),

                const SizedBox(height: 12),
                Center(child: Text('v${AppConstants.appVersion} • PACT Command Center', style: const TextStyle(color: AppColors.textDisabled, fontSize: 12))),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _fmt(String iso) {
    try { final d = DateTime.parse(iso); return '${d.day}/${d.month}/${d.year} ${d.hour}:${d.minute.toString().padLeft(2,'0')}'; } catch (_) { return iso; }
  }
}

class _Section extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _Section(this.title, this.children);
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Padding(padding: const EdgeInsets.fromLTRB(16, 16, 16, 8), child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.textSecondary))),
      Card(margin: const EdgeInsets.symmetric(horizontal: 16), child: Column(children: children)),
    ],
  );
}

Widget _InfoRow(IconData icon, String label, String value) {
  return Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    child: Row(children: [
      Icon(icon, size: 20, color: AppColors.textSecondary),
      const SizedBox(width: 12),
      SizedBox(width: 80, child: Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13))),
      Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13))),
    ]),
  );
}
