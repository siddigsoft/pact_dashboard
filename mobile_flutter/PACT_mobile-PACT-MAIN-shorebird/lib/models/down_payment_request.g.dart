// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'down_payment_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$DownPaymentRequestImpl _$$DownPaymentRequestImplFromJson(
  Map<String, dynamic> json,
) => _$DownPaymentRequestImpl(
  id: json['id'] as String,
  siteVisitId: json['site_visit_id'] as String,
  mmpSiteEntryId: json['mmp_site_entry_id'] as String? ?? '',
  siteName: json['site_name'] as String? ?? '',
  requestedBy: json['requested_by'] as String,
  requestedAt: DateTime.parse(json['requested_at'] as String),
  requesterRole: json['requester_role'] as String? ?? 'dataCollector',
  hubId: json['hub_id'] as String?,
  hubName: json['hub_name'] as String?,
  totalTransportationBudget:
      (json['total_transportation_budget'] as num?)?.toDouble() ?? 0.0,
  requestedAmount: (json['requested_amount'] as num?)?.toDouble() ?? 0.0,
  paymentType: json['payment_type'] as String? ?? 'full_advance',
  installmentPlan:
      (json['installment_plan'] as List<dynamic>?)
          ?.map((e) => InstallmentPlan.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
  paidInstallments:
      (json['paid_installments'] as List<dynamic>?)
          ?.map((e) => PaidInstallment.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
  justification: json['justification'] as String? ?? '',
  supportingDocuments:
      (json['supporting_documents'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList() ??
      const [],
  supervisorId: json['supervisor_id'] as String?,
  supervisorStatus: json['supervisor_status'] as String?,
  supervisorApprovedBy: json['supervisor_approved_by'] as String?,
  supervisorApprovedAt: json['supervisor_approved_at'] == null
      ? null
      : DateTime.parse(json['supervisor_approved_at'] as String),
  supervisorNotes: json['supervisor_notes'] as String?,
  supervisorRejectionReason: json['supervisor_rejection_reason'] as String?,
  adminStatus: json['admin_status'] as String?,
  adminProcessedBy: json['admin_processed_by'] as String?,
  adminProcessedAt: json['admin_processed_at'] == null
      ? null
      : DateTime.parse(json['admin_processed_at'] as String),
  adminNotes: json['admin_notes'] as String?,
  adminRejectionReason: json['admin_rejection_reason'] as String?,
  status: json['status'] as String? ?? 'pending_supervisor',
  totalPaidAmount: (json['total_paid_amount'] as num?)?.toDouble() ?? 0.0,
  remainingAmount: (json['remaining_amount'] as num?)?.toDouble(),
  walletTransactionIds:
      (json['wallet_transaction_ids'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList() ??
      const <String>[],
  createdAt: DateTime.parse(json['created_at'] as String),
  updatedAt: DateTime.parse(json['updated_at'] as String),
  metadata:
      json['metadata'] as Map<String, dynamic>? ?? const <String, dynamic>{},
);

Map<String, dynamic> _$$DownPaymentRequestImplToJson(
  _$DownPaymentRequestImpl instance,
) => <String, dynamic>{
  'id': instance.id,
  'site_visit_id': instance.siteVisitId,
  'mmp_site_entry_id': instance.mmpSiteEntryId,
  'site_name': instance.siteName,
  'requested_by': instance.requestedBy,
  'requested_at': instance.requestedAt.toIso8601String(),
  'requester_role': instance.requesterRole,
  'hub_id': instance.hubId,
  'hub_name': instance.hubName,
  'total_transportation_budget': instance.totalTransportationBudget,
  'requested_amount': instance.requestedAmount,
  'payment_type': instance.paymentType,
  'installment_plan': instance.installmentPlan,
  'paid_installments': instance.paidInstallments,
  'justification': instance.justification,
  'supporting_documents': instance.supportingDocuments,
  'supervisor_id': instance.supervisorId,
  'supervisor_status': instance.supervisorStatus,
  'supervisor_approved_by': instance.supervisorApprovedBy,
  'supervisor_approved_at': instance.supervisorApprovedAt?.toIso8601String(),
  'supervisor_notes': instance.supervisorNotes,
  'supervisor_rejection_reason': instance.supervisorRejectionReason,
  'admin_status': instance.adminStatus,
  'admin_processed_by': instance.adminProcessedBy,
  'admin_processed_at': instance.adminProcessedAt?.toIso8601String(),
  'admin_notes': instance.adminNotes,
  'admin_rejection_reason': instance.adminRejectionReason,
  'status': instance.status,
  'total_paid_amount': instance.totalPaidAmount,
  'remaining_amount': instance.remainingAmount,
  'wallet_transaction_ids': instance.walletTransactionIds,
  'created_at': instance.createdAt.toIso8601String(),
  'updated_at': instance.updatedAt.toIso8601String(),
  'metadata': instance.metadata,
};

_$InstallmentPlanImpl _$$InstallmentPlanImplFromJson(
  Map<String, dynamic> json,
) => _$InstallmentPlanImpl(
  installmentNumber: (json['installmentNumber'] as num).toInt(),
  amount: (json['amount'] as num).toDouble(),
  dueDate: DateTime.parse(json['dueDate'] as String),
  description: json['description'] as String,
);

Map<String, dynamic> _$$InstallmentPlanImplToJson(
  _$InstallmentPlanImpl instance,
) => <String, dynamic>{
  'installmentNumber': instance.installmentNumber,
  'amount': instance.amount,
  'dueDate': instance.dueDate.toIso8601String(),
  'description': instance.description,
};

_$PaidInstallmentImpl _$$PaidInstallmentImplFromJson(
  Map<String, dynamic> json,
) => _$PaidInstallmentImpl(
  installmentNumber: (json['installmentNumber'] as num).toInt(),
  amount: (json['amount'] as num).toDouble(),
  paidAt: DateTime.parse(json['paidAt'] as String),
  transactionId: json['transactionId'] as String,
);

Map<String, dynamic> _$$PaidInstallmentImplToJson(
  _$PaidInstallmentImpl instance,
) => <String, dynamic>{
  'installmentNumber': instance.installmentNumber,
  'amount': instance.amount,
  'paidAt': instance.paidAt.toIso8601String(),
  'transactionId': instance.transactionId,
};
