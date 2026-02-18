import 'package:flutter/foundation.dart';
import 'package:freezed_annotation/freezed_annotation.dart';

part 'down_payment_request.freezed.dart';
part 'down_payment_request.g.dart';

// ============================================================================
// Helper converters for nested objects
// ============================================================================

List<InstallmentPlan> _installmentPlanFromJson(List<dynamic>? json) {
  if (json == null) return [];
  try {
    return json
        .map((e) => InstallmentPlan.fromJson(e as Map<String, dynamic>))
        .toList();
  } catch (e) {
    debugPrint('Error parsing installment plans: $e');
    return [];
  }
}

List<Map<String, dynamic>> _installmentPlanToJson(List<InstallmentPlan> plans) {
  return plans.map((p) => p.toJson()).toList();
}

List<PaidInstallment> _paidInstallmentFromJson(List<dynamic>? json) {
  if (json == null) return [];
  try {
    return json
        .map((e) => PaidInstallment.fromJson(e as Map<String, dynamic>))
        .toList();
  } catch (e) {
    debugPrint('Error parsing paid installments: $e');
    return [];
  }
}

List<Map<String, dynamic>> _paidInstallmentToJson(
  List<PaidInstallment> installments,
) {
  return installments.map((p) => p.toJson()).toList();
}

// ============================================================================
// Main DownPaymentRequest class
// ============================================================================

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
    @JsonKey(
      name: 'installment_plan',
      fromJson: _installmentPlanFromJson,
      toJson: _installmentPlanToJson,
    )
    @Default([])
    List<InstallmentPlan> installmentPlan,
    @JsonKey(
      name: 'paid_installments',
      fromJson: _paidInstallmentFromJson,
      toJson: _paidInstallmentToJson,
    )
    @Default([])
    List<PaidInstallment> paidInstallments,
    @JsonKey(name: 'justification') @Default('') String justification,
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
    @JsonKey(name: 'status') @Default('pending_supervisor') String status,
    @JsonKey(name: 'total_paid_amount') @Default(0.0) double totalPaidAmount,
    @JsonKey(name: 'remaining_amount') @Default(0.0) double? remainingAmount,
    @JsonKey(name: 'wallet_transaction_ids')
    @Default(<String>[])
    List<String> walletTransactionIds,
    @JsonKey(name: 'created_at') required DateTime createdAt,
    @JsonKey(name: 'updated_at') required DateTime updatedAt,
    @Default(<String, dynamic>{}) Map<String, dynamic> metadata,
  }) = _DownPaymentRequest;

  factory DownPaymentRequest.fromJson(Map<String, dynamic> json) =>
      _$DownPaymentRequestFromJson(json);

  const DownPaymentRequest._();

  // ========================================================================
  // Computed properties
  // ========================================================================

  /// Check if request is pending supervisor approval
  bool get isPendingSupervisor =>
      status == DownPaymentStatus.pendingSupervisor.value;

  /// Check if request is pending admin approval
  bool get isPendingAdmin => status == DownPaymentStatus.pendingAdmin.value;

  /// Check if request is approved
  bool get isApproved => status == DownPaymentStatus.approved.value;

  /// Check if request is rejected
  bool get isRejected => status == DownPaymentStatus.rejected.value;

  /// Check if payment is partially completed
  bool get isPartiallyPaid => status == DownPaymentStatus.partiallyPaid.value;

  /// Check if payment is fully completed
  bool get isFullyPaid => status == DownPaymentStatus.fullyPaid.value;

  /// Check if request is cancelled
  bool get isCancelled => status == DownPaymentStatus.cancelled.value;

  /// Calculate remaining balance
  double get balanceRemaining =>
      (remainingAmount ?? 0.0) > 0 ? (remainingAmount ?? 0.0) : 0.0;

  /// Check if there are pending installments
  bool get hasPendingInstallments {
    if (installmentPlan.isEmpty) return false;
    return installmentPlan.length > paidInstallments.length;
  }

  /// Get number of paid installments
  int get paidInstallmentsCount => paidInstallments.length;

  /// Get total installments
  int get totalInstallments => installmentPlan.length;

  /// Get next due installment
  InstallmentPlan? get nextDueInstallment {
    if (!hasPendingInstallments) return null;
    return installmentPlan[paidInstallmentsCount];
  }

  /// Check if receipt has been confirmed with digital signature
  bool get isReceiptConfirmed {
    final rc = metadata['receipt_confirmation'] as Map<String, dynamic>?;
    return rc?['confirmed'] == true;
  }

  /// Get receipt confirmation timestamp
  String? get receiptConfirmedAt {
    final rc = metadata['receipt_confirmation'] as Map<String, dynamic>?;
    return rc?['confirmedAt'] as String?;
  }

  /// Get receipt signature method (handwriting or uuid)
  String? get receiptSignatureMethod {
    final rc = metadata['receipt_confirmation'] as Map<String, dynamic>?;
    return rc?['signatureMethod'] as String?;
  }

  /// Check if receipt can be confirmed (paid but not yet confirmed)
  bool get canConfirmReceipt {
    return (isPartiallyPaid || isFullyPaid) && !isReceiptConfirmed;
  }
}

// ============================================================================
// InstallmentPlan class
// ============================================================================

@freezed
class InstallmentPlan with _$InstallmentPlan {
  const factory InstallmentPlan({
    @JsonKey(name: 'installment_number') required int installmentNumber,
    required double amount,
    @JsonKey(name: 'due_date') required DateTime dueDate,
    required String description,
  }) = _InstallmentPlan;

  factory InstallmentPlan.fromJson(Map<String, dynamic> json) =>
      _$InstallmentPlanFromJson(json);

  const InstallmentPlan._();

  /// Check if installment is overdue
  bool get isOverdue => DateTime.now().isAfter(dueDate);

  /// Check if installment is due today
  bool get isDueToday {
    final today = DateTime.now();
    return dueDate.year == today.year &&
        dueDate.month == today.month &&
        dueDate.day == today.day;
  }

  /// Get days until due
  int get daysUntilDue {
    final difference = dueDate.difference(DateTime.now()).inDays;
    return difference > 0 ? difference : 0;
  }
}

// ============================================================================
// PaidInstallment class
// ============================================================================

@freezed
class PaidInstallment with _$PaidInstallment {
  const factory PaidInstallment({
    @JsonKey(name: 'installment_number') required int installmentNumber,
    required double amount,
    @JsonKey(name: 'paid_at') required DateTime paidAt,
    @JsonKey(name: 'transaction_id') required String transactionId,
  }) = _PaidInstallment;

  factory PaidInstallment.fromJson(Map<String, dynamic> json) =>
      _$PaidInstallmentFromJson(json);

  const PaidInstallment._();

  /// Format paid date as readable string
  String get formattedPaidDate =>
      '${paidAt.day}/${paidAt.month}/${paidAt.year}';
}

// ============================================================================
// Enums
// ============================================================================

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
    try {
      return DownPaymentStatus.values.firstWhere(
        (status) => status.value == value,
        orElse: () => DownPaymentStatus.pendingSupervisor,
      );
    } catch (e) {
      debugPrint('Error parsing DownPaymentStatus: $e');
      return DownPaymentStatus.pendingSupervisor;
    }
  }

  /// Get readable status name
  String get displayName {
    switch (this) {
      case DownPaymentStatus.pendingSupervisor:
        return 'Pending Supervisor';
      case DownPaymentStatus.pendingAdmin:
        return 'Pending Admin';
      case DownPaymentStatus.approved:
        return 'Approved';
      case DownPaymentStatus.rejected:
        return 'Rejected';
      case DownPaymentStatus.partiallyPaid:
        return 'Partially Paid';
      case DownPaymentStatus.fullyPaid:
        return 'Fully Paid';
      case DownPaymentStatus.cancelled:
        return 'Cancelled';
    }
  }

  /// Get status color for UI (hex code without #)
  String get statusColor {
    switch (this) {
      case DownPaymentStatus.pendingSupervisor:
      case DownPaymentStatus.pendingAdmin:
        return 'FF9800'; // Orange
      case DownPaymentStatus.approved:
        return '4CAF50'; // Green
      case DownPaymentStatus.rejected:
      case DownPaymentStatus.cancelled:
        return 'F44336'; // Red
      case DownPaymentStatus.partiallyPaid:
        return '2196F3'; // Blue
      case DownPaymentStatus.fullyPaid:
        return '4CAF50'; // Green
    }
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
    try {
      return SupervisorStatus.values.firstWhere(
        (status) => status.value == value,
        orElse: () => SupervisorStatus.pending,
      );
    } catch (e) {
      debugPrint('Error parsing SupervisorStatus: $e');
      return SupervisorStatus.pending;
    }
  }

  /// Get readable status name
  String get displayName {
    switch (this) {
      case SupervisorStatus.pending:
        return 'Pending';
      case SupervisorStatus.approved:
        return 'Approved';
      case SupervisorStatus.rejected:
        return 'Rejected';
      case SupervisorStatus.changesRequested:
        return 'Changes Requested';
    }
  }
}

enum AdminStatus {
  pending('pending'),
  approved('approved'),
  rejected('rejected');

  const AdminStatus(this.value);
  final String value;

  static AdminStatus fromString(String value) {
    try {
      return AdminStatus.values.firstWhere(
        (status) => status.value == value,
        orElse: () => AdminStatus.pending,
      );
    } catch (e) {
      debugPrint('Error parsing AdminStatus: $e');
      return AdminStatus.pending;
    }
  }

  /// Get readable status name
  String get displayName {
    switch (this) {
      case AdminStatus.pending:
        return 'Pending';
      case AdminStatus.approved:
        return 'Approved';
      case AdminStatus.rejected:
        return 'Rejected';
    }
  }
}
