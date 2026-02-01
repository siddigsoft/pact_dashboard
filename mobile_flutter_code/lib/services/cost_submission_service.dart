import 'dart:io';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/cost_submission.dart';

/// Cost Submission Service for PACT Mobile App
/// 
/// Handles all cost submission operations including:
/// - Creating new submissions
/// - Fetching user submissions
/// - Fetching submission history
/// - Uploading supporting documents
/// - Reconciliation submissions

class CostSubmissionService {
  final SupabaseClient _supabase;

  CostSubmissionService(this._supabase);

  // Get current user ID
  String? get currentUserId => _supabase.auth.currentUser?.id;

  /// Fetch all operational cost submissions for current user
  Future<List<OperationalCostSubmission>> getUserSubmissions() async {
    if (currentUserId == null) return [];

    try {
      final response = await _supabase
          .from('operational_cost_submissions')
          .select()
          .eq('submitted_by', currentUserId!)
          .order('created_at', ascending: false);

      return (response as List)
          .map((json) => OperationalCostSubmission.fromJson(json))
          .toList();
    } catch (e) {
      print('Error fetching user submissions: $e');
      return [];
    }
  }

  /// Fetch all submissions (for admins/supervisors)
  Future<List<OperationalCostSubmission>> getAllSubmissions({
    String? hubId,
    String? projectId,
    CostSubmissionStatus? status,
  }) async {
    try {
      var query = _supabase.from('operational_cost_submissions').select();

      if (hubId != null) {
        query = query.eq('hub_id', hubId);
      }
      if (projectId != null) {
        query = query.eq('project_id', projectId);
      }
      if (status != null) {
        query = query.eq('status', status.value);
      }

      final response = await query.order('created_at', ascending: false);

      return (response as List)
          .map((json) => OperationalCostSubmission.fromJson(json))
          .toList();
    } catch (e) {
      print('Error fetching all submissions: $e');
      return [];
    }
  }

  /// Fetch pending submissions for approval (Tier 1 or Tier 2)
  Future<List<OperationalCostSubmission>> getPendingApprovals({
    required int tier,
    String? hubId,
  }) async {
    try {
      var query = _supabase.from('operational_cost_submissions').select();

      if (tier == 1) {
        query = query.eq('tier1_status', 'pending');
      } else {
        query = query
            .eq('tier1_status', 'approved')
            .eq('tier2_status', 'pending');
      }

      if (hubId != null) {
        query = query.eq('hub_id', hubId);
      }

      final response = await query.order('created_at', ascending: false);

      return (response as List)
          .map((json) => OperationalCostSubmission.fromJson(json))
          .toList();
    } catch (e) {
      print('Error fetching pending approvals: $e');
      return [];
    }
  }

  /// Submit a new operational cost
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

    try {
      final now = DateTime.now().toIso8601String();
      
      final response = await _supabase
          .from('operational_cost_submissions')
          .insert({
            'expense_category': expenseCategory.value,
            'amount_cents': amountCents,
            'currency': currency,
            'description': description,
            'expense_date': expenseDate,
            'vendor': vendor,
            'reference_number': referenceNumber,
            'hub_id': hubId,
            'project_id': projectId,
            'submitted_by': currentUserId,
            'submitted_at': now,
            'submitter_role': submitterRole,
            'supporting_documents': supportingDocuments.map((d) => d.toJson()).toList(),
            'status': 'pending',
            'tier1_status': 'pending',
            'tier2_status': 'pending',
          })
          .select()
          .single();

      return OperationalCostSubmission.fromJson(response);
    } catch (e) {
      print('Error submitting operational cost: $e');
      rethrow;
    }
  }

  /// Upload a supporting document
  Future<SupportingDocument?> uploadDocument({
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
      await _supabase.storage.from('documents').upload(
        storagePath,
        file,
        fileOptions: const FileOptions(cacheControl: '3600', upsert: false),
      );

      // Get public URL
      final publicUrl = _supabase.storage
          .from('documents')
          .getPublicUrl(storagePath);

      return SupportingDocument(
        url: publicUrl,
        type: type,
        filename: filename,
        uploadedAt: DateTime.now().toIso8601String(),
        description: description,
      );
    } catch (e) {
      print('Error uploading document: $e');
      rethrow;
    }
  }

  /// Approve a submission (Tier 1 or Tier 2)
  Future<bool> approveSubmission({
    required String submissionId,
    required int tier,
    String? notes,
    int? adjustedAmountCents,
  }) async {
    if (currentUserId == null) return false;

    try {
      final now = DateTime.now().toIso8601String();
      Map<String, dynamic> updates = {};

      if (tier == 1) {
        updates = {
          'tier1_status': 'approved',
          'tier1_reviewed_by': currentUserId,
          'tier1_reviewed_at': now,
          'tier1_notes': notes,
          'status': 'under_review', // Moves to Tier 2
        };
      } else {
        updates = {
          'tier2_status': 'approved',
          'tier2_reviewed_by': currentUserId,
          'tier2_reviewed_at': now,
          'tier2_notes': notes,
          'status': 'approved',
        };
        if (adjustedAmountCents != null) {
          updates['amount_cents'] = adjustedAmountCents;
        }
      }

      await _supabase
          .from('operational_cost_submissions')
          .update(updates)
          .eq('id', submissionId);

      return true;
    } catch (e) {
      print('Error approving submission: $e');
      return false;
    }
  }

  /// Reject a submission (Tier 1 or Tier 2)
  Future<bool> rejectSubmission({
    required String submissionId,
    required int tier,
    required String notes,
  }) async {
    if (currentUserId == null) return false;

    try {
      final now = DateTime.now().toIso8601String();
      Map<String, dynamic> updates = {};

      if (tier == 1) {
        updates = {
          'tier1_status': 'rejected',
          'tier1_reviewed_by': currentUserId,
          'tier1_reviewed_at': now,
          'tier1_notes': notes,
          'status': 'rejected',
        };
      } else {
        updates = {
          'tier2_status': 'rejected',
          'tier2_reviewed_by': currentUserId,
          'tier2_reviewed_at': now,
          'tier2_notes': notes,
          'status': 'rejected',
        };
      }

      await _supabase
          .from('operational_cost_submissions')
          .update(updates)
          .eq('id', submissionId);

      return true;
    } catch (e) {
      print('Error rejecting submission: $e');
      return false;
    }
  }

  /// Request changes for a submission
  Future<bool> requestChanges({
    required String submissionId,
    required String notes,
  }) async {
    if (currentUserId == null) return false;

    try {
      final now = DateTime.now().toIso8601String();

      await _supabase
          .from('operational_cost_submissions')
          .update({
            'tier1_status': 'changes_requested',
            'tier1_reviewed_by': currentUserId,
            'tier1_reviewed_at': now,
            'tier1_notes': notes,
            'status': 'pending', // Back to pending for resubmission
          })
          .eq('id', submissionId);

      return true;
    } catch (e) {
      print('Error requesting changes: $e');
      return false;
    }
  }

  /// Mark submission as paid
  Future<bool> markAsPaid({
    required String submissionId,
    required int paidAmountCents,
    String? paymentNotes,
    String? walletTransactionId,
  }) async {
    if (currentUserId == null) return false;

    try {
      final now = DateTime.now().toIso8601String();

      await _supabase
          .from('operational_cost_submissions')
          .update({
            'status': 'paid',
            'paid_at': now,
            'paid_amount_cents': paidAmountCents,
            'payment_notes': paymentNotes,
            'wallet_transaction_id': walletTransactionId,
          })
          .eq('id', submissionId);

      return true;
    } catch (e) {
      print('Error marking as paid: $e');
      return false;
    }
  }

  /// Cancel a submission (only if pending)
  Future<bool> cancelSubmission(String submissionId) async {
    if (currentUserId == null) return false;

    try {
      await _supabase
          .from('operational_cost_submissions')
          .update({'status': 'cancelled'})
          .eq('id', submissionId)
          .eq('submitted_by', currentUserId!) // Only submitter can cancel
          .eq('status', 'pending'); // Only pending can be cancelled

      return true;
    } catch (e) {
      print('Error cancelling submission: $e');
      return false;
    }
  }

  /// Get submission statistics
  Future<CostSubmissionStats> getSubmissionStats({String? userId}) async {
    try {
      var query = _supabase.from('operational_cost_submissions').select();
      
      if (userId != null) {
        query = query.eq('submitted_by', userId);
      }

      final response = await query;
      final submissions = (response as List)
          .map((json) => OperationalCostSubmission.fromJson(json))
          .toList();

      return CostSubmissionStats.fromSubmissions(submissions);
    } catch (e) {
      print('Error getting submission stats: $e');
      return CostSubmissionStats.empty();
    }
  }

  /// Subscribe to real-time updates for user's submissions
  RealtimeChannel subscribeToUserSubmissions(
    void Function(List<OperationalCostSubmission>) onUpdate,
  ) {
    return _supabase
        .channel('user_cost_submissions')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'operational_cost_submissions',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'submitted_by',
            value: currentUserId ?? '',
          ),
          callback: (payload) async {
            final submissions = await getUserSubmissions();
            onUpdate(submissions);
          },
        )
        .subscribe();
  }

  /// Unsubscribe from real-time updates
  Future<void> unsubscribe(RealtimeChannel channel) async {
    await _supabase.removeChannel(channel);
  }
}
