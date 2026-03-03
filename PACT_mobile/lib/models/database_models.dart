/// Profile record in the profiles table
/// Linked to auth.users via FK
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

  factory Profile.fromJson(Map<String, dynamic> json) => Profile(
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

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'fullName': fullName,
        'username': username,
        'email': email,
        'phone': phone,
        'avatarUrl': avatarUrl,
        'employeeId': employeeId,
        'role': role,
        'status': status,
        'stateId': stateId,
        'localityId': localityId,
        'hubId': hubId,
        'location': location,
        'locationSharing': locationSharing,
        'availability': availability,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
        'lastActive': lastActive,
        'fcmTokens': fcmTokens,
        'classificationLevel': classificationLevel,
        'roleScope': roleScope,
        'hasRetainer': hasRetainer,
        'retainerAmountCents': retainerAmountCents,
        'retainerCurrency': retainerCurrency,
      };

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

  factory UserRole.fromJson(Map<String, dynamic> json) => UserRole(
        id: json['id'] as String,
        userId: json['userId'] as String,
        role: json['role'] as String,
        assignedAt: json['assignedAt'] as String?,
        assignedBy: json['assignedBy'] as String?,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'userId': userId,
        'role': role,
        'assignedAt': assignedAt,
        'assignedBy': assignedBy,
      };
}

/// Wallet - financial account per user
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

  factory Wallet.fromJson(Map<String, dynamic> json) => Wallet(
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

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'userId': userId,
        'currency': currency,
        'balanceCents': balanceCents,
        'totalEarnedCents': totalEarnedCents,
        'totalPaidOutCents': totalPaidOutCents,
        'pendingPayoutCents': pendingPayoutCents,
        'balances': balances,
        'totalEarned': totalEarned,
        'totalWithdrawn': totalWithdrawn,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };

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
  siteVisitFee,
  withdrawal,
  adjustment,
  bonus,
  penalty,
  earning,
}

enum WalletTransactionStatus {
  pending,
  posted,
  reversed,
  failed,
}

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

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'walletId': walletId,
        'userId': userId,
        'amountCents': amountCents,
        'currency': currency,
        'type': type,
        'status': status,
        'createdAt': createdAt,
        'postedAt': postedAt,
        'memo': memo,
        'relatedSiteVisitId': relatedSiteVisitId,
        'visitCode': visitCode,
        'amount': amount,
        'siteVisitId': siteVisitId,
        'withdrawalRequestId': withdrawalRequestId,
        'description': description,
        'metadata': metadata,
        'balanceBefore': balanceBefore,
        'balanceAfter': balanceAfter,
        'createdBy': createdBy,
      };

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
  bank,
  mobileMoney,
  manual,
}

enum PayoutStatus {
  requested,
  approved,
  declined,
  paid,
  cancelled,
}

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

  factory PayoutRequest.fromJson(Map<String, dynamic> json) => PayoutRequest(
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

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'userId': userId,
        'amountCents': amountCents,
        'method': method,
        'destination': destination,
        'status': status,
        'requestedAt': requestedAt,
        'decidedAt': decidedAt,
        'decidedBy': decidedBy,
        'paidAt': paidAt,
        'walletId': walletId,
        'currency': currency,
        'requestReason': requestReason,
        'supervisorId': supervisorId,
        'supervisorNotes': supervisorNotes,
        'approvedAt': approvedAt,
        'rejectedAt': rejectedAt,
        'paymentMethod': paymentMethod,
        'paymentDetails': paymentDetails,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };

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
      UserClassificationRecord(
        id: json['id'] as String,
        userId: json['userId'] as String,
        classificationLevel: json['classificationLevel'] as String,
        roleScope: json['roleScope'] as String,
        hasRetainer: json['hasRetainer'] as bool? ?? false,
        retainerAmountCents:
            (json['retainerAmountCents'] as num?)?.toInt() ?? 0,
        retainerCurrency: json['retainerCurrency'] as String? ?? 'SDG',
        effectiveFrom: json['effectiveFrom'] as String,
        effectiveUntil: json['effectiveUntil'] as String?,
        isActive: json['isActive'] as bool? ?? true,
        createdAt: json['createdAt'] as String?,
        updatedAt: json['updatedAt'] as String?,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'userId': userId,
        'classificationLevel': classificationLevel,
        'roleScope': roleScope,
        'hasRetainer': hasRetainer,
        'retainerAmountCents': retainerAmountCents,
        'retainerCurrency': retainerCurrency,
        'effectiveFrom': effectiveFrom,
        'effectiveUntil': effectiveUntil,
        'isActive': isActive,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };
}

/// User bank account (stored separately for security)
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
      UserBankAccount(
        id: json['id'] as String,
        userId: json['userId'] as String,
        accountName: json['accountName'] as String,
        accountNumber: json['accountNumber'] as String,
        branch: json['branch'] as String,
        createdAt: json['createdAt'] as String?,
        updatedAt: json['updatedAt'] as String?,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'userId': userId,
        'accountName': accountName,
        'accountNumber': accountNumber,
        'branch': branch,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };
}
