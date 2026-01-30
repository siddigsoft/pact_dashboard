/// Enhanced Cost Request Model for Flutter Mobile App
/// Two-phase workflow: Advance Payments and Reimbursements
/// 
/// Corresponds to web types in: src/types/cost-submission.ts

enum CostRequestType {
  advance,
  reimbursement,
}

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

enum BalanceStatus {
  notApplicable,
  open,
  settled,
  underspent,
  overspent,
}

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

class SupportingDocument {
  final String url;
  final String type;
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
      uploadedAt: json['uploadedAt'] ?? '',
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

class EnhancedCostRequest {
  final String id;
  final CostRequestType requestType;
  final String projectId;
  final String? projectName;
  final BudgetLineCategory budgetLineCategory;
  final String? budgetLineId;
  final String submittedBy;
  final String? submitterName;
  final String? submitterRole;
  final String submittedAt;
  final int requestedAmountCents;
  final String currency;
  final String title;
  final String description;
  final String justification;
  final List<SupportingDocument> justificationDocuments;
  final CostSubmissionStatus status;
  final String tier1Status;
  final String? tier1ReviewedBy;
  final String? tier1ReviewedAt;
  final String? tier1Notes;
  final String tier2Status;
  final String? tier2ReviewedBy;
  final String? tier2ReviewedAt;
  final String? tier2Notes;
  final int? approvedAmountCents;
  final int? disbursedAmountCents;
  final String? disbursedAt;
  final String? disbursedBy;
  final String? disbursementMethod;
  final String? disbursementReference;
  final BalanceStatus balanceStatus;
  final int? balanceCents;
  final int? actualSpentCents;
  final List<SupportingDocument> reconciliationDocuments;
  final String? reconciliationNotes;
  final String? reconciliationSubmittedAt;
  final String? reconciledBy;
  final String? reconciledAt;
  final bool? reconciliationVerified;
  final int? balanceReturnedCents;
  final int? additionalPaymentCents;
  final int? paidAmountCents;
  final String? paidAt;
  final String? paidBy;
  final String? paymentMethod;
  final String? paymentReference;
  final String? hubId;
  final String? mmpFileId;
  final String? siteVisitId;
  final String? walletTransactionId;
  final String createdAt;
  final String updatedAt;

  EnhancedCostRequest({
    required this.id,
    required this.requestType,
    required this.projectId,
    this.projectName,
    required this.budgetLineCategory,
    this.budgetLineId,
    required this.submittedBy,
    this.submitterName,
    this.submitterRole,
    required this.submittedAt,
    required this.requestedAmountCents,
    required this.currency,
    required this.title,
    required this.description,
    required this.justification,
    required this.justificationDocuments,
    required this.status,
    required this.tier1Status,
    this.tier1ReviewedBy,
    this.tier1ReviewedAt,
    this.tier1Notes,
    required this.tier2Status,
    this.tier2ReviewedBy,
    this.tier2ReviewedAt,
    this.tier2Notes,
    this.approvedAmountCents,
    this.disbursedAmountCents,
    this.disbursedAt,
    this.disbursedBy,
    this.disbursementMethod,
    this.disbursementReference,
    required this.balanceStatus,
    this.balanceCents,
    this.actualSpentCents,
    required this.reconciliationDocuments,
    this.reconciliationNotes,
    this.reconciliationSubmittedAt,
    this.reconciledBy,
    this.reconciledAt,
    this.reconciliationVerified,
    this.balanceReturnedCents,
    this.additionalPaymentCents,
    this.paidAmountCents,
    this.paidAt,
    this.paidBy,
    this.paymentMethod,
    this.paymentReference,
    this.hubId,
    this.mmpFileId,
    this.siteVisitId,
    this.walletTransactionId,
    required this.createdAt,
    required this.updatedAt,
  });

  factory EnhancedCostRequest.fromJson(Map<String, dynamic> json) {
    return EnhancedCostRequest(
      id: json['id'] ?? '',
      requestType: _parseRequestType(json['requestType']),
      projectId: json['projectId'] ?? '',
      projectName: json['projectName'],
      budgetLineCategory: _parseBudgetLine(json['budgetLineCategory']),
      budgetLineId: json['budgetLineId'],
      submittedBy: json['submittedBy'] ?? '',
      submitterName: json['submitterName'],
      submitterRole: json['submitterRole'],
      submittedAt: json['submittedAt'] ?? '',
      requestedAmountCents: json['requestedAmountCents'] ?? 0,
      currency: json['currency'] ?? 'SDG',
      title: json['title'] ?? '',
      description: json['description'] ?? '',
      justification: json['justification'] ?? '',
      justificationDocuments: (json['justificationDocuments'] as List<dynamic>?)
          ?.map((e) => SupportingDocument.fromJson(e))
          .toList() ?? [],
      status: _parseStatus(json['status']),
      tier1Status: json['tier1Status'] ?? 'pending',
      tier1ReviewedBy: json['tier1ReviewedBy'],
      tier1ReviewedAt: json['tier1ReviewedAt'],
      tier1Notes: json['tier1Notes'],
      tier2Status: json['tier2Status'] ?? 'pending',
      tier2ReviewedBy: json['tier2ReviewedBy'],
      tier2ReviewedAt: json['tier2ReviewedAt'],
      tier2Notes: json['tier2Notes'],
      approvedAmountCents: json['approvedAmountCents'],
      disbursedAmountCents: json['disbursedAmountCents'],
      disbursedAt: json['disbursedAt'],
      disbursedBy: json['disbursedBy'],
      disbursementMethod: json['disbursementMethod'],
      disbursementReference: json['disbursementReference'],
      balanceStatus: _parseBalanceStatus(json['balanceStatus']),
      balanceCents: json['balanceCents'],
      actualSpentCents: json['actualSpentCents'],
      reconciliationDocuments: (json['reconciliationDocuments'] as List<dynamic>?)
          ?.map((e) => SupportingDocument.fromJson(e))
          .toList() ?? [],
      reconciliationNotes: json['reconciliationNotes'],
      reconciliationSubmittedAt: json['reconciliationSubmittedAt'],
      reconciledBy: json['reconciledBy'],
      reconciledAt: json['reconciledAt'],
      reconciliationVerified: json['reconciliationVerified'],
      balanceReturnedCents: json['balanceReturnedCents'],
      additionalPaymentCents: json['additionalPaymentCents'],
      paidAmountCents: json['paidAmountCents'],
      paidAt: json['paidAt'],
      paidBy: json['paidBy'],
      paymentMethod: json['paymentMethod'],
      paymentReference: json['paymentReference'],
      hubId: json['hubId'],
      mmpFileId: json['mmpFileId'],
      siteVisitId: json['siteVisitId'],
      walletTransactionId: json['walletTransactionId'],
      createdAt: json['createdAt'] ?? '',
      updatedAt: json['updatedAt'] ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'requestType': requestType.name,
      'projectId': projectId,
      'projectName': projectName,
      'budgetLineCategory': _budgetLineToString(budgetLineCategory),
      'budgetLineId': budgetLineId,
      'submittedBy': submittedBy,
      'submitterName': submitterName,
      'submitterRole': submitterRole,
      'submittedAt': submittedAt,
      'requestedAmountCents': requestedAmountCents,
      'currency': currency,
      'title': title,
      'description': description,
      'justification': justification,
      'justificationDocuments': justificationDocuments.map((e) => e.toJson()).toList(),
      'status': _statusToString(status),
      'tier1Status': tier1Status,
      'tier1ReviewedBy': tier1ReviewedBy,
      'tier1ReviewedAt': tier1ReviewedAt,
      'tier1Notes': tier1Notes,
      'tier2Status': tier2Status,
      'tier2ReviewedBy': tier2ReviewedBy,
      'tier2ReviewedAt': tier2ReviewedAt,
      'tier2Notes': tier2Notes,
      'approvedAmountCents': approvedAmountCents,
      'disbursedAmountCents': disbursedAmountCents,
      'disbursedAt': disbursedAt,
      'disbursedBy': disbursedBy,
      'disbursementMethod': disbursementMethod,
      'disbursementReference': disbursementReference,
      'balanceStatus': _balanceStatusToString(balanceStatus),
      'balanceCents': balanceCents,
      'actualSpentCents': actualSpentCents,
      'reconciliationDocuments': reconciliationDocuments.map((e) => e.toJson()).toList(),
      'reconciliationNotes': reconciliationNotes,
      'reconciliationSubmittedAt': reconciliationSubmittedAt,
      'reconciledBy': reconciledBy,
      'reconciledAt': reconciledAt,
      'reconciliationVerified': reconciliationVerified,
      'balanceReturnedCents': balanceReturnedCents,
      'additionalPaymentCents': additionalPaymentCents,
      'paidAmountCents': paidAmountCents,
      'paidAt': paidAt,
      'paidBy': paidBy,
      'paymentMethod': paymentMethod,
      'paymentReference': paymentReference,
      'hubId': hubId,
      'mmpFileId': mmpFileId,
      'siteVisitId': siteVisitId,
      'walletTransactionId': walletTransactionId,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
    };
  }

  double get requestedAmount => requestedAmountCents / 100;
  double get disbursedAmount => (disbursedAmountCents ?? 0) / 100;
  double get actualSpent => (actualSpentCents ?? 0) / 100;
  double get balance => (balanceCents ?? 0) / 100;

  bool get isAdvance => requestType == CostRequestType.advance;
  bool get isReimbursement => requestType == CostRequestType.reimbursement;
  bool get needsReconciliation => isAdvance && balanceStatus == BalanceStatus.open;
  bool get isOverdue {
    if (!needsReconciliation || disbursedAt == null) return false;
    final disbursedDate = DateTime.parse(disbursedAt!);
    return DateTime.now().difference(disbursedDate).inDays > 30;
  }

  static CostRequestType _parseRequestType(String? value) {
    switch (value) {
      case 'advance': return CostRequestType.advance;
      case 'reimbursement': return CostRequestType.reimbursement;
      default: return CostRequestType.advance;
    }
  }

  static CostSubmissionStatus _parseStatus(String? value) {
    switch (value) {
      case 'pending': return CostSubmissionStatus.pending;
      case 'under_review': return CostSubmissionStatus.underReview;
      case 'approved': return CostSubmissionStatus.approved;
      case 'rejected': return CostSubmissionStatus.rejected;
      case 'disbursed': return CostSubmissionStatus.disbursed;
      case 'reconciliation_pending': return CostSubmissionStatus.reconciliationPending;
      case 'reconciled': return CostSubmissionStatus.reconciled;
      case 'paid': return CostSubmissionStatus.paid;
      case 'closed': return CostSubmissionStatus.closed;
      case 'cancelled': return CostSubmissionStatus.cancelled;
      default: return CostSubmissionStatus.pending;
    }
  }

  static String _statusToString(CostSubmissionStatus status) {
    switch (status) {
      case CostSubmissionStatus.pending: return 'pending';
      case CostSubmissionStatus.underReview: return 'under_review';
      case CostSubmissionStatus.approved: return 'approved';
      case CostSubmissionStatus.rejected: return 'rejected';
      case CostSubmissionStatus.disbursed: return 'disbursed';
      case CostSubmissionStatus.reconciliationPending: return 'reconciliation_pending';
      case CostSubmissionStatus.reconciled: return 'reconciled';
      case CostSubmissionStatus.paid: return 'paid';
      case CostSubmissionStatus.closed: return 'closed';
      case CostSubmissionStatus.cancelled: return 'cancelled';
    }
  }

  static BalanceStatus _parseBalanceStatus(String? value) {
    switch (value) {
      case 'not_applicable': return BalanceStatus.notApplicable;
      case 'open': return BalanceStatus.open;
      case 'settled': return BalanceStatus.settled;
      case 'underspent': return BalanceStatus.underspent;
      case 'overspent': return BalanceStatus.overspent;
      default: return BalanceStatus.notApplicable;
    }
  }

  static String _balanceStatusToString(BalanceStatus status) {
    switch (status) {
      case BalanceStatus.notApplicable: return 'not_applicable';
      case BalanceStatus.open: return 'open';
      case BalanceStatus.settled: return 'settled';
      case BalanceStatus.underspent: return 'underspent';
      case BalanceStatus.overspent: return 'overspent';
    }
  }

  static BudgetLineCategory _parseBudgetLine(String? value) {
    switch (value) {
      case 'transportation_and_visit_fees': return BudgetLineCategory.transportationAndVisitFees;
      case 'permit_fee': return BudgetLineCategory.permitFee;
      case 'internet_and_communication_fees': return BudgetLineCategory.internetAndCommunicationFees;
      case 'training_and_capacity_building': return BudgetLineCategory.trainingAndCapacityBuilding;
      case 'equipment_and_supplies': return BudgetLineCategory.equipmentAndSupplies;
      case 'office_and_admin': return BudgetLineCategory.officeAndAdmin;
      case 'personnel_allowances': return BudgetLineCategory.personnelAllowances;
      case 'other': return BudgetLineCategory.other;
      default: return BudgetLineCategory.other;
    }
  }

  static String _budgetLineToString(BudgetLineCategory category) {
    switch (category) {
      case BudgetLineCategory.transportationAndVisitFees: return 'transportation_and_visit_fees';
      case BudgetLineCategory.permitFee: return 'permit_fee';
      case BudgetLineCategory.internetAndCommunicationFees: return 'internet_and_communication_fees';
      case BudgetLineCategory.trainingAndCapacityBuilding: return 'training_and_capacity_building';
      case BudgetLineCategory.equipmentAndSupplies: return 'equipment_and_supplies';
      case BudgetLineCategory.officeAndAdmin: return 'office_and_admin';
      case BudgetLineCategory.personnelAllowances: return 'personnel_allowances';
      case BudgetLineCategory.other: return 'other';
    }
  }
}

class CreateCostRequestDto {
  final String requestType;
  final String projectId;
  final String budgetLineCategory;
  final int requestedAmountCents;
  final String currency;
  final String title;
  final String description;
  final String justification;
  final List<SupportingDocument>? justificationDocuments;
  final List<SupportingDocument>? reconciliationDocuments;
  final String? hubId;
  final String? mmpFileId;
  final String? siteVisitId;

  CreateCostRequestDto({
    required this.requestType,
    required this.projectId,
    required this.budgetLineCategory,
    required this.requestedAmountCents,
    this.currency = 'SDG',
    required this.title,
    required this.description,
    required this.justification,
    this.justificationDocuments,
    this.reconciliationDocuments,
    this.hubId,
    this.mmpFileId,
    this.siteVisitId,
  });

  Map<String, dynamic> toJson() {
    return {
      'requestType': requestType,
      'projectId': projectId,
      'budgetLineCategory': budgetLineCategory,
      'requestedAmountCents': requestedAmountCents,
      'currency': currency,
      'title': title,
      'description': description,
      'justification': justification,
      if (justificationDocuments != null) 
        'justificationDocuments': justificationDocuments!.map((e) => e.toJson()).toList(),
      if (reconciliationDocuments != null) 
        'reconciliationDocuments': reconciliationDocuments!.map((e) => e.toJson()).toList(),
      if (hubId != null) 'hubId': hubId,
      if (mmpFileId != null) 'mmpFileId': mmpFileId,
      if (siteVisitId != null) 'siteVisitId': siteVisitId,
    };
  }
}

class SubmitReconciliationDto {
  final String requestId;
  final int actualSpentCents;
  final List<SupportingDocument> reconciliationDocuments;
  final String? reconciliationNotes;

  SubmitReconciliationDto({
    required this.requestId,
    required this.actualSpentCents,
    required this.reconciliationDocuments,
    this.reconciliationNotes,
  });

  Map<String, dynamic> toJson() {
    return {
      'requestId': requestId,
      'actualSpentCents': actualSpentCents,
      'reconciliationDocuments': reconciliationDocuments.map((e) => e.toJson()).toList(),
      if (reconciliationNotes != null) 'reconciliationNotes': reconciliationNotes,
    };
  }
}

extension BudgetLineCategoryLabels on BudgetLineCategory {
  String get labelEn {
    switch (this) {
      case BudgetLineCategory.transportationAndVisitFees: return 'Transportation & Visit Fees';
      case BudgetLineCategory.permitFee: return 'Permit Fees';
      case BudgetLineCategory.internetAndCommunicationFees: return 'Internet & Communications';
      case BudgetLineCategory.trainingAndCapacityBuilding: return 'Training & Capacity Building';
      case BudgetLineCategory.equipmentAndSupplies: return 'Equipment & Supplies';
      case BudgetLineCategory.officeAndAdmin: return 'Office & Admin';
      case BudgetLineCategory.personnelAllowances: return 'Personnel Allowances';
      case BudgetLineCategory.other: return 'Other';
    }
  }

  String get labelAr {
    switch (this) {
      case BudgetLineCategory.transportationAndVisitFees: return 'رسوم النقل والزيارة';
      case BudgetLineCategory.permitFee: return 'رسوم التصاريح';
      case BudgetLineCategory.internetAndCommunicationFees: return 'الإنترنت والاتصالات';
      case BudgetLineCategory.trainingAndCapacityBuilding: return 'التدريب وبناء القدرات';
      case BudgetLineCategory.equipmentAndSupplies: return 'المعدات واللوازم';
      case BudgetLineCategory.officeAndAdmin: return 'المكتب والإدارة';
      case BudgetLineCategory.personnelAllowances: return 'بدلات الموظفين';
      case BudgetLineCategory.other: return 'أخرى';
    }
  }
}

extension CostRequestTypeLabels on CostRequestType {
  String get labelEn => this == CostRequestType.advance ? 'Advance Payment' : 'Reimbursement';
  String get labelAr => this == CostRequestType.advance ? 'دفعة مقدمة' : 'استرداد';
}

extension BalanceStatusLabels on BalanceStatus {
  String get labelEn {
    switch (this) {
      case BalanceStatus.notApplicable: return 'N/A';
      case BalanceStatus.open: return 'Open Balance';
      case BalanceStatus.settled: return 'Settled';
      case BalanceStatus.underspent: return 'Underspent';
      case BalanceStatus.overspent: return 'Overspent';
    }
  }

  String get labelAr {
    switch (this) {
      case BalanceStatus.notApplicable: return 'غير قابل للتطبيق';
      case BalanceStatus.open: return 'رصيد مفتوح';
      case BalanceStatus.settled: return 'تمت التسوية';
      case BalanceStatus.underspent: return 'إنفاق أقل';
      case BalanceStatus.overspent: return 'إنفاق زائد';
    }
  }
}