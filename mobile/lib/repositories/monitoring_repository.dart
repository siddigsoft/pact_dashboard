// lib/repositories/monitoring_repository.dart
// Repository for admin monitoring dashboard - handles all API calls to Edge Functions

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/monitoring_action.dart';
import '../providers/monitoring_provider.dart';

class MonitoringRepository {
  final SupabaseClient supabaseClient;

  // Edge Function names (set by Task #1 - web dashboard)
  static const String _dashboardReadFunction = 'monitoring-dashboard-read';
  static const String _statusChangeFunction = 'monitoring-status-change';
  static const String _workflowFunction = 'monitoring-workflow-action';
  static const String _exportFunction = 'monitoring-export';
  static const String _notificationFunction =
      'monitoring-push-notification-receipt';

  MonitoringRepository({required this.supabaseClient});

  /// Fetch all monitoring actions for the dashboard
  /// Server enforces super_admins RBAC check on every call
  Future<List<MonitoringAction>> fetchAllActions() async {
    try {
      debugPrint('[MonitoringRepository] Fetching all actions...');

      final response = await supabaseClient.functions.invoke(
        _dashboardReadFunction,
        method: HttpMethod.post,
        body: {'action': 'fetch_all', 'filter': null},
      );

      if (response.status != 200) {
        throw Exception('Failed to fetch actions: ${response.status}');
      }

      final List<dynamic> data = response.data['actions'] ?? [];
      final actions = data
          .map((item) => MonitoringAction.fromMap(item as Map<String, dynamic>))
          .toList();

      debugPrint('[MonitoringRepository] ✅ Fetched ${actions.length} actions');
      return actions;
    } catch (e) {
      debugPrint('[MonitoringRepository] Error fetching actions: $e');
      rethrow;
    }
  }

  /// Fetch actions filtered by category
  Future<List<MonitoringAction>> fetchActionsByCategory(String category) async {
    try {
      debugPrint(
        '[MonitoringRepository] Fetching actions for category: $category',
      );

      final response = await supabaseClient.functions.invoke(
        _dashboardReadFunction,
        method: HttpMethod.post,
        body: {
          'action': 'fetch_by_category',
          'filter': {'category': category},
        },
      );

      if (response.status != 200) {
        throw Exception('Failed to fetch actions: ${response.status}');
      }

      final List<dynamic> data = response.data['actions'] ?? [];
      final actions = data
          .map((item) => MonitoringAction.fromMap(item as Map<String, dynamic>))
          .toList();

      return actions;
    } catch (e) {
      debugPrint('[MonitoringRepository] Error fetching actions: $e');
      rethrow;
    }
  }

  /// Fetch actions filtered by status
  Future<List<MonitoringAction>> fetchActionsByStatus(String status) async {
    try {
      final response = await supabaseClient.functions.invoke(
        _dashboardReadFunction,
        method: HttpMethod.post,
        body: {
          'action': 'fetch_by_status',
          'filter': {'status': status},
        },
      );

      if (response.status != 200) {
        throw Exception('Failed to fetch actions: ${response.status}');
      }

      final List<dynamic> data = response.data['actions'] ?? [];
      return data
          .map((item) => MonitoringAction.fromMap(item as Map<String, dynamic>))
          .toList();
    } catch (e) {
      debugPrint('[MonitoringRepository] Error fetching actions by status: $e');
      rethrow;
    }
  }

  /// Fetch summary statistics
  Future<MonitoringSummary> fetchSummary() async {
    try {
      final response = await supabaseClient.functions.invoke(
        _dashboardReadFunction,
        method: HttpMethod.post,
        body: {'action': 'fetch_summary'},
      );

      if (response.status != 200) {
        throw Exception('Failed to fetch summary: ${response.status}');
      }

      return MonitoringSummary.fromMap(response.data as Map<String, dynamic>);
    } catch (e) {
      debugPrint('[MonitoringRepository] Error fetching summary: $e');
      rethrow;
    }
  }

  /// Fetch detailed action information
  Future<MonitoringAction?> fetchActionDetails(String actionId) async {
    try {
      final response = await supabaseClient.functions.invoke(
        _dashboardReadFunction,
        method: HttpMethod.post,
        body: {'action': 'fetch_details', 'action_id': actionId},
      );

      if (response.status != 200) {
        return null;
      }

      return MonitoringAction.fromMap(response.data as Map<String, dynamic>);
    } catch (e) {
      debugPrint('[MonitoringRepository] Error fetching action details: $e');
      return null;
    }
  }

  /// Change status of an action (mark as Acted/Ignored/No Response)
  /// Returns updated action and triggers audit log + push notification
  Future<MonitoringAction> changeStatusBulk({
    required List<String> actionIds,
    required String newStatus, // 'acted', 'ignored', 'no_response'
  }) async {
    try {
      debugPrint(
        '[MonitoringRepository] Changing status for ${actionIds.length} actions to: $newStatus',
      );

      final response = await supabaseClient.functions.invoke(
        _statusChangeFunction,
        method: HttpMethod.post,
        body: {'action_ids': actionIds, 'new_status': newStatus, 'notes': null},
      );

      if (response.status != 200) {
        throw Exception('Failed to change status: ${response.status}');
      }

      debugPrint('[MonitoringRepository] ✅ Status changed successfully');

      // Return first updated action (client can refetch all if needed)
      return MonitoringAction.fromMap(response.data as Map<String, dynamic>);
    } catch (e) {
      debugPrint('[MonitoringRepository] Error changing status: $e');
      rethrow;
    }
  }

  /// Execute workflow action (Approve/Reject/Return) on an action
  /// Updates source table + creates workflow log
  Future<Map<String, dynamic>> executeWorkflowAction({
    required String actionId,
    required String action, // 'approve', 'reject', 'return'
    String? notes,
  }) async {
    try {
      debugPrint(
        '[MonitoringRepository] Executing workflow: $action on action: $actionId',
      );

      final response = await supabaseClient.functions.invoke(
        _workflowFunction,
        method: HttpMethod.post,
        body: {
          'action_id': actionId,
          'workflow_action': action,
          'notes': notes,
        },
      );

      if (response.status != 200) {
        throw Exception('Workflow failed: ${response.status}');
      }

      debugPrint('[MonitoringRepository] ✅ Workflow executed: $action');

      return response.data as Map<String, dynamic>;
    } catch (e) {
      debugPrint('[MonitoringRepository] Error executing workflow: $e');
      rethrow;
    }
  }

  /// Export actions to CSV or PDF
  /// Returns downloadable data URL or file path
  Future<String> exportActions({
    required String format, // 'csv' or 'pdf'
    List<String>? actionIds, // if null, export all
    Map<String, String>? filters, // category, status, date range
  }) async {
    try {
      debugPrint('[MonitoringRepository] Exporting to $format...');

      final response = await supabaseClient.functions.invoke(
        _exportFunction,
        method: HttpMethod.post,
        body: {'format': format, 'action_ids': actionIds, 'filters': filters},
      );

      if (response.status != 200) {
        throw Exception('Export failed: ${response.status}');
      }

      final downloadUrl = response.data['download_url'] as String?;
      if (downloadUrl == null) {
        throw Exception('No download URL returned');
      }

      debugPrint('[MonitoringRepository] ✅ Export generated: $downloadUrl');

      return downloadUrl;
    } catch (e) {
      debugPrint('[MonitoringRepository] Error exporting: $e');
      rethrow;
    }
  }

  /// Confirm push notification receipt for a monitoring event
  /// Part of the audit trail
  Future<void> confirmNotificationReceipt({
    required String actionId,
    required String notificationId,
  }) async {
    try {
      debugPrint(
        '[MonitoringRepository] Confirming notification receipt: $notificationId',
      );

      await supabaseClient.functions.invoke(
        _notificationFunction,
        method: HttpMethod.post,
        body: {
          'action_id': actionId,
          'notification_id': notificationId,
          'received_at': DateTime.now().toIso8601String(),
        },
      );

      debugPrint('[MonitoringRepository] ✅ Notification receipt confirmed');
    } catch (e) {
      debugPrint('[MonitoringRepository] Error confirming notification: $e');
      // Don't rethrow - this is a non-critical audit event
    }
  }

  /// Subscribe to real-time updates via Supabase Realtime
  /// Listens to the system_monitoring_actions table for changes
  Stream<List<MonitoringAction>> subscribeToActions() {
    try {
      debugPrint('[MonitoringRepository] Setting up Realtime subscription...');

      return supabaseClient
          .from('system_monitoring_actions')
          .stream(primaryKey: ['id'])
          .map((records) {
            debugPrint(
              '[MonitoringRepository] Realtime event received: ${records.length} records',
            );
            return records
                .map(
                  (record) =>
                      MonitoringAction.fromMap(record as Map<String, dynamic>),
                )
                .toList();
          });
    } catch (e) {
      debugPrint('[MonitoringRepository] Error subscribing to actions: $e');
      return Stream.empty();
    }
  }
}
