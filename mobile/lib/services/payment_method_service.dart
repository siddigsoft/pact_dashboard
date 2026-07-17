import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/payment_method_models.dart';

class PaymentMethodService {
  final SupabaseClient _supabase;

  PaymentMethodService(this._supabase);

  /// Fetch all payment methods for current user
  Future<List<PaymentMethod>> fetchPaymentMethods() async {
    try {
      final userId = _supabase.auth.currentUser?.id;
      if (userId == null) {
        throw PaymentMethodException('User not authenticated');
      }

      final response = await _supabase
          .from('payment_methods')
          .select(
            'id, user_id, type, name, account_number, bank_name, phone_number, card_number, is_default, created_at, updated_at',
          )
          .eq('user_id', userId)
          .order('is_default', ascending: false)
          .order('created_at', ascending: false);

      final List<PaymentMethod> methods = [];
      for (final json in (response as List)) {
        try {
          methods.add(PaymentMethod.fromJson(Map<String, dynamic>.from(json)));
        } catch (e) {
          // Skip invalid records but log the error
          print('Error parsing payment method: $e, data: $json');
        }
      }
      return methods;
    } catch (e) {
      if (e is PaymentMethodException) rethrow;
      throw PaymentMethodException('Failed to fetch payment methods: $e');
    }
  }

  /// Create a new payment method - matches public.payment_methods table schema
  Future<PaymentMethod> createPaymentMethod(
    CreatePaymentMethodRequest request,
  ) async {
    try {
      final userId = _supabase.auth.currentUser?.id;
      if (userId == null) {
        throw PaymentMethodException('User not authenticated');
      }

      // Validate request
      final validation = validatePaymentMethod(request);
      if (!validation.isValid) {
        throw PaymentMethodException(validation.error ?? 'Validation failed');
      }

      // Prepare data based on payment type - only include columns that exist in table
      // Table columns: id, user_id, type, name, account_number, bank_name, phone_number, card_number, is_default, created_at, updated_at
      final data = <String, dynamic>{
        'user_id': userId,
        'type': _paymentTypeToString(
          request.type,
        ), // 'bank', 'mobile_money', 'card'
        'is_default': false, // Default to false, user can set later
      };

      switch (request.type) {
        case PaymentType.bank:
          data['name'] = request.name ?? request.bankName ?? 'Bank Account';
          data['bank_name'] = request.bankName;
          data['account_number'] = request.accountNumber;
          break;

        case PaymentType.mobileMoney:
          data['name'] = request.name ?? 'Mobile Money';
          data['phone_number'] = request.phoneNumber;
          break;

        case PaymentType.card:
          data['name'] = request.name ?? 'Card';
          data['card_number'] = _maskCardNumber(request.cardNumber!);
          break;
      }

      final response = await _supabase
          .from('payment_methods')
          .insert(data)
          .select()
          .single();

      return PaymentMethod.fromJson(response);
    } catch (e) {
      if (e is PaymentMethodException) rethrow;
      throw PaymentMethodException('Failed to create payment method: $e');
    }
  }

  /// Convert PaymentType enum to database string
  String _paymentTypeToString(PaymentType type) {
    switch (type) {
      case PaymentType.bank:
        return 'bank';
      case PaymentType.mobileMoney:
        return 'mobile_money';
      case PaymentType.card:
        return 'card';
    }
  }

  /// Delete a payment method
  Future<void> deletePaymentMethod(String id) async {
    try {
      final userId = _supabase.auth.currentUser?.id;
      if (userId == null) {
        throw PaymentMethodException('User not authenticated');
      }

      await _supabase
          .from('payment_methods')
          .delete()
          .eq('id', id)
          .eq('user_id', userId);
    } catch (e) {
      throw PaymentMethodException('Failed to delete payment method: $e');
    }
  }

  /// Set a payment method as default
  Future<void> setDefaultPaymentMethod(String id) async {
    try {
      final userId = _supabase.auth.currentUser?.id;
      if (userId == null) {
        throw PaymentMethodException('User not authenticated');
      }

      // The database trigger will handle unsetting other defaults
      await _supabase
          .from('payment_methods')
          .update({
            'is_default': true,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', id)
          .eq('user_id', userId);
    } catch (e) {
      throw PaymentMethodException('Failed to set default payment method: $e');
    }
  }

  /// Get the default payment method
  Future<PaymentMethod?> getDefaultPaymentMethod() async {
    try {
      final methods = await fetchPaymentMethods();
      return methods.firstWhere(
        (method) => method.isDefault,
        orElse: () => methods.isNotEmpty
            ? methods.first
            : throw PaymentMethodException('No payment methods found'),
      );
    } catch (e) {
      return null;
    }
  }

  /// Validate payment method request
  PaymentMethodValidationResult validatePaymentMethod(
    CreatePaymentMethodRequest request,
  ) {
    switch (request.type) {
      case PaymentType.bank:
        if (request.bankName == null || request.bankName!.isEmpty) {
          return PaymentMethodValidationResult(
            isValid: false,
            error: 'Bank name is required',
          );
        }
        if (request.accountNumber == null || request.accountNumber!.isEmpty) {
          return PaymentMethodValidationResult(
            isValid: false,
            error: 'Account number is required',
          );
        }
        if (request.accountNumber!.length < 8) {
          return PaymentMethodValidationResult(
            isValid: false,
            error: 'Account number must be at least 8 digits',
          );
        }
        break;

      case PaymentType.mobileMoney:
        if (request.phoneNumber == null || request.phoneNumber!.isEmpty) {
          return PaymentMethodValidationResult(
            isValid: false,
            error: 'Phone number is required',
          );
        }
        if (!_isValidPhoneNumber(request.phoneNumber!)) {
          return PaymentMethodValidationResult(
            isValid: false,
            error: 'Invalid phone number format',
          );
        }
        break;

      case PaymentType.card:
        if (request.cardNumber == null || request.cardNumber!.isEmpty) {
          return PaymentMethodValidationResult(
            isValid: false,
            error: 'Card number is required',
          );
        }
        final cleanCardNumber = request.cardNumber!.replaceAll(
          RegExp(r'\s+'),
          '',
        );
        if (cleanCardNumber.length != 16) {
          return PaymentMethodValidationResult(
            isValid: false,
            error: 'Card number must be 16 digits',
          );
        }
        if (!_isValidLuhn(cleanCardNumber)) {
          return PaymentMethodValidationResult(
            isValid: false,
            error: 'Invalid card number',
          );
        }
        break;
    }

    return PaymentMethodValidationResult(isValid: true);
  }

  /// Mask card number for storage (keep only last 4 digits)
  String _maskCardNumber(String cardNumber) {
    final clean = cardNumber.replaceAll(RegExp(r'\s+'), '');
    return '************${clean.substring(clean.length - 4)}';
  }

  /// Validate phone number format
  bool _isValidPhoneNumber(String phone) {
    // Basic validation - adjust regex for your region
    final phoneRegex = RegExp(r'^\+?[\d\s-]{10,}$');
    return phoneRegex.hasMatch(phone);
  }

  /// Luhn algorithm for card number validation
  bool _isValidLuhn(String cardNumber) {
    int sum = 0;
    bool alternate = false;

    for (int i = cardNumber.length - 1; i >= 0; i--) {
      int digit = int.parse(cardNumber[i]);

      if (alternate) {
        digit *= 2;
        if (digit > 9) {
          digit = (digit % 10) + 1;
        }
      }

      sum += digit;
      alternate = !alternate;
    }

    return (sum % 10) == 0;
  }

  /// Format card number for display (XXXX XXXX XXXX XXXX)
  String formatCardNumber(String cardNumber) {
    final clean = cardNumber.replaceAll(RegExp(r'\s+'), '');
    final buffer = StringBuffer();

    for (int i = 0; i < clean.length; i++) {
      if (i > 0 && i % 4 == 0) {
        buffer.write(' ');
      }
      buffer.write(clean[i]);
    }

    return buffer.toString();
  }

  /// Format phone number for display
  String formatPhoneNumber(String phone) {
    // Basic formatting - adjust for your region
    final clean = phone.replaceAll(RegExp(r'[^\d+]'), '');
    if (clean.startsWith('+249')) {
      // Sudan format: +249 XXX XXX XXX
      return '+249 ${clean.substring(4, 7)} ${clean.substring(7, 10)} ${clean.substring(10)}';
    }
    return clean;
  }
}
