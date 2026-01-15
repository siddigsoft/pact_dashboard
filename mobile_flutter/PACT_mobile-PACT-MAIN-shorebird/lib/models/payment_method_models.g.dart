// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payment_method_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PaymentMethod _$PaymentMethodFromJson(Map<String, dynamic> json) =>
    PaymentMethod(
      id: json['id'] as String,
      type: json['type'] as String,
      name: json['name'] as String,
      isDefault: json['is_default'] as bool? ?? false,
      userId: json['user_id'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: json['updated_at'] == null
          ? null
          : DateTime.parse(json['updated_at'] as String),
      bankName: json['bank_name'] as String?,
      accountNumber: json['account_number'] as String?,
      phoneNumber: json['phone_number'] as String?,
      cardNumber: json['card_number'] as String?,
    );

Map<String, dynamic> _$PaymentMethodToJson(PaymentMethod instance) =>
    <String, dynamic>{
      'id': instance.id,
      'type': instance.type,
      'name': instance.name,
      'is_default': instance.isDefault,
      'user_id': instance.userId,
      'created_at': instance.createdAt.toIso8601String(),
      'updated_at': instance.updatedAt?.toIso8601String(),
      'bank_name': instance.bankName,
      'account_number': instance.accountNumber,
      'phone_number': instance.phoneNumber,
      'card_number': instance.cardNumber,
    };

CreatePaymentMethodRequest _$CreatePaymentMethodRequestFromJson(
  Map<String, dynamic> json,
) => CreatePaymentMethodRequest(
  type: $enumDecode(_$PaymentTypeEnumMap, json['type']),
  name: json['name'] as String?,
  bankName: json['bank_name'] as String?,
  accountNumber: json['account_number'] as String?,
  phoneNumber: json['phone_number'] as String?,
  cardNumber: json['card_number'] as String?,
);

Map<String, dynamic> _$CreatePaymentMethodRequestToJson(
  CreatePaymentMethodRequest instance,
) => <String, dynamic>{
  'type': _$PaymentTypeEnumMap[instance.type]!,
  'name': instance.name,
  'bank_name': instance.bankName,
  'account_number': instance.accountNumber,
  'phone_number': instance.phoneNumber,
  'card_number': instance.cardNumber,
};

const _$PaymentTypeEnumMap = {
  PaymentType.bank: 'bank',
  PaymentType.mobileMoney: 'mobile_money',
  PaymentType.card: 'card',
};
