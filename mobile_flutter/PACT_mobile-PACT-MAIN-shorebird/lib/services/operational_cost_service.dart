/// Operational Cost Service for Mobile App
/// Handles all Supabase operations for operational cost submissions

import 'dart:async';
import 'dart:typed_data';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/operational_cost_submission.dart';

class OperationalCostService {
  static final OperationalCostService _instance = OperationalCostService._internal();
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
            profiles:user_id(name, role),
            projects:project_id(name),
            hubs:hub_id(name)
          ''')
          .eq('user_id', userId)
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
      var query = _supabase
          .from('operational_cost_submissions')
          .select('''
            *,
            profiles:user_id(name, role),
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
  Future<List<OperationalCostSubmission>> getTeamSubmissions(String? hubId) async {
    if (hubId == null) return [];
    
    try {
      final response = await _supabase
          .from('operational_cost_submissions')
          .select('''
            *,
            profiles:user_id(name, role),
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
            profiles:user_id(name, role),
            projects:project_id(name),
            hubs:hub_id(name)
          ''')
          .eq('user_id', userId)
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
            'user_id': userId,
            'expense_category': expenseCategory.value,
            'funding_type': fundingType.value,
            'amount_cents': (amount * 100).round(),
            'currency': currency,
            'description': description,
            'justification': justification,
            'expense_date': expenseDate ?? DateTime.now().toIso8601String().split('T')[0],
            'vendor': vendor,
            'reference_number': referenceNumber,
            'project_id': projectId,
            'hub_id': hubId,
            'status': 'pending',
            'supporting_documents': supportingDocuments?.map((d) => d.toJson()).toList() ?? [],
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
    String? hubId,
    List<SupportingDocument>? supportingDocuments,
  }) async {
    try {
      final updates = <String, dynamic>{
        'updated_at': DateTime.now().toIso8601String(),
      };
      
      if (expenseCategory != null) updates['expense_category'] = expenseCategory.value;
      if (fundingType != null) updates['funding_type'] = fundingType.value;
      if (amount != null) updates['amount_cents'] = (amount * 100).round();
      if (description != null) updates['description'] = description;
      if (justification != null) updates['justification'] = justification;
      if (expenseDate != null) updates['expense_date'] = expenseDate;
      if (vendor != null) updates['vendor'] = vendor;
      if (referenceNumber != null) updates['reference_number'] = referenceNumber;
      if (projectId != null) updates['project_id'] = projectId;
      if (hubId != null) updates['hub_id'] = hubId;
      if (supportingDocuments != null) {
        updates['supporting_documents'] = supportingDocuments.map((d) => d.toJson()).toList();
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
    if (!permissions.isSupervisor && !permissions.isFOM && 
        !permissions.isCountryDirector && !permissions.isAdmin) {
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
      final submission = await _supabase
          .from('operational_cost_submissions')
          .select('submitter_role, user_id')
          .eq('id', submissionId)
          .single();

      final submitterRole = (submission['submitter_role'] ?? '').toString().toLowerCase();
      final isThreeTier = submitterRole.contains('coordinator');

      String overallStatus;
      if (!approved) {
        overallStatus = 'rejected';
      } else if (isThreeTier) {
        overallStatus = 'under_review';
      } else {
        overallStatus = 'approved';
      }

      final updateData = <String, dynamic>{
        'tier2_reviewed_by': userId,
        'tier2_reviewed_at': DateTime.now().toIso8601String(),
        'tier2_notes': notes,
        'tier2_status': approved ? 'approved' : 'rejected',
        'status': overallStatus,
        'updated_at': DateTime.now().toIso8601String(),
      };

      if (isThreeTier && approved) {
        updateData['tier3_status'] = 'pending';
      }

      await _supabase
          .from('operational_cost_submissions')
          .update(updateData)
          .eq('id', submissionId)
          .eq('status', 'under_review');

      return true;
    } catch (e) {
      print('Error tier 2 review: $e');
      return false;
    }
  }

  /// Tier 3 Review (Admin/SuperAdmin - for 3-tier coordinator flow)
  Future<bool> tier3Review({
    required String submissionId,
    required bool approved,
    String? notes,
  }) async {
    final userId = currentUserId;
    if (userId == null) return false;

    final permissions = await getUserPermissions();
    if (!permissions.isAdmin) {
      print('Error: User does not have Tier 3 approval permission');
      return false;
    }

    try {
      final newStatus = approved ? 'approved' : 'rejected';
      await _supabase
          .from('operational_cost_submissions')
          .update({
            'tier3_status': newStatus,
            'tier3_approved_by': userId,
            'tier3_approved_at': DateTime.now().toIso8601String(),
            'tier3_notes': notes,
            'status': approved ? 'approved' : 'rejected',
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', submissionId)
          .eq('status', 'under_review');

      return true;
    } catch (e) {
      print('Error tier 3 review: $e');
      return false;
    }
  }

  /// Mark as paid (Admin only)
  Future<bool> markAsPaid(String submissionId) async {
    final userId = currentUserId;
    if (userId == null) return false;

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

  /// Mark as paid WITH a mandatory payment receipt upload.
  /// [proofBytes]     — raw bytes of the image or PDF selected by the admin.
  /// [proofExtension] — file extension e.g. 'jpg', 'pdf'.
  /// [proofNotes]     — optional admin notes attached alongside the proof.
  /// Returns the public URL of the uploaded receipt, or throws on failure.
  Future<String> markAsPaidWithProof({
    required String submissionId,
    required List<int> proofBytes,
    required String proofExtension,
    String? proofNotes,
  }) async {
    final userId = currentUserId;
    if (userId == null) throw Exception('Not authenticated');

    final permissions = await getUserPermissions();
    if (!permissions.canPayOut) throw Exception('Insufficient permissions');

    // 1. Upload receipt to Supabase Storage
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final random = (DateTime.now().microsecondsSinceEpoch % 10000).toString().padLeft(4, '0');
    final filePath = 'payment-proofs/${timestamp}_$random.$proofExtension';

    await _supabase.storage
        .from('mmp-files')
        .uploadBinary(filePath, Uint8List.fromList(proofBytes),
            fileOptions: FileOptions(contentType: _mimeType(proofExtension), upsert: false));

    final proofUrl = _supabase.storage.from('mmp-files').getPublicUrl(filePath);

    // 2. Update the submission record
    final now = DateTime.now().toIso8601String();
    await _supabase
        .from('operational_cost_submissions')
        .update({
          'status': 'paid',
          'paid_by': userId,
          'paid_at': now,
          'payment_proof_url': proofUrl,
          'payment_proof_uploaded_at': now,
          if (proofNotes != null && proofNotes.trim().isNotEmpty)
            'payment_proof_notes': proofNotes.trim(),
          'updated_at': now,
        })
        .eq('id', submissionId);

    return proofUrl;
  }

  String _mimeType(String ext) {
    switch (ext.toLowerCase()) {
      case 'pdf': return 'application/pdf';
      case 'png': return 'image/png';
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      case 'webp': return 'image/webp';
      default: return 'application/octet-stream';
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
        updates['supporting_documents'] = documents.map((d) => d.toJson()).toList();
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
    _submissionsController = StreamController<List<OperationalCostSubmission>>.broadcast();

    _loadAndSubscribe(userOnly: userOnly, hubId: hubId);

    return _submissionsController!.stream;
  }

  Future<void> _loadAndSubscribe({
    bool userOnly = false,
    String? hubId,
  }) async {
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

  /// Trigger notification for cost submission events
  Future<void> triggerNotification({
    required String recipientId,
    required String title,
    required String titleAr,
    required String message,
    required String messageAr,
    required String category,
    required String relatedEntityType,
    required String relatedEntityId,
    String priority = 'normal',
  }) async {
    try {
      await _supabase.from('notifications').insert({
        'user_id': recipientId,
        'title': title,
        'title_ar': titleAr,
        'message': message,
        'message_ar': messageAr,
        'category': category,
        'priority': priority,
        'related_entity_type': relatedEntityType,
        'related_entity_id': relatedEntityId,
        'is_read': false,
        'created_at': DateTime.now().toIso8601String(),
      });
    } catch (e) {
      print('Error sending notification: $e');
    }
  }

  /// Notify submitter of approval/rejection
  Future<void> notifyApprovalAction({
    required OperationalCostSubmission submission,
    required String action,
    required int tier,
    String? reviewerName,
  }) async {
    final isApproved = action == 'approved';
    final tierLabel = 'Tier $tier';
    
    await triggerNotification(
      recipientId: submission.userId,
      title: isApproved 
          ? 'Cost Submission $tierLabel Approved' 
          : 'Cost Submission $tierLabel Rejected',
      titleAr: isApproved 
          ? 'تمت الموافقة على طلب التكلفة - $tierLabel' 
          : 'تم رفض طلب التكلفة - $tierLabel',
      message: '${submission.expenseCategory.labelEn} submission of ${submission.amount.toStringAsFixed(2)} ${submission.currency} has been $action${reviewerName != null ? " by $reviewerName" : ""}.',
      messageAr: 'طلب ${submission.expenseCategory.labelAr} بمبلغ ${submission.amount.toStringAsFixed(2)} ${submission.currency} تم ${isApproved ? "الموافقة عليه" : "رفضه"}${reviewerName != null ? " بواسطة $reviewerName" : ""}.',
      category: 'financial',
      relatedEntityType: 'costSubmission',
      relatedEntityId: submission.id,
      priority: isApproved ? 'normal' : 'high',
    );
  }

  /// Notify payment recorded
  Future<void> notifyPaymentRecorded({
    required OperationalCostSubmission submission,
  }) async {
    await triggerNotification(
      recipientId: submission.userId,
      title: 'Payment Recorded',
      titleAr: 'تم تسجيل الدفع',
      message: 'Payment of ${submission.amount.toStringAsFixed(2)} ${submission.currency} for ${submission.expenseCategory.labelEn} has been recorded.',
      messageAr: 'تم تسجيل دفع ${submission.amount.toStringAsFixed(2)} ${submission.currency} لـ ${submission.expenseCategory.labelAr}.',
      category: 'financial',
      relatedEntityType: 'costSubmission',
      relatedEntityId: submission.id,
      priority: 'normal',
    );
  }

  /// Notify approvers when a new cost submission is created
  Future<void> notifyNewSubmission({
    required OperationalCostSubmission submission,
    required List<String> approverIds,
    String? submitterName,
  }) async {
    for (final approverId in approverIds) {
      await triggerNotification(
        recipientId: approverId,
        title: 'New Cost Submission',
        titleAr: 'طلب تكلفة جديد',
        message: '${submitterName ?? "A team member"} submitted a ${submission.expenseCategory.labelEn} cost of ${submission.amount.toStringAsFixed(2)} ${submission.currency} for approval.',
        messageAr: '${submitterName ?? "عضو فريق"} قدم طلب تكلفة ${submission.expenseCategory.labelAr} بمبلغ ${submission.amount.toStringAsFixed(2)} ${submission.currency} للموافقة.',
        category: 'financial',
        relatedEntityType: 'costSubmission',
        relatedEntityId: submission.id,
        priority: 'high',
      );
    }
  }

  /// Export submissions as CSV string
  String exportToCsv(List<OperationalCostSubmission> submissions, {bool isArabic = false}) {
    final buffer = StringBuffer();
    
    if (isArabic) {
      buffer.writeln('المرجع,الفئة,نوع التمويل,المبلغ,العملة,الحالة,الوصف,مقدم الطلب,المشروع,المحور,التاريخ,المستوى 1,المستوى 2,المستوى 3,تمت التسوية');
    } else {
      buffer.writeln('Reference,Category,Funding Type,Amount,Currency,Status,Description,Submitter,Project,Hub,Date,Tier 1,Tier 2,Tier 3,Reconciled');
    }
    
    for (final s in submissions) {
      final ref = 'PACT-OC-${s.id.substring(0, 8).toUpperCase()}';
      final desc = '"${s.description.replaceAll('"', '""')}"';
      buffer.writeln([
        ref,
        isArabic ? s.expenseCategory.labelAr : s.expenseCategory.labelEn,
        isArabic ? s.fundingType.labelAr : s.fundingType.labelEn,
        s.amount.toStringAsFixed(2),
        s.currency,
        isArabic ? s.status.labelAr : s.status.labelEn,
        desc,
        s.submitterName ?? 'N/A',
        s.projectName ?? 'N/A',
        s.hubName ?? 'N/A',
        s.createdAt.toIso8601String(),
        s.tier1Status ?? 'N/A',
        s.tier2Status ?? 'N/A',
        s.tier3Status ?? 'N/A',
        s.isReconciled ? (isArabic ? 'نعم' : 'Yes') : (isArabic ? 'لا' : 'No'),
      ].join(','));
    }
    
    return buffer.toString();
  }

  /// Dispose resources
  void dispose() {
    _realtimeChannel?.unsubscribe();
    _submissionsController?.close();
    _submissionsController = null;
    _realtimeChannel = null;
  }
}
