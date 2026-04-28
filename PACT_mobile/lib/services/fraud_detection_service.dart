import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'dart:math';

/// Fraud detection and security monitoring
class FraudDetectionService {
  static final FraudDetectionService _instance =
      FraudDetectionService._internal();

  factory FraudDetectionService() {
    return _instance;
  }

  FraudDetectionService._internal();

  final _supabase = Supabase.instance.client;

  /// Detect suspicious transactions
  Future<List<Map<String, dynamic>>> detectSuspiciousActivity(
    String userId,
    List<Map<String, dynamic>> transactions,
  ) async {
    try {
      final suspicious = _analyzeTransactions(transactions);

      // Log suspicious activities
      for (final activity in suspicious) {
        await _logSecurityAlert(userId, activity);
      }

      return suspicious;
    } catch (e) {
      debugPrint('[FraudDetection] Error detecting suspicious activity: $e');
      return [];
    }
  }

  /// Monitor velocity (multiple transactions in short time)
  Future<bool> checkVelocity(
    String userId,
    List<Map<String, dynamic>> transactions,
  ) async {
    try {
      final now = DateTime.now();
      final oneHourAgo = now.subtract(const Duration(hours: 1));

      final recentTx = transactions.where((tx) {
        final date = DateTime.parse(tx['created_at'] as String).toLocal();
        return date.isAfter(oneHourAgo) &&
            tx['type'] != 'earning' &&
            tx['type'] != 'advance';
      }).toList();

      if (recentTx.length > 5) {
        await _logSecurityAlert(userId, {
          'alert_type': 'high_velocity',
          'description': 'Multiple transactions within 1 hour',
          'transaction_count': recentTx.length,
          'risk_level': 'medium',
        });
        return true;
      }

      return false;
    } catch (e) {
      debugPrint('[FraudDetection] Error checking velocity: $e');
      return false;
    }
  }

  /// Check for unusual location access
  Future<bool> checkLocationAnomaly(
    String userId,
    String currentLocation,
    List<String> previousLocations,
  ) async {
    try {
      if (!previousLocations.contains(currentLocation) &&
          previousLocations.isNotEmpty) {
        await _logSecurityAlert(userId, {
          'alert_type': 'location_change',
          'description': 'Access from new location',
          'location': currentLocation,
          'risk_level': 'low',
        });
        return true;
      }

      return false;
    } catch (e) {
      debugPrint('[FraudDetection] Error checking location: $e');
      return false;
    }
  }

  /// Verify transaction legitimacy
  Future<Map<String, dynamic>> verifyTransaction(
    String userId,
    double amount,
    String category,
    List<Map<String, dynamic>> userHistory,
  ) async {
    try {
      final isLegit = _assessLegitimacy(amount, category, userHistory);

      return {
        'is_legitimate': isLegit['legitimate'],
        'risk_score': isLegit['risk'],
        'recommendation': isLegit['action'],
      };
    } catch (e) {
      debugPrint('[FraudDetection] Error verifying transaction: $e');
      return {
        'is_legitimate': true,
        'risk_score': 0,
        'recommendation': 'proceed',
      };
    }
  }

  /// Get security alerts
  Future<List<Map<String, dynamic>>> getSecurityAlerts(String userId) async {
    try {
      final alerts = await _supabase
          .from('security_alerts')
          .select()
          .eq('user_id', userId)
          .order('created_at', ascending: false)
          .limit(20);

      return alerts.cast<Map<String, dynamic>>();
    } catch (e) {
      debugPrint('[FraudDetection] Error getting alerts: $e');
      return [];
    }
  }

  /// Enable 2FA
  Future<bool> enableTwoFactor(String userId) async {
    try {
      await _supabase
          .from('user_security')
          .update({
            'two_factor_enabled': true,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('user_id', userId);

      await _logSecurityAlert(userId, {
        'alert_type': 'security_setting',
        'description': '2FA enabled',
        'risk_level': 'none',
      });

      return true;
    } catch (e) {
      debugPrint('[FraudDetection] Error enabling 2FA: $e');
      return false;
    }
  }

  /// Disable 2FA
  Future<bool> disableTwoFactor(String userId) async {
    try {
      await _supabase
          .from('user_security')
          .update({
            'two_factor_enabled': false,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('user_id', userId);

      await _logSecurityAlert(userId, {
        'alert_type': 'security_warning',
        'description': '2FA disabled',
        'risk_level': 'medium',
      });

      return true;
    } catch (e) {
      debugPrint('[FraudDetection] Error disabling 2FA: $e');
      return false;
    }
  }

  /// Log security alert
  Future<void> _logSecurityAlert(
    String userId,
    Map<String, dynamic> alert,
  ) async {
    try {
      await _supabase
          .from('security_alerts')
          .insert({
            'user_id': userId,
            'alert_type': alert['alert_type'] ?? 'unknown',
            'description': alert['description'] ?? '',
            'risk_level': alert['risk_level'] ?? 'low',
            'details': alert,
            'reviewed': false,
            'created_at': DateTime.now().toIso8601String(),
          })
          .onError((error, stackTrace) {
            debugPrint('[FraudDetection] Error logging alert: $error');
            return null;
          });
    } catch (e) {
      debugPrint('[FraudDetection] Error in _logSecurityAlert: $e');
    }
  }

  /// Analyze transactions for suspicious patterns
  List<Map<String, dynamic>> _analyzeTransactions(
    List<Map<String, dynamic>> transactions,
  ) {
    final suspicious = <Map<String, dynamic>>[];

    if (transactions.isEmpty) return suspicious;

    // Calculate average and std dev
    final amounts = transactions
        .where(
          (tx) =>
              tx['type'] != 'earning' &&
              tx['type'] != 'advance' &&
              tx['type'] != 'down_payment',
        )
        .map((tx) => (tx['amount'] as num?)?.toDouble() ?? 0)
        .toList();

    if (amounts.isEmpty) return suspicious;

    final avg = amounts.reduce((a, b) => a + b) / amounts.length;
    final variance =
        amounts.map((x) => (x - avg) * (x - avg)).reduce((a, b) => a + b) /
        amounts.length;
    final stdDev = variance.squareRoot();

    // Find transactions 3+ std dev from mean
    for (final tx in transactions) {
      final amount = (tx['amount'] as num?)?.toDouble() ?? 0;

      if (amount.abs() > avg + (3 * stdDev)) {
        suspicious.add({
          'transaction_id': tx['id'],
          'amount': amount,
          'category': tx['category'],
          'alert_type': 'unusual_amount',
          'description':
              'Transaction amount significantly higher than normal (${(amount / avg).toStringAsFixed(1)}x average)',
          'risk_level': 'high',
          'action': 'verify',
        });
      }
    }

    // Check for rapid spending patterns
    if (transactions.length > 10) {
      final recent = transactions.take(10).toList();
      final recentTotal = recent.fold<double>(
        0,
        (sum, tx) => sum + ((tx['amount'] as num?)?.toDouble() ?? 0).abs(),
      );

      if (recentTotal > avg * 15) {
        suspicious.add({
          'alert_type': 'rapid_spending',
          'description': 'Abnormally high spending in last 10 transactions',
          'amount': recentTotal,
          'risk_level': 'medium',
          'action': 'review',
        });
      }
    }

    return suspicious;
  }

  /// Assess transaction legitimacy
  Map<String, dynamic> _assessLegitimacy(
    double amount,
    String category,
    List<Map<String, dynamic>> userHistory,
  ) {
    final categoryTotal = <String, double>{};

    for (final tx in userHistory) {
      if (tx['category'] == category) {
        categoryTotal[category] =
            (categoryTotal[category] ?? 0) +
            (tx['amount'] as num).toDouble().abs();
      }
    }

    final avgForCategory = userHistory.isEmpty
        ? 1000.0
        : categoryTotal.isEmpty
        ? amount
        : categoryTotal[category]! / userHistory.length;

    var riskScore = 0.0;
    var action = 'proceed';

    if (amount > avgForCategory * 2) {
      riskScore += 25;
      action = 'verify';
    }
    if (amount > avgForCategory * 5) {
      riskScore = 75;
      action = 'block';
    }

    return {'legitimate': riskScore < 50, 'risk': riskScore, 'action': action};
  }
}

extension on double {
  double squareRoot() => pow(this, 0.5);
}
