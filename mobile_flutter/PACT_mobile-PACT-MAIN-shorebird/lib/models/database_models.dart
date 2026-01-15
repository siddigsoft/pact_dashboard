import 'package:json_annotation/json_annotation.dart';

part 'database_models.g.dart';

/// Profile record in the profiles table
/// Linked to auth.users via FK
@JsonSerializable()
class Profile {
  final String id;
  final String? fullName;
  final String? username;
  final String? email;
  final String? phone;
  final String? avatarUrl;
  final String? employeeId;
  final String role; // 'dataCollector', 'coordinator', 'supervisor', 'admin', etc.
  final String status; // 'pending', 'approved', 'rejected'
  final String? stateId;
  final String? localityId;
  final String? hubId;
  final Map<String, dynamic>? location; // {latitude, longitude, accuracy, lastUpdated, isSharing}
  final bool locationSharing;
  final String availability; // 'online', 'offline', 'busy'
  final String? createdAt;
  final String? updatedAt;
  final String? lastActive;
  final List<String>? fcmTokens;
  final String? classificationLevel;
  final String? roleScope;
  final bool? hasRetainer;
  final int? retainerAmountCents;
  final String? retainerCurrency;

  Profile({
    required this.id,
    this.fullName,
    this.username,
    this.email,
    this.phone,
    this.avatarUrl,
    this.employeeId,
    this.role = 'dataCollector',
    this.status = 'pending',
    this.stateId,
    this.localityId,
    this.hubId,
    this.location,
    this.locationSharing = false,
    this.availability = 'offline',
    this.createdAt,
    this.updatedAt,
    this.lastActive,
    this.fcmTokens,
    this.classificationLevel,
    this.roleScope,
    this.hasRetainer,
    this.retainerAmountCents,
    this.retainerCurrency,
  });

  factory Profile.fromJson(Map<String, dynamic> json) =>
      _$ProfileFromJson(json);

  Map<String, dynamic> toJson() => _$ProfileToJson(this);

  Profile copyWith({
    String? id,
    String? fullName,
    String? username,
    String? email,
    String? phone,
    String? avatarUrl,
    String? employeeId,
    String? role,
    String? status,
    String? stateId,
    String? localityId,
    String? hubId,
    Map<String, dynamic>? location,
    bool? locationSharing,
    String? availability,
    String? createdAt,
    String? updatedAt,
    String? lastActive,
    List<String>? fcmTokens,
    String? classificationLevel,
    String? roleScope,
    bool? hasRetainer,
    int? retainerAmountCents,
    String? retainerCurrency,
  }) {
    return Profile(
      id: id ?? this.id,
      fullName: fullName ?? this.fullName,
      username: username ?? this.username,
      email: email ?? this.email,
      phone: phone ?? this.phone,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      employeeId: employeeId ?? this.employeeId,
      role: role ?? this.role,
      status: status ?? this.status,
      stateId: stateId ?? this.stateId,
      localityId: localityId ?? this.localityId,
      hubId: hubId ?? this.hubId,
      location: location ?? this.location,
      locationSharing: locationSharing ?? this.locationSharing,
      availability: availability ?? this.availability,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      lastActive: lastActive ?? this.lastActive,
      fcmTokens: fcmTokens ?? this.fcmTokens,
      classificationLevel: classificationLevel ?? this.classificationLevel,
      roleScope: roleScope ?? this.roleScope,
      hasRetainer: hasRetainer ?? this.hasRetainer,
      retainerAmountCents: retainerAmountCents ?? this.retainerAmountCents,
      retainerCurrency: retainerCurrency ?? this.retainerCurrency,
    );
  }
}

/// User role assignment
/// Supports multiple roles per user
@JsonSerializable()
class UserRole {
  final String id;
  final String userId;
  final String role;
  final String? assignedAt;
  final String? assignedBy;

  UserRole({
    required this.id,
    required this.userId,
    required this.role,
    this.assignedAt,
    this.assignedBy,
  });

  factory UserRole.fromJson(Map<String, dynamic> json) =>
      _$UserRoleFromJson(json);

  Map<String, dynamic> toJson() => _$UserRoleToJson(this);
}

/// Wallet - financial account per user
@JsonSerializable()
class Wallet {
  final String id;
  final String userId;
  final String currency;
  final int balanceCents;
  final int totalEarnedCents;
  final int totalPaidOutCents;
  final int pendingPayoutCents;
  final Map<String, dynamic>? balances; // For backward compatibility
  final double? totalEarned;
  final double? totalWithdrawn;
  final String? createdAt;
  final String? updatedAt;

  Wallet({
    required this.id,
    required this.userId,
    this.currency = 'SDG',
    this.balanceCents = 0,
    this.totalEarnedCents = 0,
    this.totalPaidOutCents = 0,
    this.pendingPayoutCents = 0,
    this.balances,
    this.totalEarned,
    this.totalWithdrawn,
    this.createdAt,
    this.updatedAt,
  });

  factory Wallet.fromJson(Map<String, dynamic> json) =>
      _$WalletFromJson(json);

  Map<String, dynamic> toJson() => _$WalletToJson(this);

  Wallet copyWith({
    String? id,
    String? userId,
    String? currency,
    int? balanceCents,
    int? totalEarnedCents,
    int? totalPaidOutCents,
    int? pendingPayoutCents,
    Map<String, dynamic>? balances,
    double? totalEarned,
    double? totalWithdrawn,
    String? createdAt,
    String? updatedAt,
  }) {
    return Wallet(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      currency: currency ?? this.currency,
      balanceCents: balanceCents ?? this.balanceCents,
      totalEarnedCents: totalEarnedCents ?? this.totalEarnedCents,
      totalPaidOutCents: totalPaidOutCents ?? this.totalPaidOutCents,
      pendingPayoutCents: pendingPayoutCents ?? this.pendingPayoutCents,
      balances: balances ?? this.balances,
      totalEarned: totalEarned ?? this.totalEarned,
      totalWithdrawn: totalWithdrawn ?? this.totalWithdrawn,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  /// Get balance in SDG (as decimal)
  double get balanceInSDG => balanceCents / 100.0;

  /// Get total earned (as decimal)
  double get totalEarnedInSDG => totalEarnedCents / 100.0;

  /// Get total paid out (as decimal)
  double get totalPaidOutInSDG => totalPaidOutCents / 100.0;

  /// Get pending payout (as decimal)
  double get pendingPayoutInSDG => pendingPayoutCents / 100.0;
}

/// Wallet transaction record
enum WalletTransactionType {
  @JsonValue('site_visit_fee')
  siteVisitFee,
  @JsonValue('withdrawal')
  withdrawal,
  @JsonValue('adjustment')
  adjustment,
  @JsonValue('bonus')
  bonus,
  @JsonValue('penalty')
  penalty,
  @JsonValue('earning')
  earning,
}

enum WalletTransactionStatus {
  @JsonValue('pending')
  pending,
  @JsonValue('posted')
  posted,
  @JsonValue('reversed')
  reversed,
  @JsonValue('failed')
  failed,
}

@JsonSerializable()
class WalletTransaction {
  final String id;
  final String? walletId;
  final String userId;
  final int amountCents;
  final String currency;
  final String type; // wallet_tx_type
  final String status; // 'pending', 'posted', 'reversed', 'failed'
  final String? createdAt;
  final String? postedAt;
  final String? memo;
  final String? relatedSiteVisitId;
  final String? visitCode;
  final double? amount;
  final String? siteVisitId;
  final String? withdrawalRequestId;
  final String? description;
  final Map<String, dynamic>? metadata;
  final double? balanceBefore;
  final double? balanceAfter;
  final String? createdBy;

  WalletTransaction({
    required this.id,
    this.walletId,
    required this.userId,
    required this.amountCents,
    this.currency = 'SDG',
    required this.type,
    this.status = 'pending',
    this.createdAt,
    this.postedAt,
    this.memo,
    this.relatedSiteVisitId,
    this.visitCode,
    this.amount,
    this.siteVisitId,
    this.withdrawalRequestId,
    this.description,
    this.metadata,
    this.balanceBefore,
    this.balanceAfter,
    this.createdBy,
  });

  factory WalletTransaction.fromJson(Map<String, dynamic> json) =>
      _$WalletTransactionFromJson(json);

  Map<String, dynamic> toJson() => _$WalletTransactionToJson(this);

  WalletTransaction copyWith({
    String? id,
    String? walletId,
    String? userId,
    int? amountCents,
    String? currency,
    String? type,
    String? status,
    String? createdAt,
    String? postedAt,
    String? memo,
    String? relatedSiteVisitId,
    String? visitCode,
    double? amount,
    String? siteVisitId,
    String? withdrawalRequestId,
    String? description,
    Map<String, dynamic>? metadata,
    double? balanceBefore,
    double? balanceAfter,
    String? createdBy,
  }) {
    return WalletTransaction(
      id: id ?? this.id,
      walletId: walletId ?? this.walletId,
      userId: userId ?? this.userId,
      amountCents: amountCents ?? this.amountCents,
      currency: currency ?? this.currency,
      type: type ?? this.type,
      status: status ?? this.status,
      createdAt: createdAt ?? this.createdAt,
      postedAt: postedAt ?? this.postedAt,
      memo: memo ?? this.memo,
      relatedSiteVisitId: relatedSiteVisitId ?? this.relatedSiteVisitId,
      visitCode: visitCode ?? this.visitCode,
      amount: amount ?? this.amount,
      siteVisitId: siteVisitId ?? this.siteVisitId,
      withdrawalRequestId: withdrawalRequestId ?? this.withdrawalRequestId,
      description: description ?? this.description,
      metadata: metadata ?? this.metadata,
      balanceBefore: balanceBefore ?? this.balanceBefore,
      balanceAfter: balanceAfter ?? this.balanceAfter,
      createdBy: createdBy ?? this.createdBy,
    );
  }

  /// Get amount in SDG (as decimal)
  double get amountInSDG => amountCents / 100.0;
}

/// Payout/Withdrawal request
enum PayoutMethod {
  @JsonValue('bank')
  bank,
  @JsonValue('mobile_money')
  mobileMoney,
  @JsonValue('manual')
  manual,
}

enum PayoutStatus {
  @JsonValue('requested')
  requested,
  @JsonValue('approved')
  approved,
  @JsonValue('declined')
  declined,
  @JsonValue('paid')
  paid,
  @JsonValue('cancelled')
  cancelled,
}

@JsonSerializable()
class PayoutRequest {
  final String id;
  final String userId;
  final int amountCents;
  final String method; // 'bank', 'mobile_money', 'manual'
  final Map<String, dynamic>? destination;
  final String status; // 'requested', 'approved', 'declined', 'paid', 'cancelled'
  final String? requestedAt;
  final String? decidedAt;
  final String? decidedBy;
  final String? paidAt;
  final String? walletId;
  final String? currency;
  final String? requestReason;
  final String? supervisorId;
  final String? supervisorNotes;
  final String? approvedAt;
  final String? rejectedAt;
  final String? paymentMethod;
  final Map<String, dynamic>? paymentDetails;
  final String? createdAt;
  final String? updatedAt;

  PayoutRequest({
    required this.id,
    required this.userId,
    required this.amountCents,
    required this.method,
    this.destination,
    this.status = 'requested',
    this.requestedAt,
    this.decidedAt,
    this.decidedBy,
    this.paidAt,
    this.walletId,
    this.currency = 'SDG',
    this.requestReason,
    this.supervisorId,
    this.supervisorNotes,
    this.approvedAt,
    this.rejectedAt,
    this.paymentMethod,
    this.paymentDetails,
    this.createdAt,
    this.updatedAt,
  });

  factory PayoutRequest.fromJson(Map<String, dynamic> json) =>
      _$PayoutRequestFromJson(json);

  Map<String, dynamic> toJson() => _$PayoutRequestToJson(this);

  PayoutRequest copyWith({
    String? id,
    String? userId,
    int? amountCents,
    String? method,
    Map<String, dynamic>? destination,
    String? status,
    String? requestedAt,
    String? decidedAt,
    String? decidedBy,
    String? paidAt,
    String? walletId,
    String? currency,
    String? requestReason,
    String? supervisorId,
    String? supervisorNotes,
    String? approvedAt,
    String? rejectedAt,
    String? paymentMethod,
    Map<String, dynamic>? paymentDetails,
    String? createdAt,
    String? updatedAt,
  }) {
    return PayoutRequest(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      amountCents: amountCents ?? this.amountCents,
      method: method ?? this.method,
      destination: destination ?? this.destination,
      status: status ?? this.status,
      requestedAt: requestedAt ?? this.requestedAt,
      decidedAt: decidedAt ?? this.decidedAt,
      decidedBy: decidedBy ?? this.decidedBy,
      paidAt: paidAt ?? this.paidAt,
      walletId: walletId ?? this.walletId,
      currency: currency ?? this.currency,
      requestReason: requestReason ?? this.requestReason,
      supervisorId: supervisorId ?? this.supervisorId,
      supervisorNotes: supervisorNotes ?? this.supervisorNotes,
      approvedAt: approvedAt ?? this.approvedAt,
      rejectedAt: rejectedAt ?? this.rejectedAt,
      paymentMethod: paymentMethod ?? this.paymentMethod,
      paymentDetails: paymentDetails ?? this.paymentDetails,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  /// Get amount in SDG (as decimal)
  double get amountInSDG => amountCents / 100.0;

  /// Check if request is pending decision
  bool get isPending => status == 'requested';

  /// Check if request is approved
  bool get isApproved => status == 'approved';

  /// Check if request is paid
  bool get isPaid => status == 'paid';
}

/// User classification for cost tracking
@JsonSerializable()
class UserClassificationRecord {
  final String id;
  final String userId;
  final String classificationLevel;
  final String roleScope;
  final bool hasRetainer;
  final int retainerAmountCents;
  final String retainerCurrency;
  final String effectiveFrom;
  final String? effectiveUntil;
  final bool isActive;
  final String? createdAt;
  final String? updatedAt;

  UserClassificationRecord({
    required this.id,
    required this.userId,
    required this.classificationLevel,
    required this.roleScope,
    this.hasRetainer = false,
    this.retainerAmountCents = 0,
    this.retainerCurrency = 'SDG',
    required this.effectiveFrom,
    this.effectiveUntil,
    this.isActive = true,
    this.createdAt,
    this.updatedAt,
  });

  factory UserClassificationRecord.fromJson(Map<String, dynamic> json) =>
      _$UserClassificationRecordFromJson(json);

  Map<String, dynamic> toJson() => _$UserClassificationRecordToJson(this);
}

/// User bank account (stored separately for security)
@JsonSerializable()
class UserBankAccount {
  final String id;
  final String userId;
  final String accountName;
  final String accountNumber;
  final String branch;
  final String? createdAt;
  final String? updatedAt;

  UserBankAccount({
    required this.id,
    required this.userId,
    required this.accountName,
    required this.accountNumber,
    required this.branch,
    this.createdAt,
    this.updatedAt,
  });

  factory UserBankAccount.fromJson(Map<String, dynamic> json) =>
      _$UserBankAccountFromJson(json);

  Map<String, dynamic> toJson() => _$UserBankAccountToJson(this);
}
