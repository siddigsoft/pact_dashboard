/// Cost Submission Models for PACT Mobile App
///
/// Mirrors the web app's cost submission system with:
/// - Two-tier approval workflow
/// - 9 operational expense categories
/// - Advance and reimbursement request types
/// - Full bilingual support (English/Arabic)
library;

// Request type distinguishes advance payments from reimbursements
enum CostRequestType { advance, reimbursement }

extension CostRequestTypeExtension on CostRequestType {
  String get value {
    switch (this) {
      case CostRequestType.advance:
        return 'advance';
      case CostRequestType.reimbursement:
        return 'reimbursement';
    }
  }

  String get labelEn {
    switch (this) {
      case CostRequestType.advance:
        return 'Advance Payment';
      case CostRequestType.reimbursement:
        return 'Reimbursement';
    }
  }

  String get labelAr {
    switch (this) {
      case CostRequestType.advance:
        return 'دفعة مقدمة';
      case CostRequestType.reimbursement:
        return 'استرداد';
    }
  }

  static CostRequestType fromString(String value) {
    switch (value) {
      case 'advance':
        return CostRequestType.advance;
      case 'reimbursement':
        return CostRequestType.reimbursement;
      default:
        return CostRequestType.advance;
    }
  }
}

// Cost submission status
enum CostSubmissionStatus {
  pending,
  underReview,
  approved,
  rejected,
  disbursed,
  reconciliationPending,
  reconciled,
  paid,
  closed,
  cancelled,
}

extension CostSubmissionStatusExtension on CostSubmissionStatus {
  String get value {
    switch (this) {
      case CostSubmissionStatus.pending:
        return 'pending';
      case CostSubmissionStatus.underReview:
        return 'under_review';
      case CostSubmissionStatus.approved:
        return 'approved';
      case CostSubmissionStatus.rejected:
        return 'rejected';
      case CostSubmissionStatus.disbursed:
        return 'disbursed';
      case CostSubmissionStatus.reconciliationPending:
        return 'reconciliation_pending';
      case CostSubmissionStatus.reconciled:
        return 'reconciled';
      case CostSubmissionStatus.paid:
        return 'paid';
      case CostSubmissionStatus.closed:
        return 'closed';
      case CostSubmissionStatus.cancelled:
        return 'cancelled';
    }
  }

  String get labelEn {
    switch (this) {
      case CostSubmissionStatus.pending:
        return 'Pending';
      case CostSubmissionStatus.underReview:
        return 'Under Review';
      case CostSubmissionStatus.approved:
        return 'Approved';
      case CostSubmissionStatus.rejected:
        return 'Rejected';
      case CostSubmissionStatus.disbursed:
        return 'Disbursed';
      case CostSubmissionStatus.reconciliationPending:
        return 'Reconciliation Pending';
      case CostSubmissionStatus.reconciled:
        return 'Reconciled';
      case CostSubmissionStatus.paid:
        return 'Paid';
      case CostSubmissionStatus.closed:
        return 'Closed';
      case CostSubmissionStatus.cancelled:
        return 'Cancelled';
    }
  }

  String get labelAr {
    switch (this) {
      case CostSubmissionStatus.pending:
        return 'قيد الانتظار';
      case CostSubmissionStatus.underReview:
        return 'قيد المراجعة';
      case CostSubmissionStatus.approved:
        return 'موافق عليه';
      case CostSubmissionStatus.rejected:
        return 'مرفوض';
      case CostSubmissionStatus.disbursed:
        return 'تم الصرف';
      case CostSubmissionStatus.reconciliationPending:
        return 'تسوية معلقة';
      case CostSubmissionStatus.reconciled:
        return 'تمت التسوية';
      case CostSubmissionStatus.paid:
        return 'مدفوع';
      case CostSubmissionStatus.closed:
        return 'مغلق';
      case CostSubmissionStatus.cancelled:
        return 'ملغى';
    }
  }

  static CostSubmissionStatus fromString(String? value) {
    switch (value) {
      case 'pending':
        return CostSubmissionStatus.pending;
      case 'under_review':
        return CostSubmissionStatus.underReview;
      case 'approved':
        return CostSubmissionStatus.approved;
      case 'rejected':
        return CostSubmissionStatus.rejected;
      case 'disbursed':
        return CostSubmissionStatus.disbursed;
      case 'reconciliation_pending':
        return CostSubmissionStatus.reconciliationPending;
      case 'reconciled':
        return CostSubmissionStatus.reconciled;
      case 'paid':
        return CostSubmissionStatus.paid;
      case 'closed':
        return CostSubmissionStatus.closed;
      case 'cancelled':
        return CostSubmissionStatus.cancelled;
      default:
        return CostSubmissionStatus.pending;
    }
  }
}

// Tier approval statuses
enum TierApprovalStatus { pending, approved, rejected, changesRequested }

extension TierApprovalStatusExtension on TierApprovalStatus {
  String get value {
    switch (this) {
      case TierApprovalStatus.pending:
        return 'pending';
      case TierApprovalStatus.approved:
        return 'approved';
      case TierApprovalStatus.rejected:
        return 'rejected';
      case TierApprovalStatus.changesRequested:
        return 'changes_requested';
    }
  }

  static TierApprovalStatus fromString(String? value) {
    switch (value) {
      case 'pending':
        return TierApprovalStatus.pending;
      case 'approved':
        return TierApprovalStatus.approved;
      case 'rejected':
        return TierApprovalStatus.rejected;
      case 'changes_requested':
        return TierApprovalStatus.changesRequested;
      default:
        return TierApprovalStatus.pending;
    }
  }
}

// Balance status for advance payments
enum BalanceStatus { notApplicable, open, settled, underspent, overspent }

extension BalanceStatusExtension on BalanceStatus {
  String get value {
    switch (this) {
      case BalanceStatus.notApplicable:
        return 'not_applicable';
      case BalanceStatus.open:
        return 'open';
      case BalanceStatus.settled:
        return 'settled';
      case BalanceStatus.underspent:
        return 'underspent';
      case BalanceStatus.overspent:
        return 'overspent';
    }
  }

  String get labelEn {
    switch (this) {
      case BalanceStatus.notApplicable:
        return 'N/A';
      case BalanceStatus.open:
        return 'Open Balance';
      case BalanceStatus.settled:
        return 'Settled';
      case BalanceStatus.underspent:
        return 'Underspent';
      case BalanceStatus.overspent:
        return 'Overspent';
    }
  }

  String get labelAr {
    switch (this) {
      case BalanceStatus.notApplicable:
        return 'غير قابل للتطبيق';
      case BalanceStatus.open:
        return 'رصيد مفتوح';
      case BalanceStatus.settled:
        return 'تمت التسوية';
      case BalanceStatus.underspent:
        return 'إنفاق أقل';
      case BalanceStatus.overspent:
        return 'إنفاق زائد';
    }
  }

  static BalanceStatus fromString(String? value) {
    switch (value) {
      case 'not_applicable':
        return BalanceStatus.notApplicable;
      case 'open':
        return BalanceStatus.open;
      case 'settled':
        return BalanceStatus.settled;
      case 'underspent':
        return BalanceStatus.underspent;
      case 'overspent':
        return BalanceStatus.overspent;
      default:
        return BalanceStatus.notApplicable;
    }
  }
}

// 9 Operational expense categories
enum OperationalExpenseCategory {
  permits,
  incentives,
  communications,
  training,
  generalTransport,
  equipment,
  printing,
  meetings,
  other,
}

extension OperationalExpenseCategoryExtension on OperationalExpenseCategory {
  String get value {
    switch (this) {
      case OperationalExpenseCategory.permits:
        return 'permits';
      case OperationalExpenseCategory.incentives:
        return 'incentives';
      case OperationalExpenseCategory.communications:
        return 'communications';
      case OperationalExpenseCategory.training:
        return 'training';
      case OperationalExpenseCategory.generalTransport:
        return 'general_transport';
      case OperationalExpenseCategory.equipment:
        return 'equipment';
      case OperationalExpenseCategory.printing:
        return 'printing';
      case OperationalExpenseCategory.meetings:
        return 'meetings';
      case OperationalExpenseCategory.other:
        return 'other';
    }
  }

  String get labelEn {
    switch (this) {
      case OperationalExpenseCategory.permits:
        return 'Permits';
      case OperationalExpenseCategory.incentives:
        return 'Incentives';
      case OperationalExpenseCategory.communications:
        return 'Communications';
      case OperationalExpenseCategory.training:
        return 'Training';
      case OperationalExpenseCategory.generalTransport:
        return 'General Transportation';
      case OperationalExpenseCategory.equipment:
        return 'Equipment & Supplies';
      case OperationalExpenseCategory.printing:
        return 'Printing & Materials';
      case OperationalExpenseCategory.meetings:
        return 'Meetings & Events';
      case OperationalExpenseCategory.other:
        return 'Other';
    }
  }

  String get labelAr {
    switch (this) {
      case OperationalExpenseCategory.permits:
        return 'التصاريح';
      case OperationalExpenseCategory.incentives:
        return 'الحوافز';
      case OperationalExpenseCategory.communications:
        return 'الاتصالات';
      case OperationalExpenseCategory.training:
        return 'التدريب';
      case OperationalExpenseCategory.generalTransport:
        return 'النقل العام';
      case OperationalExpenseCategory.equipment:
        return 'المعدات واللوازم';
      case OperationalExpenseCategory.printing:
        return 'الطباعة والمواد';
      case OperationalExpenseCategory.meetings:
        return 'الاجتماعات والفعاليات';
      case OperationalExpenseCategory.other:
        return 'أخرى';
    }
  }

  static OperationalExpenseCategory fromString(String? value) {
    switch (value) {
      case 'permits':
        return OperationalExpenseCategory.permits;
      case 'incentives':
        return OperationalExpenseCategory.incentives;
      case 'communications':
        return OperationalExpenseCategory.communications;
      case 'training':
        return OperationalExpenseCategory.training;
      case 'general_transport':
        return OperationalExpenseCategory.generalTransport;
      case 'equipment':
        return OperationalExpenseCategory.equipment;
      case 'printing':
        return OperationalExpenseCategory.printing;
      case 'meetings':
        return OperationalExpenseCategory.meetings;
      case 'other':
        return OperationalExpenseCategory.other;
      default:
        return OperationalExpenseCategory.other;
    }
  }

  static List<OperationalExpenseCategory> get allCategories =>
      OperationalExpenseCategory.values;
}

// Budget line categories
enum BudgetLineCategory {
  transportationAndVisitFees,
  permitFee,
  internetAndCommunicationFees,
  trainingAndCapacityBuilding,
  equipmentAndSupplies,
  officeAndAdmin,
  personnelAllowances,
  other,
}

extension BudgetLineCategoryExtension on BudgetLineCategory {
  String get value {
    switch (this) {
      case BudgetLineCategory.transportationAndVisitFees:
        return 'transportation_and_visit_fees';
      case BudgetLineCategory.permitFee:
        return 'permit_fee';
      case BudgetLineCategory.internetAndCommunicationFees:
        return 'internet_and_communication_fees';
      case BudgetLineCategory.trainingAndCapacityBuilding:
        return 'training_and_capacity_building';
      case BudgetLineCategory.equipmentAndSupplies:
        return 'equipment_and_supplies';
      case BudgetLineCategory.officeAndAdmin:
        return 'office_and_admin';
      case BudgetLineCategory.personnelAllowances:
        return 'personnel_allowances';
      case BudgetLineCategory.other:
        return 'other';
    }
  }

  String get labelEn {
    switch (this) {
      case BudgetLineCategory.transportationAndVisitFees:
        return 'Transportation & Visit Fees';
      case BudgetLineCategory.permitFee:
        return 'Permit Fees';
      case BudgetLineCategory.internetAndCommunicationFees:
        return 'Internet & Communications';
      case BudgetLineCategory.trainingAndCapacityBuilding:
        return 'Training & Capacity Building';
      case BudgetLineCategory.equipmentAndSupplies:
        return 'Equipment & Supplies';
      case BudgetLineCategory.officeAndAdmin:
        return 'Office & Admin';
      case BudgetLineCategory.personnelAllowances:
        return 'Personnel Allowances';
      case BudgetLineCategory.other:
        return 'Other';
    }
  }

  String get labelAr {
    switch (this) {
      case BudgetLineCategory.transportationAndVisitFees:
        return 'رسوم النقل والزيارة';
      case BudgetLineCategory.permitFee:
        return 'رسوم التصاريح';
      case BudgetLineCategory.internetAndCommunicationFees:
        return 'الإنترنت والاتصالات';
      case BudgetLineCategory.trainingAndCapacityBuilding:
        return 'التدريب وبناء القدرات';
      case BudgetLineCategory.equipmentAndSupplies:
        return 'المعدات واللوازم';
      case BudgetLineCategory.officeAndAdmin:
        return 'المكتب والإدارة';
      case BudgetLineCategory.personnelAllowances:
        return 'بدلات الموظفين';
      case BudgetLineCategory.other:
        return 'أخرى';
    }
  }

  static BudgetLineCategory fromString(String? value) {
    switch (value) {
      case 'transportation_and_visit_fees':
        return BudgetLineCategory.transportationAndVisitFees;
      case 'permit_fee':
        return BudgetLineCategory.permitFee;
      case 'internet_and_communication_fees':
        return BudgetLineCategory.internetAndCommunicationFees;
      case 'training_and_capacity_building':
        return BudgetLineCategory.trainingAndCapacityBuilding;
      case 'equipment_and_supplies':
        return BudgetLineCategory.equipmentAndSupplies;
      case 'office_and_admin':
        return BudgetLineCategory.officeAndAdmin;
      case 'personnel_allowances':
        return BudgetLineCategory.personnelAllowances;
      case 'other':
        return BudgetLineCategory.other;
      default:
        return BudgetLineCategory.other;
    }
  }
}

// Supporting document model
class SupportingDocument {
  final String url;
  final String type; // 'receipt' | 'photo' | 'invoice' | 'other'
  final String filename;
  final String uploadedAt;
  final int? size;
  final String? description;

  SupportingDocument({
    required this.url,
    required this.type,
    required this.filename,
    required this.uploadedAt,
    this.size,
    this.description,
  });

  factory SupportingDocument.fromJson(Map<String, dynamic> json) {
    return SupportingDocument(
      url: json['url'] ?? '',
      type: json['type'] ?? 'other',
      filename: json['filename'] ?? '',
      uploadedAt: json['uploadedAt'] ?? json['uploaded_at'] ?? '',
      size: json['size'],
      description: json['description'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'url': url,
      'type': type,
      'filename': filename,
      'uploadedAt': uploadedAt,
      if (size != null) 'size': size,
      if (description != null) 'description': description,
    };
  }
}

// Operational Cost Submission model
class OperationalCostSubmission {
  final String id;
  final OperationalExpenseCategory expenseCategory;
  final String? hubId;
  final String? projectId;
  final String? mmpFileId;
  final String submittedBy;
  final String submittedAt;
  final String submitterRole;
  final int amountCents;
  final String currency;
  final String description;
  final String expenseDate;
  final String? vendor;
  final String? referenceNumber;
  final List<SupportingDocument> supportingDocuments;
  final CostSubmissionStatus status;
  final TierApprovalStatus tier1Status;
  final String? tier1ReviewedBy;
  final String? tier1ReviewedAt;
  final String? tier1Notes;
  final TierApprovalStatus tier2Status;
  final String? tier2ReviewedBy;
  final String? tier2ReviewedAt;
  final String? tier2Notes;
  final String? walletTransactionId;
  final String? paidAt;
  final int? paidAmountCents;
  final String? paymentNotes;
  final String createdAt;
  final String updatedAt;

  OperationalCostSubmission({
    required this.id,
    required this.expenseCategory,
    this.hubId,
    this.projectId,
    this.mmpFileId,
    required this.submittedBy,
    required this.submittedAt,
    required this.submitterRole,
    required this.amountCents,
    required this.currency,
    required this.description,
    required this.expenseDate,
    this.vendor,
    this.referenceNumber,
    required this.supportingDocuments,
    required this.status,
    required this.tier1Status,
    this.tier1ReviewedBy,
    this.tier1ReviewedAt,
    this.tier1Notes,
    required this.tier2Status,
    this.tier2ReviewedBy,
    this.tier2ReviewedAt,
    this.tier2Notes,
    this.walletTransactionId,
    this.paidAt,
    this.paidAmountCents,
    this.paymentNotes,
    required this.createdAt,
    required this.updatedAt,
  });

  factory OperationalCostSubmission.fromJson(Map<String, dynamic> json) {
    List<SupportingDocument> docs = [];
    if (json['supporting_documents'] != null) {
      if (json['supporting_documents'] is List) {
        docs = (json['supporting_documents'] as List)
            .map((d) => SupportingDocument.fromJson(d as Map<String, dynamic>))
            .toList();
      }
    }

    return OperationalCostSubmission(
      id: json['id'] ?? '',
      expenseCategory: OperationalExpenseCategoryExtension.fromString(
        json['expense_category'],
      ),
      hubId: json['hub_id'],
      projectId: json['project_id'],
      mmpFileId: json['mmp_file_id'],
      submittedBy: json['submitted_by'] ?? '',
      submittedAt: json['submitted_at'] ?? '',
      submitterRole: json['submitter_role'] ?? '',
      amountCents: json['amount_cents'] ?? 0,
      currency: json['currency'] ?? 'SDG',
      description: json['description'] ?? '',
      expenseDate: json['expense_date'] ?? '',
      vendor: json['vendor'],
      referenceNumber: json['reference_number'],
      supportingDocuments: docs,
      status: CostSubmissionStatusExtension.fromString(json['status']),
      tier1Status: TierApprovalStatusExtension.fromString(json['tier1_status']),
      tier1ReviewedBy: json['tier1_reviewed_by'],
      tier1ReviewedAt: json['tier1_reviewed_at'],
      tier1Notes: json['tier1_notes'],
      tier2Status: TierApprovalStatusExtension.fromString(json['tier2_status']),
      tier2ReviewedBy: json['tier2_reviewed_by'],
      tier2ReviewedAt: json['tier2_reviewed_at'],
      tier2Notes: json['tier2_notes'],
      walletTransactionId: json['wallet_transaction_id'],
      paidAt: json['paid_at'],
      paidAmountCents: json['paid_amount_cents'],
      paymentNotes: json['payment_notes'],
      createdAt: json['created_at'] ?? '',
      updatedAt: json['updated_at'] ?? '',
    );
  }

  double get amountInCurrency => amountCents / 100.0;

  String get formattedAmount =>
      '${amountInCurrency.toStringAsFixed(2)} $currency';
}

// Cost submission statistics
class CostSubmissionStats {
  final int total;
  final int pending;
  final int underReview;
  final int approved;
  final int rejected;
  final int paid;
  final int totalPendingCents;
  final int totalApprovedCents;
  final int totalPaidCents;

  CostSubmissionStats({
    required this.total,
    required this.pending,
    required this.underReview,
    required this.approved,
    required this.rejected,
    required this.paid,
    required this.totalPendingCents,
    required this.totalApprovedCents,
    required this.totalPaidCents,
  });

  factory CostSubmissionStats.empty() {
    return CostSubmissionStats(
      total: 0,
      pending: 0,
      underReview: 0,
      approved: 0,
      rejected: 0,
      paid: 0,
      totalPendingCents: 0,
      totalApprovedCents: 0,
      totalPaidCents: 0,
    );
  }

  factory CostSubmissionStats.fromSubmissions(
    List<OperationalCostSubmission> submissions,
  ) {
    int pending = 0, underReview = 0, approved = 0, rejected = 0, paid = 0;
    int totalPendingCents = 0, totalApprovedCents = 0, totalPaidCents = 0;

    for (final s in submissions) {
      switch (s.status) {
        case CostSubmissionStatus.pending:
          pending++;
          totalPendingCents += s.amountCents;
          break;
        case CostSubmissionStatus.underReview:
          underReview++;
          totalPendingCents += s.amountCents;
          break;
        case CostSubmissionStatus.approved:
        case CostSubmissionStatus.disbursed:
          approved++;
          totalApprovedCents += s.amountCents;
          break;
        case CostSubmissionStatus.rejected:
          rejected++;
          break;
        case CostSubmissionStatus.paid:
        case CostSubmissionStatus.closed:
        case CostSubmissionStatus.reconciled:
          paid++;
          totalPaidCents += s.paidAmountCents ?? s.amountCents;
          break;
        default:
          break;
      }
    }

    return CostSubmissionStats(
      total: submissions.length,
      pending: pending,
      underReview: underReview,
      approved: approved,
      rejected: rejected,
      paid: paid,
      totalPendingCents: totalPendingCents,
      totalApprovedCents: totalApprovedCents,
      totalPaidCents: totalPaidCents,
    );
  }
}
