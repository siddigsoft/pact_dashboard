/// Operational Cost Service for Mobile App
/// Handles all Supabase operations for operational cost submissions
library;

import 'dart:async';
import 'dart:typed_data';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/operational_cost_submission.dart';
import 'notification_insert_service.dart';

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

  /// Submit a new operational cost request.
  // ponytail: fundingType/justification/requiresReconciliation dropped —
  // operational_cost_submissions has no such columns (verified live);
  // inserting them made every submission fail. Callers that need to record
  // funding type/justification should fold it into `description` text, the
  // way cost_submit_tab.dart already does. submitter_role is set here so
  // tier2Review can later decide whether a 3rd tier is needed.
  Future<OperationalCostSubmission?> submitCost({
    required ExpenseCategory expenseCategory,
    required double amount,
    required String currency,
    required String description,
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
      final permissions = await getUserPermissions();

      final response = await _supabase
          .from('operational_cost_submissions')
          .insert({
            'submitted_by': userId,
            'submitter_role': permissions.role,
            'expense_category': expenseCategory.dbValue,
            'amount_cents': (amount * 100).round(),
            'currency': currency,
            'description': description,
            'expense_date':
                expenseDate ?? DateTime.now().toIso8601String().split('T')[0],
            'vendor': vendor,
            'reference_number': referenceNumber,
            'project_id': projectId,
            'hub_id': hubId,
            'status': 'pending',
            'supporting_documents':
                supportingDocuments?.map((d) => d.toJson()).toList() ?? [],
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
    double? amount,
    String? description,
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
      if (amount != null) updates['amount_cents'] = (amount * 100).round();
      if (description != null) updates['description'] = description;
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
  Future<bool> tier1Review({
    required String submissionId,
    required bool approved,
    String? notes,
  }) async {
    final userId = currentUserId;
    if (userId == null) return false;

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
            'tier1_approved_by': userId,
            'tier1_approved_at': DateTime.now().toIso8601String(),
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

  /// Tier 2 Review. Coordinator submissions need a 3rd tier (Admin), so this
  /// escalates to tier3 ('under_review' + tier3_status: pending) instead of
  /// finalizing when the submitter is a coordinator.
  Future<bool> tier2Review({
    required String submissionId,
    required bool approved,
    String? notes,
  }) async {
    final userId = currentUserId;
    if (userId == null) return false;

    final permissions = await getUserPermissions();
    if (!permissions.isAdmin && !permissions.isCountryDirector) {
      print('Error: User does not have Tier 2 approval permission');
      return false;
    }

    try {
      final submission = await _supabase
          .from('operational_cost_submissions')
          .select('submitter_role')
          .eq('id', submissionId)
          .single();
      final isThreeTier = (submission['submitter_role'] as String? ?? '')
          .toLowerCase()
          .contains('coordinator');

      final overallStatus = !approved
          ? 'rejected'
          : (isThreeTier ? 'under_review' : 'approved');

      final updateData = <String, dynamic>{
        'tier2_approved_by': userId,
        'tier2_approved_at': DateTime.now().toIso8601String(),
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

  /// Tier 3 Review (Admin only — final approval for 3-tier coordinator flow)
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
      await _supabase
          .from('operational_cost_submissions')
          .update({
            'tier3_status': approved ? 'approved' : 'rejected',
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
            'paid_by': userId,
            'paid_at': DateTime.now().toIso8601String(),
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

    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final random = (DateTime.now().microsecondsSinceEpoch % 10000)
        .toString()
        .padLeft(4, '0');
    final filePath = 'payment-proofs/${timestamp}_$random.$proofExtension';

    await _supabase.storage
        .from('mmp-files')
        .uploadBinary(
          filePath,
          Uint8List.fromList(proofBytes),
          fileOptions: FileOptions(
            contentType: _mimeType(proofExtension),
            upsert: false,
          ),
        );

    final proofUrl = _supabase.storage.from('mmp-files').getPublicUrl(filePath);

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
      case 'pdf':
        return 'application/pdf';
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'webp':
        return 'image/webp';
      default:
        return 'application/octet-stream';
    }
  }

  /// Confirm the submitter received and used the paid funds correctly.
  // ponytail: real schema has no is_reconciled/reconciled_amount_cents — that
  // concept was replaced by fund_receipt_confirmed. actualAmount has no
  // column of its own, so it's folded into the notes rather than dropped.
  Future<bool> confirmFundReceipt({
    required String submissionId,
    double? actualAmount,
    String? notes,
  }) async {
    try {
      final combinedNotes = actualAmount != null
          ? 'Reported actual amount: ${actualAmount.toStringAsFixed(2)}.'
              '${notes != null && notes.isNotEmpty ? ' $notes' : ''}'
          : notes;

      await _supabase
          .from('operational_cost_submissions')
          .update({
            'fund_receipt_confirmed': true,
            'fund_receipt_confirmed_at': DateTime.now().toIso8601String(),
            'fund_receipt_notes': combinedNotes,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', submissionId)
          .eq('status', 'paid');

      return true;
    } catch (e) {
      print('Error confirming fund receipt: $e');
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

  /// Trigger a notification for a cost submission event.
  // ponytail: direct insert with only confirmed-real `notifications` columns
  // (no 'category' — that column doesn't exist on this table). The app-wide
  // NotificationTriggerService does insert 'category' and would fail the
  // same way; not fixing that shared service here, it's a separate, bigger
  // finding.
  Future<void> triggerNotification({
    required String recipientId,
    required String title,
    required String titleAr,
    required String message,
    required String messageAr,
    required String relatedEntityType,
    required String relatedEntityId,
    String priority = 'normal',
  }) async {
    try {
      await NotificationInsertService.insertNotification({
        'recipient_id': recipientId,
        'user_id': recipientId,
        'title_en': title,
        'title_ar': titleAr,
        'message_en': message,
        'message_ar': messageAr,
        'title': title,
        'message': message,
        'type': 'financial',
        'event_type': 'financial',
        'priority': priority,
        'related_entity_type': relatedEntityType,
        'related_entity_id': relatedEntityId,
        'entity_type': relatedEntityType,
        'entity_id': relatedEntityId,
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
      message:
          '${submission.expenseCategory.labelEn} submission of ${submission.amount.toStringAsFixed(2)} ${submission.currency} has been $action${reviewerName != null ? " by $reviewerName" : ""}.',
      messageAr:
          'طلب ${submission.expenseCategory.labelAr} بمبلغ ${submission.amount.toStringAsFixed(2)} ${submission.currency} تم ${isApproved ? "الموافقة عليه" : "رفضه"}${reviewerName != null ? " بواسطة $reviewerName" : ""}.',
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
      message:
          'Payment of ${submission.amount.toStringAsFixed(2)} ${submission.currency} for ${submission.expenseCategory.labelEn} has been recorded.',
      messageAr:
          'تم تسجيل دفع ${submission.amount.toStringAsFixed(2)} ${submission.currency} لـ ${submission.expenseCategory.labelAr}.',
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
        message:
            '${submitterName ?? "A team member"} submitted a ${submission.expenseCategory.labelEn} cost of ${submission.amount.toStringAsFixed(2)} ${submission.currency} for approval.',
        messageAr:
            '${submitterName ?? "عضو فريق"} قدم طلب تكلفة ${submission.expenseCategory.labelAr} بمبلغ ${submission.amount.toStringAsFixed(2)} ${submission.currency} للموافقة.',
        relatedEntityType: 'costSubmission',
        relatedEntityId: submission.id,
        priority: 'high',
      );
    }
  }

  /// Export submissions as CSV string
  String exportToCsv(
    List<OperationalCostSubmission> submissions, {
    bool isArabic = false,
  }) {
    final buffer = StringBuffer();

    if (isArabic) {
      buffer.writeln(
        'المرجع,الفئة,المبلغ,العملة,الحالة,الوصف,مقدم الطلب,المشروع,المحور,التاريخ,المستوى 1,المستوى 2,المستوى 3',
      );
    } else {
      buffer.writeln(
        'Reference,Category,Amount,Currency,Status,Description,Submitter,Project,Hub,Date,Tier 1,Tier 2,Tier 3',
      );
    }

    for (final s in submissions) {
      final ref = 'PACT-OC-${s.id.substring(0, 8).toUpperCase()}';
      final desc = '"${s.description.replaceAll('"', '""')}"';
      buffer.writeln(
        [
          ref,
          isArabic ? s.expenseCategory.labelAr : s.expenseCategory.labelEn,
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
        ].join(','),
      );
    }

    return buffer.toString();
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
    List<OperationalCostSubmission> submissions;
    if (userOnly) {
      submissions = await getUserSubmissions();
    } else if (hubId != null) {
      submissions = await getTeamSubmissions(hubId);
    } else {
      submissions = await getAllSubmissions();
    }
    _submissionsController?.add(submissions);

    _realtimeChannel?.unsubscribe();
    _realtimeChannel = _supabase
        .channel('operational_cost_changes')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'operational_cost_submissions',
          callback: (payload) async {
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
