/// Currency formatting utilities matching the React TSX implementation
library;

import 'package:intl/intl.dart';
import '../config/wallet_constants.dart';

/// Format a numeric amount as currency with locale-aware formatting
String formatCurrency(
  double amount, [
  String currency = DEFAULT_CURRENCY,
  String locale = DEFAULT_LOCALE,
]) {
  try {
    final formatter = NumberFormat.currency(
      locale: locale,
      symbol: '',
      decimalDigits: 2,
    );

    final formattedNumber = formatter.format(amount);

    // Add currency symbol based on currency code
    final symbol = _getCurrencySymbol(currency);
    return '$symbol$formattedNumber';
  } catch (e) {
    // Fallback to simple formatting if NumberFormat fails
    return '$currency ${amount.toStringAsFixed(2)}';
  }
}

/// Get the currency symbol for a given currency code
String _getCurrencySymbol(String currency) {
  switch (currency.toUpperCase()) {
    case 'USD':
      return '\$';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    case 'JPY':
      return '¥';
    case 'SDG':
      return 'ج.س';
    case 'EGP':
      return 'ج.م';
    case 'AED':
      return 'د.إ';
    default:
      return currency;
  }
}

/// Format a number as decimal with specified decimal places
String formatDecimal(double value, {int decimalPlaces = 2}) {
  return value.toStringAsFixed(decimalPlaces);
}

/// Parse a string to double with error handling
double? parseAmount(String? value) {
  if (value == null || value.isEmpty) return null;
  try {
    return double.parse(value);
  } catch (e) {
    return null;
  }
}

/// Validate if an amount is valid for withdrawal
bool isValidWithdrawalAmount(double amount, double availableBalance) {
  return amount > 0 && amount <= availableBalance;
}

/// Calculate the withdrawal success rate as a percentage
double calculateWithdrawalSuccessRate(
  int approvedWithdrawals,
  int totalWithdrawals,
) {
  if (totalWithdrawals == 0) return 0.0;
  return (approvedWithdrawals / totalWithdrawals) * 100;
}
