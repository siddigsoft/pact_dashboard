/// Operational Cost Service for Mobile App
/// Handles all Supabase operations for operational cost submissions
library;

import 'dart:async';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/operational_cost_submission.dart';

class OperationalCostService {
  static final OperationalCostService _instance =
      OperationalCostService._internal();
  factory OperationalCostService() => _instance;
  OperationalCostService._internal();

  final _supabase = Supabase.instance.client;

  StreamController<List<OperationalCostSubmission>>? _submissionsController;
  RealtimeChannel? _realtimeChannel;

  /// Get the current user ID
  String? get currentUserId => _supabase.auth.currentUser?.id;

  /// Get user permissions based on role
  Future<CostSubmissionPermissions> getUserPermissions() async {
    final userId = currentUserId;
    if (userId == null) {
      return CostSubmissionPermissions.fromRole(null);
    }

    try {
      final response = await _supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();

      return CostSubmissionPermissions.fromRole(response['role'] as String?);
    } catch (e) {
      print('Error getting user permissions: $e');
      return CostSubmissionPermissions.fromRole(null);
    }
  }

  /// Fetch all operational cost submissions for the current user
  Future<List<OperationalCostSubmission>> getUserSubmissions() async {
    final userId = currentUserId;
    if (userId == null) return [];

    try {
      final response = await _supabase
          .from('operational_cost_submissions')
          .select('''
            *,
            profiles:submitted_by(name, role),
            projects:project_id(name),
            hubs:hub_id(name)
          ''')
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

  /// Fetch all operational cost submissions (for admins/supervisors)
  Future<List<OperationalCostSubmission>> getAllSubmissions({
    String? hubId,
    String? projectId,
    OperationalCostStatus? status,
  }) async {
    try {
      var query = _supabase.from('operational_cost_submissions').select('''
            *,
            profiles:submitted_by(name, role),
            projects:project_id(name),
            hubs:hub_id(name)
          ''');

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

  /// Fetch team submissions for supervisors
  Future<List<OperationalCostSubmission>> getTeamSubmissions(
    String? hubId,
  ) async {
    if (hubId == null) return [];

    try {
      final response = await _supabase
          .from('operational_cost_submissions')
          .select('''
            *,
            profiles:submitted_by(name, role),
            projects:project_id(name),
            hubs:hub_id(name)
          ''')
          .eq('hub_id', hubId)
          .order('created_at', ascending: false);

      return (response as List)
          .map((json) => OperationalCostSubmission.fromJson(json))
          .toList();
    } catch (e) {
      print('Error fetching team submissions: $e');
      return [];
    }
  }

  /// Fetch outstanding advances (paid but not reconciled)
  Future<List<OperationalCostSubmission>> getOutstandingAdvances() async {
    final userId = currentUserId;
    if (userId == null) return [];

    try {
      final response = await _supabase
          .from('operational_cost_submissions')
          .select('''
            *,
            profiles:submitted_by(name, role),
            projects:project_id(name),
            hubs:hub_id(name)
          ''')
          .eq('submitted_by', userId)
          .eq('funding_type', 'advance')
          .eq('status', 'paid')
          .eq('is_reconciled', false)
          .order('created_at', ascending: false);

      return (response as List)
          .map((json) => OperationalCostSubmission.fromJson(json))
          .toList();
    } catch (e) {
      print('Error fetching outstanding advances: $e');
      return [];
    }
  }

  /// Submit a new operational cost request
  Future<OperationalCostSubmission?> submitCost({
    required ExpenseCategory expenseCategory,
    required FundingType fundingType,
    required double amount,
    required String currency,
    required String description,
    String? justification,
    String? expenseDate,
    String? vendor,
    String? referenceNumber,
    String? projectId,
    String? hubId,
    List<SupportingDocument>? supportingDocuments,
  }) async {
    final userId = currentUserId;
    if (userId == null) throw Exception('User not authenticated');

    try {
      final response = await _supabase
          .from('operational_cost_submissions')
          .insert({
            'submitted_by': userId,
            'expense_category': expenseCategory.dbValue,
            'funding_type': fundingType.value,
            'amount_cents': (amount * 100).round(),
            'currency': currency,
            'description': description,
            'justification': justification,
            'expense_date':
                expenseDate ?? DateTime.now().toIso8601String().split('T')[0],
            'vendor': vendor,
            'reference_number': referenceNumber,
            'project_id': projectId,
            'hub_id': hubId,
            'status': 'pending',
            'supporting_documents':
                supportingDocuments?.map((d) => d.toJson()).toList() ?? [],
            'requires_reconciliation': fundingType == FundingType.advance,
          })
          .select()
          .single();

      return OperationalCostSubmission.fromJson(response);
    } catch (e) {
      print('Error submitting cost: $e');
      rethrow;
    }
  }

  /// Update an existing submission (only if status is pending)
  Future<OperationalCostSubmission?> updateSubmission({
    required String submissionId,
    ExpenseCategory? expenseCategory,
    FundingType? fundingType,
    double? amount,
    String? description,
    String? justification,
    String? expenseDate,
    String? vendor,
    String? referenceNumber,
    String? projectId,
    List<SupportingDocument>? supportingDocuments,
  }) async {
    try {
      final updates = <String, dynamic>{
        'updated_at': DateTime.now().toIso8601String(),
      };

      if (expenseCategory != null) {
        updates['expense_category'] = expenseCategory.dbValue;
      }
      if (fundingType != null) updates['funding_type'] = fundingType.value;
      if (amount != null) updates['amount_cents'] = (amount * 100).round();
      if (description != null) updates['description'] = description;
      if (justification != null) updates['justification'] = justification;
      if (expenseDate != null) updates['expense_date'] = expenseDate;
      if (vendor != null) updates['vendor'] = vendor;
      if (referenceNumber != null) {
        updates['reference_number'] = referenceNumber;
      }
      if (projectId != null) updates['project_id'] = projectId;
      if (supportingDocuments != null) {
        updates['supporting_documents'] = supportingDocuments
            .map((d) => d.toJson())
            .toList();
      }

      final response = await _supabase
          .from('operational_cost_submissions')
          .update(updates)
          .eq('id', submissionId)
          .eq('status', 'pending')
          .select()
          .single();

      return OperationalCostSubmission.fromJson(response);
    } catch (e) {
      print('Error updating submission: $e');
      rethrow;
    }
  }

  /// Cancel a submission (only if status is pending or under_review)
  Future<bool> cancelSubmission(String submissionId) async {
    try {
      await _supabase
          .from('operational_cost_submissions')
          .update({
            'status': 'cancelled',
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', submissionId)
          .inFilter('status', ['pending', 'under_review']);

      return true;
    } catch (e) {
      print('Error cancelling submission: $e');
      return false;
    }
  }

  /// Tier 1 Review (Supervisor/FOM based on submitter role hierarchy)
  /// Coordinator → Supervisor approves
  /// Supervisor → FOM approves
  /// FOM → CountryDirector approves
  /// CountryDirector → Admin approves
  Future<bool> tier1Review({
    required String submissionId,
    required bool approved,
    String? notes,
  }) async {
    final userId = currentUserId;
    if (userId == null) return false;

    // Verify reviewer has Tier 1 approval permission
    final permissions = await getUserPermissions();
    if (!permissions.isSupervisor &&
        !permissions.isFOM &&
        !permissions.isCountryDirector &&
        !permissions.isAdmin) {
      print('Error: User does not have Tier 1 approval permission');
      return false;
    }

    try {
      await _supabase
          .from('operational_cost_submissions')
          .update({
            'tier1_reviewed_by': userId,
            'tier1_reviewed_at': DateTime.now().toIso8601String(),
            'tier1_notes': notes,
            'tier1_status': approved ? 'approved' : 'rejected',
            'status': approved ? 'under_review' : 'rejected',
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', submissionId)
          .eq('status', 'pending');

      return true;
    } catch (e) {
      print('Error tier 1 review: $e');
      return false;
    }
  }

  /// Tier 2 Review (Admin/Country Director - final approval)
  Future<bool> tier2Review({
    required String submissionId,
    required bool approved,
    String? notes,
  }) async {
    final userId = currentUserId;
    if (userId == null) return false;

    // Verify reviewer has Tier 2 approval permission (Admin or CountryDirector)
    final permissions = await getUserPermissions();
    if (!permissions.isAdmin && !permissions.isCountryDirector) {
      print('Error: User does not have Tier 2 approval permission');
      return false;
    }

    try {
      await _supabase
          .from('operational_cost_submissions')
          .update({
            'tier2_reviewed_by': userId,
            'tier2_reviewed_at': DateTime.now().toIso8601String(),
            'tier2_notes': notes,
            'tier2_status': approved ? 'approved' : 'rejected',
            'status': approved ? 'approved' : 'rejected',
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', submissionId)
          .eq('status', 'under_review');

      return true;
    } catch (e) {
      print('Error tier 2 review: $e');
      return false;
    }
  }

  /// Mark as paid (Admin only)
  Future<bool> markAsPaid(String submissionId) async {
    final userId = currentUserId;
    if (userId == null) return false;

    // Verify user has payout permission (Admin only)
    final permissions = await getUserPermissions();
    if (!permissions.canPayOut) {
      print('Error: User does not have payout permission');
      return false;
    }

    try {
      await _supabase
          .from('operational_cost_submissions')
          .update({
            'status': 'paid',
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', submissionId)
          .eq('status', 'approved');

      return true;
    } catch (e) {
      print('Error marking as paid: $e');
      return false;
    }
  }

  /// Submit reconciliation for an advance
  Future<bool> reconcileAdvance({
    required String submissionId,
    required double actualAmount,
    String? notes,
    List<SupportingDocument>? documents,
  }) async {
    final userId = currentUserId;
    if (userId == null) return false;

    try {
      final updates = <String, dynamic>{
        'is_reconciled': true,
        'reconciled_at': DateTime.now().toIso8601String(),
        'reconciled_amount_cents': (actualAmount * 100).round(),
        'reconciliation_notes': notes,
        'updated_at': DateTime.now().toIso8601String(),
      };

      if (documents != null && documents.isNotEmpty) {
        updates['supporting_documents'] = documents
            .map((d) => d.toJson())
            .toList();
      }

      await _supabase
          .from('operational_cost_submissions')
          .update(updates)
          .eq('id', submissionId)
          .eq('funding_type', 'advance')
          .eq('status', 'paid');

      return true;
    } catch (e) {
      print('Error reconciling advance: $e');
      return false;
    }
  }

  /// Fetch available projects for the user
  Future<List<Map<String, dynamic>>> getAvailableProjects() async {
    try {
      final response = await _supabase
          .from('projects')
          .select('id, name')
          .eq('status', 'active')
          .order('name');

      return (response as List).cast<Map<String, dynamic>>();
    } catch (e) {
      print('Error fetching projects: $e');
      return [];
    }
  }

  /// Fetch available hubs for the user
  Future<List<Map<String, dynamic>>> getAvailableHubs() async {
    try {
      final response = await _supabase
          .from('hubs')
          .select('id, name')
          .order('name');

      return (response as List).cast<Map<String, dynamic>>();
    } catch (e) {
      print('Error fetching hubs: $e');
      return [];
    }
  }

  /// Subscribe to realtime updates
  Stream<List<OperationalCostSubmission>> subscribeToSubmissions({
    bool userOnly = false,
    String? hubId,
  }) {
    _submissionsController?.close();
    _submissionsController =
        StreamController<List<OperationalCostSubmission>>.broadcast();

    _loadAndSubscribe(userOnly: userOnly, hubId: hubId);

    return _submissionsController!.stream;
  }

  Future<void> _loadAndSubscribe({bool userOnly = false, String? hubId}) async {
    // Initial load
    List<OperationalCostSubmission> submissions;
    if (userOnly) {
      submissions = await getUserSubmissions();
    } else if (hubId != null) {
      submissions = await getTeamSubmissions(hubId);
    } else {
      submissions = await getAllSubmissions();
    }
    _submissionsController?.add(submissions);

    // Setup realtime subscription
    _realtimeChannel?.unsubscribe();
    _realtimeChannel = _supabase
        .channel('operational_cost_changes')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'operational_cost_submissions',
          callback: (payload) async {
            // Reload on any change
            List<OperationalCostSubmission> updated;
            if (userOnly) {
              updated = await getUserSubmissions();
            } else if (hubId != null) {
              updated = await getTeamSubmissions(hubId);
            } else {
              updated = await getAllSubmissions();
            }
            _submissionsController?.add(updated);
          },
        )
        .subscribe();
  }

  /// Dispose resources
  void dispose() {
    _realtimeChannel?.unsubscribe();
    _submissionsController?.close();
    _submissionsController = null;
    _realtimeChannel = null;
  }
}
