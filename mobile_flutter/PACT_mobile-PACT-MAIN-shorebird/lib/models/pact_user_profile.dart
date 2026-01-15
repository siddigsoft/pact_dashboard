// Comprehensive user profile models matching the PACT database schema
// This file contains all profile-related models for the mobile app

import 'dart:convert';

/// User availability status
enum UserAvailability {
  online,
  offline,
  busy;

  String get displayName {
    switch (this) {
      case UserAvailability.online:
        return 'Online';
      case UserAvailability.offline:
        return 'Offline';
      case UserAvailability.busy:
        return 'Busy';
    }
  }

  String get colorHex {
    switch (this) {
      case UserAvailability.online:
        return '#10B981'; // Green
      case UserAvailability.offline:
        return '#6B7280'; // Gray
      case UserAvailability.busy:
        return '#F59E0B'; // Orange
    }
  }

  static UserAvailability fromString(String? value) {
    switch (value?.toLowerCase()) {
      case 'online':
        return UserAvailability.online;
      case 'busy':
        return UserAvailability.busy;
      default:
        return UserAvailability.offline;
    }
  }
}

/// User classification/tier information
class UserClassification {
  final String level; // e.g., 'bronze', 'silver', 'gold'
  final String roleScope;
  final bool hasRetainer;
  final int retainerAmountCents;
  final String retainerCurrency;
  final DateTime effectiveFrom;
  final DateTime? effectiveUntil;

  UserClassification({
    required this.level,
    required this.roleScope,
    this.hasRetainer = false,
    this.retainerAmountCents = 0,
    this.retainerCurrency = 'SDG',
    required this.effectiveFrom,
    this.effectiveUntil,
  });

  factory UserClassification.fromJson(Map<String, dynamic> json) {
    return UserClassification(
      level: json['classification_level'] ?? json['level'] ?? 'bronze',
      roleScope: json['role_scope'] ?? '',
      hasRetainer: json['has_retainer'] ?? false,
      retainerAmountCents: json['retainer_amount_cents'] ?? 0,
      retainerCurrency: json['retainer_currency'] ?? 'SDG',
      effectiveFrom: DateTime.parse(json['effective_from'] ?? DateTime.now().toIso8601String()),
      effectiveUntil: json['effective_until'] != null 
          ? DateTime.parse(json['effective_until']) 
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'classification_level': level,
    'role_scope': roleScope,
    'has_retainer': hasRetainer,
    'retainer_amount_cents': retainerAmountCents,
    'retainer_currency': retainerCurrency,
    'effective_from': effectiveFrom.toIso8601String(),
    'effective_until': effectiveUntil?.toIso8601String(),
  };

  double get retainerAmount => retainerAmountCents / 100.0;
}

/// User location with sharing status
class UserLocation {
  final double latitude;
  final double longitude;
  final double? accuracy;
  final DateTime lastUpdated;
  final bool isSharing;

  UserLocation({
    required this.latitude,
    required this.longitude,
    this.accuracy,
    required this.lastUpdated,
    this.isSharing = false,
  });

  factory UserLocation.fromJson(Map<String, dynamic> json) {
    return UserLocation(
      latitude: (json['latitude'] ?? 0.0).toDouble(),
      longitude: (json['longitude'] ?? 0.0).toDouble(),
      accuracy: json['accuracy']?.toDouble(),
      lastUpdated: DateTime.parse(json['last_updated'] ?? json['lastUpdated'] ?? DateTime.now().toIso8601String()),
      isSharing: json['is_sharing'] ?? json['isSharing'] ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
    'latitude': latitude,
    'longitude': longitude,
    'accuracy': accuracy,
    'last_updated': lastUpdated.toIso8601String(),
    'is_sharing': isSharing,
  };
}

/// User performance metrics
class UserPerformance {
  final double rating;
  final int totalCompletedTasks;
  final double onTimeCompletion; // Percentage

  UserPerformance({
    this.rating = 0.0,
    this.totalCompletedTasks = 0,
    this.onTimeCompletion = 0.0,
  });

  factory UserPerformance.fromJson(Map<String, dynamic> json) {
    return UserPerformance(
      rating: (json['rating'] ?? 0.0).toDouble(),
      totalCompletedTasks: json['total_completed_tasks'] ?? json['totalCompletedTasks'] ?? 0,
      onTimeCompletion: (json['on_time_completion'] ?? json['onTimeCompletion'] ?? 0.0).toDouble(),
    );
  }

  Map<String, dynamic> toJson() => {
    'rating': rating,
    'total_completed_tasks': totalCompletedTasks,
    'on_time_completion': onTimeCompletion,
  };
}

/// Bank account information
class BankAccount {
  final String? accountNumber;
  final String? accountName;
  final String? bankName;
  final String? branchCode;

  BankAccount({
    this.accountNumber,
    this.accountName,
    this.bankName,
    this.branchCode,
  });

  factory BankAccount.fromJson(Map<String, dynamic> json) {
    return BankAccount(
      accountNumber: json['account_number'] ?? json['accountNumber'],
      accountName: json['account_name'] ?? json['accountName'],
      bankName: json['bank_name'] ?? json['bankName'],
      branchCode: json['branch_code'] ?? json['branchCode'],
    );
  }

  Map<String, dynamic> toJson() => {
    'account_number': accountNumber,
    'account_name': accountName,
    'bank_name': bankName,
    'branch_code': branchCode,
  };
}

/// Complete user profile model matching the database schema
class PACTUserProfile {
  final String id;
  
  // Basic info
  final String? fullName;
  final String? username;
  final String email;
  final String? phone;
  
  // Role and status
  final String role; // app_role enum from database
  final String status; // pending, approved, rejected
  final UserAvailability availability;
  
  // Avatar
  final String? avatarUrl;
  
  // Organizational assignment
  final String? hubId;
  final String? stateId;
  final String? localityId;
  
  // Employment info
  final String? employeeId;
  final BankAccount? bankAccount;
  
  // Location
  final UserLocation? location;
  final bool locationSharing;
  
  // Timestamps
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? lastActive;
  
  // Additional data (not in profiles table, joined from other tables)
  final UserPerformance? performance;
  final UserClassification? classification;

  PACTUserProfile({
    required this.id,
    this.fullName,
    this.username,
    required this.email,
    this.phone,
    this.role = 'dataCollector',
    this.status = 'pending',
    this.availability = UserAvailability.offline,
    this.avatarUrl,
    this.hubId,
    this.stateId,
    this.localityId,
    this.employeeId,
    this.bankAccount,
    this.location,
    this.locationSharing = false,
    required this.createdAt,
    required this.updatedAt,
    this.lastActive,
    this.performance,
    this.classification,
  });

  factory PACTUserProfile.fromJson(Map<String, dynamic> json) {
    // Parse location (can be string JSON or object)
    UserLocation? parsedLocation;
    if (json['location'] != null) {
      try {
        if (json['location'] is String) {
          final locationData = Map<String, dynamic>.from(
            jsonDecode(json['location'])
          );
          parsedLocation = UserLocation.fromJson(locationData);
        } else if (json['location'] is Map) {
          parsedLocation = UserLocation.fromJson(json['location']);
        }
      } catch (e) {
        print('Error parsing location: $e');
      }
    }

    // Parse bank account
    BankAccount? parsedBankAccount;
    if (json['bank_account'] != null) {
      try {
        if (json['bank_account'] is String) {
          final bankData = Map<String, dynamic>.from(
            jsonDecode(json['bank_account'])
          );
          parsedBankAccount = BankAccount.fromJson(bankData);
        } else if (json['bank_account'] is Map) {
          parsedBankAccount = BankAccount.fromJson(json['bank_account']);
        }
      } catch (e) {
        print('Error parsing bank_account: $e');
      }
    }

    return PACTUserProfile(
      id: json['id'] ?? '',
      fullName: json['full_name'] ?? json['fullName'],
      username: json['username'],
      email: json['email'] ?? '',
      phone: json['phone'],
      role: json['role'] ?? 'dataCollector',
      status: json['status'] ?? 'pending',
      availability: UserAvailability.fromString(json['availability']),
      avatarUrl: json['avatar_url'] ?? json['avatarUrl'],
      hubId: json['hub_id'] ?? json['hubId'],
      stateId: json['state_id'] ?? json['stateId'],
      localityId: json['locality_id'] ?? json['localityId'],
      employeeId: json['employee_id'] ?? json['employeeId'],
      bankAccount: parsedBankAccount,
      location: parsedLocation,
      locationSharing: json['location_sharing'] ?? json['locationSharing'] ?? false,
      createdAt: DateTime.parse(json['created_at'] ?? json['createdAt'] ?? DateTime.now().toIso8601String()),
      updatedAt: DateTime.parse(json['updated_at'] ?? json['updatedAt'] ?? DateTime.now().toIso8601String()),
      lastActive: json['last_active'] != null || json['lastActive'] != null
          ? DateTime.parse(json['last_active'] ?? json['lastActive'])
          : null,
      performance: json['performance'] != null 
          ? UserPerformance.fromJson(json['performance'])
          : null,
      classification: json['classification'] != null
          ? UserClassification.fromJson(json['classification'])
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'full_name': fullName,
    'username': username,
    'email': email,
    'phone': phone,
    'role': role,
    'status': status,
    'availability': availability.name,
    'avatar_url': avatarUrl,
    'hub_id': hubId,
    'state_id': stateId,
    'locality_id': localityId,
    'employee_id': employeeId,
    'bank_account': bankAccount?.toJson(),
    'location': location?.toJson(),
    'location_sharing': locationSharing,
    'created_at': createdAt.toIso8601String(),
    'updated_at': updatedAt.toIso8601String(),
    'last_active': lastActive?.toIso8601String(),
  };

  /// Get display name (prioritize fullName, fallback to username or email)
  String get displayName =>
      fullName?.isNotEmpty == true
          ? fullName!
          : username?.isNotEmpty == true
              ? username!
              : email.split('@').first;

  /// Get initials for avatar
  String get initials {
    final name = displayName;
    final parts = name.split(' ');
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return name.substring(0, 1).toUpperCase();
  }

  /// Check if user is approved
  bool get isApproved => status == 'approved';

  /// Check if user has avatar
  bool get hasAvatar => avatarUrl != null && avatarUrl!.isNotEmpty;

  /// Get role display name
  String get roleDisplayName {
    switch (role) {
      case 'admin':
        return 'Administrator';
      case 'dataCollector':
        return 'Data Collector';
      case 'supervisor':
        return 'Supervisor';
      case 'financialAdmin':
        return 'Financial Admin';
      case 'projectManager':
        return 'Project Manager';
      default:
        return role;
    }
  }

  /// Copy with method for updates
  PACTUserProfile copyWith({
    String? id,
    String? fullName,
    String? username,
    String? email,
    String? phone,
    String? role,
    String? status,
    UserAvailability? availability,
    String? avatarUrl,
    String? hubId,
    String? stateId,
    String? localityId,
    String? employeeId,
    BankAccount? bankAccount,
    UserLocation? location,
    bool? locationSharing,
    DateTime? createdAt,
    DateTime? updatedAt,
    DateTime? lastActive,
    UserPerformance? performance,
    UserClassification? classification,
  }) {
    return PACTUserProfile(
      id: id ?? this.id,
      fullName: fullName ?? this.fullName,
      username: username ?? this.username,
      email: email ?? this.email,
      phone: phone ?? this.phone,
      role: role ?? this.role,
      status: status ?? this.status,
      availability: availability ?? this.availability,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      hubId: hubId ?? this.hubId,
      stateId: stateId ?? this.stateId,
      localityId: localityId ?? this.localityId,
      employeeId: employeeId ?? this.employeeId,
      bankAccount: bankAccount ?? this.bankAccount,
      location: location ?? this.location,
      locationSharing: locationSharing ?? this.locationSharing,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      lastActive: lastActive ?? this.lastActive,
      performance: performance ?? this.performance,
      classification: classification ?? this.classification,
    );
  }
}
