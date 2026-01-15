import 'package:supabase_flutter/supabase_flutter.dart';

/// Handles the atomic assignment of site visits to users
class SiteVisitAssignment {
  final SupabaseClient _supabase;

  SiteVisitAssignment(this._supabase);

  /// Attempts to assign a site visit to a user
  ///
  /// Returns a Future that completes with the assignment result
  /// If successful, updates the local site visit status
  /// If failed, returns the current assignment state from the server
  Future<AssignmentResult> attemptAssign({
    required String siteId,
    required String userId,
  }) async {
    try {
      // Optional: Mark local state as pending to prevent duplicate attempts
      // await _markLocalPendingAssignment(siteId);

      // Call Supabase RPC to attempt assignment
      final response = await _supabase.rpc(
        'assign_site_visit',
        params: {
          'p_site_id': siteId,
          'p_user_id': userId,
        },
      );

      if (response.error != null) {
        // Handle network or server error
        return AssignmentResult(
          success: false,
          error: response.error!.message,
          currentAssignment: null,
        );
      }

      final result = response.data as Map<String, dynamic>;

      if (result['success'] == true) {
        // Update local state
        await _updateLocalAssignment(
          siteId: siteId,
          userId: userId,
          status: 'assigned',
        );

        return AssignmentResult(
          success: true,
          error: null,
          currentAssignment: Assignment(
            siteId: siteId,
            assignedTo: userId,
            status: 'assigned',
          ),
        );
      } else {
        // Assignment failed - site was already assigned
        return AssignmentResult(
          success: false,
          error: 'Site visit already assigned',
          currentAssignment: Assignment(
            siteId: siteId,
            assignedTo: result['assigned_to'],
            status: result['status'],
          ),
        );
      }
    } catch (e) {
      // Handle unexpected errors
      return AssignmentResult(
        success: false,
        error: e.toString(),
        currentAssignment: null,
      );
    }
  }

  /// Updates the local site visit record after successful assignment
  Future<void> _updateLocalAssignment({
    required String siteId,
    required String userId,
    required String status,
  }) async {
    // TODO: Implement local database update
    // This should update your local site_visits table/storage
    // Example with Hive or other local storage:
    // await _box.put(siteId, {'status': status, 'assigned_to': userId});
  }
}

/// Represents the result of an assignment attempt
class AssignmentResult {
  final bool success;
  final String? error;
  final Assignment? currentAssignment;

  AssignmentResult({
    required this.success,
    this.error,
    this.currentAssignment,
  });
}

/// Represents the assignment state of a site visit
class Assignment {
  final String siteId;
  final String assignedTo;
  final String status;

  Assignment({
    required this.siteId,
    required this.assignedTo,
    required this.status,
  });
}
