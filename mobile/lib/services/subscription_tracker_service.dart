import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart' show debugPrint;

/// Subscription tracking and management
class SubscriptionTrackerService {
  static final SubscriptionTrackerService _instance =
      SubscriptionTrackerService._internal();

  factory SubscriptionTrackerService() {
    return _instance;
  }

  SubscriptionTrackerService._internal();

  final _supabase = Supabase.instance.client;

  /// Add subscription
  Future<bool> addSubscription(
    String userId,
    String serviceName,
    double amount,
    String billingCycle, // 'monthly', 'quarterly', 'yearly'
    DateTime nextBillingDate, {
    String status = 'active',
    String notes = '',
  }) async {
    try {
      await _supabase.from('subscriptions').insert({
        'user_id': userId,
        'service_name': serviceName,
        'amount': amount,
        'billing_cycle': billingCycle,
        'next_billing_date': nextBillingDate.toIso8601String(),
        'status': status,
        'notes': notes,
        'created_at': DateTime.now().toIso8601String(),
      });

      debugPrint('[SubscriptionTracker] Subscription added: $serviceName');
      return true;
    } catch (e) {
      debugPrint('[SubscriptionTracker] Error adding subscription: $e');
      return false;
    }
  }

  /// Get active subscriptions
  Future<List<Map<String, dynamic>>> getActiveSubscriptions(
    String userId,
  ) async {
    try {
      final subscriptions = await _supabase
          .from('subscriptions')
          .select()
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('next_billing_date', ascending: true);

      return subscriptions.cast<Map<String, dynamic>>();
    } catch (e) {
      debugPrint('[SubscriptionTracker] Error getting subscriptions: $e');
      return [];
    }
  }

  /// Get all subscriptions (including inactive)
  Future<List<Map<String, dynamic>>> getAllSubscriptions(String userId) async {
    try {
      final subscriptions = await _supabase
          .from('subscriptions')
          .select()
          .eq('user_id', userId)
          .order('next_billing_date', ascending: true);

      return subscriptions.cast<Map<String, dynamic>>();
    } catch (e) {
      debugPrint('[SubscriptionTracker] Error getting all subscriptions: $e');
      return [];
    }
  }

  /// Get subscriptions due this month
  Future<List<Map<String, dynamic>>> getSubscriptionsDueThisMonth(
    String userId,
  ) async {
    try {
      final subscriptions = await getActiveSubscriptions(userId);
      final now = DateTime.now();
      final monthEnd = DateTime(now.year, now.month + 1, 0);

      final dueSubs = subscriptions.where((sub) {
        final nextDate = DateTime.parse(sub['next_billing_date'] as String);
        return nextDate.isBefore(monthEnd) &&
            nextDate.isAfter(now.subtract(const Duration(days: 1)));
      }).toList();

      return dueSubs;
    } catch (e) {
      debugPrint(
        '[SubscriptionTracker] Error getting subscriptions due this month: $e',
      );
      return [];
    }
  }

  /// Calculate total monthly subscription cost
  Future<double> getTotalMonthlyCost(String userId) async {
    try {
      final subscriptions = await getActiveSubscriptions(userId);

      double total = 0;
      for (final sub in subscriptions) {
        final amount = (sub['amount'] as num?)?.toDouble() ?? 0;
        final cycle = (sub['billing_cycle'] as String?) ?? 'monthly';

        if (cycle == 'monthly') {
          total += amount;
        } else if (cycle == 'quarterly') {
          total += amount / 3;
        } else if (cycle == 'yearly') {
          total += amount / 12;
        }
      }

      return total;
    } catch (e) {
      debugPrint('[SubscriptionTracker] Error calculating total cost: $e');
      return 0;
    }
  }

  /// Get subscriptions by category
  Future<Map<String, double>> getSubscriptionsByCategory(String userId) async {
    try {
      final subscriptions = await getActiveSubscriptions(userId);
      final byCategory = <String, double>{};

      for (final sub in subscriptions) {
        final serviceName = (sub['service_name'] as String?) ?? 'Other';
        final amount = (sub['amount'] as num?)?.toDouble() ?? 0;
        byCategory[serviceName] = (byCategory[serviceName] ?? 0) + amount;
      }

      return byCategory;
    } catch (e) {
      debugPrint('[SubscriptionTracker] Error getting by category: $e');
      return {};
    }
  }

  /// Record subscription payment
  Future<bool> recordPayment(
    String userId,
    String subscriptionId,
    double amount,
  ) async {
    try {
      final subscription = await _supabase
          .from('subscriptions')
          .select()
          .eq('id', subscriptionId)
          .single();

      // Record payment
      await _supabase.from('subscription_payments').insert({
        'subscription_id': subscriptionId,
        'user_id': userId,
        'amount_paid': amount,
        'payment_date': DateTime.now().toIso8601String(),
      });

      // Create transaction
      await _supabase.from('wallet_transactions').insert({
        'user_id': userId,
        'amount': -amount,
        'type': 'subscription_payment',
        'category': 'subscriptions',
        'description':
            'Subscription payment for ${subscription['service_name']}',
        'created_at': DateTime.now().toIso8601String(),
      });

      // Calculate next billing date
      final cycle = (subscription['billing_cycle'] as String?) ?? 'monthly';
      final nextDate = DateTime.now().add(
        (cycle == 'monthly')
            ? const Duration(days: 30)
            : (cycle == 'quarterly'
                  ? const Duration(days: 90)
                  : const Duration(days: 365)),
      );

      // Update next billing date
      await _supabase
          .from('subscriptions')
          .update({
            'next_billing_date': nextDate.toIso8601String(),
            'last_paid_date': DateTime.now().toIso8601String(),
          })
          .eq('id', subscriptionId);

      debugPrint('[SubscriptionTracker] Payment recorded');
      return true;
    } catch (e) {
      debugPrint('[SubscriptionTracker] Error recording payment: $e');
      return false;
    }
  }

  /// Cancel subscription
  Future<bool> cancelSubscription(String subscriptionId) async {
    try {
      await _supabase
          .from('subscriptions')
          .update({
            'status': 'cancelled',
            'cancelled_at': DateTime.now().toIso8601String(),
          })
          .eq('id', subscriptionId);

      debugPrint('[SubscriptionTracker] Subscription cancelled');
      return true;
    } catch (e) {
      debugPrint('[SubscriptionTracker] Error cancelling subscription: $e');
      return false;
    }
  }

  /// Pause subscription
  Future<bool> pauseSubscription(String subscriptionId) async {
    try {
      await _supabase
          .from('subscriptions')
          .update({
            'status': 'paused',
            'paused_at': DateTime.now().toIso8601String(),
          })
          .eq('id', subscriptionId);

      return true;
    } catch (e) {
      debugPrint('[SubscriptionTracker] Error pausing subscription: $e');
      return false;
    }
  }

  /// Resume subscription
  Future<bool> resumeSubscription(String subscriptionId) async {
    try {
      await _supabase
          .from('subscriptions')
          .update({
            'status': 'active',
            'resumed_at': DateTime.now().toIso8601String(),
          })
          .eq('id', subscriptionId);

      return true;
    } catch (e) {
      debugPrint('[SubscriptionTracker] Error resuming subscription: $e');
      return false;
    }
  }

  /// Get subscription savings opportunities
  List<Map<String, dynamic>> getSavingsOpportunities(
    List<Map<String, dynamic>> subscriptions, {
    bool isArabic = false,
  }) {
    final opportunities = <Map<String, dynamic>>[];

    if (subscriptions.length > 5) {
      opportunities.add({
        'title': isArabic ? '💰 قلل الاشتراكات' : '💰 Reduce Subscriptions',
        'description': isArabic
            ? 'لديك عدد كبير من الاشتراكات. قد تتمكن من إلغاء بعضها'
            : 'You have many subscriptions. Consider cancelling unused ones.',
        'potential_savings': 0.0,
        'priority': 'medium',
      });
    }

    for (final sub in subscriptions) {
      final cycle = (sub['billing_cycle'] as String?) ?? 'monthly';
      final amount = (sub['amount'] as num?)?.toDouble() ?? 0;

      if (cycle == 'monthly' && amount > 500) {
        opportunities.add({
          'title': isArabic ? '📉 خطط سنوية أرخص' : '📉 Yearly Plans',
          'description': isArabic
              ? 'الخطط السنوية تحفظ ما يصل إلى 20%'
              : 'Annual plans often offer 20% discount',
          'potential_savings': amount * 12 * 0.2,
          'priority': 'high',
        });
        break;
      }
    }

    return opportunities;
  }
}
