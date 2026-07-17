// lib/providers/monitoring_provider.dart
// Riverpod providers for admin monitoring dashboard

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/monitoring_action.dart';
import '../repositories/monitoring_repository.dart';

// Monitoring repository provider
final monitoringRepositoryProvider = Provider((ref) {
  return MonitoringRepository(supabaseClient: Supabase.instance.client);
});

// All monitoring actions (from Edge Function)
final monitoringActionsProvider = FutureProvider<List<MonitoringAction>>((
  ref,
) async {
  final repository = ref.watch(monitoringRepositoryProvider);
  return repository.fetchAllActions();
});

// Filtered actions by category
final monitoringActionsByCategoryProvider =
    FutureProvider.family<List<MonitoringAction>, String>((
      ref,
      category,
    ) async {
      final repository = ref.watch(monitoringRepositoryProvider);
      return repository.fetchActionsByCategory(category);
    });

// Filtered actions by status
final monitoringActionsByStatusProvider =
    FutureProvider.family<List<MonitoringAction>, String>((ref, status) async {
      final repository = ref.watch(monitoringRepositoryProvider);
      return repository.fetchActionsByStatus(status);
    });

// Summary statistics
final monitoringSummaryProvider = FutureProvider<MonitoringSummary>((
  ref,
) async {
  final repository = ref.watch(monitoringRepositoryProvider);
  return repository.fetchSummary();
});

// Cache of single action details
final monitoringActionDetailsProvider =
    FutureProvider.family<MonitoringAction?, String>((ref, actionId) async {
      final repository = ref.watch(monitoringRepositoryProvider);
      return repository.fetchActionDetails(actionId);
    });

// Real-time stream of actions (via Supabase Realtime)
final monitoringRealtimeProvider = StreamProvider<List<MonitoringAction>>((
  ref,
) {
  final repository = ref.watch(monitoringRepositoryProvider);
  return repository.subscribeToActions();
});

// Summary data structure
class MonitoringSummary {
  final int totalActions;
  final int actedCount;
  final int ignoredCount;
  final int noResponseCount;

  MonitoringSummary({
    required this.totalActions,
    required this.actedCount,
    required this.ignoredCount,
    required this.noResponseCount,
  });

  /// Convert from Supabase response
  factory MonitoringSummary.fromMap(Map<String, dynamic> map) {
    return MonitoringSummary(
      totalActions: (map['total_actions'] as num?)?.toInt() ?? 0,
      actedCount: (map['acted_count'] as num?)?.toInt() ?? 0,
      ignoredCount: (map['ignored_count'] as num?)?.toInt() ?? 0,
      noResponseCount: (map['no_response_count'] as num?)?.toInt() ?? 0,
    );
  }
}
