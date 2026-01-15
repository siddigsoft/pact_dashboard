// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'database_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Profile _$ProfileFromJson(Map<String, dynamic> json) => Profile(
  id: json['id'] as String,
  fullName: json['fullName'] as String?,
  username: json['username'] as String?,
  email: json['email'] as String?,
  phone: json['phone'] as String?,
  avatarUrl: json['avatarUrl'] as String?,
  employeeId: json['employeeId'] as String?,
  role: json['role'] as String? ?? 'dataCollector',
  status: json['status'] as String? ?? 'pending',
  stateId: json['stateId'] as String?,
  localityId: json['localityId'] as String?,
  hubId: json['hubId'] as String?,
  location: json['location'] as Map<String, dynamic>?,
  locationSharing: json['locationSharing'] as bool? ?? false,
  availability: json['availability'] as String? ?? 'offline',
  createdAt: json['createdAt'] as String?,
  updatedAt: json['updatedAt'] as String?,
  lastActive: json['lastActive'] as String?,
  fcmTokens: (json['fcmTokens'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  classificationLevel: json['classificationLevel'] as String?,
  roleScope: json['roleScope'] as String?,
  hasRetainer: json['hasRetainer'] as bool?,
  retainerAmountCents: (json['retainerAmountCents'] as num?)?.toInt(),
  retainerCurrency: json['retainerCurrency'] as String?,
);

Map<String, dynamic> _$ProfileToJson(Profile instance) => <String, dynamic>{
  'id': instance.id,
  'fullName': instance.fullName,
  'username': instance.username,
  'email': instance.email,
  'phone': instance.phone,
  'avatarUrl': instance.avatarUrl,
  'employeeId': instance.employeeId,
  'role': instance.role,
  'status': instance.status,
  'stateId': instance.stateId,
  'localityId': instance.localityId,
  'hubId': instance.hubId,
  'location': instance.location,
  'locationSharing': instance.locationSharing,
  'availability': instance.availability,
  'createdAt': instance.createdAt,
  'updatedAt': instance.updatedAt,
  'lastActive': instance.lastActive,
  'fcmTokens': instance.fcmTokens,
  'classificationLevel': instance.classificationLevel,
  'roleScope': instance.roleScope,
  'hasRetainer': instance.hasRetainer,
  'retainerAmountCents': instance.retainerAmountCents,
  'retainerCurrency': instance.retainerCurrency,
};

UserRole _$UserRoleFromJson(Map<String, dynamic> json) => UserRole(
  id: json['id'] as String,
  userId: json['userId'] as String,
  role: json['role'] as String,
  assignedAt: json['assignedAt'] as String?,
  assignedBy: json['assignedBy'] as String?,
);

Map<String, dynamic> _$UserRoleToJson(UserRole instance) => <String, dynamic>{
  'id': instance.id,
  'userId': instance.userId,
  'role': instance.role,
  'assignedAt': instance.assignedAt,
  'assignedBy': instance.assignedBy,
};

Wallet _$WalletFromJson(Map<String, dynamic> json) => Wallet(
  id: json['id'] as String,
  userId: json['userId'] as String,
  currency: json['currency'] as String? ?? 'SDG',
  balanceCents: (json['balanceCents'] as num?)?.toInt() ?? 0,
  totalEarnedCents: (json['totalEarnedCents'] as num?)?.toInt() ?? 0,
  totalPaidOutCents: (json['totalPaidOutCents'] as num?)?.toInt() ?? 0,
  pendingPayoutCents: (json['pendingPayoutCents'] as num?)?.toInt() ?? 0,
  balances: json['balances'] as Map<String, dynamic>?,
  totalEarned: (json['totalEarned'] as num?)?.toDouble(),
  totalWithdrawn: (json['totalWithdrawn'] as num?)?.toDouble(),
  createdAt: json['createdAt'] as String?,
  updatedAt: json['updatedAt'] as String?,
);

Map<String, dynamic> _$WalletToJson(Wallet instance) => <String, dynamic>{
  'id': instance.id,
  'userId': instance.userId,
  'currency': instance.currency,
  'balanceCents': instance.balanceCents,
  'totalEarnedCents': instance.totalEarnedCents,
  'totalPaidOutCents': instance.totalPaidOutCents,
  'pendingPayoutCents': instance.pendingPayoutCents,
  'balances': instance.balances,
  'totalEarned': instance.totalEarned,
  'totalWithdrawn': instance.totalWithdrawn,
  'createdAt': instance.createdAt,
  'updatedAt': instance.updatedAt,
};

WalletTransaction _$WalletTransactionFromJson(Map<String, dynamic> json) =>
    WalletTransaction(
      id: json['id'] as String,
      walletId: json['walletId'] as String?,
      userId: json['userId'] as String,
      amountCents: (json['amountCents'] as num).toInt(),
      currency: json['currency'] as String? ?? 'SDG',
      type: json['type'] as String,
      status: json['status'] as String? ?? 'pending',
      createdAt: json['createdAt'] as String?,
      postedAt: json['postedAt'] as String?,
      memo: json['memo'] as String?,
      relatedSiteVisitId: json['relatedSiteVisitId'] as String?,
      visitCode: json['visitCode'] as String?,
      amount: (json['amount'] as num?)?.toDouble(),
      siteVisitId: json['siteVisitId'] as String?,
      withdrawalRequestId: json['withdrawalRequestId'] as String?,
      description: json['description'] as String?,
      metadata: json['metadata'] as Map<String, dynamic>?,
      balanceBefore: (json['balanceBefore'] as num?)?.toDouble(),
      balanceAfter: (json['balanceAfter'] as num?)?.toDouble(),
      createdBy: json['createdBy'] as String?,
    );

Map<String, dynamic> _$WalletTransactionToJson(WalletTransaction instance) =>
    <String, dynamic>{
      'id': instance.id,
      'walletId': instance.walletId,
      'userId': instance.userId,
      'amountCents': instance.amountCents,
      'currency': instance.currency,
      'type': instance.type,
      'status': instance.status,
      'createdAt': instance.createdAt,
      'postedAt': instance.postedAt,
      'memo': instance.memo,
      'relatedSiteVisitId': instance.relatedSiteVisitId,
      'visitCode': instance.visitCode,
      'amount': instance.amount,
      'siteVisitId': instance.siteVisitId,
      'withdrawalRequestId': instance.withdrawalRequestId,
      'description': instance.description,
      'metadata': instance.metadata,
      'balanceBefore': instance.balanceBefore,
      'balanceAfter': instance.balanceAfter,
      'createdBy': instance.createdBy,
    };

PayoutRequest _$PayoutRequestFromJson(Map<String, dynamic> json) =>
    PayoutRequest(
      id: json['id'] as String,
      userId: json['userId'] as String,
      amountCents: (json['amountCents'] as num).toInt(),
      method: json['method'] as String,
      destination: json['destination'] as Map<String, dynamic>?,
      status: json['status'] as String? ?? 'requested',
      requestedAt: json['requestedAt'] as String?,
      decidedAt: json['decidedAt'] as String?,
      decidedBy: json['decidedBy'] as String?,
      paidAt: json['paidAt'] as String?,
      walletId: json['walletId'] as String?,
      currency: json['currency'] as String? ?? 'SDG',
      requestReason: json['requestReason'] as String?,
      supervisorId: json['supervisorId'] as String?,
      supervisorNotes: json['supervisorNotes'] as String?,
      approvedAt: json['approvedAt'] as String?,
      rejectedAt: json['rejectedAt'] as String?,
      paymentMethod: json['paymentMethod'] as String?,
      paymentDetails: json['paymentDetails'] as Map<String, dynamic>?,
      createdAt: json['createdAt'] as String?,
      updatedAt: json['updatedAt'] as String?,
    );

Map<String, dynamic> _$PayoutRequestToJson(PayoutRequest instance) =>
    <String, dynamic>{
      'id': instance.id,
      'userId': instance.userId,
      'amountCents': instance.amountCents,
      'method': instance.method,
      'destination': instance.destination,
      'status': instance.status,
      'requestedAt': instance.requestedAt,
      'decidedAt': instance.decidedAt,
      'decidedBy': instance.decidedBy,
      'paidAt': instance.paidAt,
      'walletId': instance.walletId,
      'currency': instance.currency,
      'requestReason': instance.requestReason,
      'supervisorId': instance.supervisorId,
      'supervisorNotes': instance.supervisorNotes,
      'approvedAt': instance.approvedAt,
      'rejectedAt': instance.rejectedAt,
      'paymentMethod': instance.paymentMethod,
      'paymentDetails': instance.paymentDetails,
      'createdAt': instance.createdAt,
      'updatedAt': instance.updatedAt,
    };

UserClassificationRecord _$UserClassificationRecordFromJson(
  Map<String, dynamic> json,
) => UserClassificationRecord(
  id: json['id'] as String,
  userId: json['userId'] as String,
  classificationLevel: json['classificationLevel'] as String,
  roleScope: json['roleScope'] as String,
  hasRetainer: json['hasRetainer'] as bool? ?? false,
  retainerAmountCents: (json['retainerAmountCents'] as num?)?.toInt() ?? 0,
  retainerCurrency: json['retainerCurrency'] as String? ?? 'SDG',
  effectiveFrom: json['effectiveFrom'] as String,
  effectiveUntil: json['effectiveUntil'] as String?,
  isActive: json['isActive'] as bool? ?? true,
  createdAt: json['createdAt'] as String?,
  updatedAt: json['updatedAt'] as String?,
);

Map<String, dynamic> _$UserClassificationRecordToJson(
  UserClassificationRecord instance,
) => <String, dynamic>{
  'id': instance.id,
  'userId': instance.userId,
  'classificationLevel': instance.classificationLevel,
  'roleScope': instance.roleScope,
  'hasRetainer': instance.hasRetainer,
  'retainerAmountCents': instance.retainerAmountCents,
  'retainerCurrency': instance.retainerCurrency,
  'effectiveFrom': instance.effectiveFrom,
  'effectiveUntil': instance.effectiveUntil,
  'isActive': instance.isActive,
  'createdAt': instance.createdAt,
  'updatedAt': instance.updatedAt,
};

UserBankAccount _$UserBankAccountFromJson(Map<String, dynamic> json) =>
    UserBankAccount(
      id: json['id'] as String,
      userId: json['userId'] as String,
      accountName: json['accountName'] as String,
      accountNumber: json['accountNumber'] as String,
      branch: json['branch'] as String,
      createdAt: json['createdAt'] as String?,
      updatedAt: json['updatedAt'] as String?,
    );

Map<String, dynamic> _$UserBankAccountToJson(UserBankAccount instance) =>
    <String, dynamic>{
      'id': instance.id,
      'userId': instance.userId,
      'accountName': instance.accountName,
      'accountNumber': instance.accountNumber,
      'branch': instance.branch,
      'createdAt': instance.createdAt,
      'updatedAt': instance.updatedAt,
    };
