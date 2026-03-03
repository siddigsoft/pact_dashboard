import 'package:freezed_annotation/freezed_annotation.dart';

part 'down_payment_request.freezed.dart';

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

@Freezed(fromJson: false, toJson: false)
abstract class DownPaymentRequest with _$DownPaymentRequest {
  const factory DownPaymentRequest({
    required String id,
    @Default('') String siteVisitId,
    @Default('') String mmpSiteEntryId,
    @Default('') String siteName,
    required String requestedBy,
    required DateTime requestedAt,
    @Default('dataCollector') String requesterRole,
    String? hubId,
    String? hubName,
    @Default(0.0) double totalTransportationBudget,
    @Default(0.0) double requestedAmount,
    @Default('full_advance') String paymentType,
    @Default([]) List<InstallmentPlan> installmentPlan,
    @Default([]) List<PaidInstallment> paidInstallments,
    @Default('') String justification,
    @Default([]) List<String> supportingDocuments,
    String? supervisorId,
    String? supervisorStatus,
    String? supervisorApprovedBy,
    DateTime? supervisorApprovedAt,
    String? supervisorNotes,
    String? supervisorRejectionReason,
    String? adminStatus,
    String? adminProcessedBy,
    DateTime? adminProcessedAt,
    String? adminNotes,
    String? adminRejectionReason,
    @Default('pending_supervisor') String status,
    @Default(0.0) double totalPaidAmount,
    @Default(0.0) double? remainingAmount,
    @Default(<String>[]) List<String> walletTransactionIds,
    required DateTime createdAt,
    required DateTime updatedAt,
    @Default(<String, dynamic>{}) Map<String, dynamic> metadata,
  }) = _DownPaymentRequest;

  factory DownPaymentRequest.fromJson(
    Map<String, dynamic> json,
  ) => DownPaymentRequest(
    id: json['id'] as String,
    siteVisitId: json['site_visit_id'] as String? ?? '',
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
    installmentPlan: _installmentPlanFromJson(
      json['installment_plan'] as List<dynamic>?,
    ),
    paidInstallments: _paidInstallmentFromJson(
      json['paid_installments'] as List<dynamic>?,
    ),
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
    remainingAmount: (json['remaining_amount'] as num?)?.toDouble() ?? 0.0,
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

  const DownPaymentRequest._();

  Map<String, dynamic> toJson() => <String, dynamic>{
    'id': id,
    'site_visit_id': siteVisitId,
    'mmp_site_entry_id': mmpSiteEntryId,
    'site_name': siteName,
    'requested_by': requestedBy,
    'requested_at': requestedAt.toIso8601String(),
    'requester_role': requesterRole,
    'hub_id': hubId,
    'hub_name': hubName,
    'total_transportation_budget': totalTransportationBudget,
    'requested_amount': requestedAmount,
    'payment_type': paymentType,
    'installment_plan': _installmentPlanToJson(installmentPlan),
    'paid_installments': _paidInstallmentToJson(paidInstallments),
    'justification': justification,
    'supporting_documents': supportingDocuments,
    'supervisor_id': supervisorId,
    'supervisor_status': supervisorStatus,
    'supervisor_approved_by': supervisorApprovedBy,
    'supervisor_approved_at': supervisorApprovedAt?.toIso8601String(),
    'supervisor_notes': supervisorNotes,
    'supervisor_rejection_reason': supervisorRejectionReason,
    'admin_status': adminStatus,
    'admin_processed_by': adminProcessedBy,
    'admin_processed_at': adminProcessedAt?.toIso8601String(),
    'admin_notes': adminNotes,
    'admin_rejection_reason': adminRejectionReason,
    'status': status,
    'total_paid_amount': totalPaidAmount,
    'remaining_amount': remainingAmount,
    'wallet_transaction_ids': walletTransactionIds,
    'created_at': createdAt.toIso8601String(),
    'updated_at': updatedAt.toIso8601String(),
    'metadata': metadata,
  };

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

  // ── Reclaim Financial Gap computed properties ─────────────────────────────

  /// True when the site associated with this advance was reclaimed
  bool get isSiteReclaimed => metadata['site_reclaimed'] == true;

  /// True when this advance was auto-cancelled because the site was reclaimed
  /// while the advance was in pending state
  bool get isAutoCancelledOnReclaim =>
      metadata['auto_cancelled_on_reclaim'] == true;

  /// True when this advance was disbursed/approved but the site was later
  /// reclaimed — requires manual financial reconciliation by an admin
  bool get needsManualReconciliation =>
      metadata['manual_reconciliation_required'] == true;

  /// True when an admin has written off this advance after site reclaim
  bool get isWrittenOff => metadata['written_off'] == true;

  /// True when an admin has manually resolved the reconciliation
  bool get isReconciliationResolved =>
      metadata['reconciliation_resolved'] == true;

  /// The reason the site was reclaimed (from metadata)
  String? get siteReclaimReason =>
      metadata['site_reclaim_reason'] as String? ??
      metadata['reclaim_reason'] as String?;

  /// The reason this advance was written off
  String? get writeOffReason => metadata['write_off_reason'] as String?;

  /// Optional notes added during write-off
  String? get writeOffNotes => metadata['write_off_notes'] as String?;

  /// User ID who performed the write-off
  String? get writeOffBy => metadata['write_off_by'] as String?;

  /// ISO timestamp when the write-off was performed
  String? get writeOffAt => metadata['write_off_at'] as String?;

  /// ISO timestamp when the site was reclaimed
  String? get reclaimedAt => metadata['site_reclaimed_at'] as String?;

  /// Whether dispatch should be hard-blocked for this advance
  /// (disbursed advance needing reconciliation, not yet written off)
  bool get blocksRedispatch =>
      needsManualReconciliation && !isWrittenOff && !isReconciliationResolved;
}

// ============================================================================
// InstallmentPlan class
// ============================================================================

@Freezed(fromJson: false, toJson: false)
abstract class InstallmentPlan with _$InstallmentPlan {
  const factory InstallmentPlan({
    required int installmentNumber,
    required double amount,
    required DateTime dueDate,
    required String description,
  }) = _InstallmentPlan;

  factory InstallmentPlan.fromJson(Map<String, dynamic> json) =>
      InstallmentPlan(
        installmentNumber: (json['installment_number'] as num).toInt(),
        amount: (json['amount'] as num).toDouble(),
        dueDate: DateTime.parse(json['due_date'] as String),
        description: json['description'] as String,
      );

  const InstallmentPlan._();

  Map<String, dynamic> toJson() => <String, dynamic>{
    'installment_number': installmentNumber,
    'amount': amount,
    'due_date': dueDate.toIso8601String(),
    'description': description,
  };

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

@Freezed(fromJson: false, toJson: false)
abstract class PaidInstallment with _$PaidInstallment {
  const factory PaidInstallment({
    required int installmentNumber,
    required double amount,
    required DateTime paidAt,
    required String transactionId,
  }) = _PaidInstallment;

  factory PaidInstallment.fromJson(Map<String, dynamic> json) =>
      PaidInstallment(
        installmentNumber: (json['installment_number'] as num).toInt(),
        amount: (json['amount'] as num).toDouble(),
        paidAt: DateTime.parse(json['paid_at'] as String),
        transactionId: json['transaction_id'] as String,
      );

  const PaidInstallment._();

  Map<String, dynamic> toJson() => <String, dynamic>{
    'installment_number': installmentNumber,
    'amount': amount,
    'paid_at': paidAt.toIso8601String(),
    'transaction_id': transactionId,
  };

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
    } catch (_) {
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
    } catch (_) {
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
    } catch (_) {
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
