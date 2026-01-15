import 'package:json_annotation/json_annotation.dart';

part 'cost_submission.g.dart';

/// Cost submission status lifecycle:
/// pending → under_review → approved → paid
/// or → rejected / cancelled
enum CostSubmissionStatus {
  pending,
  @JsonValue('under_review')
  underReview,
  approved,
  paid,
  rejected,
  cancelled;

  String get displayName {
    switch (this) {
      case CostSubmissionStatus.pending:
        return 'Pending';
      case CostSubmissionStatus.underReview:
        return 'Under Review';
      case CostSubmissionStatus.approved:
        return 'Approved';
      case CostSubmissionStatus.paid:
        return 'Paid';
      case CostSubmissionStatus.rejected:
        return 'Rejected';
      case CostSubmissionStatus.cancelled:
        return 'Cancelled';
    }
  }

  bool get canEdit => this == CostSubmissionStatus.pending;
  bool get canApprove =>
      this == CostSubmissionStatus.pending ||
      this == CostSubmissionStatus.underReview;
  bool get canPay => this == CostSubmissionStatus.approved;
  bool get isSettled =>
      this == CostSubmissionStatus.paid ||
      this == CostSubmissionStatus.rejected ||
      this == CostSubmissionStatus.cancelled;
}

@JsonSerializable()
class CostSubmission {
  final String id;
  @JsonKey(name: 'site_visit_id')
  final String siteVisitId;
  @JsonKey(name: 'user_id')
  final String userId;
  final String currency;
  final double amount;
  
  @JsonKey(
    name: 'status',
    unknownEnumValue: CostSubmissionStatus.pending,
  )
  final CostSubmissionStatus status;
  
  @JsonKey(name: 'submission_date')
  final DateTime submissionDate;
  
  // Approval tracking
  @JsonKey(name: 'approved_by')
  final String? approvedBy;
  @JsonKey(name: 'approved_at')
  final DateTime? approvedAt;
  
  // Payment tracking
  @JsonKey(name: 'paid_by')
  final String? paidBy;
  @JsonKey(name: 'paid_at')
  final DateTime? paidAt;
  @JsonKey(name: 'payment_wallet_tx_id')
  final String? paymentWalletTxId;
  
  // Audit and notes
  final String? notes;
  @JsonKey(name: 'reference_id')
  final String? referenceId; // Client-generated UUID for offline dedup
  
  @JsonKey(name: 'created_at')
  final DateTime createdAt;
  @JsonKey(name: 'updated_at')
  final DateTime updatedAt;

  CostSubmission({
    required this.id,
    required this.siteVisitId,
    required this.userId,
    this.currency = 'SDG',
    required this.amount,
    this.status = CostSubmissionStatus.pending,
    required this.submissionDate,
    this.approvedBy,
    this.approvedAt,
    this.paidBy,
    this.paidAt,
    this.paymentWalletTxId,
    this.notes,
    this.referenceId,
    required this.createdAt,
    required this.updatedAt,
  });

  factory CostSubmission.fromJson(Map<String, dynamic> json) =>
      _$CostSubmissionFromJson(json);
  
  Map<String, dynamic> toJson() => _$CostSubmissionToJson(this);

  CostSubmission copyWith({
    String? id,
    String? siteVisitId,
    String? userId,
    String? currency,
    double? amount,
    CostSubmissionStatus? status,
    DateTime? submissionDate,
    String? approvedBy,
    DateTime? approvedAt,
    String? paidBy,
    DateTime? paidAt,
    String? paymentWalletTxId,
    String? notes,
    String? referenceId,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return CostSubmission(
      id: id ?? this.id,
      siteVisitId: siteVisitId ?? this.siteVisitId,
      userId: userId ?? this.userId,
      currency: currency ?? this.currency,
      amount: amount ?? this.amount,
      status: status ?? this.status,
      submissionDate: submissionDate ?? this.submissionDate,
      approvedBy: approvedBy ?? this.approvedBy,
      approvedAt: approvedAt ?? this.approvedAt,
      paidBy: paidBy ?? this.paidBy,
      paidAt: paidAt ?? this.paidAt,
      paymentWalletTxId: paymentWalletTxId ?? this.paymentWalletTxId,
      notes: notes ?? this.notes,
      referenceId: referenceId ?? this.referenceId,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  /// Check if this submission can be edited by the user
  bool canBeEditedBy(String currentUserId) {
    return userId == currentUserId && status.canEdit;
  }

  /// Check if this submission can be approved by an admin
  bool get canBeApproved => status.canApprove;

  /// Check if this submission can be paid
  bool get canBePaid => status.canPay;

  /// Check if this submission is settled (final state)
  bool get isSettled => status.isSettled;

  /// Get status color for UI
  String get statusColor {
    switch (status) {
      case CostSubmissionStatus.pending:
      case CostSubmissionStatus.underReview:
        return '#FFA726'; // Orange
      case CostSubmissionStatus.approved:
        return '#66BB6A'; // Green
      case CostSubmissionStatus.paid:
        return '#42A5F5'; // Blue
      case CostSubmissionStatus.rejected:
      case CostSubmissionStatus.cancelled:
        return '#EF5350'; // Red
    }
  }
}
