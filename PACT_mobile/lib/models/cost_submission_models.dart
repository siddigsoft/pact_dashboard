/// Enum for cost submission status
enum CostSubmissionStatus {
  pending,
  underReview,
  approved,
  rejected,
  paid,
  cancelled,
}

CostSubmissionStatus _costSubmissionStatusFromJson(String? value) {
  switch (value) {
    case 'pending':
      return CostSubmissionStatus.pending;
    case 'under_review':
      return CostSubmissionStatus.underReview;
    case 'approved':
      return CostSubmissionStatus.approved;
    case 'rejected':
      return CostSubmissionStatus.rejected;
    case 'paid':
      return CostSubmissionStatus.paid;
    case 'cancelled':
      return CostSubmissionStatus.cancelled;
    default:
      return CostSubmissionStatus.pending;
  }
}

String _costSubmissionStatusToJson(CostSubmissionStatus s) {
  switch (s) {
    case CostSubmissionStatus.underReview:
      return 'under_review';
    default:
      return s.name;
  }
}

/// Supporting document model
class SupportingDocument {
  final String id;
  final String url;
  final String type; // e.g., "receipt", "invoice"
  final String filename;
  final DateTime uploadedAt;

  SupportingDocument({
    required this.id,
    required this.url,
    required this.type,
    required this.filename,
    required this.uploadedAt,
  });

  factory SupportingDocument.fromJson(Map<String, dynamic> json) =>
      SupportingDocument(
        id: json['id'] as String,
        url: json['url'] as String,
        type: json['type'] as String,
        filename: json['filename'] as String,
        uploadedAt: DateTime.parse(json['uploaded_at'] as String),
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
    'id': id,
    'url': url,
    'type': type,
    'filename': filename,
    'uploaded_at': uploadedAt.toIso8601String(),
  };
}

/// Main cost submission model
class CostSubmission {
  final String id;
  final String siteVisitId;
  final String? mmpFileId;
  final String? projectId;
  final String submittedBy;
  final DateTime submittedAt;
  final int transportationCostCents;
  final int accommodationCostCents;
  final int mealAllowanceCents;
  final int otherCostsCents;
  final int totalCostCents;
  final String currency;
  final String? transportationDetails;
  final String? accommodationDetails;
  final String? mealDetails;
  final String? otherCostsDetails;
  final String? submissionNotes;
  final List<SupportingDocument> supportingDocuments;
  final CostSubmissionStatus status;
  final String? reviewedBy;
  final DateTime? reviewedAt;
  final String? reviewerNotes;
  final String? approvalNotes;
  final String? walletTransactionId;
  final DateTime? paidAt;
  final int? paidAmountCents;
  final String? paymentNotes;
  final String? classificationLevel;
  final String? roleScope;
  final bool revisionRequested;
  final String? revisionNotes;
  final int revisionCount;
  final DateTime createdAt;
  final DateTime updatedAt;

  // Additional fields from joins (not stored in DB)
  final String? siteName;
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

  factory CostSubmission.fromJson(Map<String, dynamic> json) => CostSubmission(
    id: json['id'] as String,
    siteVisitId: json['site_visit_id'] as String,
    mmpFileId: json['mmp_file_id'] as String?,
    projectId: json['project_id'] as String?,
    submittedBy: json['submitted_by'] as String,
    submittedAt: DateTime.parse(json['submitted_at'] as String),
    transportationCostCents: (json['transportation_cost_cents'] as num).toInt(),
    accommodationCostCents: (json['accommodation_cost_cents'] as num).toInt(),
    mealAllowanceCents: (json['meal_allowance_cents'] as num).toInt(),
    otherCostsCents: (json['other_costs_cents'] as num).toInt(),
    totalCostCents: (json['total_cost_cents'] as num).toInt(),
    currency: json['currency'] as String? ?? 'SDG',
    transportationDetails: json['transportation_details'] as String?,
    accommodationDetails: json['accommodation_details'] as String?,
    mealDetails: json['meal_details'] as String?,
    otherCostsDetails: json['other_costs_details'] as String?,
    submissionNotes: json['submission_notes'] as String?,
    supportingDocuments:
        (json['supporting_documents'] as List<dynamic>?)
            ?.map((e) => SupportingDocument.fromJson(e as Map<String, dynamic>))
            .toList() ??
        const [],
    status: _costSubmissionStatusFromJson(json['status'] as String?),
    reviewedBy: json['reviewed_by'] as String?,
    reviewedAt: json['reviewed_at'] == null
        ? null
        : DateTime.parse(json['reviewed_at'] as String),
    reviewerNotes: json['reviewer_notes'] as String?,
    approvalNotes: json['approval_notes'] as String?,
    walletTransactionId: json['wallet_transaction_id'] as String?,
    paidAt: json['paid_at'] == null
        ? null
        : DateTime.parse(json['paid_at'] as String),
    paidAmountCents: (json['paid_amount_cents'] as num?)?.toInt(),
    paymentNotes: json['payment_notes'] as String?,
    classificationLevel: json['classification_level'] as String?,
    roleScope: json['role_scope'] as String?,
    revisionRequested: json['revision_requested'] as bool? ?? false,
    revisionNotes: json['revision_notes'] as String?,
    revisionCount: (json['revision_count'] as num?)?.toInt() ?? 0,
    createdAt: DateTime.parse(json['created_at'] as String),
    updatedAt: DateTime.parse(json['updated_at'] as String),
    siteName: null,
    submitterName: null,
  );

  Map<String, dynamic> toJson() => <String, dynamic>{
    'id': id,
    'site_visit_id': siteVisitId,
    'mmp_file_id': mmpFileId,
    'project_id': projectId,
    'submitted_by': submittedBy,
    'submitted_at': submittedAt.toIso8601String(),
    'transportation_cost_cents': transportationCostCents,
    'accommodation_cost_cents': accommodationCostCents,
    'meal_allowance_cents': mealAllowanceCents,
    'other_costs_cents': otherCostsCents,
    'total_cost_cents': totalCostCents,
    'currency': currency,
    'transportation_details': transportationDetails,
    'accommodation_details': accommodationDetails,
    'meal_details': mealDetails,
    'other_costs_details': otherCostsDetails,
    'submission_notes': submissionNotes,
    'supporting_documents': supportingDocuments,
    'status': _costSubmissionStatusToJson(status),
    'reviewed_by': reviewedBy,
    'reviewed_at': reviewedAt?.toIso8601String(),
    'reviewer_notes': reviewerNotes,
    'approval_notes': approvalNotes,
    'wallet_transaction_id': walletTransactionId,
    'paid_at': paidAt?.toIso8601String(),
    'paid_amount_cents': paidAmountCents,
    'payment_notes': paymentNotes,
    'classification_level': classificationLevel,
    'role_scope': roleScope,
    'revision_requested': revisionRequested,
    'revision_notes': revisionNotes,
    'revision_count': revisionCount,
    'created_at': createdAt.toIso8601String(),
    'updated_at': updatedAt.toIso8601String(),
  };

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
      transportationCostCents:
          transportationCostCents ?? this.transportationCostCents,
      accommodationCostCents:
          accommodationCostCents ?? this.accommodationCostCents,
      mealAllowanceCents: mealAllowanceCents ?? this.mealAllowanceCents,
      otherCostsCents: otherCostsCents ?? this.otherCostsCents,
      totalCostCents: totalCostCents ?? this.totalCostCents,
      currency: currency ?? this.currency,
      transportationDetails:
          transportationDetails ?? this.transportationDetails,
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
class CreateCostSubmissionRequest {
  final String siteVisitId;
  final String? mmpFileId;
  final String? projectId;
  final int transportationCostCents;
  final int accommodationCostCents;
  final int mealAllowanceCents;
  final int otherCostsCents;
  final String? currency;
  final String? transportationDetails;
  final String? accommodationDetails;
  final String? mealDetails;
  final String? otherCostsDetails;
  final String? submissionNotes;
  final List<SupportingDocument>? supportingDocuments;
  final String? classificationLevel;
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

  factory CreateCostSubmissionRequest.fromJson(
    Map<String, dynamic> json,
  ) => CreateCostSubmissionRequest(
    siteVisitId: json['site_visit_id'] as String,
    mmpFileId: json['mmp_file_id'] as String?,
    projectId: json['project_id'] as String?,
    transportationCostCents: (json['transportation_cost_cents'] as num).toInt(),
    accommodationCostCents: (json['accommodation_cost_cents'] as num).toInt(),
    mealAllowanceCents: (json['meal_allowance_cents'] as num).toInt(),
    otherCostsCents: (json['other_costs_cents'] as num).toInt(),
    currency: json['currency'] as String?,
    transportationDetails: json['transportation_details'] as String?,
    accommodationDetails: json['accommodation_details'] as String?,
    mealDetails: json['meal_details'] as String?,
    otherCostsDetails: json['other_costs_details'] as String?,
    submissionNotes: json['submission_notes'] as String?,
    supportingDocuments: (json['supporting_documents'] as List<dynamic>?)
        ?.map((e) => SupportingDocument.fromJson(e as Map<String, dynamic>))
        .toList(),
    classificationLevel: json['classification_level'] as String?,
    roleScope: json['role_scope'] as String?,
  );

  Map<String, dynamic> toJson() => <String, dynamic>{
    'site_visit_id': siteVisitId,
    'mmp_file_id': mmpFileId,
    'project_id': projectId,
    'transportation_cost_cents': transportationCostCents,
    'accommodation_cost_cents': accommodationCostCents,
    'meal_allowance_cents': mealAllowanceCents,
    'other_costs_cents': otherCostsCents,
    'currency': currency,
    'transportation_details': transportationDetails,
    'accommodation_details': accommodationDetails,
    'meal_details': mealDetails,
    'other_costs_details': otherCostsDetails,
    'submission_notes': submissionNotes,
    'supporting_documents': supportingDocuments,
    'classification_level': classificationLevel,
    'role_scope': roleScope,
  };

  /// Calculate total cost
  int get totalCostCents =>
      transportationCostCents +
      accommodationCostCents +
      mealAllowanceCents +
      otherCostsCents;
}

/// Request model for updating a cost submission
class UpdateCostSubmissionRequest {
  final int? transportationCostCents;
  final int? accommodationCostCents;
  final int? mealAllowanceCents;
  final int? otherCostsCents;
  final String? transportationDetails;
  final String? accommodationDetails;
  final String? mealDetails;
  final String? otherCostsDetails;
  final String? submissionNotes;
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
      UpdateCostSubmissionRequest(
        transportationCostCents: (json['transportation_cost_cents'] as num?)
            ?.toInt(),
        accommodationCostCents: (json['accommodation_cost_cents'] as num?)
            ?.toInt(),
        mealAllowanceCents: (json['meal_allowance_cents'] as num?)?.toInt(),
        otherCostsCents: (json['other_costs_cents'] as num?)?.toInt(),
        transportationDetails: json['transportation_details'] as String?,
        accommodationDetails: json['accommodation_details'] as String?,
        mealDetails: json['meal_details'] as String?,
        otherCostsDetails: json['other_costs_details'] as String?,
        submissionNotes: json['submission_notes'] as String?,
        supportingDocuments: (json['supporting_documents'] as List<dynamic>?)
            ?.map((e) => SupportingDocument.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
    'transportation_cost_cents': transportationCostCents,
    'accommodation_cost_cents': accommodationCostCents,
    'meal_allowance_cents': mealAllowanceCents,
    'other_costs_cents': otherCostsCents,
    'transportation_details': transportationDetails,
    'accommodation_details': accommodationDetails,
    'meal_details': mealDetails,
    'other_costs_details': otherCostsDetails,
    'submission_notes': submissionNotes,
    'supporting_documents': supportingDocuments,
  };
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
enum ReviewAction { approve, reject, requestRevision }

ReviewAction _reviewActionFromJson(String? value) {
  switch (value) {
    case 'approve':
      return ReviewAction.approve;
    case 'reject':
      return ReviewAction.reject;
    case 'request_revision':
      return ReviewAction.requestRevision;
    default:
      return ReviewAction.approve;
  }
}

String _reviewActionToJson(ReviewAction a) {
  switch (a) {
    case ReviewAction.requestRevision:
      return 'request_revision';
    default:
      return a.name;
  }
}

/// Review request model
class ReviewCostSubmissionRequest {
  final String submissionId;
  final ReviewAction action;
  final String? reviewerNotes;
  final String? approvalNotes;
  final String? revisionNotes;

  ReviewCostSubmissionRequest({
    required this.submissionId,
    required this.action,
    this.reviewerNotes,
    this.approvalNotes,
    this.revisionNotes,
  });

  factory ReviewCostSubmissionRequest.fromJson(Map<String, dynamic> json) =>
      ReviewCostSubmissionRequest(
        submissionId: json['submission_id'] as String,
        action: _reviewActionFromJson(json['action'] as String?),
        reviewerNotes: json['reviewer_notes'] as String?,
        approvalNotes: json['approval_notes'] as String?,
        revisionNotes: json['revision_notes'] as String?,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
    'submission_id': submissionId,
    'action': _reviewActionToJson(action),
    'reviewer_notes': reviewerNotes,
    'approval_notes': approvalNotes,
    'revision_notes': revisionNotes,
  };
}

/// Cost approval history model
class CostApprovalHistory {
  final String id;
  final String submissionId;
  final String reviewerId;
  final String action;
  final String? notes;
  final String? previousStatus;
  final String? newStatus;
  final DateTime createdAt;
  final String? reviewerName;
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
      CostApprovalHistory(
        id: json['id'] as String,
        submissionId: json['submission_id'] as String,
        reviewerId: json['reviewer_id'] as String,
        action: json['action'] as String,
        notes: json['notes'] as String?,
        previousStatus: json['previous_status'] as String?,
        newStatus: json['new_status'] as String?,
        createdAt: DateTime.parse(json['created_at'] as String),
        reviewerName: json['reviewer_name'] as String?,
        reviewerEmail: json['reviewer_email'] as String?,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
    'id': id,
    'submission_id': submissionId,
    'reviewer_id': reviewerId,
    'action': action,
    'notes': notes,
    'previous_status': previousStatus,
    'new_status': newStatus,
    'created_at': createdAt.toIso8601String(),
  };

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
