import 'package:freezed_annotation/freezed_annotation.dart';

part 'down_payment_request.freezed.dart';
part 'down_payment_request.g.dart';

@freezed
class DownPaymentRequest with _$DownPaymentRequest {
  const factory DownPaymentRequest({
    required String id,
    @JsonKey(name: 'site_visit_id') required String siteVisitId,
    @JsonKey(name: 'mmp_site_entry_id') @Default('') String mmpSiteEntryId,
    @JsonKey(name: 'site_name') @Default('') String siteName,
    @JsonKey(name: 'requested_by') required String requestedBy,
    @JsonKey(name: 'requested_at') required DateTime requestedAt,
    @JsonKey(name: 'requester_role')
    @Default('dataCollector')
    String requesterRole,
    @JsonKey(name: 'hub_id') String? hubId,
    @JsonKey(name: 'hub_name') String? hubName,
    @JsonKey(name: 'total_transportation_budget')
    @Default(0.0)
    double totalTransportationBudget,
    @JsonKey(name: 'requested_amount') @Default(0.0) double requestedAmount,
    @JsonKey(name: 'payment_type') @Default('full_advance') String paymentType,
    @JsonKey(name: 'installment_plan')
    @Default([])
    List<InstallmentPlan> installmentPlan,
    @JsonKey(name: 'paid_installments')
    @Default([])
    List<PaidInstallment> paidInstallments,
    @Default('') String justification,
    @JsonKey(name: 'supporting_documents')
    @Default([])
    List<String> supportingDocuments,
    @JsonKey(name: 'supervisor_id') String? supervisorId,
    @JsonKey(name: 'supervisor_status') String? supervisorStatus,
    @JsonKey(name: 'supervisor_approved_by') String? supervisorApprovedBy,
    @JsonKey(name: 'supervisor_approved_at') DateTime? supervisorApprovedAt,
    @JsonKey(name: 'supervisor_notes') String? supervisorNotes,
    @JsonKey(name: 'supervisor_rejection_reason')
    String? supervisorRejectionReason,
    @JsonKey(name: 'admin_status') String? adminStatus,
    @JsonKey(name: 'admin_processed_by') String? adminProcessedBy,
    @JsonKey(name: 'admin_processed_at') DateTime? adminProcessedAt,
    @JsonKey(name: 'admin_notes') String? adminNotes,
    @JsonKey(name: 'admin_rejection_reason') String? adminRejectionReason,
    @Default('pending_supervisor') String status,
    @JsonKey(name: 'total_paid_amount') @Default(0.0) double totalPaidAmount,
    @JsonKey(name: 'remaining_amount') double? remainingAmount,
    @JsonKey(name: 'wallet_transaction_ids')
    @Default(<String>[])
    List<String> walletTransactionIds,
    @JsonKey(name: 'created_at') required DateTime createdAt,
    @JsonKey(name: 'updated_at') required DateTime updatedAt,
    @Default(<String, dynamic>{}) Map<String, dynamic> metadata,
  }) = _DownPaymentRequest;

  factory DownPaymentRequest.fromJson(Map<String, dynamic> json) =>
      _$DownPaymentRequestFromJson(json);
}

@freezed
class InstallmentPlan with _$InstallmentPlan {
  const factory InstallmentPlan({
    required int installmentNumber,
    required double amount,
    required DateTime dueDate,
    required String description,
  }) = _InstallmentPlan;

  factory InstallmentPlan.fromJson(Map<String, dynamic> json) =>
      _$InstallmentPlanFromJson(json);
}

@freezed
class PaidInstallment with _$PaidInstallment {
  const factory PaidInstallment({
    required int installmentNumber,
    required double amount,
    required DateTime paidAt,
    required String transactionId,
  }) = _PaidInstallment;

  factory PaidInstallment.fromJson(Map<String, dynamic> json) =>
      _$PaidInstallmentFromJson(json);
}

enum DownPaymentStatus {
  pendingSupervisor('pending_supervisor'),
  pendingAdmin('pending_admin'),
  approved('approved'),
  rejected('rejected'),
  partiallyPaid('partially_paid'),
  fullyPaid('fully_paid'),
  cancelled('cancelled');

  const DownPaymentStatus(this.value);
  final String value;

  static DownPaymentStatus fromString(String value) {
    return DownPaymentStatus.values.firstWhere(
      (status) => status.value == value,
      orElse: () => DownPaymentStatus.pendingSupervisor,
    );
  }
}

enum SupervisorStatus {
  pending('pending'),
  approved('approved'),
  rejected('rejected'),
  changesRequested('changes_requested');

  const SupervisorStatus(this.value);
  final String value;

  static SupervisorStatus fromString(String value) {
    return SupervisorStatus.values.firstWhere(
      (status) => status.value == value,
      orElse: () => SupervisorStatus.pending,
    );
  }
}

enum AdminStatus {
  pending('pending'),
  approved('approved'),
  rejected('rejected');

  const AdminStatus(this.value);
  final String value;

  static AdminStatus fromString(String value) {
    return AdminStatus.values.firstWhere(
      (status) => status.value == value,
      orElse: () => AdminStatus.pending,
    );
  }
}
