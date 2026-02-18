import 'dart:io';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/cost_submission.dart';

/// Cost Submission Service - Matches React implementation
///
/// Handles cost submission operations with the same API as React:
/// - Table: site_visit_cost_submissions (not operational_cost_submissions)
/// - Approval history tracking via cost_approval_history
/// - Real-time subscriptions
/// - Payment integration with wallet_transactions

class CostSubmissionService {
  final SupabaseClient _supabase;

  CostSubmissionService(this._supabase);

  // Get current user ID
  String? get currentUserId => _supabase.auth.currentUser?.id;

  /// Fetch all cost submissions (matches React fetchCostSubmissions)
  Future<List<OperationalCostSubmission>> fetchCostSubmissions() async {
    try {
      final response = await _supabase
          .from('site_visit_cost_submissions')
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
          .from('site_visit_cost_submissions')
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
          .from('site_visit_cost_submissions')
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
          .from('site_visit_cost_submissions')
          .select('''
            *,
            site_visits(id, site_name, state, locality),
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

  /// Fetch submission history (matches React fetchSubmissionHistory)
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
        (sum, s) => sum + (s.amountCents ?? 0),
      );
      int approvedAmountCents = submissions
          .where((s) => s.status == CostSubmissionStatus.approved)
          .fold(0, (sum, s) => sum + (s.amountCents ?? 0));

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
          .from('site_visit_cost_submissions')
          .select()
          .eq('mmp_file_id', mmpFileId);

      final submissions = (response as List)
          .map((json) => OperationalCostSubmission.fromJson(json))
          .toList();

      int totalSubmissions = submissions.length;
      int totalAmountCents = submissions.fold(
        0,
        (sum, s) => sum + (s.amountCents ?? 0),
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
        'created_at': now,
      };

      final response = await _supabase
          .from('site_visit_cost_submissions')
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
          .from('site_visit_cost_submissions')
          .update(updates)
          .eq('id', id);
    } catch (e) {
      print('Error updating cost submission: $e');
      rethrow;
    }
  }

  /// Review cost submission (matches React reviewCostSubmission)
  Future<void> reviewCostSubmission({
    required String submissionId,
    required String action, // 'approve', 'reject', 'request_changes'
    String? comments,
    int? adjustedAmountCents,
  }) async {
    if (currentUserId == null) {
      throw Exception('User not authenticated');
    }

    try {
      final now = DateTime.now().toIso8601String();

      // Update submission status
      Map<String, dynamic> updates = {
        'reviewed_at': now,
        'reviewed_by': currentUserId,
        'review_comments': comments,
      };

      if (action == 'approve') {
        updates['status'] = 'approved';
        if (adjustedAmountCents != null) {
          updates['approved_amount_cents'] = adjustedAmountCents;
        }
      } else if (action == 'reject') {
        updates['status'] = 'rejected';
      } else if (action == 'request_changes') {
        updates['status'] = 'changes_requested';
      }

      await _supabase
          .from('site_visit_cost_submissions')
          .update(updates)
          .eq('id', submissionId);

      // Record in approval history
      await _supabase.from('cost_approval_history').insert({
        'submission_id': submissionId,
        'reviewed_by': currentUserId,
        'action': action,
        'comments': comments,
        'adjusted_amount_cents': adjustedAmountCents,
        'created_at': now,
      });
    } catch (e) {
      print('Error reviewing cost submission: $e');
      rethrow;
    }
  }

  /// Mark cost submission as paid (matches React markCostSubmissionPaid)
  Future<void> markCostSubmissionPaid({
    required String submissionId,
    required String walletTransactionId,
    int? paidAmountCents,
  }) async {
    try {
      final now = DateTime.now().toIso8601String();

      await _supabase
          .from('site_visit_cost_submissions')
          .update({
            'status': 'disbursed',
            'paid_at': now,
            'wallet_transaction_id': walletTransactionId,
            if (paidAmountCents != null) 'paid_amount_cents': paidAmountCents,
          })
          .eq('id', submissionId);
    } catch (e) {
      print('Error marking submission as paid: $e');
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
          .from('site_visit_cost_submissions')
          .update({
            'status': 'cancelled',
            'cancelled_at': DateTime.now().toIso8601String(),
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
          .from('site_visit_cost_submissions')
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
          table: 'site_visit_cost_submissions',
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
          : await fetchCostSubmissions();

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
    return fetchCostSubmissions();
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
}
