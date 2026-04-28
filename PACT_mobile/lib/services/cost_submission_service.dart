import 'dart:io';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/cost_submission.dart';

/// Cost Submission Service - Matches React implementation
///
/// Handles cost submission operations with the same API as React:
/// - Table: operational_cost_submissions
/// - 3-tier approval workflow (Tier1 → Tier2 → Tier3)
/// - Group-based updates via request_group_id
/// - Reconciliation tracking (status: 'reconciled')
/// - Approval history tracking via cost_approval_history
/// - Real-time subscriptions

class CostSubmissionService {
  final SupabaseClient _supabase;

  CostSubmissionService(this._supabase);

  // Get current user ID
  String? get currentUserId => _supabase.auth.currentUser?.id;

  /// Fetch all cost submissions (matches React fetchOperationalCosts).
  /// When [fetchAll] is true, tries the RPC first then falls back to direct query.
  Future<List<OperationalCostSubmission>> fetchCostSubmissions({
    bool fetchAll = false,
  }) async {
    try {
      if (fetchAll) {
        try {
          final rpcResult = await _supabase.rpc(
            'get_all_operational_cost_submissions',
          );
          if (rpcResult != null) {
            return (rpcResult as List)
                .map((json) => OperationalCostSubmission.fromJson(json))
                .toList();
          }
        } catch (_) {
          // RPC not available – fall through to direct query
        }
      }
      final response = await _supabase
          .from('operational_cost_submissions')
          .select()
          .order('created_at', ascending: false);

      return (response as List)
          .map((json) => OperationalCostSubmission.fromJson(json))
          .toList();
    } catch (e) {
      print('Error fetching cost submissions: $e');
      rethrow;
    }
  }

  /// Fetch cost submission by ID (matches React fetchCostSubmissionById)
  Future<OperationalCostSubmission?> fetchCostSubmissionById(String id) async {
    try {
      final response = await _supabase
          .from('operational_cost_submissions')
          .select()
          .eq('id', id)
          .single();

      return OperationalCostSubmission.fromJson(response);
    } catch (e) {
      print('Error fetching submission by ID: $e');
      return null;
    }
  }

  /// Fetch user's cost submissions (matches React fetchUserCostSubmissions)
  Future<List<OperationalCostSubmission>> fetchUserCostSubmissions(
    String userId,
  ) async {
    try {
      final response = await _supabase
          .from('operational_cost_submissions')
          .select()
          .eq('submitted_by', userId)
          .order('created_at', ascending: false);

      return (response as List)
          .map((json) => OperationalCostSubmission.fromJson(json))
          .toList();
    } catch (e) {
      print('Error fetching user submissions: $e');
      return [];
    }
  }

  /// Fetch pending approvals (matches React fetchPendingApprovals)
  Future<List<Map<String, dynamic>>> fetchPendingApprovals() async {
    try {
      final response = await _supabase
          .from('operational_cost_submissions')
          .select('''
            *,
            profiles:submitted_by(full_name, email)
          ''')
          .inFilter('status', ['pending', 'under_review', 'approved'])
          .order('created_at', ascending: false);

      return List<Map<String, dynamic>>.from(response as List);
    } catch (e) {
      print('Error fetching pending approvals: $e');
      return [];
    }
  }

  /// Fetch approval history for a submission (matches React fetchSubmissionHistory)
  Future<List<Map<String, dynamic>>> fetchSubmissionHistory(
    String submissionId,
  ) async {
    try {
      final response = await _supabase
          .from('cost_approval_history')
          .select('''
            *,
            profiles:reviewed_by(full_name, email)
          ''')
          .eq('submission_id', submissionId)
          .order('created_at', ascending: false);

      return List<Map<String, dynamic>>.from(response as List);
    } catch (e) {
      print('Error fetching submission history: $e');
      return [];
    }
  }

  /// Fetch user summary (matches React fetchUserSummary)
  Future<Map<String, dynamic>?> fetchUserSummary(String userId) async {
    try {
      final submissions = await fetchUserCostSubmissions(userId);

      int totalSubmissions = submissions.length;
      int approved = submissions
          .where((s) => s.status == CostSubmissionStatus.approved)
          .length;
      int pending = submissions
          .where((s) => s.status == CostSubmissionStatus.pending)
          .length;
      int rejected = submissions
          .where((s) => s.status == CostSubmissionStatus.rejected)
          .length;

      int totalAmountCents = submissions.fold(
        0,
        (sum, s) => sum + s.amountCents,
      );
      int approvedAmountCents = submissions
          .where((s) => s.status == CostSubmissionStatus.approved)
          .fold(0, (sum, s) => sum + s.amountCents);

      return {
        'userId': userId,
        'totalSubmissions': totalSubmissions,
        'approvedCount': approved,
        'pendingCount': pending,
        'rejectedCount': rejected,
        'totalAmountCents': totalAmountCents,
        'approvedAmountCents': approvedAmountCents,
      };
    } catch (e) {
      print('Error fetching user summary: $e');
      return null;
    }
  }

  /// Fetch MMP summary (matches React fetchMMPSummary)
  Future<Map<String, dynamic>?> fetchMMPSummary(String mmpFileId) async {
    try {
      final response = await _supabase
          .from('operational_cost_submissions')
          .select()
          .eq('mmp_file_id', mmpFileId);

      final submissions = (response as List)
          .map((json) => OperationalCostSubmission.fromJson(json))
          .toList();

      int totalSubmissions = submissions.length;
      int totalAmountCents = submissions.fold(
        0,
        (sum, s) => sum + s.amountCents,
      );

      return {
        'mmpFileId': mmpFileId,
        'totalSubmissions': totalSubmissions,
        'totalAmountCents': totalAmountCents,
      };
    } catch (e) {
      print('Error fetching MMP summary: $e');
      return null;
    }
  }

  /// Create cost submission (matches React createCostSubmission)
  Future<OperationalCostSubmission?> createCostSubmission({
    required Map<String, dynamic> request,
  }) async {
    if (currentUserId == null) {
      throw Exception('User not authenticated');
    }

    try {
      final now = DateTime.now().toIso8601String();

      final data = {
        ...request,
        'submitted_by': currentUserId,
        'submitted_at': now,
        'status': 'pending',
        'tier1_status': 'pending',
        'tier2_status': 'pending',
        'created_at': now,
        'updated_at': now,
      };

      final response = await _supabase
          .from('operational_cost_submissions')
          .insert(data)
          .select()
          .single();

      return OperationalCostSubmission.fromJson(response);
    } catch (e) {
      print('Error creating cost submission: $e');
      rethrow;
    }
  }

  /// Update cost submission (matches React updateCostSubmission)
  Future<void> updateCostSubmission(
    String id,
    Map<String, dynamic> updates,
  ) async {
    try {
      await _supabase
          .from('operational_cost_submissions')
          .update({...updates, 'updated_at': DateTime.now().toIso8601String()})
          .eq('id', id);
    } catch (e) {
      print('Error updating cost submission: $e');
      rethrow;
    }
  }

  /// Review (approve or reject) at a specific tier.
  /// Mirrors React's processApproval exactly.
  ///
  /// [tier] — 1, 2, or 3
  /// [action] — 'approve' | 'reject'
  /// [isFinalTier] — when true an approval sets status to 'approved'
  /// [requestGroupId] — when set, updates all items in the group
  Future<void> reviewTier({
    required String submissionId,
    required String action,
    required int tier,
    String? notes,
    bool isFinalTier = false,
    String? requestGroupId,
  }) async {
    if (currentUserId == null) {
      throw Exception('User not authenticated');
    }

    try {
      final now = DateTime.now().toIso8601String();
      final Map<String, dynamic> updates = {};

      if (tier == 1) {
        updates['tier1_status'] = action == 'approve' ? 'approved' : 'rejected';
        updates['tier1_approved_by'] = currentUserId;
        updates['tier1_approved_at'] = now;
        updates['tier1_notes'] = notes;
        if (action == 'approve') {
          updates['status'] = 'under_review';
        } else {
          updates['status'] = 'rejected';
          updates['rejection_reason'] = notes ?? 'Rejected at Tier 1';
        }
      } else if (tier == 2) {
        updates['tier2_status'] = action == 'approve' ? 'approved' : 'rejected';
        updates['tier2_approved_by'] = currentUserId;
        updates['tier2_approved_at'] = now;
        updates['tier2_notes'] = notes;
        if (action == 'approve') {
          updates['status'] = isFinalTier ? 'approved' : 'under_review';
        } else {
          updates['status'] = 'rejected';
          updates['rejection_reason'] = notes ?? 'Rejected at Tier 2';
        }
      } else if (tier == 3) {
        updates['tier3_status'] = action == 'approve' ? 'approved' : 'rejected';
        updates['tier3_approved_by'] = currentUserId;
        updates['tier3_approved_at'] = now;
        updates['tier3_notes'] = notes;
        if (action == 'approve') {
          updates['status'] = 'approved';
        } else {
          updates['status'] = 'rejected';
          updates['rejection_reason'] = notes ?? 'Rejected at Tier 3';
        }
      }

      updates['updated_at'] = now;

      // Apply to all items in the group, or just the single submission
      if (requestGroupId != null) {
        var query = _supabase
            .from('operational_cost_submissions')
            .update(updates)
            .eq('request_group_id', requestGroupId);
        if (tier == 1) query = query.eq('tier1_status', 'pending');
        if (tier == 2) query = query.eq('tier2_status', 'pending');
        if (tier == 3) query = query.eq('tier3_status', 'pending');
        await query;
      } else {
        await _supabase
            .from('operational_cost_submissions')
            .update(updates)
            .eq('id', submissionId);
      }
    } catch (e) {
      print('Error reviewing tier $tier: $e');
      rethrow;
    }
  }

  /// Convenience wrapper — approve a tier (calls [reviewTier] with action='approve')
  Future<void> approveSubmission({
    required String submissionId,
    required int tier,
    String? notes,
    bool isFinalTier = false,
    String? requestGroupId,
  }) => reviewTier(
    submissionId: submissionId,
    action: 'approve',
    tier: tier,
    notes: notes,
    isFinalTier: isFinalTier,
    requestGroupId: requestGroupId,
  );

  /// Convenience wrapper — reject a tier (calls [reviewTier] with action='reject')
  Future<void> rejectSubmission({
    required String submissionId,
    required int tier,
    String? notes,
    String? requestGroupId,
  }) => reviewTier(
    submissionId: submissionId,
    action: 'reject',
    tier: tier,
    notes: notes,
    requestGroupId: requestGroupId,
  );

  /// Mark cost submission as paid (matches React handleMarkAsPaid)
  Future<void> markCostSubmissionPaid({
    required String submissionId,
    String? walletTransactionId,
    int? paidAmountCents,
  }) async {
    if (currentUserId == null) {
      throw Exception('User not authenticated');
    }

    try {
      final now = DateTime.now().toIso8601String();

      await _supabase
          .from('operational_cost_submissions')
          .update({
            'status': 'paid',
            'paid_at': now,
            'paid_by': currentUserId,
            'updated_at': now,
            'wallet_transaction_id': ?walletTransactionId,
            'paid_amount_cents': ?paidAmountCents,
          })
          .eq('id', submissionId);
    } catch (e) {
      print('Error marking submission as paid: $e');
      rethrow;
    }
  }

  /// Reconcile an advance payment (matches React reconcile action)
  Future<void> reconcileSubmission({
    required String submissionId,
    required int actualAmountCents,
    String? reconciliationNotes,
  }) async {
    if (currentUserId == null) {
      throw Exception('User not authenticated');
    }

    try {
      final now = DateTime.now().toIso8601String();

      await _supabase
          .from('operational_cost_submissions')
          .update({
            'status': 'reconciled',
            'reconciled_at': now,
            'reconciled_by': currentUserId,
            'reconciled_amount_cents': actualAmountCents,
            'reconciliation_notes': reconciliationNotes,
            'updated_at': now,
          })
          .eq('id', submissionId);
    } catch (e) {
      print('Error reconciling submission: $e');
      rethrow;
    }
  }

  /// Resubmit a rejected submission — resets all tier statuses
  /// (matches React recallConfirm action)
  Future<void> resubmitRejected(String id) async {
    if (currentUserId == null) {
      throw Exception('User not authenticated');
    }

    try {
      await _supabase
          .from('operational_cost_submissions')
          .update({
            'status': 'pending',
            'tier1_status': null,
            'tier1_approved_by': null,
            'tier1_approved_at': null,
            'tier1_notes': null,
            'tier2_status': null,
            'tier2_approved_by': null,
            'tier2_approved_at': null,
            'tier2_notes': null,
            'tier3_status': null,
            'tier3_approved_by': null,
            'tier3_approved_at': null,
            'tier3_notes': null,
            'rejection_reason': null,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', id);
    } catch (e) {
      print('Error resubmitting rejected submission: $e');
      rethrow;
    }
  }

  /// Cancel cost submission (matches React cancelCostSubmission)
  Future<void> cancelCostSubmission(String id) async {
    if (currentUserId == null) {
      throw Exception('User not authenticated');
    }

    try {
      await _supabase
          .from('operational_cost_submissions')
          .update({
            'status': 'cancelled',
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', id)
          .eq('submitted_by', currentUserId!); // Only submitter can cancel
    } catch (e) {
      print('Error cancelling cost submission: $e');
      rethrow;
    }
  }

  /// Delete cost submission (matches React deleteCostSubmission)
  Future<void> deleteCostSubmission(String id) async {
    if (currentUserId == null) {
      throw Exception('User not authenticated');
    }

    try {
      await _supabase
          .from('operational_cost_submissions')
          .delete()
          .eq('id', id)
          .eq('submitted_by', currentUserId!); // Only submitter can delete
    } catch (e) {
      print('Error deleting cost submission: $e');
      rethrow;
    }
  }

  /// Upload a supporting document
  Future<Map<String, dynamic>> uploadDocument({
    required String filePath,
    required String filename,
    required String type,
    String? description,
  }) async {
    if (currentUserId == null) {
      throw Exception('User not authenticated');
    }

    try {
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final storagePath = 'cost-documents/$currentUserId/$timestamp-$filename';

      // Upload to Supabase Storage using File object
      final file = File(filePath);
      await _supabase.storage
          .from('documents')
          .upload(
            storagePath,
            file,
            fileOptions: const FileOptions(cacheControl: '3600', upsert: false),
          );

      // Get public URL
      final publicUrl = _supabase.storage
          .from('documents')
          .getPublicUrl(storagePath);

      return {
        'url': publicUrl,
        'fileUrl': publicUrl,
        'type': type,
        'fileName': filename,
        'filename': filename,
        'uploadedAt': DateTime.now().toIso8601String(),
        'description': description,
      };
    } catch (e) {
      print('Error uploading document: $e');
      rethrow;
    }
  }

  /// Subscribe to real-time cost submission changes (matches React realtime subscriptions)
  RealtimeChannel subscribeToChanges({required void Function() onUpdate}) {
    return _supabase
        .channel('cost_flow_changes')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'operational_cost_submissions',
          callback: (payload) => onUpdate(),
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'cost_approval_history',
          callback: (payload) => onUpdate(),
        )
        .subscribe();
  }

  /// Unsubscribe from real-time updates
  Future<void> unsubscribe(RealtimeChannel channel) async {
    await _supabase.removeChannel(channel);
  }

  /// Get submission statistics
  Future<CostSubmissionStats> getSubmissionStats({String? userId}) async {
    try {
      final submissions = userId != null
          ? await fetchUserCostSubmissions(userId)
          : await fetchCostSubmissions(fetchAll: true);

      return CostSubmissionStats.fromSubmissions(submissions);
    } catch (e) {
      print('Error getting submission stats: $e');
      return CostSubmissionStats.empty();
    }
  }

  // Legacy methods for backward compatibility (will be deprecated)

  /// Submit a new operational cost (backward compatibility wrapper)
  Future<OperationalCostSubmission?> submitOperationalCost({
    required OperationalExpenseCategory expenseCategory,
    required int amountCents,
    required String description,
    required String expenseDate,
    String? hubId,
    String? projectId,
    String? vendor,
    String? referenceNumber,
    String currency = 'SDG',
    required List<SupportingDocument> supportingDocuments,
    required String submitterRole,
  }) async {
    if (currentUserId == null) {
      throw Exception('User not authenticated');
    }

    if (supportingDocuments.isEmpty) {
      throw Exception('At least one supporting document is required');
    }

    final request = {
      'expense_category': expenseCategory.value,
      'amount_cents': amountCents,
      'currency': currency,
      'description': description,
      'expense_date': expenseDate,
      'vendor': vendor,
      'reference_number': referenceNumber,
      'hub_id': hubId,
      'project_id': projectId,
      'submitter_role': submitterRole,
      'supporting_documents': supportingDocuments
          .map((d) => d.toJson())
          .toList(),
    };

    return createCostSubmission(request: request);
  }

  @deprecated
  Future<List<OperationalCostSubmission>> getUserSubmissions() async {
    if (currentUserId == null) return [];
    return fetchUserCostSubmissions(currentUserId!);
  }

  @deprecated
  Future<List<OperationalCostSubmission>> getAllSubmissions({
    String? hubId,
    String? projectId,
    CostSubmissionStatus? status,
  }) async {
    return fetchCostSubmissions(fetchAll: true);
  }

  @deprecated
  Future<List<OperationalCostSubmission>> getPendingApprovals({
    required int tier,
    String? hubId,
  }) async {
    final approvals = await fetchPendingApprovals();
    return approvals
        .map((json) => OperationalCostSubmission.fromJson(json))
        .toList();
  }

  /// @deprecated — use [reviewTier] instead.
  @deprecated
  Future<void> reviewCostSubmission({
    required String submissionId,
    required String action, // 'approve' | 'reject'
    String? comments,
    int? adjustedAmountCents,
  }) async {
    await reviewTier(
      submissionId: submissionId,
      action: action == 'approve' ? 'approve' : 'reject',
      tier: 1,
      notes: comments,
    );
  }
}
