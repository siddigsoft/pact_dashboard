// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cost_submission.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CostSubmission _$CostSubmissionFromJson(Map<String, dynamic> json) =>
    CostSubmission(
      id: json['id'] as String,
      siteVisitId: json['site_visit_id'] as String,
      userId: json['user_id'] as String,
      currency: json['currency'] as String? ?? 'SDG',
      amount: (json['amount'] as num).toDouble(),
      status:
          $enumDecodeNullable(
            _$CostSubmissionStatusEnumMap,
            json['status'],
            unknownValue: CostSubmissionStatus.pending,
          ) ??
          CostSubmissionStatus.pending,
      submissionDate: DateTime.parse(json['submission_date'] as String),
      approvedBy: json['approved_by'] as String?,
      approvedAt: json['approved_at'] == null
          ? null
          : DateTime.parse(json['approved_at'] as String),
      paidBy: json['paid_by'] as String?,
      paidAt: json['paid_at'] == null
          ? null
          : DateTime.parse(json['paid_at'] as String),
      paymentWalletTxId: json['payment_wallet_tx_id'] as String?,
      notes: json['notes'] as String?,
      referenceId: json['reference_id'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
    );

Map<String, dynamic> _$CostSubmissionToJson(CostSubmission instance) =>
    <String, dynamic>{
      'id': instance.id,
      'site_visit_id': instance.siteVisitId,
      'user_id': instance.userId,
      'currency': instance.currency,
      'amount': instance.amount,
      'status': _$CostSubmissionStatusEnumMap[instance.status]!,
      'submission_date': instance.submissionDate.toIso8601String(),
      'approved_by': instance.approvedBy,
      'approved_at': instance.approvedAt?.toIso8601String(),
      'paid_by': instance.paidBy,
      'paid_at': instance.paidAt?.toIso8601String(),
      'payment_wallet_tx_id': instance.paymentWalletTxId,
      'notes': instance.notes,
      'reference_id': instance.referenceId,
      'created_at': instance.createdAt.toIso8601String(),
      'updated_at': instance.updatedAt.toIso8601String(),
    };

const _$CostSubmissionStatusEnumMap = {
  CostSubmissionStatus.pending: 'pending',
  CostSubmissionStatus.underReview: 'under_review',
  CostSubmissionStatus.approved: 'approved',
  CostSubmissionStatus.paid: 'paid',
  CostSubmissionStatus.rejected: 'rejected',
  CostSubmissionStatus.cancelled: 'cancelled',
};
