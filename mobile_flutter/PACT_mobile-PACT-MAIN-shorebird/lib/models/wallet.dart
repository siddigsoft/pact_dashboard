/// Wallet models for the data collector wallet system.
/// Based on the Supabase schema from pact_dashboard.
library;

// ============================================================================
// WALLET MODEL
// ============================================================================

class Wallet {
  final String id;
  final String userId;
  final Map<String, double> balances; // {"SDG": 15000}
  final double totalEarned;
  final double totalWithdrawn;
  final DateTime createdAt;
  final DateTime updatedAt;

  Wallet({
    required this.id,
    required this.userId,
    required this.balances,
    required this.totalEarned,
    required this.totalWithdrawn,
    required this.createdAt,
    required this.updatedAt,
  });

  /// Get balance for a specific currency (defaults to SDG)
  double getBalance([String currency = 'SDG']) {
    return balances[currency] ?? 0.0;
  }

  /// Available balance (total - pending withdrawals)
  double get availableBalance => getBalance('SDG');

  factory Wallet.fromJson(Map<String, dynamic> json) {
    // Parse balances from JSONB
    Map<String, double> balances = {};
    if (json['balances'] != null) {
      final balancesRaw = json['balances'];
      if (balancesRaw is Map) {
        balancesRaw.forEach((key, value) {
          balances[key.toString()] = (value is num) ? value.toDouble() : 0.0;
        });
      }
    }

    return Wallet(
      id: json['id']?.toString() ?? '',
      userId: json['user_id']?.toString() ?? '',
      balances: balances,
      totalEarned: _parseDouble(json['total_earned']),
      totalWithdrawn: _parseDouble(json['total_withdrawn']),
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'])
          : DateTime.now(),
      updatedAt: json['updated_at'] != null
          ? DateTime.parse(json['updated_at'])
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'user_id': userId,
    'balances': balances,
    'total_earned': totalEarned,
    'total_withdrawn': totalWithdrawn,
    'created_at': createdAt.toIso8601String(),
    'updated_at': updatedAt.toIso8601String(),
  };
}

// ============================================================================
// WALLET TRANSACTION MODEL
// ============================================================================

enum TransactionType {
  earning,
  siteVisitFee,
  withdrawal,
  adjustment,
  bonus,
  penalty,
}

class WalletTransaction {
  final String id;
  final String walletId;
  final String userId;
  final TransactionType type;
  final double amount;
  final String currency;
  final String? siteVisitId;
  final String? withdrawalRequestId;
  final String description;
  final double? balanceBefore;
  final double? balanceAfter;
  final DateTime createdAt;

  WalletTransaction({
    required this.id,
    required this.walletId,
    required this.userId,
    required this.type,
    required this.amount,
    required this.currency,
    this.siteVisitId,
    this.withdrawalRequestId,
    required this.description,
    this.balanceBefore,
    this.balanceAfter,
    required this.createdAt,
  });

  bool get isCredit => amount > 0;
  bool get isDebit => amount < 0;

  factory WalletTransaction.fromJson(Map<String, dynamic> json) {
    return WalletTransaction(
      id: json['id']?.toString() ?? '',
      walletId: json['wallet_id']?.toString() ?? '',
      userId: json['user_id']?.toString() ?? '',
      type: _parseTransactionType(json['type']),
      amount: _parseDouble(json['amount']),
      currency: json['currency']?.toString() ?? 'SDG',
      siteVisitId: json['site_visit_id']?.toString(),
      withdrawalRequestId: json['withdrawal_request_id']?.toString(),
      description: json['description']?.toString() ?? '',
      balanceBefore: json['balance_before'] != null
          ? _parseDouble(json['balance_before'])
          : null,
      balanceAfter: json['balance_after'] != null
          ? _parseDouble(json['balance_after'])
          : null,
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'])
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'wallet_id': walletId,
    'user_id': userId,
    'type': type.name,
    'amount': amount,
    'currency': currency,
    'site_visit_id': siteVisitId,
    'withdrawal_request_id': withdrawalRequestId,
    'description': description,
    'balance_before': balanceBefore,
    'balance_after': balanceAfter,
    'created_at': createdAt.toIso8601String(),
  };
}

// ============================================================================
// WITHDRAWAL REQUEST MODEL
// ============================================================================

enum WithdrawalStatus {
  pending,
  supervisorApproved,
  processing,
  approved,
  rejected,
  cancelled,
}

class WithdrawalRequest {
  final String id;
  final String userId;
  final String walletId;
  final double amount;
  final String currency;
  final WithdrawalStatus status;
  final String? requestReason;
  final String? supervisorId;
  final String? supervisorNotes;
  final DateTime? approvedAt;
  final String? adminProcessedBy;
  final String? adminNotes;
  final DateTime? adminProcessedAt;
  final String? paymentMethod;
  final Map<String, dynamic>? paymentDetails;
  final DateTime createdAt;
  final DateTime updatedAt;

  WithdrawalRequest({
    required this.id,
    required this.userId,
    required this.walletId,
    required this.amount,
    required this.currency,
    required this.status,
    this.requestReason,
    this.supervisorId,
    this.supervisorNotes,
    this.approvedAt,
    this.adminProcessedBy,
    this.adminNotes,
    this.adminProcessedAt,
    this.paymentMethod,
    this.paymentDetails,
    required this.createdAt,
    required this.updatedAt,
  });

  bool get isPending => status == WithdrawalStatus.pending;
  bool get isApproved => status == WithdrawalStatus.approved;
  bool get isRejected => status == WithdrawalStatus.rejected;
  bool get canCancel => status == WithdrawalStatus.pending;

  factory WithdrawalRequest.fromJson(Map<String, dynamic> json) {
    return WithdrawalRequest(
      id: json['id']?.toString() ?? '',
      userId: json['user_id']?.toString() ?? '',
      walletId: json['wallet_id']?.toString() ?? '',
      amount: _parseDouble(json['amount']),
      currency: json['currency']?.toString() ?? 'SDG',
      status: _parseWithdrawalStatus(json['status']),
      requestReason: json['request_reason']?.toString(),
      supervisorId: json['supervisor_id']?.toString(),
      supervisorNotes: json['supervisor_notes']?.toString(),
      approvedAt: json['approved_at'] != null
          ? DateTime.tryParse(json['approved_at'])
          : null,
      adminProcessedBy: json['admin_processed_by']?.toString(),
      adminNotes: json['admin_notes']?.toString(),
      adminProcessedAt: json['admin_processed_at'] != null
          ? DateTime.tryParse(json['admin_processed_at'])
          : null,
      paymentMethod: json['payment_method']?.toString(),
      paymentDetails: json['payment_details'] is Map
          ? Map<String, dynamic>.from(json['payment_details'])
          : null,
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'])
          : DateTime.now(),
      updatedAt: json['updated_at'] != null
          ? DateTime.parse(json['updated_at'])
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'user_id': userId,
    'wallet_id': walletId,
    'amount': amount,
    'currency': currency,
    'status': _statusToString(status),
    'request_reason': requestReason,
    'supervisor_id': supervisorId,
    'supervisor_notes': supervisorNotes,
    'approved_at': approvedAt?.toIso8601String(),
    'admin_processed_by': adminProcessedBy,
    'admin_notes': adminNotes,
    'admin_processed_at': adminProcessedAt?.toIso8601String(),
    'payment_method': paymentMethod,
    'payment_details': paymentDetails,
    'created_at': createdAt.toIso8601String(),
    'updated_at': updatedAt.toIso8601String(),
  };
}

// ============================================================================
// PAYMENT METHOD MODEL
// ============================================================================

enum PaymentMethodType { bank, mobileMoney, card }

class PaymentMethod {
  final String id;
  final String userId;
  final PaymentMethodType type;
  final String name;
  final String? accountNumber;
  final String? bankName;
  final String? phoneNumber;
  final String? cardNumber;
  final bool isDefault;
  final DateTime createdAt;
  final DateTime updatedAt;

  PaymentMethod({
    required this.id,
    required this.userId,
    required this.type,
    required this.name,
    this.accountNumber,
    this.bankName,
    this.phoneNumber,
    this.cardNumber,
    required this.isDefault,
    required this.createdAt,
    required this.updatedAt,
  });

  /// Display-friendly masked account info
  String get maskedInfo {
    switch (type) {
      case PaymentMethodType.bank:
        if (accountNumber != null && accountNumber!.length > 4) {
          return '****${accountNumber!.substring(accountNumber!.length - 4)}';
        }
        return accountNumber ?? '';
      case PaymentMethodType.mobileMoney:
        if (phoneNumber != null && phoneNumber!.length > 4) {
          return '****${phoneNumber!.substring(phoneNumber!.length - 4)}';
        }
        return phoneNumber ?? '';
      case PaymentMethodType.card:
        if (cardNumber != null && cardNumber!.length > 4) {
          return '****${cardNumber!.substring(cardNumber!.length - 4)}';
        }
        return cardNumber ?? '';
    }
  }

  factory PaymentMethod.fromJson(Map<String, dynamic> json) {
    return PaymentMethod(
      id: json['id']?.toString() ?? '',
      userId: json['user_id']?.toString() ?? '',
      type: _parsePaymentMethodType(json['type']),
      name: json['name']?.toString() ?? '',
      accountNumber: json['account_number']?.toString(),
      bankName: json['bank_name']?.toString(),
      phoneNumber: json['phone_number']?.toString(),
      cardNumber: json['card_number']?.toString(),
      isDefault: json['is_default'] == true,
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'])
          : DateTime.now(),
      updatedAt: json['updated_at'] != null
          ? DateTime.parse(json['updated_at'])
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'user_id': userId,
    'type': _paymentMethodTypeToString(type),
    'name': name,
    'account_number': accountNumber,
    'bank_name': bankName,
    'phone_number': phoneNumber,
    'card_number': cardNumber,
    'is_default': isDefault,
    'created_at': createdAt.toIso8601String(),
    'updated_at': updatedAt.toIso8601String(),
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

double _parseDouble(dynamic value) {
  if (value == null) return 0.0;
  if (value is double) return value;
  if (value is int) return value.toDouble();
  if (value is String) return double.tryParse(value) ?? 0.0;
  return 0.0;
}

TransactionType _parseTransactionType(dynamic value) {
  final str = value?.toString().toLowerCase() ?? '';
  switch (str) {
    case 'earning':
      return TransactionType.earning;
    case 'site_visit_fee':
      return TransactionType.siteVisitFee;
    case 'withdrawal':
      return TransactionType.withdrawal;
    case 'adjustment':
      return TransactionType.adjustment;
    case 'bonus':
      return TransactionType.bonus;
    case 'penalty':
      return TransactionType.penalty;
    default:
      return TransactionType.earning;
  }
}

WithdrawalStatus _parseWithdrawalStatus(dynamic value) {
  final str = value?.toString().toLowerCase() ?? '';
  switch (str) {
    case 'pending':
      return WithdrawalStatus.pending;
    case 'supervisor_approved':
      return WithdrawalStatus.supervisorApproved;
    case 'processing':
      return WithdrawalStatus.processing;
    case 'approved':
      return WithdrawalStatus.approved;
    case 'rejected':
      return WithdrawalStatus.rejected;
    case 'cancelled':
      return WithdrawalStatus.cancelled;
    default:
      return WithdrawalStatus.pending;
  }
}

String _statusToString(WithdrawalStatus status) {
  switch (status) {
    case WithdrawalStatus.pending:
      return 'pending';
    case WithdrawalStatus.supervisorApproved:
      return 'supervisor_approved';
    case WithdrawalStatus.processing:
      return 'processing';
    case WithdrawalStatus.approved:
      return 'approved';
    case WithdrawalStatus.rejected:
      return 'rejected';
    case WithdrawalStatus.cancelled:
      return 'cancelled';
  }
}

PaymentMethodType _parsePaymentMethodType(dynamic value) {
  final str = value?.toString().toLowerCase() ?? '';
  switch (str) {
    case 'bank':
      return PaymentMethodType.bank;
    case 'mobile_money':
      return PaymentMethodType.mobileMoney;
    case 'card':
      return PaymentMethodType.card;
    default:
      return PaymentMethodType.bank;
  }
}

String _paymentMethodTypeToString(PaymentMethodType type) {
  switch (type) {
    case PaymentMethodType.bank:
      return 'bank';
    case PaymentMethodType.mobileMoney:
      return 'mobile_money';
    case PaymentMethodType.card:
      return 'card';
  }
}
