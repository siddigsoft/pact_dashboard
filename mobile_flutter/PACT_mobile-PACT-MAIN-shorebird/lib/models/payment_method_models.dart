import 'package:flutter/material.dart';
import 'package:json_annotation/json_annotation.dart';

part 'payment_method_models.g.dart';

/// Enum for payment types
enum PaymentType {
  bank,
  @JsonValue('mobile_money')
  mobileMoney,
  card;

  String get displayName {
    switch (this) {
      case PaymentType.bank:
        return 'Bank Transfer';
      case PaymentType.mobileMoney:
        return 'Mobile Money';
      case PaymentType.card:
        return 'Debit/Credit Card';
    }
  }

  IconData get icon {
    switch (this) {
      case PaymentType.bank:
        return Icons.account_balance;
      case PaymentType.mobileMoney:
        return Icons.phone_android;
      case PaymentType.card:
        return Icons.credit_card;
    }
  }
}

/// Payment method model - matches public.payment_methods table
@JsonSerializable()
class PaymentMethod {
  final String id;
  final String type; // 'bank', 'mobile_money', 'card'
  final String name; // Display name (bank name, provider name, or cardholder name)
  @JsonKey(name: 'is_default')
  final bool isDefault;
  @JsonKey(name: 'user_id')
  final String userId;
  @JsonKey(name: 'created_at')
  final DateTime createdAt;
  @JsonKey(name: 'updated_at')
  final DateTime? updatedAt;

  // Bank-specific fields
  @JsonKey(name: 'bank_name')
  final String? bankName;
  @JsonKey(name: 'account_number')
  final String? accountNumber;

  // Mobile money specific fields
  @JsonKey(name: 'phone_number')
  final String? phoneNumber;

  // Card specific fields
  @JsonKey(name: 'card_number')
  final String? cardNumber;

  PaymentMethod({
    required this.id,
    required this.type,
    required this.name,
    this.isDefault = false,
    required this.userId,
    required this.createdAt,
    this.updatedAt,
    this.bankName,
    this.accountNumber,
    this.phoneNumber,
    this.cardNumber,
  });

  /// Get PaymentType enum from string type
  PaymentType get paymentType {
    switch (type) {
      case 'bank':
        return PaymentType.bank;
      case 'mobile_money':
        return PaymentType.mobileMoney;
      case 'card':
        return PaymentType.card;
      default:
        return PaymentType.bank;
    }
  }

  factory PaymentMethod.fromJson(Map<String, dynamic> json) {
    // Get type first to help generate default name if needed
    final type = json['type']?.toString() ?? 'bank';
    
    // Generate default name based on type if name is null
    String name = json['name']?.toString() ?? '';
    if (name.isEmpty) {
      switch (type) {
        case 'bank':
          name = json['bank_name']?.toString() ?? 'Bank Account';
          break;
        case 'mobile_money':
          name = 'Mobile Money';
          break;
        case 'card':
          name = 'Card';
          break;
        default:
          name = 'Payment Method';
      }
    }
    
    return PaymentMethod(
      id: json['id']?.toString() ?? '',
      type: type,
      name: name,
      isDefault: json['is_default'] == true,
      userId: json['user_id']?.toString() ?? '',
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'].toString()) ?? DateTime.now()
          : DateTime.now(),
      updatedAt: json['updated_at'] != null
          ? DateTime.tryParse(json['updated_at'].toString())
          : null,
      bankName: json['bank_name']?.toString(),
      accountNumber: json['account_number']?.toString(),
      phoneNumber: json['phone_number']?.toString(),
      cardNumber: json['card_number']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'type': type,
        'name': name,
        'is_default': isDefault,
        'user_id': userId,
        'created_at': createdAt.toIso8601String(),
        'updated_at': updatedAt?.toIso8601String(),
        'bank_name': bankName,
        'account_number': accountNumber,
        'phone_number': phoneNumber,
        'card_number': cardNumber,
      };

  /// Get masked details string for display
  String get maskedDetails {
    switch (type) {
      case 'bank':
        if (accountNumber != null && accountNumber!.length >= 4) {
          return 'Account: ***${accountNumber!.substring(accountNumber!.length - 4)}';
        }
        return 'Account: $accountNumber';
      case 'mobile_money':
        if (phoneNumber != null && phoneNumber!.length >= 4) {
          return 'Phone: ***${phoneNumber!.substring(phoneNumber!.length - 4)}';
        }
        return 'Phone: $phoneNumber';
      case 'card':
        if (cardNumber != null && cardNumber!.length >= 4) {
          return 'Card: ****${cardNumber!.substring(cardNumber!.length - 4)}';
        }
        return 'Card: $cardNumber';
      default:
        return '';
    }
  }

  PaymentMethod copyWith({
    String? id,
    String? type,
    String? name,
    bool? isDefault,
    String? userId,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? bankName,
    String? accountNumber,
    String? phoneNumber,
    String? cardNumber,
  }) {
    return PaymentMethod(
      id: id ?? this.id,
      type: type ?? this.type,
      name: name ?? this.name,
      isDefault: isDefault ?? this.isDefault,
      userId: userId ?? this.userId,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      bankName: bankName ?? this.bankName,
      accountNumber: accountNumber ?? this.accountNumber,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      cardNumber: cardNumber ?? this.cardNumber,
    );
  }
}

/// Request model for creating a payment method - matches DB schema
@JsonSerializable()
class CreatePaymentMethodRequest {
  final PaymentType type;
  final String? name; // Display name (optional, will default based on type)
  @JsonKey(name: 'bank_name')
  final String? bankName;
  @JsonKey(name: 'account_number')
  final String? accountNumber;
  @JsonKey(name: 'phone_number')
  final String? phoneNumber;
  @JsonKey(name: 'card_number')
  final String? cardNumber;

  CreatePaymentMethodRequest({
    required this.type,
    this.name,
    this.bankName,
    this.accountNumber,
    this.phoneNumber,
    this.cardNumber,
  });

  factory CreatePaymentMethodRequest.fromJson(Map<String, dynamic> json) =>
      _$CreatePaymentMethodRequestFromJson(json);
  Map<String, dynamic> toJson() => _$CreatePaymentMethodRequestToJson(this);
}

/// Validation result for payment method
class PaymentMethodValidationResult {
  final bool isValid;
  final String? error;
  final List<String> warnings;

  PaymentMethodValidationResult({
    required this.isValid,
    this.error,
    this.warnings = const [],
  });
}

/// Exception for payment method operations
class PaymentMethodException implements Exception {
  final String message;
  final String? code;

  PaymentMethodException(this.message, {this.code});

  @override
  String toString() => 'PaymentMethodException: $message';
}
