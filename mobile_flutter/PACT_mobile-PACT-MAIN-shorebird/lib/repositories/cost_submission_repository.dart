import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/cost_submission_models.dart';

class CostSubmissionRepository {
  final SupabaseClient _supabase;

  CostSubmissionRepository(this._supabase);

  /// Get all cost submissions for current user
  Future<List<CostSubmission>> getUserCostSubmissions(String userId) async {
    try {
      final response = await _supabase
          .from('site_visit_cost_submissions')
          .select()
          .eq('submitted_by', userId)
          .order('submitted_at', ascending: false);

      return (response as List)
          .map((json) => CostSubmission.fromJson(json))
          .toList();
    } catch (e) {
      throw CostSubmissionException('Failed to fetch cost submissions: $e');
    }
  }

  /// Get cost submission by ID
  Future<CostSubmission?> getCostSubmissionById(String id) async {
    try {
      final response = await _supabase
          .from('site_visit_cost_submissions')
          .select()
          .eq('id', id)
          .single();

      return CostSubmission.fromJson(response);
    } catch (e) {
      if (e.toString().contains('PGRST116')) {
        return null; // Not found
      }
      throw CostSubmissionException('Failed to fetch cost submission: $e');
    }
  }

  /// Get cost submissions by status
  Future<List<CostSubmission>> getCostSubmissionsByStatus(
    String userId,
    CostSubmissionStatus status,
  ) async {
    try {
      final statusStr = status.toString().split('.').last;
      final response = await _supabase
          .from('site_visit_cost_submissions')
          .select()
          .eq('submitted_by', userId)
          .eq('status', statusStr)
          .order('submitted_at', ascending: false);

      return (response as List)
          .map((json) => CostSubmission.fromJson(json))
          .toList();
    } catch (e) {
      throw CostSubmissionException('Failed to fetch cost submissions: $e');
    }
  }

  /// Get cost submissions for a site visit
  Future<List<CostSubmission>> getCostSubmissionsBySiteVisit(
    String siteVisitId,
  ) async {
    try {
      final response = await _supabase
          .from('site_visit_cost_submissions')
          .select()
          .eq('site_visit_id', siteVisitId)
          .order('submitted_at', ascending: false);

      return (response as List)
          .map((json) => CostSubmission.fromJson(json))
          .toList();
    } catch (e) {
      throw CostSubmissionException('Failed to fetch cost submissions: $e');
    }
  }

  /// Create a new cost submission
  Future<CostSubmission> createCostSubmission(
    CreateCostSubmissionRequest request,
    String userId,
  ) async {
    try {
      final data = {
        ...request.toJson(),
        'submitted_by': userId,
        'submitted_at': DateTime.now().toIso8601String(),
        'total_cost_cents': request.totalCostCents,
        'currency': request.currency ?? 'SDG',
        'status': 'pending',
        'created_at': DateTime.now().toIso8601String(),
        'updated_at': DateTime.now().toIso8601String(),
      };

      final response = await _supabase
          .from('site_visit_cost_submissions')
          .insert(data)
          .select()
          .single();

      return CostSubmission.fromJson(response);
    } catch (e) {
      throw CostSubmissionException('Failed to create cost submission: $e');
    }
  }

  /// Update a cost submission (only if pending)
  Future<CostSubmission> updateCostSubmission(
    String id,
    UpdateCostSubmissionRequest request,
  ) async {
    try {
      // First, check if submission exists and is pending
      final existing = await getCostSubmissionById(id);
      if (existing == null) {
        throw CostSubmissionException('Cost submission not found');
      }
      if (!existing.canEdit) {
        throw CostSubmissionException(
          'Cannot edit submission with status: ${existing.statusLabel}',
        );
      }

      final data = {
        ...request.toJson(),
        'updated_at': DateTime.now().toIso8601String(),
      };

      // Calculate new total if cost fields are provided
      final transportCents = request.transportationCostCents ?? existing.transportationCostCents;
      final accommodationCents = request.accommodationCostCents ?? existing.accommodationCostCents;
      final mealCents = request.mealAllowanceCents ?? existing.mealAllowanceCents;
      final otherCents = request.otherCostsCents ?? existing.otherCostsCents;
      
      data['total_cost_cents'] = transportCents + accommodationCents + mealCents + otherCents;

      final response = await _supabase
          .from('site_visit_cost_submissions')
          .update(data)
          .eq('id', id)
          .select()
          .single();

      return CostSubmission.fromJson(response);
    } catch (e) {
      if (e is CostSubmissionException) rethrow;
      throw CostSubmissionException('Failed to update cost submission: $e');
    }
  }

  /// Cancel a cost submission (only if pending)
  Future<CostSubmission> cancelCostSubmission(String id) async {
    try {
      final existing = await getCostSubmissionById(id);
      if (existing == null) {
        throw CostSubmissionException('Cost submission not found');
      }
      if (!existing.canCancel) {
        throw CostSubmissionException(
          'Cannot cancel submission with status: ${existing.statusLabel}',
        );
      }

      final response = await _supabase
          .from('site_visit_cost_submissions')
          .update({
            'status': 'cancelled',
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', id)
          .select()
          .single();

      return CostSubmission.fromJson(response);
    } catch (e) {
      if (e is CostSubmissionException) rethrow;
      throw CostSubmissionException('Failed to cancel cost submission: $e');
    }
  }

  /// Delete a cost submission (only if pending or cancelled)
  Future<void> deleteCostSubmission(String id) async {
    try {
      final existing = await getCostSubmissionById(id);
      if (existing == null) {
        throw CostSubmissionException('Cost submission not found');
      }
      if (existing.status != CostSubmissionStatus.pending &&
          existing.status != CostSubmissionStatus.cancelled) {
        throw CostSubmissionException(
          'Cannot delete submission with status: ${existing.statusLabel}',
        );
      }

      await _supabase
          .from('site_visit_cost_submissions')
          .delete()
          .eq('id', id);
    } catch (e) {
      if (e is CostSubmissionException) rethrow;
      throw CostSubmissionException('Failed to delete cost submission: $e');
    }
  }

  /// Watch cost submissions for current user (real-time)
  Stream<List<CostSubmission>> watchUserCostSubmissions(String userId) {
    return _supabase
        .from('site_visit_cost_submissions')
        .stream(primaryKey: ['id'])
        .eq('submitted_by', userId)
        .order('submitted_at', ascending: false)
        .map((data) => data.map((json) => CostSubmission.fromJson(json)).toList());
  }

  /// Get cost submission statistics
  Future<CostSubmissionStats> getCostSubmissionStats(String userId) async {
    try {
      final submissions = await getUserCostSubmissions(userId);

      int pendingCount = 0;
      int approvedCount = 0;
      int paidCount = 0;
      int rejectedCount = 0;
      int totalPendingAmountCents = 0;
      int totalApprovedAmountCents = 0;
      int totalPaidAmountCents = 0;

      for (final submission in submissions) {
        switch (submission.status) {
          case CostSubmissionStatus.pending:
          case CostSubmissionStatus.underReview:
            pendingCount++;
            totalPendingAmountCents += submission.totalCostCents;
            break;
          case CostSubmissionStatus.approved:
            approvedCount++;
            totalApprovedAmountCents += submission.totalCostCents;
            break;
          case CostSubmissionStatus.paid:
            paidCount++;
            totalPaidAmountCents += submission.paidAmountCents ?? submission.totalCostCents;
            break;
          case CostSubmissionStatus.rejected:
            rejectedCount++;
            break;
          case CostSubmissionStatus.cancelled:
            break;
        }
      }

      return CostSubmissionStats(
        totalSubmissions: submissions.length,
        pendingCount: pendingCount,
        approvedCount: approvedCount,
        paidCount: paidCount,
        rejectedCount: rejectedCount,
        totalPendingAmountCents: totalPendingAmountCents,
        totalApprovedAmountCents: totalApprovedAmountCents,
        totalPaidAmountCents: totalPaidAmountCents,
      );
    } catch (e) {
      throw CostSubmissionException('Failed to calculate statistics: $e');
    }
  }

  /// Search cost submissions
  Future<List<CostSubmission>> searchCostSubmissions(
    String userId,
    String query,
  ) async {
    try {
      // Search by site visit ID or submission notes
      final response = await _supabase
          .from('site_visit_cost_submissions')
          .select()
          .eq('submitted_by', userId)
          .or('site_visit_id.ilike.%$query%,submission_notes.ilike.%$query%')
          .order('submitted_at', ascending: false);

      return (response as List)
          .map((json) => CostSubmission.fromJson(json))
          .toList();
    } catch (e) {
      throw CostSubmissionException('Failed to search cost submissions: $e');
    }
  }

  /// Get cost submissions by date range
  Future<List<CostSubmission>> getCostSubmissionsByDateRange(
    String userId,
    DateTime startDate,
    DateTime endDate,
  ) async {
    try {
      final response = await _supabase
          .from('site_visit_cost_submissions')
          .select()
          .eq('submitted_by', userId)
          .gte('submitted_at', startDate.toIso8601String())
          .lte('submitted_at', endDate.toIso8601String())
          .order('submitted_at', ascending: false);

      return (response as List)
          .map((json) => CostSubmission.fromJson(json))
          .toList();
    } catch (e) {
      throw CostSubmissionException('Failed to fetch cost submissions: $e');
    }
  }

  /// Review cost submission (approve/reject/request revision)
  Future<CostSubmission> reviewCostSubmission(
    ReviewCostSubmissionRequest request,
    String reviewerId,
  ) async {
    try {
      Map<String, dynamic> updateData = {
        'reviewed_by': reviewerId,
        'reviewed_at': DateTime.now().toIso8601String(),
        'updated_at': DateTime.now().toIso8601String(),
      };

      switch (request.action) {
        case ReviewAction.approve:
          updateData['status'] = 'approved';
          updateData['approval_notes'] = request.approvalNotes ?? request.reviewerNotes;
          updateData['reviewer_notes'] = request.reviewerNotes;
          break;

        case ReviewAction.reject:
          updateData['status'] = 'rejected';
          updateData['reviewer_notes'] = request.reviewerNotes;
          break;

        case ReviewAction.requestRevision:
          updateData['status'] = 'under_review';
          updateData['revision_requested'] = true;
          updateData['revision_notes'] = request.revisionNotes ?? request.reviewerNotes;
          updateData['reviewer_notes'] = request.reviewerNotes;
          break;
      }

      final response = await _supabase
          .from('site_visit_cost_submissions')
          .update(updateData)
          .eq('id', request.submissionId)
          .select()
          .single();

      return CostSubmission.fromJson(response);
    } catch (e) {
      throw CostSubmissionException('Failed to review cost submission: $e');
    }
  }

  /// Get approval history for a submission
  Future<List<CostApprovalHistory>> getApprovalHistory(String submissionId) async {
    try {
      final response = await _supabase
          .rpc('get_cost_submission_history', params: {
        'submission_id_param': submissionId,
      });

      return (response as List)
          .map((json) => CostApprovalHistory.fromJson(json))
          .toList();
    } catch (e) {
      throw CostSubmissionException('Failed to fetch approval history: $e');
    }
  }

  /// Get submissions requiring revision
  Future<List<CostSubmission>> getRevisionRequested(String userId) async {
    try {
      final response = await _supabase
          .from('site_visit_cost_submissions')
          .select()
          .eq('submitted_by', userId)
          .eq('status', 'under_review')
          .eq('revision_requested', true)
          .order('submitted_at', ascending: false);

      return (response as List)
          .map((json) => CostSubmission.fromJson(json))
          .toList();
    } catch (e) {
      throw CostSubmissionException('Failed to fetch revision requests: $e');
    }
  }

  // ============================================================================
  // ATOMIC RPC OPERATIONS (Payment processing)
  // ============================================================================

  /// Pay cost submission using atomic RPC - prevents double-payment
  /// This uses the database RPC function that:
  /// 1. Locks the cost submission
  /// 2. Verifies it's approved
  /// 3. Creates wallet transaction
  /// 4. Updates wallet balance
  /// 5. Marks cost as paid
  /// All in one atomic transaction with proper locking
  Future<Map<String, dynamic>> payCostSubmission({
    required String costSubmissionId,
    required String adminId,
    String? notes,
  }) async {
    try {
      final response = await _supabase.rpc(
        'rpc_pay_cost_submission',
        params: {
          'in_cost_submission_id': costSubmissionId,
          'in_admin_id': adminId,
          'in_notes': notes,
        },
      ).select().single();

      // Response format: {success: bool, error_text: text, transaction_id: uuid}
      if (response['success'] == true) {
        return {
          'success': true,
          'transaction_id': response['transaction_id'],
        };
      } else {
        throw CostSubmissionException(
          response['error_text'] ?? 'Payment failed',
        );
      }
    } catch (e) {
      if (e is CostSubmissionException) rethrow;
      throw CostSubmissionException('Failed to pay cost submission: $e');
    }
  }

  /// Batch pay multiple approved cost submissions
  /// Calls the atomic RPC for each submission
  Future<Map<String, dynamic>> batchPayCostSubmissions({
    required List<String> costSubmissionIds,
    required String adminId,
    String? notes,
  }) async {
    final results = <String, dynamic>{
      'success_count': 0,
      'failure_count': 0,
      'errors': <Map<String, String>>[],
      'transaction_ids': <String>[],
    };

    for (final id in costSubmissionIds) {
      try {
        final result = await payCostSubmission(
          costSubmissionId: id,
          adminId: adminId,
          notes: notes,
        );
        results['success_count'] = (results['success_count'] as int) + 1;
        results['transaction_ids'] = [
          ...(results['transaction_ids'] as List<String>),
          result['transaction_id'] as String,
        ];
      } catch (e) {
        results['failure_count'] = (results['failure_count'] as int) + 1;
        results['errors'] = [
          ...(results['errors'] as List<Map<String, String>>),
          {'id': id, 'error': e.toString()},
        ];
      }
    }

    return results;
  }
}

