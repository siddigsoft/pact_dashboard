import 'package:pact_mobile/services/rpc_client.dart';

class AssignmentInfo {
  final String? assignedTo;
  final String? status;

  const AssignmentInfo({this.assignedTo, this.status});
}

class SiteVisitAssignmentResult {
  final bool success;
  final String? error;
  final AssignmentInfo? currentAssignment;

  const SiteVisitAssignmentResult({
    required this.success,
    this.error,
    this.currentAssignment,
  });
}

class SiteVisitAssignment {
  final RpcClient _client;

  SiteVisitAssignment(this._client);

  Future<SiteVisitAssignmentResult> attemptAssign({
    required String siteId,
    required String userId,
  }) async {
    try {
      final response = await _client.rpc(
        'assign_site_visit',
        params: {'site_id': siteId, 'user_id': userId},
      );

      if (response.error != null) {
        return SiteVisitAssignmentResult(
          success: false,
          error: response.error?.message,
        );
      }

      final data = response.data as Map<String, dynamic>?;
      if (data == null) {
        return const SiteVisitAssignmentResult(
          success: false,
          error: 'Unexpected response from server',
        );
      }

      final assignedTo = data['assigned_to'] as String?;
      final status = data['status'] as String?;
      final current = AssignmentInfo(assignedTo: assignedTo, status: status);

      final success = data['success'] == true;
      if (success) {
        return SiteVisitAssignmentResult(
          success: true,
          currentAssignment: current,
        );
      }

      // If not successful, determine message.
      final alreadyAssigned = status == 'assigned' || assignedTo != null;
      final message = alreadyAssigned
          ? 'Site visit already assigned'
          : (data['error'] as String? ?? 'Assignment failed');
      return SiteVisitAssignmentResult(
        success: false,
        error: message,
        currentAssignment: current,
      );
    } catch (e) {
      return SiteVisitAssignmentResult(success: false, error: e.toString());
    }
  }
}
