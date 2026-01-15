// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cost_submission_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportingDocument _$SupportingDocumentFromJson(Map<String, dynamic> json) =>
    SupportingDocument(
      id: json['id'] as String,
      url: json['url'] as String,
      type: json['type'] as String,
      filename: json['filename'] as String,
      uploadedAt: DateTime.parse(json['uploaded_at'] as String),
    );

Map<String, dynamic> _$SupportingDocumentToJson(SupportingDocument instance) =>
    <String, dynamic>{
      'id': instance.id,
      'url': instance.url,
      'type': instance.type,
      'filename': instance.filename,
      'uploaded_at': instance.uploadedAt.toIso8601String(),
    };

CostSubmission _$CostSubmissionFromJson(
  Map<String, dynamic> json,
) => CostSubmission(
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
  status: $enumDecode(_$CostSubmissionStatusEnumMap, json['status']),
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
);

Map<String, dynamic> _$CostSubmissionToJson(CostSubmission instance) =>
    <String, dynamic>{
      'id': instance.id,
      'site_visit_id': instance.siteVisitId,
      'mmp_file_id': instance.mmpFileId,
      'project_id': instance.projectId,
      'submitted_by': instance.submittedBy,
      'submitted_at': instance.submittedAt.toIso8601String(),
      'transportation_cost_cents': instance.transportationCostCents,
      'accommodation_cost_cents': instance.accommodationCostCents,
      'meal_allowance_cents': instance.mealAllowanceCents,
      'other_costs_cents': instance.otherCostsCents,
      'total_cost_cents': instance.totalCostCents,
      'currency': instance.currency,
      'transportation_details': instance.transportationDetails,
      'accommodation_details': instance.accommodationDetails,
      'meal_details': instance.mealDetails,
      'other_costs_details': instance.otherCostsDetails,
      'submission_notes': instance.submissionNotes,
      'supporting_documents': instance.supportingDocuments,
      'status': _$CostSubmissionStatusEnumMap[instance.status]!,
      'reviewed_by': instance.reviewedBy,
      'reviewed_at': instance.reviewedAt?.toIso8601String(),
      'reviewer_notes': instance.reviewerNotes,
      'approval_notes': instance.approvalNotes,
      'wallet_transaction_id': instance.walletTransactionId,
      'paid_at': instance.paidAt?.toIso8601String(),
      'paid_amount_cents': instance.paidAmountCents,
      'payment_notes': instance.paymentNotes,
      'classification_level': instance.classificationLevel,
      'role_scope': instance.roleScope,
      'revision_requested': instance.revisionRequested,
      'revision_notes': instance.revisionNotes,
      'revision_count': instance.revisionCount,
      'created_at': instance.createdAt.toIso8601String(),
      'updated_at': instance.updatedAt.toIso8601String(),
    };

const _$CostSubmissionStatusEnumMap = {
  CostSubmissionStatus.pending: 'pending',
  CostSubmissionStatus.underReview: 'under_review',
  CostSubmissionStatus.approved: 'approved',
  CostSubmissionStatus.rejected: 'rejected',
  CostSubmissionStatus.paid: 'paid',
  CostSubmissionStatus.cancelled: 'cancelled',
};

CreateCostSubmissionRequest _$CreateCostSubmissionRequestFromJson(
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

Map<String, dynamic> _$CreateCostSubmissionRequestToJson(
  CreateCostSubmissionRequest instance,
) => <String, dynamic>{
  'site_visit_id': instance.siteVisitId,
  'mmp_file_id': instance.mmpFileId,
  'project_id': instance.projectId,
  'transportation_cost_cents': instance.transportationCostCents,
  'accommodation_cost_cents': instance.accommodationCostCents,
  'meal_allowance_cents': instance.mealAllowanceCents,
  'other_costs_cents': instance.otherCostsCents,
  'currency': instance.currency,
  'transportation_details': instance.transportationDetails,
  'accommodation_details': instance.accommodationDetails,
  'meal_details': instance.mealDetails,
  'other_costs_details': instance.otherCostsDetails,
  'submission_notes': instance.submissionNotes,
  'supporting_documents': instance.supportingDocuments,
  'classification_level': instance.classificationLevel,
  'role_scope': instance.roleScope,
};

UpdateCostSubmissionRequest _$UpdateCostSubmissionRequestFromJson(
  Map<String, dynamic> json,
) => UpdateCostSubmissionRequest(
  transportationCostCents: (json['transportation_cost_cents'] as num?)?.toInt(),
  accommodationCostCents: (json['accommodation_cost_cents'] as num?)?.toInt(),
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

Map<String, dynamic> _$UpdateCostSubmissionRequestToJson(
  UpdateCostSubmissionRequest instance,
) => <String, dynamic>{
  'transportation_cost_cents': instance.transportationCostCents,
  'accommodation_cost_cents': instance.accommodationCostCents,
  'meal_allowance_cents': instance.mealAllowanceCents,
  'other_costs_cents': instance.otherCostsCents,
  'transportation_details': instance.transportationDetails,
  'accommodation_details': instance.accommodationDetails,
  'meal_details': instance.mealDetails,
  'other_costs_details': instance.otherCostsDetails,
  'submission_notes': instance.submissionNotes,
  'supporting_documents': instance.supportingDocuments,
};

ReviewCostSubmissionRequest _$ReviewCostSubmissionRequestFromJson(
  Map<String, dynamic> json,
) => ReviewCostSubmissionRequest(
  submissionId: json['submission_id'] as String,
  action: $enumDecode(_$ReviewActionEnumMap, json['action']),
  reviewerNotes: json['reviewer_notes'] as String?,
  approvalNotes: json['approval_notes'] as String?,
  revisionNotes: json['revision_notes'] as String?,
);

Map<String, dynamic> _$ReviewCostSubmissionRequestToJson(
  ReviewCostSubmissionRequest instance,
) => <String, dynamic>{
  'submission_id': instance.submissionId,
  'action': _$ReviewActionEnumMap[instance.action]!,
  'reviewer_notes': instance.reviewerNotes,
  'approval_notes': instance.approvalNotes,
  'revision_notes': instance.revisionNotes,
};

const _$ReviewActionEnumMap = {
  ReviewAction.approve: 'approve',
  ReviewAction.reject: 'reject',
  ReviewAction.requestRevision: 'request_revision',
};

CostApprovalHistory _$CostApprovalHistoryFromJson(Map<String, dynamic> json) =>
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

Map<String, dynamic> _$CostApprovalHistoryToJson(
  CostApprovalHistory instance,
) => <String, dynamic>{
  'id': instance.id,
  'submission_id': instance.submissionId,
  'reviewer_id': instance.reviewerId,
  'action': instance.action,
  'notes': instance.notes,
  'previous_status': instance.previousStatus,
  'new_status': instance.newStatus,
  'created_at': instance.createdAt.toIso8601String(),
};
