import 'package:json_annotation/json_annotation.dart';

@JsonSerializable()
class Wallet {
  final String id;
  @JsonKey(name: 'user_id')
  final String userId;
  final Map<String, dynamic> balances;
  @JsonKey(name: 'total_earned')
  final double totalEarned;
  @JsonKey(name: 'total_withdrawn')
  final double totalWithdrawn;
  @JsonKey(defaultValue: 'SDG')
  final String currency;
  @JsonKey(name: 'created_at')
  final DateTime createdAt;
  @JsonKey(name: 'updated_at')
  final DateTime updatedAt;

  Wallet({
    required this.id,
    required this.userId,
    required this.balances,
    required this.totalEarned,
    required this.totalWithdrawn,
    this.currency = 'SDG',
    required this.createdAt,
    required this.updatedAt,
  });

  factory Wallet.fromJson(Map<String, dynamic> json) => Wallet(
    id: json['id'] is String ? json['id'] as String : 'unknown',
    userId: json['user_id'] is String ? json['user_id'] as String : 'unknown',
    balances: json['balances'] is Map<String, dynamic> ? json['balances'] as Map<String, dynamic> : {},
    totalEarned: (json['total_earned'] as num?)?.toDouble() ?? 0.0,
    totalWithdrawn: (json['total_withdrawn'] as num?)?.toDouble() ?? 0.0,
    currency: json['currency'] is String ? json['currency'] as String : 'SDG',
    createdAt: json['created_at'] is String ? DateTime.parse(json['created_at'] as String) : DateTime.now(),
    updatedAt: json['updated_at'] is String ? DateTime.parse(json['updated_at'] as String) : DateTime.now(),
  );
  Map<String, dynamic> toJson() => {
    'id': id,
    'user_id': userId,
    'balances': balances,
    'total_earned': totalEarned,
    'total_withdrawn': totalWithdrawn,
    'currency': currency,
    'created_at': createdAt.toIso8601String(),
    'updated_at': updatedAt.toIso8601String(),
  };

  double get currentBalance {
    final sdgBalance = balances['SDG'];
    if (sdgBalance is num) {
      return sdgBalance.toDouble();
    }
    return 0.0;
  }

  Wallet copyWith({
    String? id,
    String? userId,
    Map<String, dynamic>? balances,
    double? totalEarned,
    double? totalWithdrawn,
    String? currency,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return Wallet(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      balances: balances ?? this.balances,
      totalEarned: totalEarned ?? this.totalEarned,
      totalWithdrawn: totalWithdrawn ?? this.totalWithdrawn,
      currency: currency ?? this.currency,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}

class WalletTransaction {
  final String id;
  @JsonKey(name: 'wallet_id')
  final String walletId;
  @JsonKey(name: 'user_id')
  final String userId;
  final String type;
  final double amount;
  @JsonKey(name: 'amount_cents')
  final int? amountCents;
  final String currency;
  @JsonKey(name: 'site_visit_id')
  final String? siteVisitId;
  @JsonKey(name: 'withdrawal_request_id')
  final String? withdrawalRequestId;
  final String? description;
  final Map<String, dynamic>? metadata;
  @JsonKey(name: 'balance_before')
  final double? balanceBefore;
  @JsonKey(name: 'balance_after')
  final double? balanceAfter;
  @JsonKey(name: 'created_by')
  final String? createdBy;
  @JsonKey(name: 'created_at')
  final DateTime createdAt;

  WalletTransaction({
    required this.id,
    required this.walletId,
    required this.userId,
    required this.type,
    required this.amount,
    this.amountCents,
    this.currency = 'SDG',
    this.siteVisitId,
    this.withdrawalRequestId,
    this.description,
    this.metadata,
    this.balanceBefore,
    this.balanceAfter,
    this.createdBy,
    required this.createdAt,
  });

  factory WalletTransaction.fromJson(Map<String, dynamic> json) => WalletTransaction(
    id: json['id'] is String ? json['id'] as String : 'unknown',
    walletId: json['wallet_id'] is String ? json['wallet_id'] as String : 'unknown',
    userId: json['user_id'] is String ? json['user_id'] as String : 'unknown',
    type: json['type'] is String ? json['type'] as String : 'unknown',
    amount: (json['amount'] as num?)?.toDouble() ?? 0.0,
    amountCents: json['amount_cents'] is int ? json['amount_cents'] as int : null,
    currency: json['currency'] is String ? json['currency'] as String : 'SDG',
    siteVisitId: json['site_visit_id'] as String?,
    withdrawalRequestId: json['withdrawal_request_id'] as String?,
    description: json['description'] as String?,
    metadata: json['metadata'] as Map<String, dynamic>?,
    balanceBefore: json['balance_before'] is num ? (json['balance_before'] as num).toDouble() : null,
    balanceAfter: json['balance_after'] is num ? (json['balance_after'] as num).toDouble() : null,
    createdBy: json['created_by'] as String?,
    createdAt: json['created_at'] is String ? DateTime.parse(json['created_at'] as String) : DateTime.now(),
  );
  Map<String, dynamic> toJson() => {
    'id': id,
    'wallet_id': walletId,
    'user_id': userId,
    'type': type,
    'amount': amount,
    'amount_cents': amountCents,
    'currency': currency,
    'site_visit_id': siteVisitId,
    'withdrawal_request_id': withdrawalRequestId,
    'description': description,
    'metadata': metadata,
    'balance_before': balanceBefore,
    'balance_after': balanceAfter,
    'created_by': createdBy,
    'created_at': createdAt.toIso8601String(),
  };

  String get typeLabel {
    switch (type) {
      case 'earning':
        return 'Earning';
      case 'site_visit_fee':
        return 'Site Visit Fee';
      case 'withdrawal':
        return 'Withdrawal';
      case 'adjustment':
        return 'Adjustment';
      case 'bonus':
        return 'Bonus';
      case 'penalty':
        return 'Penalty';
      default:
        return type;
    }
  }

  bool get isCredit => ['earning', 'site_visit_fee', 'bonus', 'adjustment'].contains(type) && amount > 0;
}

@JsonSerializable()
class WithdrawalRequest {
  final String id;
  @JsonKey(name: 'wallet_id')
  final String walletId;
  @JsonKey(name: 'user_id')
  final String userId;
  final double amount;
  @JsonKey(defaultValue: 'SDG')
  final String currency;
  @JsonKey(defaultValue: 'pending')
  final String status; // pending, processing, approved, rejected, cancelled
  @JsonKey(name: 'requested_at')
  final DateTime requestedAt;
  @JsonKey(name: 'processed_at')
  final DateTime? processedAt;
  final String? reason;
  final String? notes;

  // Offline deduplication
  @JsonKey(name: 'reference_id')
  final String? referenceId;

  WithdrawalRequest({
    required this.id,
    required this.walletId,
    required this.userId,
    required this.amount,
    this.currency = 'SDG',
    this.status = 'pending',
    required this.requestedAt,
    this.processedAt,
    this.reason,
    this.notes,
    this.referenceId,
  });

  factory WithdrawalRequest.fromJson(Map<String, dynamic> json) => WithdrawalRequest(
    id: json['id'] is String ? json['id'] as String : 'unknown',
    walletId: json['wallet_id'] is String ? json['wallet_id'] as String : 'unknown',
    userId: json['user_id'] is String ? json['user_id'] as String : 'unknown',
    amount: (json['amount'] as num?)?.toDouble() ?? 0.0,
    currency: json['currency'] is String ? json['currency'] as String : 'SDG',
    status: json['status'] is String ? json['status'] as String : 'pending',
    requestedAt: json['requested_at'] is String ? DateTime.parse(json['requested_at'] as String) : DateTime.now(),
    processedAt: json['processed_at'] is String ? DateTime.parse(json['processed_at'] as String) : null,
    reason: json['reason'] as String?,
    notes: json['notes'] as String?,
    referenceId: json['reference_id'] as String?,
  );
  Map<String, dynamic> toJson() => {
    'id': id,
    'wallet_id': walletId,
    'user_id': userId,
    'amount': amount,
    'currency': currency,
    'status': status,
    'requested_at': requestedAt.toIso8601String(),
    'processed_at': processedAt?.toIso8601String(),
    'reason': reason,
    'notes': notes,
    'reference_id': referenceId,
  };

  // Helper getters
  String get statusLabel {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'processing':
        return 'Processing';
      case 'approved':
        return 'Approved';
      case 'rejected':
        return 'Rejected';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  }

  bool get canCancel => status == 'pending';
  bool get isSettled => ['approved', 'rejected', 'cancelled'].contains(status);
}

@JsonSerializable()
class SiteVisitCost {
  final String id;
  @JsonKey(name: 'site_visit_id')
  final String siteVisitId;
  final double cost;
  final String currency;
  final String type;
  @JsonKey(name: 'created_at')
  final DateTime createdAt;

  SiteVisitCost({
    required this.id,
    required this.siteVisitId,
    required this.cost,
    this.currency = 'SDG',
    this.type = 'field_operation',
    required this.createdAt,
  });

  factory SiteVisitCost.fromJson(Map<String, dynamic> json) => SiteVisitCost(
    id: json['id'] is String ? json['id'] as String : 'unknown',
    siteVisitId: json['site_visit_id'] is String ? json['site_visit_id'] as String : 'unknown',
    cost: (json['cost'] as num?)?.toDouble() ?? 0.0,
    currency: json['currency'] is String ? json['currency'] as String : 'SDG',
    type: json['type'] is String ? json['type'] as String : 'field_operation',
    createdAt: json['created_at'] is String ? DateTime.parse(json['created_at'] as String) : DateTime.now(),
  );
  Map<String, dynamic> toJson() => {
    'id': id,
    'site_visit_id': siteVisitId,
    'cost': cost,
    'currency': currency,
    'type': type,
    'created_at': createdAt.toIso8601String(),
  };
}

@JsonSerializable()
class WalletStats {
  final double totalEarned;
  final double totalWithdrawn;
  final int pendingWithdrawals;
  final double currentBalance;
  final int totalTransactions;
  final int completedSiteVisits;

  WalletStats({
    required this.totalEarned,
    required this.totalWithdrawn,
    this.pendingWithdrawals = 0,
    required this.currentBalance,
    this.totalTransactions = 0,
    this.completedSiteVisits = 0,
  });

  factory WalletStats.fromJson(Map<String, dynamic> json) => WalletStats(
    totalEarned: (json['totalEarned'] as num?)?.toDouble() ?? 0.0,
    totalWithdrawn: (json['totalWithdrawn'] as num?)?.toDouble() ?? 0.0,
    pendingWithdrawals: (json['pendingWithdrawals'] as num?)?.toInt() ?? 0,
    currentBalance: (json['currentBalance'] as num?)?.toDouble() ?? 0.0,
    totalTransactions: (json['totalTransactions'] as num?)?.toInt() ?? 0,
    completedSiteVisits: (json['completedSiteVisits'] as num?)?.toInt() ?? 0,
  );
  Map<String, dynamic> toJson() => {
    'totalEarned': totalEarned,
    'totalWithdrawn': totalWithdrawn,
    'pendingWithdrawals': pendingWithdrawals,
    'currentBalance': currentBalance,
    'totalTransactions': totalTransactions,
    'completedSiteVisits': completedSiteVisits,
  };

  double get approvalRate {
    if (totalTransactions == 0) return 0;
    return (totalEarned / (totalEarned + totalWithdrawn)) * 100;
  }
}

class ValidationResult {
  final bool isValid;
  final String? errorMessage;

  ValidationResult({required this.isValid, this.errorMessage});

  factory ValidationResult.valid() => ValidationResult(isValid: true);
  factory ValidationResult.invalid(String message) =>
      ValidationResult(isValid: false, errorMessage: message);
}
