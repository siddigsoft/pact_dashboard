// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'wallet_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Wallet _$WalletFromJson(Map<String, dynamic> json) => Wallet(
  id: json['id'] as String,
  userId: json['user_id'] as String,
  balances: json['balances'] as Map<String, dynamic>,
  totalEarned: (json['total_earned'] as num).toDouble(),
  totalWithdrawn: (json['total_withdrawn'] as num).toDouble(),
  currency: json['currency'] as String? ?? 'SDG',
  createdAt: DateTime.parse(json['created_at'] as String),
  updatedAt: DateTime.parse(json['updated_at'] as String),
);

Map<String, dynamic> _$WalletToJson(Wallet instance) => <String, dynamic>{
  'id': instance.id,
  'user_id': instance.userId,
  'balances': instance.balances,
  'total_earned': instance.totalEarned,
  'total_withdrawn': instance.totalWithdrawn,
  'currency': instance.currency,
  'created_at': instance.createdAt.toIso8601String(),
  'updated_at': instance.updatedAt.toIso8601String(),
};

WithdrawalRequest _$WithdrawalRequestFromJson(Map<String, dynamic> json) =>
    WithdrawalRequest(
      id: json['id'] as String,
      walletId: json['wallet_id'] as String?,
      userId: json['user_id'] as String,
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'] as String? ?? 'SDG',
      statusString: json['statusString'] as String? ?? 'pending',
      createdAt: DateTime.parse(json['created_at'] as String),
      approvedAt: json['approved_at'] == null
          ? null
          : DateTime.parse(json['approved_at'] as String),
      supervisorApprovedAt: json['supervisor_approved_at'] == null
          ? null
          : DateTime.parse(json['supervisor_approved_at'] as String),
      requestReason: json['request_reason'] as String?,
      supervisorNotes: json['supervisor_notes'] as String?,
      adminNotes: json['admin_notes'] as String?,
      paymentMethodString: json['payment_method'] as String?,
      paymentMethodDetails:
          json['payment_method_details'] as Map<String, dynamic>?,
      requesterName: json['requester_name'] as String?,
      referenceId: json['reference_id'] as String?,
    );

Map<String, dynamic> _$WithdrawalRequestToJson(
  WithdrawalRequest instance,
) => <String, dynamic>{
  'id': instance.id,
  'wallet_id': instance.walletId,
  'user_id': instance.userId,
  'amount': instance.amount,
  'currency': instance.currency,
  'statusString': instance.statusString,
  'created_at': instance.createdAt.toIso8601String(),
  'approved_at': instance.approvedAt?.toIso8601String(),
  'supervisor_approved_at': instance.supervisorApprovedAt?.toIso8601String(),
  'request_reason': instance.requestReason,
  'supervisor_notes': instance.supervisorNotes,
  'admin_notes': instance.adminNotes,
  'payment_method': instance.paymentMethodString,
  'payment_method_details': instance.paymentMethodDetails,
  'requester_name': instance.requesterName,
  'reference_id': instance.referenceId,
};

SiteVisitCost _$SiteVisitCostFromJson(Map<String, dynamic> json) =>
    SiteVisitCost(
      id: json['id'] as String,
      siteVisitId: json['site_visit_id'] as String,
      cost: (json['cost'] as num).toDouble(),
      currency: json['currency'] as String? ?? 'SDG',
      type: json['type'] as String? ?? 'field_operation',
      createdAt: DateTime.parse(json['created_at'] as String),
    );

Map<String, dynamic> _$SiteVisitCostToJson(SiteVisitCost instance) =>
    <String, dynamic>{
      'id': instance.id,
      'site_visit_id': instance.siteVisitId,
      'cost': instance.cost,
      'currency': instance.currency,
      'type': instance.type,
      'created_at': instance.createdAt.toIso8601String(),
    };

WalletStats _$WalletStatsFromJson(Map<String, dynamic> json) => WalletStats(
  totalEarned: (json['totalEarned'] as num).toDouble(),
  totalWithdrawn: (json['totalWithdrawn'] as num).toDouble(),
  pendingWithdrawals: (json['pendingWithdrawals'] as num?)?.toInt() ?? 0,
  currentBalance: (json['currentBalance'] as num).toDouble(),
  totalTransactions: (json['totalTransactions'] as num?)?.toInt() ?? 0,
  completedSiteVisits: (json['completedSiteVisits'] as num?)?.toInt() ?? 0,
);

Map<String, dynamic> _$WalletStatsToJson(WalletStats instance) =>
    <String, dynamic>{
      'totalEarned': instance.totalEarned,
      'totalWithdrawn': instance.totalWithdrawn,
      'pendingWithdrawals': instance.pendingWithdrawals,
      'currentBalance': instance.currentBalance,
      'totalTransactions': instance.totalTransactions,
      'completedSiteVisits': instance.completedSiteVisits,
    };
