import 'package:flutter/foundation.dart';

/// Multi-currency conversion and support service
class CurrencyConversionService {
  static final CurrencyConversionService _instance =
      CurrencyConversionService._internal();

  factory CurrencyConversionService() {
    return _instance;
  }

  CurrencyConversionService._internal();

  // Exchange rates (in real app, fetch from API)
  static const Map<String, double> _exchangeRates = {
    'SDG': 1.0, // Base currency
    'USD': 0.0017, // 1 SDG = 0.0017 USD (example)
    'EUR': 0.0016, // 1 SDG = 0.0016 EUR (example)
    'GBP': 0.0013, // 1 SDG = 0.0013 GBP (example)
    'SAR': 0.0064, // 1 SDG = 0.0064 SAR (example)
    'AED': 0.0062, // 1 SDG = 0.0062 AED (example)
  };

  /// Convert amount from one currency to another
  static double convert({
    required double amount,
    required String fromCurrency,
    required String toCurrency,
  }) {
    if (fromCurrency == toCurrency) return amount;

    final fromRate = _exchangeRates[fromCurrency] ?? 1.0;
    final toRate = _exchangeRates[toCurrency] ?? 1.0;

    // Convert to base (SDG) then to target
    final inSDG = amount / fromRate;
    return inSDG * toRate;
  }

  /// Get all supported currencies
  static List<String> getSupportedCurrencies() {
    return _exchangeRates.keys.toList();
  }

  /// Format currency with symbol
  static String formatCurrency(double amount, String currency) {
    final symbol = _getCurrencySymbol(currency);
    return '$symbol${amount.toStringAsFixed(2)}';
  }

  /// Get currency symbol
  static String _getCurrencySymbol(String currency) {
    switch (currency) {
      case 'USD':
        return '\$';
      case 'EUR':
        return '€';
      case 'GBP':
        return '£';
      case 'SDG':
        return 'ج.س';
      case 'SAR':
        return '﷼';
      case 'AED':
        return 'د.إ';
      default:
        return currency;
    }
  }

  /// Get currency name
  static String getCurrencyName(String code, {bool isArabic = false}) {
    final namesEn = {
      'SDG': 'Sudanese Pound',
      'USD': 'US Dollar',
      'EUR': 'Euro',
      'GBP': 'British Pound',
      'SAR': 'Saudi Riyal',
      'AED': 'UAE Dirham',
    };

    final namesAr = {
      'SDG': 'الجنيه السوداني',
      'USD': 'دولار أمريكي',
      'EUR': 'يورو',
      'GBP': 'جنيه إسترليني',
      'SAR': 'ريال سعودي',
      'AED': 'درهم إماراتي',
    };

    if (isArabic) {
      return namesAr[code] ?? code;
    } else {
      return namesEn[code] ?? code;
    }
  }

  /// Get exchange rate between two currencies
  static double getExchangeRate(String fromCurrency, String toCurrency) {
    if (fromCurrency == toCurrency) return 1.0;

    final fromRate = _exchangeRates[fromCurrency] ?? 1.0;
    final toRate = _exchangeRates[toCurrency] ?? 1.0;

    return toRate / fromRate;
  }

  /// Convert from SDG to other currency
  static double fromSDG(double amountInSDG, String targetCurrency) {
    return convert(
      amount: amountInSDG,
      fromCurrency: 'SDG',
      toCurrency: targetCurrency,
    );
  }

  /// Convert to SDG from other currency
  static double toSDG(double amount, String sourceCurrency) {
    return convert(
      amount: amount,
      fromCurrency: sourceCurrency,
      toCurrency: 'SDG',
    );
  }

  /// Get today's conversion rates summary
  Map<String, double> getTodayRates() {
    return Map.from(_exchangeRates);
  }
}
