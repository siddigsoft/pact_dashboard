import '../services/offline/offline_db.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Centralized role checks aligned with tpm-workflow `app_role` / profiles.role.
class UserRoleHelper {
  UserRoleHelper._();

  static String normalize(String? role) =>
      (role ?? '').toLowerCase().trim().replaceAll(' ', '_');

  static bool isEmployee(String? role) => normalize(role) == 'employee';

  static bool isCoordinator(String? role) {
    final r = normalize(role);
    return r == 'coordinator' ||
        r == 'field_coordinator' ||
        r == 'state_coordinator';
  }

  static bool isSupervisor(String? role) {
    final r = normalize(role);
    return r.contains('supervisor') ||
        r == 'hubsupervisor' ||
        r.contains('fom') ||
        r.contains('admin') ||
        r.contains('country');
  }

  static bool isAdmin(String? role) {
    final r = normalize(role);
    return r == 'admin' ||
        r == 'super_admin' ||
        r == 'superadmin' ||
        r == 'fom';
  }

  static bool isExecRole(String? role) {
    final r = normalize(role);
    return isAdmin(role) ||
        r == 'ceo' ||
        r == 'coo' ||
        r == 'cto' ||
        r == 'country_director' ||
        r == 'countrydirector' ||
        r == 'hr_manager';
  }

  /// Team task monitor — aligned with tpm-workflow AppSidebar.
  static bool canSeeTeamMonitor(String? role) => isExecRole(role);

  static bool isFinance(String? role) {
    final r = normalize(role);
    return r == 'finance' ||
        r == 'finance_manager' ||
        r == 'financialadmin';
  }

  static bool isDataCollector(String? role) {
    final r = normalize(role);
    return r == 'enumerator' ||
        r == 'data_collector' ||
        r == 'datacollector' ||
        r == 'dataCollector'.toLowerCase();
  }

  /// Office / HQ staff — My Tasks, comms, wallet; no field site workflows.
  static bool usesEmployeeNavigation(String? role) => isEmployee(role);

  static bool canAccessFieldOperations(String? role) =>
      !isEmployee(role) &&
      (isDataCollector(role) ||
          isCoordinator(role) ||
          isSupervisor(role) ||
          isAdmin(role));

  /// Best-effort role from offline profile cache (for shell routing before layout loads).
  static String? cachedRole() {
    try {
      final userId = Supabase.instance.client.auth.currentUser?.id;
      if (userId == null) return null;
      final cached = OfflineDb().getCachedItem(
        OfflineDb.profileCacheBox,
        'profile_$userId',
      );
      return cached?.data['role']?.toString();
    } catch (_) {
      return null;
    }
  }

  static String displayLabel(String? role) {
    if (isEmployee(role)) return 'Employee';
    if (isCoordinator(role)) return 'Coordinator';
    if (isSupervisor(role)) return 'Supervisor';
    if (isAdmin(role)) return 'Admin';
    if (isDataCollector(role)) return 'Data Collector';
    final r = role?.trim();
    if (r == null || r.isEmpty) return 'User';
    return r[0].toUpperCase() + r.substring(1);
  }
}
