import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'core/constants/app_constants.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/screens/splash_screen.dart';
import 'features/auth/screens/login_screen.dart';
import 'features/dashboard/dashboard_screen.dart';
import 'features/site_visits/screens/site_visit_detail_screen.dart';
import 'features/site_visits/screens/complete_visit_screen.dart';
import 'features/mmp/screens/mmp_screen.dart';
import 'features/mmp/screens/mmp_detail_screen.dart';
import 'features/mmp/screens/cycle_close_screen.dart';
import 'features/cost_submission/screens/cost_submission_screen.dart';
import 'features/approvals/screens/approvals_screen.dart';
import 'features/tasks/screens/tasks_screen.dart';
import 'features/wallet/screens/wallet_screen.dart';
import 'features/notifications/screens/notifications_screen.dart';
import 'features/field_ops/screens/field_ops_screen.dart';
import 'features/coordinator/screens/site_verification_screen.dart';
import 'features/coordinator/screens/sites_for_verification_screen.dart';
import 'features/finance/screens/finance_hub_screen.dart';
import 'features/programme/screens/programme_hub_screen.dart';
import 'features/crm/screens/crm_screen.dart';
import 'features/analytics/screens/analytics_screen.dart';
import 'features/communication/screens/communication_screen.dart';
import 'features/calendar/screens/calendar_screen.dart';
import 'features/expenses/screens/my_expenses_screen.dart';
import 'features/profile/screens/profile_screen.dart';

final _router = GoRouter(
  initialLocation: AppRoutes.splash,
  routes: [
    GoRoute(path: AppRoutes.splash, builder: (_, __) => const SplashScreen()),
    GoRoute(path: AppRoutes.login, builder: (_, __) => const LoginScreen()),
    GoRoute(path: AppRoutes.dashboard, builder: (_, __) => const DashboardScreen()),
    GoRoute(path: AppRoutes.myTasks, builder: (_, __) => const TasksScreen()),
    GoRoute(path: AppRoutes.mmp, builder: (_, __) => const MmpScreen()),
    GoRoute(
      path: '/mmp/:id',
      builder: (_, state) => MmpDetailScreen(mmpId: state.pathParameters['id']!),
    ),
    GoRoute(path: AppRoutes.fieldOps, builder: (_, __) => const FieldOpsScreen()),
    GoRoute(
      path: '/site-visits/:id',
      builder: (_, state) => SiteVisitDetailScreen(visitId: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/site-visits/:id/complete',
      builder: (_, state) => CompleteVisitScreen(visitId: state.pathParameters['id']!),
    ),
    GoRoute(path: AppRoutes.costSubmission, builder: (_, __) => const CostSubmissionScreen()),
    GoRoute(path: AppRoutes.approvals, builder: (_, __) => const ApprovalsScreen()),
    GoRoute(path: AppRoutes.wallet, builder: (_, __) => const WalletScreen()),
    GoRoute(path: AppRoutes.notifications, builder: (_, __) => const NotificationsScreen()),
    GoRoute(path: AppRoutes.calendar, builder: (_, __) => const CalendarScreen()),
    GoRoute(path: AppRoutes.myExpenses, builder: (_, __) => const MyExpensesScreen()),
    GoRoute(path: AppRoutes.siteVerification, builder: (_, __) => const SiteVerificationScreen()),
    GoRoute(path: AppRoutes.sitesForVerification, builder: (_, __) => const SitesForVerificationScreen()),
    GoRoute(path: AppRoutes.financeHub, builder: (_, __) => const FinanceHubScreen()),
    GoRoute(path: AppRoutes.programmeHub, builder: (_, __) => const ProgrammeHubScreen()),
    GoRoute(path: AppRoutes.crm, builder: (_, __) => const CrmScreen()),
    GoRoute(path: AppRoutes.analytics, builder: (_, __) => const AnalyticsScreen()),
    GoRoute(path: AppRoutes.communication, builder: (_, __) => const CommunicationScreen()),
    GoRoute(path: AppRoutes.profile, builder: (_, __) => const ProfileScreen()),
    GoRoute(path: AppRoutes.cyclClose, builder: (_, __) => const CycleCloseScreen()),
  ],
);

class PactApp extends ConsumerWidget {
  const PactApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: AppConstants.appName,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.system,
      routerConfig: _router,
      debugShowCheckedModeBanner: false,
    );
  }
}
