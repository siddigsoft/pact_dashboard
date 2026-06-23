import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/services/auth_service.dart';
import '../auth/models/user_model.dart';
import 'zones/data_collector_zone.dart';
import 'zones/coordinator_zone.dart';
import 'zones/supervisor_zone.dart';
import 'zones/fom_zone.dart';
import 'zones/data_team_zone.dart';
import '../../shared/widgets/offline_banner.dart';
import '../../core/theme/app_colors.dart';
import '../../core/constants/app_constants.dart';
import 'package:go_router/go_router.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    if (user == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Good ${_greeting()}, ${user.displayName.split(' ').first}'),
            Text(
              user.roleBadgeLabel,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w400, color: Colors.white70),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () => context.push(AppRoutes.notifications),
          ),
          IconButton(
            icon: const Icon(Icons.person_outline),
            onPressed: () => context.push(AppRoutes.profile),
          ),
        ],
      ),
      drawer: _buildDrawer(context, ref, user),
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(child: _zoneFor(user)),
        ],
      ),
    );
  }

  Widget _zoneFor(UserModel user) {
    if (user.isDataCollector) return const DataCollectorZone();
    if (user.isSupervisor) return const SupervisorZone();
    if (user.isCoordinator) return const CoordinatorZone();
    if (user.isFOM) return const FomZone();
    if (user.isDataTeam) return const DataTeamZone();
    return const DataTeamZone();
  }

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Morning';
    if (h < 17) return 'Afternoon';
    return 'Evening';
  }

  Widget _buildDrawer(BuildContext context, WidgetRef ref, UserModel user) {
    return Drawer(
      child: Column(
        children: [
          UserAccountsDrawerHeader(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: AppColors.primaryGradient,
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            currentAccountPicture: CircleAvatar(
              backgroundColor: Colors.white.withOpacity(0.3),
              child: Text(
                user.displayName.isNotEmpty ? user.displayName[0].toUpperCase() : 'U',
                style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700),
              ),
            ),
            accountName: Text(user.displayName, style: const TextStyle(fontWeight: FontWeight.w600)),
            accountEmail: Text(user.roleBadgeLabel),
          ),
          Expanded(
            child: ListView(
              padding: EdgeInsets.zero,
              children: [
                _tile(context, Icons.home_outlined, 'Dashboard', AppRoutes.dashboard),
                _tile(context, Icons.check_circle_outline, 'My Tasks', AppRoutes.myTasks),
                _tile(context, Icons.location_on_outlined, 'MMP / My Sites', AppRoutes.mmp),
                _tile(context, Icons.map_outlined, 'Field Ops Hub', AppRoutes.fieldOps),
                if (!user.isDataCollector && !user.isDataTeam)
                  _tile(context, Icons.receipt_outlined, 'Cost Submission', AppRoutes.costSubmission),
                if (user.isSupervisor || user.isFOM)
                  _tile(context, Icons.inbox_outlined, 'Approvals Hub', AppRoutes.approvals),
                if (!user.isDataTeam)
                  _tile(context, Icons.account_balance_wallet_outlined, 'My Wallet', AppRoutes.wallet),
                if (user.isCoordinator || user.isSupervisor) ...[
                  _tile(context, Icons.verified_outlined, 'Site Verification', AppRoutes.siteVerification),
                  _tile(context, Icons.queue_outlined, 'Sites for Verification', AppRoutes.sitesForVerification),
                ],
                if (user.isFOM) ...[
                  _tile(context, Icons.attach_money, 'Finance Hub', AppRoutes.financeHub),
                  _tile(context, Icons.folder_outlined, 'Programme Hub', AppRoutes.programmeHub),
                  _tile(context, Icons.handshake_outlined, 'CRM', AppRoutes.crm),
                  _tile(context, Icons.bar_chart, 'Analytics', AppRoutes.analytics),
                ],
                if (user.isDataTeam)
                  _tile(context, Icons.bar_chart, 'Analytics', AppRoutes.analytics),
                _tile(context, Icons.chat_outlined, 'Communication', AppRoutes.communication),
                _tile(context, Icons.calendar_today_outlined, 'Calendar', AppRoutes.calendar),
                _tile(context, Icons.notifications_outlined, 'Notifications', AppRoutes.notifications),
                const Divider(),
                _tile(context, Icons.person_outline, 'My Profile', AppRoutes.profile),
                ListTile(
                  leading: const Icon(Icons.logout, color: AppColors.error),
                  title: const Text('Sign Out', style: TextStyle(color: AppColors.error)),
                  onTap: () async {
                    Navigator.pop(context);
                    await ref.read(authServiceProvider).signOut();
                    ref.read(currentUserProvider.notifier).setUser(null);
                    if (context.mounted) context.go(AppRoutes.login);
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _tile(BuildContext context, IconData icon, String label, String route) {
    return ListTile(
      leading: Icon(icon, size: 22),
      title: Text(label, style: const TextStyle(fontSize: 14)),
      onTap: () { Navigator.pop(context); context.go(route); },
    );
  }
}
