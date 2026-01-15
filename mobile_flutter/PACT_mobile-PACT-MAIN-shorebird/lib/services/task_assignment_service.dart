// lib/services/task_assignment_service.dart

import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../models/site_visit.dart';
import '../algorithms/site_visit_assignment.dart';
import '../services/site_visit_service.dart';

enum TaskAssignmentResult {
  success,
  alreadyAssigned,
  networkError,
  permissionDenied,
}

class TaskAssignmentResponse {
  final TaskAssignmentResult result;
  final String? message;
  final SiteVisit? assignedTask;

  TaskAssignmentResponse({
    required this.result,
    this.message,
    this.assignedTask,
  });
}

class TaskAssignmentService {
  final SupabaseClient _supabase;
  final SiteVisitService _service;
  late final SiteVisitAssignment _assignmentAlgorithm;

  TaskAssignmentService(this._supabase, this._service) {
    _assignmentAlgorithm = SiteVisitAssignment(_supabase);
  }

  /// Accept a task assignment
  Future<TaskAssignmentResponse> acceptTask({
    required String taskId,
    required String userId,
  }) async {
    try {
      // Use the site_visit_assignment algorithm to attempt assignment
      final result = await _assignmentAlgorithm.attemptAssign(
        siteId: taskId,
        userId: userId,
      );

      if (result.success) {
        // Update local service
        await _service.updateSiteVisitStatus(taskId, 'assigned');

        // Get the updated task
        final updatedTask = await _service.getSiteVisitById(taskId);

        return TaskAssignmentResponse(
          result: TaskAssignmentResult.success,
          message: 'Task accepted successfully',
          assignedTask: updatedTask,
        );
      } else {
        if (result.error?.contains('already assigned') == true) {
          return TaskAssignmentResponse(
            result: TaskAssignmentResult.alreadyAssigned,
            message: 'This task has already been assigned to another operative',
          );
        } else {
          return TaskAssignmentResponse(
            result: TaskAssignmentResult.networkError,
            message: result.error ?? 'Failed to accept task',
          );
        }
      }
    } catch (e) {
      return TaskAssignmentResponse(
        result: TaskAssignmentResult.networkError,
        message: 'Network error: ${e.toString()}',
      );
    }
  }

  /// Decline a task assignment
  Future<TaskAssignmentResponse> declineTask({
    required String taskId,
    required String userId,
  }) async {
    try {
      // For declining, we might want to record this in a separate table
      // or just remove it from the user's available tasks locally
      // The server might handle decline tracking differently

      // For now, we'll just mark it as declined locally
      // In a real implementation, you might want to call a server endpoint
      await _service.markTaskDeclined(taskId, userId);

      return TaskAssignmentResponse(
        result: TaskAssignmentResult.success,
        message: 'Task declined',
      );
    } catch (e) {
      return TaskAssignmentResponse(
        result: TaskAssignmentResult.networkError,
        message: 'Failed to decline task: ${e.toString()}',
      );
    }
  }

  /// Get tasks that have been accepted by the user and are in progress
  Future<List<SiteVisit>> getAcceptedTasks(String userId) async {
    return await _service.getAcceptedSiteVisits(userId);
  }

  /// Get tasks that have been assigned but not yet started
  Future<List<SiteVisit>> getAssignedPendingTasks(String userId) async {
    return await _service.getAssignedPendingSiteVisits(userId);
  }

  // ===== LOCAL STORAGE METHODS =====

  /// Initialize Hive boxes for local storage
  static Future<void> initializeLocalStorage() async {
    await Hive.initFlutter();
  }

  /// Get assignment decisions box
  Future<Box> _getAssignmentDecisionsBox() async {
    return await Hive.openBox('assignment_decisions');
  }

  /// Get assignment queue box
  Future<Box> _getAssignmentQueueBox() async {
    return await Hive.openBox('assignment_queue');
  }

  /// Cache assignment decision locally
  Future<void> cacheAssignmentDecision(
    String taskId,
    String userId,
    String decision, // 'accepted' or 'declined'
    TaskAssignmentResponse response,
  ) async {
    try {
      final box = await _getAssignmentDecisionsBox();

      await box.put('decision_${taskId}_$userId', {
        'task_id': taskId,
        'user_id': userId,
        'decision': decision,
        'result': response.result.toString(),
        'message': response.message,
        'assigned_task': response.assignedTask?.toJson(),
        'timestamp': DateTime.now().toIso8601String(),
        'synced': false,
      });
    } catch (e) {
      print('Error caching assignment decision: $e');
    }
  }

  /// Get cached assignment decision
  Future<Map<String, dynamic>?> getCachedAssignmentDecision(
      String taskId, String userId) async {
    try {
      final box = await _getAssignmentDecisionsBox();
      return box.get('decision_${taskId}_$userId');
    } catch (e) {
      print('Error getting cached assignment decision: $e');
      return null;
    }
  }

  /// Queue assignment operation for later sync
  Future<void> queueAssignmentOperation({
    required String taskId,
    required String userId,
    required String operation, // 'accept' or 'decline'
    required Map<String, dynamic> operationData,
  }) async {
    try {
      final box = await _getAssignmentQueueBox();

      await box.put('queue_${taskId}_$userId', {
        'task_id': taskId,
        'user_id': userId,
        'operation': operation,
        'data': operationData,
        'queued_at': DateTime.now().toIso8601String(),
        'retry_count': 0,
        'status': 'pending',
      });
    } catch (e) {
      print('Error queuing assignment operation: $e');
    }
  }

  /// Accept task with local caching and queue
  Future<TaskAssignmentResponse> acceptTaskCached({
    required String taskId,
    required String userId,
  }) async {
    try {
      // Try remote operation first
      final response = await acceptTask(taskId: taskId, userId: userId);

      // Cache the decision
      await cacheAssignmentDecision(taskId, userId, 'accepted', response);

      return response;
    } catch (e) {
      // If remote fails, queue for later and return optimistic response
      print('Remote accept failed, queuing operation: $e');

      await queueAssignmentOperation(
        taskId: taskId,
        userId: userId,
        operation: 'accept',
        operationData: {'taskId': taskId, 'userId': userId},
      );

      // Return optimistic response
      return TaskAssignmentResponse(
        result: TaskAssignmentResult.success,
        message: 'Task accepted (will sync when online)',
      );
    }
  }

  /// Decline task with local caching and queue
  Future<TaskAssignmentResponse> declineTaskCached({
    required String taskId,
    required String userId,
  }) async {
    try {
      // Try remote operation first
      final response = await declineTask(taskId: taskId, userId: userId);

      // Cache the decision
      await cacheAssignmentDecision(taskId, userId, 'declined', response);

      return response;
    } catch (e) {
      // If remote fails, queue for later and return optimistic response
      print('Remote decline failed, queuing operation: $e');

      await queueAssignmentOperation(
        taskId: taskId,
        userId: userId,
        operation: 'decline',
        operationData: {'taskId': taskId, 'userId': userId},
      );

      // Return optimistic response
      return TaskAssignmentResponse(
        result: TaskAssignmentResult.success,
        message: 'Task declined (will sync when online)',
      );
    }
  }

  /// Sync queued assignment operations
  Future<void> syncQueuedAssignments() async {
    try {
      final queueBox = await _getAssignmentQueueBox();
      final keys = queueBox.keys.toList();

      for (final key in keys) {
        final queueItem = queueBox.get(key);
        if (queueItem != null && queueItem['status'] == 'pending') {
          try {
            final operation = queueItem['operation'];
            final data = queueItem['data'];

            late TaskAssignmentResponse response;

            if (operation == 'accept') {
              response = await acceptTask(
                taskId: data['taskId'],
                userId: data['userId'],
              );
            } else if (operation == 'decline') {
              response = await declineTask(
                taskId: data['taskId'],
                userId: data['userId'],
              );
            }

            if (response.result == TaskAssignmentResult.success) {
              // Mark as completed and remove from queue
              await queueBox.delete(key);
            } else {
              // Increment retry count
              queueItem['retry_count'] = (queueItem['retry_count'] ?? 0) + 1;
              if (queueItem['retry_count'] > 3) {
                // Mark as failed after max retries
                queueItem['status'] = 'failed';
              }
              await queueBox.put(key, queueItem);
            }
          } catch (e) {
            // Increment retry count
            queueItem['retry_count'] = (queueItem['retry_count'] ?? 0) + 1;
            if (queueItem['retry_count'] > 3) {
              queueItem['status'] = 'failed';
            } else {
              await queueBox.put(key, queueItem);
            }
            print('Failed to sync assignment operation: $e');
          }
        }
      }
    } catch (e) {
      print('Error syncing queued assignments: $e');
    }
  }

  /// Get accepted tasks with local caching
  Future<List<SiteVisit>> getAcceptedTasksCached(String userId) async {
    try {
      // Try remote first
      final remoteTasks = await getAcceptedTasks(userId);

      // Cache the results
      await _cacheAcceptedTasks(remoteTasks, userId);

      return remoteTasks;
    } catch (e) {
      // Fall back to cached data
      print('Remote accepted tasks failed, using cache: $e');
      return await _getCachedAcceptedTasks(userId);
    }
  }

  /// Cache accepted tasks
  Future<void> _cacheAcceptedTasks(List<SiteVisit> tasks, String userId) async {
    try {
      final box = await _getAssignmentDecisionsBox();
      final tasksData = tasks.map((task) => task.toJson()).toList();

      await box.put('accepted_tasks_$userId', {
        'tasks': tasksData,
        'cached_at': DateTime.now().toIso8601String(),
        'expires_at':
            DateTime.now().add(const Duration(hours: 1)).toIso8601String(),
      });
    } catch (e) {
      print('Error caching accepted tasks: $e');
    }
  }

  /// Get cached accepted tasks
  Future<List<SiteVisit>> _getCachedAcceptedTasks(String userId) async {
    try {
      final box = await _getAssignmentDecisionsBox();
      final cached = box.get('accepted_tasks_$userId');

      if (cached == null) return [];

      // Check if cache is expired
      final expiresAt = DateTime.parse(cached['expires_at']);
      if (DateTime.now().isAfter(expiresAt)) {
        await box.delete('accepted_tasks_$userId');
        return [];
      }

      final tasksData = cached['tasks'] as List<dynamic>;
      return tasksData.map((taskData) => SiteVisit.fromJson(taskData)).toList();
    } catch (e) {
      print('Error getting cached accepted tasks: $e');
      return [];
    }
  }

  /// Get assignment history for user
  Future<List<Map<String, dynamic>>> getAssignmentHistory(String userId) async {
    try {
      final box = await _getAssignmentDecisionsBox();
      final history = <Map<String, dynamic>>[];

      final keys = box.keys.where((key) =>
          key.toString().contains('_$userId') &&
          key.toString().startsWith('decision_'));

      for (final key in keys) {
        final decision = box.get(key);
        if (decision != null) {
          history.add(decision);
        }
      }

      // Sort by timestamp (most recent first)
      history.sort((a, b) => DateTime.parse(b['timestamp'])
          .compareTo(DateTime.parse(a['timestamp'])));

      return history;
    } catch (e) {
      print('Error getting assignment history: $e');
      return [];
    }
  }

  /// Clear cached assignment data for user
  Future<void> clearAssignmentCache(String userId) async {
    try {
      final decisionsBox = await _getAssignmentDecisionsBox();
      final queueBox = await _getAssignmentQueueBox();

      // Remove user-specific decisions
      final decisionKeys =
          decisionsBox.keys.where((key) => key.toString().contains('_$userId'));
      for (final key in decisionKeys) {
        await decisionsBox.delete(key);
      }

      // Remove queued operations for user
      final queueKeys =
          queueBox.keys.where((key) => key.toString().contains('_$userId'));
      for (final key in queueKeys) {
        await queueBox.delete(key);
      }

      print('Cleared assignment cache for user: $userId');
    } catch (e) {
      print('Error clearing assignment cache: $e');
    }
  }

  /// Get assignment cache statistics
  Future<Map<String, dynamic>> getAssignmentCacheStats() async {
    try {
      final decisionsBox = await _getAssignmentDecisionsBox();
      final queueBox = await _getAssignmentQueueBox();

      final pendingQueue = queueBox.keys.where((key) {
        final item = queueBox.get(key);
        return item != null && item['status'] == 'pending';
      }).length;

      final failedQueue = queueBox.keys.where((key) {
        final item = queueBox.get(key);
        return item != null && item['status'] == 'failed';
      }).length;

      return {
        'cached_decisions': decisionsBox.length,
        'queued_operations': queueBox.length,
        'pending_operations': pendingQueue,
        'failed_operations': failedQueue,
      };
    } catch (e) {
      print('Error getting assignment cache stats: $e');
      return {};
    }
  }
}
