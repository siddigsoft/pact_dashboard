import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/auth/models/user_model.dart';
import '../../features/auth/services/auth_service.dart';
import '../../core/theme/app_colors.dart';
import '../../core/constants/app_constants.dart';
import 'offline_banner.dart';

class AppScaffold extends ConsumerWidget {
  final String title;
  final Widget body;
  final List<Widget>? actions;
  final Widget? floatingActionButton;
  final bool showNav;
  final Widget? bottomSheet;
  final PreferredSizeWidget? bottom;

  const AppScaffold({
    super.key,
    required this.title,
    required this.body,
    this.actions,
    this.floatingActionButton,
    this.showNav = true,
    this.bottomSheet,
    this.bottom,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        actions: [
          ...?actions,
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () => context.push(AppRoutes.notifications),
          ),
        ],
        bottom: bottom,
      ),
      drawer: user != null ? _AppDrawer(user: user) : null,
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(child: body),
        ],
      ),
      floatingActionButton: floatingActionButton,
      bottomSheet: bottomSheet,
      bottomNavigationBar: showNav && user != null
          ? _RoleBottomNav(user: user)
          : null,
    );
  }
}

class _RoleBottomNav extends StatelessWidget {
  final UserModel user;

  const _RoleBottomNav({required this.user});

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.toString();
    final items = _navItems();

    int currentIndex = items.indexWhere((i) => location.startsWith(i.route));
    if (currentIndex < 0) currentIndex = 0;

    return NavigationBar(
      selectedIndex: currentIndex,
      onDestinationSelected: (i) => context.go(items[i].route),
      destinations: items.map((i) => NavigationDestination(
        icon: Icon(i.icon),
        selectedIcon: Icon(i.icon, color: AppColors.primary),
        label: i.label,
      )).toList(),
    );
  }

  List<_NavItem> _navItems() {
    if (user.isDataCollector) {
      return [
        _NavItem(AppRoutes.dashboard, Icons.home_outlined, 'Home'),
        _NavItem(AppRoutes.fieldOps, Icons.map_outlined, 'Field Ops'),
        _NavItem(AppRoutes.mmp, Icons.location_on_outlined, 'My Sites'),
        _NavItem(AppRoutes.myTasks, Icons.check_circle_outline, 'Tasks'),
        _NavItem(AppRoutes.wallet, Icons.account_balance_wallet_outlined, 'Wallet'),
      ];
    }
    if (user.isCoordinator) {
      return [
        _NavItem(AppRoutes.dashboard, Icons.home_outlined, 'Home'),
        _NavItem(AppRoutes.fieldOps, Icons.map_outlined, 'Field Ops'),
        _NavItem(AppRoutes.mmp, Icons.list_alt_outlined, 'Sites'),
        _NavItem(AppRoutes.costSubmission, Icons.receipt_outlined, 'Costs'),
        _NavItem(AppRoutes.notifications, Icons.notifications_outlined, 'Alerts'),
      ];
    }
    if (user.isSupervisor) {
      return [
        _NavItem(AppRoutes.dashboard, Icons.home_outlined, 'Home'),
        _NavItem(AppRoutes.fieldOps, Icons.map_outlined, 'Field Ops'),
        _NavItem(AppRoutes.approvals, Icons.inbox_outlined, 'Approvals'),
        _NavItem(AppRoutes.costSubmission, Icons.receipt_outlined, 'Costs'),
        _NavItem(AppRoutes.notifications, Icons.notifications_outlined, 'Alerts'),
      ];
    }
    if (user.isFOM) {
      return [
        _NavItem(AppRoutes.dashboard, Icons.home_outlined, 'Home'),
        _NavItem(AppRoutes.mmp, Icons.folder_outlined, 'MMP'),
        _NavItem(AppRoutes.approvals, Icons.inbox_outlined, 'Approvals'),
        _NavItem(AppRoutes.financeHub, Icons.attach_money_outlined, 'Finance'),
        _NavItem(AppRoutes.notifications, Icons.notifications_outlined, 'Alerts'),
      ];
    }
    if (user.isDataTeam) {
      return [
        _NavItem(AppRoutes.myTasks, Icons.check_circle_outline, 'Tasks'),
        _NavItem(AppRoutes.mmp, Icons.list_alt_outlined, 'MMP'),
        _NavItem(AppRoutes.analytics, Icons.bar_chart_outlined, 'Analytics'),
        _NavItem(AppRoutes.communication, Icons.chat_outlined, 'Chat'),
        _NavItem(AppRoutes.notifications, Icons.notifications_outlined, 'Alerts'),
      ];
    }
    return [
      _NavItem(AppRoutes.dashboard, Icons.home_outlined, 'Home'),
      _NavItem(AppRoutes.notifications, Icons.notifications_outlined, 'Alerts'),
    ];
  }
}

class _NavItem {
  final String route;
  final IconData icon;
  final String label;
  _NavItem(this.route, this.icon, this.label);
}

class _AppDrawer extends ConsumerWidget {
  final UserModel user;

  const _AppDrawer({required this.user});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            accountName: Text(
              user.displayName,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            accountEmail: Text(user.email),
          ),
          Expanded(
            child: ListView(
              padding: EdgeInsets.zero,
              children: [
                _DrawerTile(Icons.home_outlined, 'Dashboard', AppRoutes.dashboard, context),
                _DrawerTile(Icons.check_circle_outline, 'My Tasks', AppRoutes.myTasks, context),
                if (!user.isDataCollector && !user.isDataTeam)
                  _DrawerTile(Icons.receipt_outlined, 'Cost Submission', AppRoutes.costSubmission, context),
                _DrawerTile(Icons.location_on_outlined, 'MMP / My Sites', AppRoutes.mmp, context),
                _DrawerTile(Icons.map_outlined, 'Field Ops Hub', AppRoutes.fieldOps, context),
                if (!user.isDataCollector && !user.isDataTeam)
                  _DrawerTile(Icons.account_balance_wallet_outlined, 'My Wallet', AppRoutes.wallet, context),
                if (user.isDataCollector)
                  _DrawerTile(Icons.account_balance_wallet_outlined, 'My Wallet', AppRoutes.wallet, context),
                if (user.isSupervisor || user.isFOM)
                  _DrawerTile(Icons.inbox_outlined, 'Approvals Hub', AppRoutes.approvals, context),
                if (user.isFOM) ...[
                  _DrawerTile(Icons.attach_money, 'Finance Hub', AppRoutes.financeHub, context),
                  _DrawerTile(Icons.folder_outlined, 'Programme Hub', AppRoutes.programmeHub, context),
                  _DrawerTile(Icons.handshake_outlined, 'CRM', AppRoutes.crm, context),
                  _DrawerTile(Icons.bar_chart, 'Analytics', AppRoutes.analytics, context),
                ],
                if (user.isDataTeam)
                  _DrawerTile(Icons.bar_chart, 'Analytics', AppRoutes.analytics, context),
                _DrawerTile(Icons.chat_outlined, 'Communication', AppRoutes.communication, context),
                _DrawerTile(Icons.calendar_today_outlined, 'Calendar', AppRoutes.calendar, context),
                _DrawerTile(Icons.notifications_outlined, 'Notifications', AppRoutes.notifications, context),
                const Divider(),
                _DrawerTile(Icons.person_outline, 'My Profile', AppRoutes.profile, context),
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
}

Widget _DrawerTile(IconData icon, String title, String route, BuildContext context) {
  return ListTile(
    leading: Icon(icon, size: 22),
    title: Text(title, style: const TextStyle(fontSize: 14)),
    onTap: () {
      Navigator.pop(context);
      context.go(route);
    },
  );
}
