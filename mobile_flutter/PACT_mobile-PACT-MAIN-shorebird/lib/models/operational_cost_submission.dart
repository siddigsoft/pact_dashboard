/// Operational Cost Submission Models for Mobile App
/// Mirrors the web application's operational cost submission system
/// Supports advance payments, reimbursements, reconciliation workflow

/// Expense categories matching web version
enum ExpenseCategory {
  permits('permits', 'Permits & Licenses', 'تصاريح ورخص'),
  incentives('incentives', 'Incentives & Allowances', 'حوافز وبدلات'),
  communications('communications', 'Internet & Communications', 'انترنت واتصالات'),
  training('training', 'Training & Capacity Building', 'تدريب وبناء القدرات'),
  transport('transport', 'Transportation & Travel', 'نقل وسفر'),
  equipment('equipment', 'Equipment & Supplies', 'معدات ولوازم'),
  printing('printing', 'Printing & Stationery', 'طباعة وقرطاسية'),
  meetings('meetings', 'Meetings & Refreshments', 'اجتماعات ومرطبات'),
  officeAdmin('office_admin', 'Office & Administration', 'مكتب وادارة'),
  other('other', 'Other Expenses', 'مصروفات اخرى');

  final String value;
  final String labelEn;
  final String labelAr;

  const ExpenseCategory(this.value, this.labelEn, this.labelAr);

  String getLabel(bool isArabic) => isArabic ? labelAr : labelEn;

  static ExpenseCategory? fromValue(String? value) {
    if (value == null) return null;
    try {
      return ExpenseCategory.values.firstWhere((e) => e.value == value);
    } catch (_) {
      return ExpenseCategory.other;
    }
  }
}

/// Funding type for cost requests
enum FundingType {
  advance('advance', 'Advance Payment', 'دفعة مقدمة'),
  reimbursement('reimbursement', 'Reimbursement', 'استرداد');

  final String value;
  final String labelEn;
  final String labelAr;

  const FundingType(this.value, this.labelEn, this.labelAr);

  String getLabel(bool isArabic) => isArabic ? labelAr : labelEn;

  static FundingType fromValue(String? value) {
    if (value == null) return FundingType.advance;
    return FundingType.values.firstWhere(
      (e) => e.value == value,
      orElse: () => FundingType.advance,
    );
  }
}

/// Operational cost submission status
enum OperationalCostStatus {
  pending('pending', 'Pending', 'قيد الانتظار'),
  underReview('under_review', 'Under Review', 'قيد المراجعة'),
  approved('approved', 'Approved', 'موافق عليه'),
  rejected('rejected', 'Rejected', 'مرفوض'),
  paid('paid', 'Paid', 'مدفوع'),
  cancelled('cancelled', 'Cancelled', 'ملغي');

  final String value;
  final String labelEn;
  final String labelAr;

  const OperationalCostStatus(this.value, this.labelEn, this.labelAr);

  String getLabel(bool isArabic) => isArabic ? labelAr : labelEn;

  static OperationalCostStatus fromValue(String? value) {
    if (value == null) return OperationalCostStatus.pending;
    return OperationalCostStatus.values.firstWhere(
      (e) => e.value == value,
      orElse: () => OperationalCostStatus.pending,
    );
  }

  bool get canEdit => this == OperationalCostStatus.pending;
  bool get canApprove => this == OperationalCostStatus.pending || this == OperationalCostStatus.underReview;
  bool get canPay => this == OperationalCostStatus.approved;
  bool get isSettled => this == OperationalCostStatus.paid || 
                        this == OperationalCostStatus.rejected || 
                        this == OperationalCostStatus.cancelled;
}

/// Supporting document model
class SupportingDocument {
  final String id;
  final String name;
  final String url;
  final String type;
  final int? size;
  final DateTime uploadedAt;

  SupportingDocument({
    required this.id,
    required this.name,
    required this.url,
    required this.type,
    this.size,
    required this.uploadedAt,
  });

  factory SupportingDocument.fromJson(Map<String, dynamic> json) {
    return SupportingDocument(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      url: json['url']?.toString() ?? '',
      type: json['type']?.toString() ?? 'unknown',
      size: json['size'] is int ? json['size'] : null,
      uploadedAt: json['uploaded_at'] != null
          ? DateTime.parse(json['uploaded_at'].toString())
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'url': url,
    'type': type,
    'size': size,
    'uploaded_at': uploadedAt.toIso8601String(),
  };
}

/// Main operational cost submission model
class OperationalCostSubmission {
  final String id;
  final String userId;
  final String? projectId;
  final String? hubId;
  final ExpenseCategory expenseCategory;
  final FundingType fundingType;
  final int amountCents;
  final String currency;
  final String description;
  final String? justification;
  final String? expenseDate;
  final String? vendor;
  final String? referenceNumber;
  final OperationalCostStatus status;
  final List<SupportingDocument> supportingDocuments;
  
  // Tier 1 approval (Supervisor/FOM)
  final String? tier1ReviewedBy;
  final DateTime? tier1ReviewedAt;
  final String? tier1Notes;
  final String? tier1Status;
  
  // Tier 2 approval (Admin/CountryDirector)
  final String? tier2ReviewedBy;
  final DateTime? tier2ReviewedAt;
  final String? tier2Notes;
  final String? tier2Status;
  
  // Tier 3 approval (Admin/SuperAdmin - for coordinator 3-tier flow)
  final String? tier3ReviewedBy;
  final DateTime? tier3ReviewedAt;
  final String? tier3Notes;
  final String? tier3Status;
  
  // Reconciliation
  final bool requiresReconciliation;
  final bool isReconciled;
  final DateTime? reconciledAt;
  final int? reconciledAmountCents;
  final String? reconciliationNotes;
  
  final DateTime createdAt;
  final DateTime updatedAt;
  
  // Joined fields
  final String? submitterName;
  final String? submitterRole;
  final String? projectName;
  final String? hubName;
  final String? tier1ReviewerName;
  final String? tier2ReviewerName;
  final String? tier3ReviewerName;

  OperationalCostSubmission({
    required this.id,
    required this.userId,
    this.projectId,
    this.hubId,
    required this.expenseCategory,
    this.fundingType = FundingType.advance,
    required this.amountCents,
    this.currency = 'SDG',
    required this.description,
    this.justification,
    this.expenseDate,
    this.vendor,
    this.referenceNumber,
    required this.status,
    this.supportingDocuments = const [],
    this.tier1ReviewedBy,
    this.tier1ReviewedAt,
    this.tier1Notes,
    this.tier1Status,
    this.tier2ReviewedBy,
    this.tier2ReviewedAt,
    this.tier2Notes,
    this.tier2Status,
    this.tier3ReviewedBy,
    this.tier3ReviewedAt,
    this.tier3Notes,
    this.tier3Status,
    this.requiresReconciliation = false,
    this.isReconciled = false,
    this.reconciledAt,
    this.reconciledAmountCents,
    this.reconciliationNotes,
    required this.createdAt,
    required this.updatedAt,
    this.submitterName,
    this.submitterRole,
    this.projectName,
    this.hubName,
    this.tier1ReviewerName,
    this.tier2ReviewerName,
    this.tier3ReviewerName,
  });

  double get amount => amountCents / 100.0;
  double? get reconciledAmount => reconciledAmountCents != null ? reconciledAmountCents! / 100.0 : null;
  bool get isEditable => status == OperationalCostStatus.pending;
  bool get isCancellable => status == OperationalCostStatus.pending || status == OperationalCostStatus.underReview;
  bool get needsReconciliation => fundingType == FundingType.advance && !isReconciled && status == OperationalCostStatus.paid;

  bool get hasThreeTiers {
    final r = submitterRole?.toLowerCase() ?? '';
    return r.contains('coordinator') || tier3Status != null;
  }

  bool get isFullyApproved {
    if (hasThreeTiers) {
      return tier1Status == 'approved' && tier2Status == 'approved' && tier3Status == 'approved';
    }
    return tier1Status == 'approved' && tier2Status == 'approved';
  }

  bool get hasSignature {
    return (tier1Notes?.contains('[Signed:') ?? false) ||
           (tier2Notes?.contains('[Signed:') ?? false) ||
           (tier3Notes?.contains('[Signed:') ?? false);
  }

  String get derivedStatus {
    if (status == OperationalCostStatus.cancelled) return 'cancelled';
    if (isReconciled) return 'reconciled';
    if (status == OperationalCostStatus.paid) return 'paid';
    if (tier1Status == 'rejected' || tier2Status == 'rejected' || tier3Status == 'rejected' || status == OperationalCostStatus.rejected) return 'rejected';
    if (hasThreeTiers) {
      if (tier1Status == 'approved' && tier2Status == 'approved' && tier3Status == 'approved') return 'approved';
      if (tier1Status == 'approved') return 'under_review';
    } else {
      if (tier1Status == 'approved' && tier2Status == 'approved') return 'approved';
      if (tier1Status == 'approved') return 'under_review';
    }
    if (status == OperationalCostStatus.underReview) return 'under_review';
    return 'pending';
  }

  static Map<String, dynamic> getStatusDisplay(String derivedStatus, bool isArabic) {
    switch (derivedStatus) {
      case 'pending':
        return {'color': const Color(0xFFFF9800), 'label': isArabic ? 'قيد الانتظار' : 'Pending'};
      case 'under_review':
        return {'color': const Color(0xFF2196F3), 'label': isArabic ? 'قيد المراجعة' : 'Under Review'};
      case 'approved':
        return {'color': const Color(0xFF4CAF50), 'label': isArabic ? 'موافق عليه' : 'Approved'};
      case 'rejected':
        return {'color': const Color(0xFFF44336), 'label': isArabic ? 'مرفوض' : 'Rejected'};
      case 'paid':
        return {'color': const Color(0xFF9C27B0), 'label': isArabic ? 'مدفوع' : 'Paid'};
      case 'reconciled':
        return {'color': const Color(0xFF009688), 'label': isArabic ? 'تمت التسوية' : 'Reconciled'};
      case 'cancelled':
        return {'color': const Color(0xFF9E9E9E), 'label': isArabic ? 'ملغى' : 'Cancelled'};
      default:
        return {'color': const Color(0xFF9E9E9E), 'label': derivedStatus};
    }
  }

  factory OperationalCostSubmission.fromJson(Map<String, dynamic> json) {
    List<SupportingDocument> docs = [];
    if (json['supporting_documents'] != null) {
      if (json['supporting_documents'] is List) {
        docs = (json['supporting_documents'] as List)
            .where((d) => d != null)
            .map((d) => SupportingDocument.fromJson(d as Map<String, dynamic>))
            .toList();
      }
    }

    return OperationalCostSubmission(
      id: json['id']?.toString() ?? '',
      userId: json['user_id']?.toString() ?? json['submitted_by']?.toString() ?? '',
      projectId: json['project_id']?.toString(),
      hubId: json['hub_id']?.toString(),
      expenseCategory: ExpenseCategory.fromValue(json['expense_category']?.toString()) ?? ExpenseCategory.other,
      fundingType: FundingType.fromValue(json['funding_type']?.toString()),
      amountCents: _parseAmount(json),
      currency: json['currency']?.toString() ?? 'SDG',
      description: json['description']?.toString() ?? '',
      justification: json['justification']?.toString(),
      expenseDate: json['expense_date']?.toString(),
      vendor: json['vendor']?.toString(),
      referenceNumber: json['reference_number']?.toString(),
      status: OperationalCostStatus.fromValue(json['status']?.toString()),
      supportingDocuments: docs,
      tier1ReviewedBy: json['tier1_reviewed_by']?.toString(),
      tier1ReviewedAt: _parseDateTime(json['tier1_reviewed_at']),
      tier1Notes: json['tier1_notes']?.toString(),
      tier1Status: json['tier1_status']?.toString(),
      tier2ReviewedBy: json['tier2_reviewed_by']?.toString(),
      tier2ReviewedAt: _parseDateTime(json['tier2_reviewed_at']),
      tier2Notes: json['tier2_notes']?.toString(),
      tier2Status: json['tier2_status']?.toString(),
      tier3ReviewedBy: json['tier3_approved_by']?.toString() ?? json['tier3_reviewed_by']?.toString(),
      tier3ReviewedAt: _parseDateTime(json['tier3_approved_at'] ?? json['tier3_reviewed_at']),
      tier3Notes: json['tier3_notes']?.toString(),
      tier3Status: json['tier3_status']?.toString(),
      requiresReconciliation: json['requires_reconciliation'] == true,
      isReconciled: json['is_reconciled'] == true,
      reconciledAt: _parseDateTime(json['reconciled_at']),
      reconciledAmountCents: json['reconciled_amount_cents'] is int ? json['reconciled_amount_cents'] : null,
      reconciliationNotes: json['reconciliation_notes']?.toString(),
      createdAt: _parseDateTime(json['created_at']) ?? DateTime.now(),
      updatedAt: _parseDateTime(json['updated_at']) ?? DateTime.now(),
      submitterName: json['submitter_name']?.toString() ?? 
                     (json['profiles'] is Map ? json['profiles']['name']?.toString() : null),
      submitterRole: json['submitter_role']?.toString() ??
                     (json['profiles'] is Map ? json['profiles']['role']?.toString() : null),
      projectName: json['project_name']?.toString() ?? 
                   (json['projects'] is Map ? json['projects']['name']?.toString() : null),
      hubName: json['hub_name']?.toString() ?? 
               (json['hubs'] is Map ? json['hubs']['name']?.toString() : null),
      tier1ReviewerName: json['tier1_reviewer_name']?.toString(),
      tier2ReviewerName: json['tier2_reviewer_name']?.toString(),
      tier3ReviewerName: json['tier3_reviewer_name']?.toString(),
    );
  }

  static int _parseAmount(Map<String, dynamic> json) {
    if (json['amount_cents'] != null) {
      return json['amount_cents'] is int ? json['amount_cents'] : int.tryParse(json['amount_cents'].toString()) ?? 0;
    }
    if (json['amount'] != null) {
      final amount = json['amount'] is double ? json['amount'] : double.tryParse(json['amount'].toString()) ?? 0.0;
      return (amount * 100).round();
    }
    return 0;
  }

  static DateTime? _parseDateTime(dynamic value) {
    if (value == null) return null;
    if (value is DateTime) return value;
    try {
      return DateTime.parse(value.toString());
    } catch (_) {
      return null;
    }
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'user_id': userId,
    'project_id': projectId,
    'hub_id': hubId,
    'expense_category': expenseCategory.value,
    'funding_type': fundingType.value,
    'amount_cents': amountCents,
    'currency': currency,
    'description': description,
    'justification': justification,
    'expense_date': expenseDate,
    'vendor': vendor,
    'reference_number': referenceNumber,
    'status': status.value,
    'supporting_documents': supportingDocuments.map((d) => d.toJson()).toList(),
    'tier1_reviewed_by': tier1ReviewedBy,
    'tier1_reviewed_at': tier1ReviewedAt?.toIso8601String(),
    'tier1_notes': tier1Notes,
    'tier1_status': tier1Status,
    'tier2_reviewed_by': tier2ReviewedBy,
    'tier2_reviewed_at': tier2ReviewedAt?.toIso8601String(),
    'tier2_notes': tier2Notes,
    'tier2_status': tier2Status,
    'tier3_approved_by': tier3ReviewedBy,
    'tier3_approved_at': tier3ReviewedAt?.toIso8601String(),
    'tier3_notes': tier3Notes,
    'tier3_status': tier3Status,
    'requires_reconciliation': requiresReconciliation,
    'is_reconciled': isReconciled,
    'reconciled_amount_cents': reconciledAmountCents,
    'reconciliation_notes': reconciliationNotes,
  };

  OperationalCostSubmission copyWith({
    String? id,
    String? userId,
    String? projectId,
    String? hubId,
    ExpenseCategory? expenseCategory,
    FundingType? fundingType,
    int? amountCents,
    String? currency,
    String? description,
    String? justification,
    String? expenseDate,
    String? vendor,
    String? referenceNumber,
    OperationalCostStatus? status,
    List<SupportingDocument>? supportingDocuments,
    String? tier1ReviewedBy,
    DateTime? tier1ReviewedAt,
    String? tier1Notes,
    String? tier1Status,
    String? tier2ReviewedBy,
    DateTime? tier2ReviewedAt,
    String? tier2Notes,
    String? tier2Status,
    String? tier3ReviewedBy,
    DateTime? tier3ReviewedAt,
    String? tier3Notes,
    String? tier3Status,
    bool? requiresReconciliation,
    bool? isReconciled,
    DateTime? reconciledAt,
    int? reconciledAmountCents,
    String? reconciliationNotes,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? submitterName,
    String? submitterRole,
    String? projectName,
    String? hubName,
  }) {
    return OperationalCostSubmission(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      projectId: projectId ?? this.projectId,
      hubId: hubId ?? this.hubId,
      expenseCategory: expenseCategory ?? this.expenseCategory,
      fundingType: fundingType ?? this.fundingType,
      amountCents: amountCents ?? this.amountCents,
      currency: currency ?? this.currency,
      description: description ?? this.description,
      justification: justification ?? this.justification,
      expenseDate: expenseDate ?? this.expenseDate,
      vendor: vendor ?? this.vendor,
      referenceNumber: referenceNumber ?? this.referenceNumber,
      status: status ?? this.status,
      supportingDocuments: supportingDocuments ?? this.supportingDocuments,
      tier1ReviewedBy: tier1ReviewedBy ?? this.tier1ReviewedBy,
      tier1ReviewedAt: tier1ReviewedAt ?? this.tier1ReviewedAt,
      tier1Notes: tier1Notes ?? this.tier1Notes,
      tier1Status: tier1Status ?? this.tier1Status,
      tier2ReviewedBy: tier2ReviewedBy ?? this.tier2ReviewedBy,
      tier2ReviewedAt: tier2ReviewedAt ?? this.tier2ReviewedAt,
      tier2Notes: tier2Notes ?? this.tier2Notes,
      tier2Status: tier2Status ?? this.tier2Status,
      tier3ReviewedBy: tier3ReviewedBy ?? this.tier3ReviewedBy,
      tier3ReviewedAt: tier3ReviewedAt ?? this.tier3ReviewedAt,
      tier3Notes: tier3Notes ?? this.tier3Notes,
      tier3Status: tier3Status ?? this.tier3Status,
      requiresReconciliation: requiresReconciliation ?? this.requiresReconciliation,
      isReconciled: isReconciled ?? this.isReconciled,
      reconciledAt: reconciledAt ?? this.reconciledAt,
      reconciledAmountCents: reconciledAmountCents ?? this.reconciledAmountCents,
      reconciliationNotes: reconciliationNotes ?? this.reconciliationNotes,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      submitterName: submitterName ?? this.submitterName,
      submitterRole: submitterRole ?? this.submitterRole,
      projectName: projectName ?? this.projectName,
      hubName: hubName ?? this.hubName,
      tier1ReviewerName: tier1ReviewerName,
      tier2ReviewerName: tier2ReviewerName,
      tier3ReviewerName: tier3ReviewerName,
    );
  }

  @override
  String toString() => 'OperationalCostSubmission(id: $id, amount: $amount $currency, status: ${status.value})';
}

/// Statistics for operational cost submissions
class OperationalCostStats {
  final int total;
  final int pending;
  final int underReview;
  final int approved;
  final int rejected;
  final int paid;
  final double totalAmountPending;
  final double totalAmountApproved;
  final int outstandingAdvances;

  OperationalCostStats({
    required this.total,
    required this.pending,
    required this.underReview,
    required this.approved,
    required this.rejected,
    required this.paid,
    required this.totalAmountPending,
    required this.totalAmountApproved,
    required this.outstandingAdvances,
  });

  factory OperationalCostStats.fromSubmissions(List<OperationalCostSubmission> submissions) {
    final pending = submissions.where((s) => s.status == OperationalCostStatus.pending).toList();
    final underReview = submissions.where((s) => s.status == OperationalCostStatus.underReview).toList();
    final approved = submissions.where((s) => s.status == OperationalCostStatus.approved).toList();
    final rejected = submissions.where((s) => s.status == OperationalCostStatus.rejected).toList();
    final paid = submissions.where((s) => s.status == OperationalCostStatus.paid).toList();
    final outstanding = submissions.where((s) => s.needsReconciliation).toList();

    return OperationalCostStats(
      total: submissions.length,
      pending: pending.length,
      underReview: underReview.length,
      approved: approved.length,
      rejected: rejected.length,
      paid: paid.length,
      totalAmountPending: pending.fold(0.0, (sum, s) => sum + s.amount),
      totalAmountApproved: approved.fold(0.0, (sum, s) => sum + s.amount),
      outstandingAdvances: outstanding.length,
    );
  }

  factory OperationalCostStats.empty() => OperationalCostStats(
    total: 0, pending: 0, underReview: 0, approved: 0, rejected: 0, paid: 0,
    totalAmountPending: 0, totalAmountApproved: 0, outstandingAdvances: 0,
  );
}

/// User permission model for cost submissions
class CostSubmissionPermissions {
  final bool canSubmit;
  final bool canViewTeam;
  final bool canApprove;
  final bool canPayOut;
  final bool isAdmin;
  final bool isSuperAdmin;
  final bool isSupervisor;
  final bool isFOM;
  final bool isCoordinator;
  final bool isCountryDirector;
  final bool isDataCollector;
  final String role;

  CostSubmissionPermissions({
    required this.canSubmit,
    required this.canViewTeam,
    required this.canApprove,
    required this.canPayOut,
    required this.isAdmin,
    required this.isSuperAdmin,
    required this.isSupervisor,
    required this.isFOM,
    required this.isCoordinator,
    required this.isCountryDirector,
    required this.isDataCollector,
    required this.role,
  });

  factory CostSubmissionPermissions.fromRole(String? role) {
    final r = role?.toLowerCase() ?? '';
    
    final isSuperAdmin = r == 'super_admin' || r == 'superadmin';
    final isAdmin = r == 'admin' || isSuperAdmin;
    final isSupervisor = r == 'supervisor' || r == 'hubsupervisor' || r == 'hub_supervisor';
    final isFOM = r.contains('fom') || r.contains('field operation') || r.contains('fieldoperation');
    final isCoordinator = r == 'coordinator' || (r.contains('coordinator') && !r.contains('country'));
    final isCountryDirector = r == 'countrydirector' || r == 'country_director';
    final isDataCollector = r == 'data_collector' || r == 'datacollector' || r == 'enumerator';

    return CostSubmissionPermissions(
      canSubmit: isFOM || isCoordinator || isCountryDirector || isAdmin || isSupervisor,
      canViewTeam: isAdmin || isSupervisor || isCountryDirector || isFOM,
      canApprove: isAdmin || isSupervisor || isFOM || isCountryDirector,
      canPayOut: isAdmin || isSuperAdmin,
      isAdmin: isAdmin,
      isSuperAdmin: isSuperAdmin,
      isSupervisor: isSupervisor,
      isFOM: isFOM,
      isCoordinator: isCoordinator,
      isCountryDirector: isCountryDirector,
      isDataCollector: isDataCollector,
      role: r,
    );
  }

  /// Tier 1 approvers: Supervisor, FOM (for their subordinates)
  /// Coordinator submissions → Supervisor reviews Tier 1
  /// Supervisor submissions → FOM reviews Tier 1
  bool canApproveTier1(OperationalCostSubmission submission) {
    if (submission.status != OperationalCostStatus.pending) return false;
    final submitterRole = submission.submitterRole?.toLowerCase() ?? '';
    
    // Coordinator → Supervisor approves Tier 1
    if (submitterRole.contains('coordinator') && isSupervisor) return true;
    
    // Supervisor → FOM approves Tier 1
    if (submitterRole.contains('supervisor') && isFOM) return true;
    
    // FOM → Country Director approves Tier 1
    if (submitterRole.contains('fom') && isCountryDirector) return true;
    
    // Country Director → Admin approves Tier 1
    if (submitterRole.contains('country') && isAdmin) return true;
    
    // Fallback: Supervisor or FOM can approve Tier 1 for general submissions
    if (isSupervisor || isFOM) return true;
    
    return false;
  }

  /// Tier 2 approvers: Admin, Country Director (final approval for 2-tier)
  /// For 3-tier coordinator flow: Country Director does Tier 2
  bool canApproveTier2(OperationalCostSubmission submission) {
    if (submission.status != OperationalCostStatus.underReview) return false;
    if (submission.tier1Status != 'approved') return false;
    if (submission.tier2Status != null && submission.tier2Status != 'pending') return false;
    
    if (submission.hasThreeTiers) {
      if (isCountryDirector) return true;
      if (isAdmin) return true;
      return false;
    }
    
    if (isAdmin) return true;
    
    final submitterRole = submission.submitterRole?.toLowerCase() ?? '';
    if (isCountryDirector && !submitterRole.contains('country')) return true;
    
    return false;
  }

  /// Tier 3 approvers: Admin/SuperAdmin (final approval for 3-tier coordinator flow)
  bool canApproveTier3(OperationalCostSubmission submission) {
    if (!submission.hasThreeTiers) return false;
    if (submission.status != OperationalCostStatus.underReview) return false;
    if (submission.tier2Status != 'approved') return false;
    if (submission.tier3Status != null && submission.tier3Status != 'pending') return false;
    
    if (isAdmin) return true;
    
    return false;
  }

  /// Check if user can cancel this submission (own submission only)
  bool canCancel(OperationalCostSubmission submission, String? currentUserId) {
    if (currentUserId == null) return false;
    if (submission.userId != currentUserId) return false;
    return submission.isCancellable;
  }

  /// Get approval hierarchy based on submitter role
  /// Coordinator→Supervisor→CountryDirector→Admin
  /// Supervisor→FOM→CountryDirector→Admin
  /// FOM→CountryDirector→Admin
  /// CountryDirector→Admin→SuperAdmin
  String getApprovalHierarchy(String submitterRole) {
    final r = submitterRole.toLowerCase();
    if (r.contains('coordinator')) {
      return 'Supervisor → Country Director → Admin';
    } else if (r.contains('supervisor')) {
      return 'FOM → Country Director → Admin';
    } else if (r.contains('fom')) {
      return 'Country Director → Admin';
    } else if (r.contains('country')) {
      return 'Admin → Super Admin';
    }
    return 'Supervisor → Admin';
  }

  /// Get role display name
  String getRoleDisplayName(bool isArabic) {
    if (isSuperAdmin) return isArabic ? 'مشرف رئيسي' : 'Super Admin';
    if (isAdmin) return isArabic ? 'مشرف' : 'Admin';
    if (isCountryDirector) return isArabic ? 'مدير قطري' : 'Country Director';
    if (isFOM) return isArabic ? 'مدير العمليات الميدانية' : 'FOM';
    if (isSupervisor) return isArabic ? 'مشرف المحور' : 'Supervisor';
    if (isCoordinator) return isArabic ? 'منسق' : 'Coordinator';
    if (isDataCollector) return isArabic ? 'جامع بيانات' : 'Data Collector';
    return isArabic ? 'مستخدم' : 'User';
  }

  /// Check if user can view outstanding advances (for reconciliation)
  bool get canViewOutstandingAdvances => canSubmit;
}
