import 'package:json_annotation/json_annotation.dart';

part 'cost_submission_models.g.dart';

/// Enum for cost submission status
enum CostSubmissionStatus {
  pending,
  @JsonValue('under_review')
  underReview,
  approved,
  rejected,
  paid,
  cancelled,
}

/// Supporting document model
@JsonSerializable()
class SupportingDocument {
  final String id;
  final String url;
  final String type; // e.g., "receipt", "invoice"
  final String filename;
  @JsonKey(name: 'uploaded_at')
  final DateTime uploadedAt;

  SupportingDocument({
    required this.id,
    required this.url,
    required this.type,
    required this.filename,
    required this.uploadedAt,
  });

  factory SupportingDocument.fromJson(Map<String, dynamic> json) =>
      _$SupportingDocumentFromJson(json);
  Map<String, dynamic> toJson() => _$SupportingDocumentToJson(this);
}

/// Main cost submission model
@JsonSerializable()
class CostSubmission {
  final String id;
  @JsonKey(name: 'site_visit_id')
  final String siteVisitId;
  @JsonKey(name: 'mmp_file_id')
  final String? mmpFileId;
  @JsonKey(name: 'project_id')
  final String? projectId;
  @JsonKey(name: 'submitted_by')
  final String submittedBy;
  @JsonKey(name: 'submitted_at')
  final DateTime submittedAt;
  @JsonKey(name: 'transportation_cost_cents')
  final int transportationCostCents;
  @JsonKey(name: 'accommodation_cost_cents')
  final int accommodationCostCents;
  @JsonKey(name: 'meal_allowance_cents')
  final int mealAllowanceCents;
  @JsonKey(name: 'other_costs_cents')
  final int otherCostsCents;
  @JsonKey(name: 'total_cost_cents')
  final int totalCostCents;
  final String currency;
  @JsonKey(name: 'transportation_details')
  final String? transportationDetails;
  @JsonKey(name: 'accommodation_details')
  final String? accommodationDetails;
  @JsonKey(name: 'meal_details')
  final String? mealDetails;
  @JsonKey(name: 'other_costs_details')
  final String? otherCostsDetails;
  @JsonKey(name: 'submission_notes')
  final String? submissionNotes;
  @JsonKey(name: 'supporting_documents')
  final List<SupportingDocument> supportingDocuments;
  final CostSubmissionStatus status;
  @JsonKey(name: 'reviewed_by')
  final String? reviewedBy;
  @JsonKey(name: 'reviewed_at')
  final DateTime? reviewedAt;
  @JsonKey(name: 'reviewer_notes')
  final String? reviewerNotes;
  @JsonKey(name: 'approval_notes')
  final String? approvalNotes;
  @JsonKey(name: 'wallet_transaction_id')
  final String? walletTransactionId;
  @JsonKey(name: 'paid_at')
  final DateTime? paidAt;
  @JsonKey(name: 'paid_amount_cents')
  final int? paidAmountCents;
  @JsonKey(name: 'payment_notes')
  final String? paymentNotes;
  @JsonKey(name: 'classification_level')
  final String? classificationLevel;
  @JsonKey(name: 'role_scope')
  final String? roleScope;
  @JsonKey(name: 'revision_requested')
  final bool revisionRequested;
  @JsonKey(name: 'revision_notes')
  final String? revisionNotes;
  @JsonKey(name: 'revision_count')
  final int revisionCount;
  @JsonKey(name: 'created_at')
  final DateTime createdAt;
  @JsonKey(name: 'updated_at')
  final DateTime updatedAt;

  // Additional fields from joins (not stored in DB)
  @JsonKey(includeFromJson: false, includeToJson: false)
  final String? siteName;
  @JsonKey(includeFromJson: false, includeToJson: false)
  final String? submitterName;

  CostSubmission({
    required this.id,
    required this.siteVisitId,
    this.mmpFileId,
    this.projectId,
    required this.submittedBy,
    required this.submittedAt,
    required this.transportationCostCents,
    required this.accommodationCostCents,
    required this.mealAllowanceCents,
    required this.otherCostsCents,
    required this.totalCostCents,
    this.currency = 'SDG',
    this.transportationDetails,
    this.accommodationDetails,
    this.mealDetails,
    this.otherCostsDetails,
    this.submissionNotes,
    this.supportingDocuments = const [],
    required this.status,
    this.reviewedBy,
    this.reviewedAt,
    this.reviewerNotes,
    this.approvalNotes,
    this.walletTransactionId,
    this.paidAt,
    this.paidAmountCents,
    this.paymentNotes,
    this.classificationLevel,
    this.roleScope,
    this.revisionRequested = false,
    this.revisionNotes,
    this.revisionCount = 0,
    required this.createdAt,
    required this.updatedAt,
    this.siteName,
    this.submitterName,
  });

  factory CostSubmission.fromJson(Map<String, dynamic> json) =>
      _$CostSubmissionFromJson(json);
  Map<String, dynamic> toJson() => _$CostSubmissionToJson(this);

  /// Get status label
  String get statusLabel {
    switch (status) {
      case CostSubmissionStatus.pending:
        return 'Pending';
      case CostSubmissionStatus.underReview:
        return 'Under Review';
      case CostSubmissionStatus.approved:
        return 'Approved';
      case CostSubmissionStatus.rejected:
        return 'Rejected';
      case CostSubmissionStatus.paid:
        return 'Paid';
      case CostSubmissionStatus.cancelled:
        return 'Cancelled';
    }
  }

  /// Check if submission can be edited
  bool get canEdit => status == CostSubmissionStatus.pending;

  /// Check if submission can be cancelled
  bool get canCancel => status == CostSubmissionStatus.pending;

  /// Copy with method for updates
  CostSubmission copyWith({
    String? id,
    String? siteVisitId,
    String? mmpFileId,
    String? projectId,
    String? submittedBy,
    DateTime? submittedAt,
    int? transportationCostCents,
    int? accommodationCostCents,
    int? mealAllowanceCents,
    int? otherCostsCents,
    int? totalCostCents,
    String? currency,
    String? transportationDetails,
    String? accommodationDetails,
    String? mealDetails,
    String? otherCostsDetails,
    String? submissionNotes,
    List<SupportingDocument>? supportingDocuments,
    CostSubmissionStatus? status,
    String? reviewedBy,
    DateTime? reviewedAt,
    String? reviewerNotes,
    String? approvalNotes,
    String? walletTransactionId,
    DateTime? paidAt,
    int? paidAmountCents,
    String? paymentNotes,
    String? classificationLevel,
    String? roleScope,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? siteName,
    String? submitterName,
  }) {
    return CostSubmission(
      id: id ?? this.id,
      siteVisitId: siteVisitId ?? this.siteVisitId,
      mmpFileId: mmpFileId ?? this.mmpFileId,
      projectId: projectId ?? this.projectId,
      submittedBy: submittedBy ?? this.submittedBy,
      submittedAt: submittedAt ?? this.submittedAt,
      transportationCostCents: transportationCostCents ?? this.transportationCostCents,
      accommodationCostCents: accommodationCostCents ?? this.accommodationCostCents,
      mealAllowanceCents: mealAllowanceCents ?? this.mealAllowanceCents,
      otherCostsCents: otherCostsCents ?? this.otherCostsCents,
      totalCostCents: totalCostCents ?? this.totalCostCents,
      currency: currency ?? this.currency,
      transportationDetails: transportationDetails ?? this.transportationDetails,
      accommodationDetails: accommodationDetails ?? this.accommodationDetails,
      mealDetails: mealDetails ?? this.mealDetails,
      otherCostsDetails: otherCostsDetails ?? this.otherCostsDetails,
      submissionNotes: submissionNotes ?? this.submissionNotes,
      supportingDocuments: supportingDocuments ?? this.supportingDocuments,
      status: status ?? this.status,
      reviewedBy: reviewedBy ?? this.reviewedBy,
      reviewedAt: reviewedAt ?? this.reviewedAt,
      reviewerNotes: reviewerNotes ?? this.reviewerNotes,
      approvalNotes: approvalNotes ?? this.approvalNotes,
      walletTransactionId: walletTransactionId ?? this.walletTransactionId,
      paidAt: paidAt ?? this.paidAt,
      paidAmountCents: paidAmountCents ?? this.paidAmountCents,
      paymentNotes: paymentNotes ?? this.paymentNotes,
      classificationLevel: classificationLevel ?? this.classificationLevel,
      roleScope: roleScope ?? this.roleScope,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      siteName: siteName ?? this.siteName,
      submitterName: submitterName ?? this.submitterName,
    );
  }
}

/// Request model for creating a cost submission
@JsonSerializable()
class CreateCostSubmissionRequest {
  @JsonKey(name: 'site_visit_id')
  final String siteVisitId;
  @JsonKey(name: 'mmp_file_id')
  final String? mmpFileId;
  @JsonKey(name: 'project_id')
  final String? projectId;
  @JsonKey(name: 'transportation_cost_cents')
  final int transportationCostCents;
  @JsonKey(name: 'accommodation_cost_cents')
  final int accommodationCostCents;
  @JsonKey(name: 'meal_allowance_cents')
  final int mealAllowanceCents;
  @JsonKey(name: 'other_costs_cents')
  final int otherCostsCents;
  final String? currency;
  @JsonKey(name: 'transportation_details')
  final String? transportationDetails;
  @JsonKey(name: 'accommodation_details')
  final String? accommodationDetails;
  @JsonKey(name: 'meal_details')
  final String? mealDetails;
  @JsonKey(name: 'other_costs_details')
  final String? otherCostsDetails;
  @JsonKey(name: 'submission_notes')
  final String? submissionNotes;
  @JsonKey(name: 'supporting_documents')
  final List<SupportingDocument>? supportingDocuments;
  @JsonKey(name: 'classification_level')
  final String? classificationLevel;
  @JsonKey(name: 'role_scope')
  final String? roleScope;

  CreateCostSubmissionRequest({
    required this.siteVisitId,
    this.mmpFileId,
    this.projectId,
    required this.transportationCostCents,
    required this.accommodationCostCents,
    required this.mealAllowanceCents,
    required this.otherCostsCents,
    this.currency,
    this.transportationDetails,
    this.accommodationDetails,
    this.mealDetails,
    this.otherCostsDetails,
    this.submissionNotes,
    this.supportingDocuments,
    this.classificationLevel,
    this.roleScope,
  });

  factory CreateCostSubmissionRequest.fromJson(Map<String, dynamic> json) =>
      _$CreateCostSubmissionRequestFromJson(json);
  Map<String, dynamic> toJson() => _$CreateCostSubmissionRequestToJson(this);

  /// Calculate total cost
  int get totalCostCents =>
      transportationCostCents +
      accommodationCostCents +
      mealAllowanceCents +
      otherCostsCents;
}

/// Request model for updating a cost submission
@JsonSerializable()
class UpdateCostSubmissionRequest {
  @JsonKey(name: 'transportation_cost_cents')
  final int? transportationCostCents;
  @JsonKey(name: 'accommodation_cost_cents')
  final int? accommodationCostCents;
  @JsonKey(name: 'meal_allowance_cents')
  final int? mealAllowanceCents;
  @JsonKey(name: 'other_costs_cents')
  final int? otherCostsCents;
  @JsonKey(name: 'transportation_details')
  final String? transportationDetails;
  @JsonKey(name: 'accommodation_details')
  final String? accommodationDetails;
  @JsonKey(name: 'meal_details')
  final String? mealDetails;
  @JsonKey(name: 'other_costs_details')
  final String? otherCostsDetails;
  @JsonKey(name: 'submission_notes')
  final String? submissionNotes;
  @JsonKey(name: 'supporting_documents')
  final List<SupportingDocument>? supportingDocuments;

  UpdateCostSubmissionRequest({
    this.transportationCostCents,
    this.accommodationCostCents,
    this.mealAllowanceCents,
    this.otherCostsCents,
    this.transportationDetails,
    this.accommodationDetails,
    this.mealDetails,
    this.otherCostsDetails,
    this.submissionNotes,
    this.supportingDocuments,
  });

  factory UpdateCostSubmissionRequest.fromJson(Map<String, dynamic> json) =>
      _$UpdateCostSubmissionRequestFromJson(json);
  Map<String, dynamic> toJson() => _$UpdateCostSubmissionRequestToJson(this);
}

/// Cost submission statistics
class CostSubmissionStats {
  final int totalSubmissions;
  final int pendingCount;
  final int approvedCount;
  final int paidCount;
  final int rejectedCount;
  final int totalPendingAmountCents;
  final int totalApprovedAmountCents;
  final int totalPaidAmountCents;

  CostSubmissionStats({
    this.totalSubmissions = 0,
    this.pendingCount = 0,
    this.approvedCount = 0,
    this.paidCount = 0,
    this.rejectedCount = 0,
    this.totalPendingAmountCents = 0,
    this.totalApprovedAmountCents = 0,
    this.totalPaidAmountCents = 0,
  });
}

/// Validation result for cost submission
class CostSubmissionValidationResult {
  final bool isValid;
  final String? error;
  final List<String> warnings;

  CostSubmissionValidationResult({
    required this.isValid,
    this.error,
    this.warnings = const [],
  });
}

/// Exception for cost submission operations
class CostSubmissionException implements Exception {
  final String message;
  final String? code;

  CostSubmissionException(this.message, {this.code});

  @override
  String toString() => 'CostSubmissionException: $message';
}

/// Approval action enum
enum ReviewAction {
  approve,
  reject,
  @JsonValue('request_revision')
  requestRevision,
}

/// Review request model
@JsonSerializable()
class ReviewCostSubmissionRequest {
  @JsonKey(name: 'submission_id')
  final String submissionId;
  final ReviewAction action;
  @JsonKey(name: 'reviewer_notes')
  final String? reviewerNotes;
  @JsonKey(name: 'approval_notes')
  final String? approvalNotes;
  @JsonKey(name: 'revision_notes')
  final String? revisionNotes;

  ReviewCostSubmissionRequest({
    required this.submissionId,
    required this.action,
    this.reviewerNotes,
    this.approvalNotes,
    this.revisionNotes,
  });

  factory ReviewCostSubmissionRequest.fromJson(Map<String, dynamic> json) =>
      _$ReviewCostSubmissionRequestFromJson(json);
  Map<String, dynamic> toJson() => _$ReviewCostSubmissionRequestToJson(this);
}

/// Cost approval history model
@JsonSerializable()
class CostApprovalHistory {
  final String id;
  @JsonKey(name: 'submission_id')
  final String submissionId;
  @JsonKey(name: 'reviewer_id')
  final String reviewerId;
  final String action;
  final String? notes;
  @JsonKey(name: 'previous_status')
  final String? previousStatus;
  @JsonKey(name: 'new_status')
  final String? newStatus;
  @JsonKey(name: 'created_at')
  final DateTime createdAt;

  // Additional fields from joins
  @JsonKey(name: 'reviewer_name', includeFromJson: true, includeToJson: false)
  final String? reviewerName;
  @JsonKey(name: 'reviewer_email', includeFromJson: true, includeToJson: false)
  final String? reviewerEmail;

  CostApprovalHistory({
    required this.id,
    required this.submissionId,
    required this.reviewerId,
    required this.action,
    this.notes,
    this.previousStatus,
    this.newStatus,
    required this.createdAt,
    this.reviewerName,
    this.reviewerEmail,
  });

  factory CostApprovalHistory.fromJson(Map<String, dynamic> json) =>
      _$CostApprovalHistoryFromJson(json);
  Map<String, dynamic> toJson() => _$CostApprovalHistoryToJson(this);

  /// Get formatted action label
  String get actionLabel {
    switch (action) {
      case 'approved':
        return 'Approved';
      case 'rejected':
        return 'Rejected';
      case 'revision_requested':
        return 'Revision Requested';
      default:
        return action;
    }
  }

  /// Get color for action
  int get actionColor {
    switch (action) {
      case 'approved':
        return 0xFF4CAF50; // Green
      case 'rejected':
        return 0xFFF44336; // Red
      case 'revision_requested':
        return 0xFFFF9800; // Orange
      default:
        return 0xFF9E9E9E; // Grey
    }
  }
}
