class AppConstants {
  static const String appName = 'PACT Command Center';
  static const String appVersion = '1.0.0';

  // Supabase — passed via --dart-define at build time
  static const String supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: '',
  );
  static const String supabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue: '',
  );

  // Hive box names
  static const String userBox = 'user_box';
  static const String siteVisitsBox = 'site_visits_box';
  static const String mmpBox = 'mmp_box';
  static const String tasksBox = 'tasks_box';
  static const String notificationsBox = 'notifications_box';
  static const String walletBox = 'wallet_box';
  static const String costSubmissionsBox = 'cost_submissions_box';
  static const String settingsBox = 'settings_box';
  static const String syncQueueBox = 'sync_queue_box';
  static const String offlineActionsBox = 'offline_actions_box';

  // Sync
  static const Duration syncInterval = Duration(seconds: 60);
  static const Duration staleThreshold = Duration(minutes: 5);

  // Pagination
  static const int pageSize = 50;

  // Role keys (match web app normalizeRole values)
  static const String roleDataCollector = 'DataCollector';
  static const String roleCoordinator = 'Coordinator';
  static const String roleSupervisor = 'Supervisor';
  static const String roleFOM = 'Field Operation Manager (FOM)';
  static const String roleDataTeam = 'DataTeam';
  static const String roleAdmin = 'Admin';
  static const String roleSuperAdmin = 'Super Admin';
}

class AppRoutes {
  // Auth
  static const String splash = '/';
  static const String login = '/login';

  // Main
  static const String dashboard = '/dashboard';
  static const String myTasks = '/my-tasks';
  static const String notifications = '/notifications';
  static const String profile = '/profile';
  static const String calendar = '/calendar';
  static const String myExpenses = '/my-expenses';
  static const String communication = '/communication';

  // Field ops
  static const String mmp = '/mmp';
  static const String fieldOps = '/field-ops';
  static const String cyclClose = '/cycle-close';

  // Finance
  static const String costSubmission = '/cost-submission';
  static const String approvals = '/approvals';
  static const String wallet = '/wallet';

  // Coordinator / Supervisor tools
  static const String siteVerification = '/coordinator/sites';
  static const String sitesForVerification = '/coordinator/sites-for-verification';

  // FOM-only
  static const String financeHub = '/finance-hub';
  static const String programmeHub = '/programme-hub';
  static const String crm = '/crm';
  static const String analytics = '/analytics';
}
