// Helper function
double _parseDouble(dynamic value) {
  if (value == null) return 0.0;
  if (value is double) return value;
  if (value is int) return value.toDouble();
  if (value is String) return double.tryParse(value) ?? 0.0;
  return 0.0;
}

// Custom Exceptions for wallet operations
class WalletException implements Exception {
  final String message;
  WalletException(this.message);
  
  @override
  String toString() => 'WalletException: $message';
}

class WithdrawalException implements Exception {
  final String message;
  WithdrawalException(this.message);
  
  @override
  String toString() => 'WithdrawalException: $message';
}

class InsufficientBalanceException implements Exception {
  final String message;
  InsufficientBalanceException(this.message);
  
  @override
  String toString() => 'InsufficientBalanceException: $message';
}
