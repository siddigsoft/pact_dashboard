import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart';

/// Savings challenges service for gamified savings
class SavingsChallengeService {
  static final SavingsChallengeService _instance =
      SavingsChallengeService._internal();

  factory SavingsChallengeService() {
    return _instance;
  }

  SavingsChallengeService._internal();

  final _supabase = Supabase.instance.client;

  /// Create a new savings challenge
  Future<void> createChallenge({
    required String userId,
    required String challengeName,
    required double targetAmount,
    required int daysToSave,
    String? description,
  }) async {
    try {
      final startDate = DateTime.now();
      final endDate = startDate.add(Duration(days: daysToSave));

      await _supabase.from('savings_challenges').insert({
        'user_id': userId,
        'challenge_name': challengeName,
        'target_amount': targetAmount,
        'current_amount': 0,
        'days_to_save': daysToSave,
        'start_date': startDate.toIso8601String(),
        'end_date': endDate.toIso8601String(),
        'status': 'active',
        'description': description ?? '',
        'created_at': startDate.toIso8601String(),
      });

      debugPrint(
        '[SavingsChallenge] Created challenge: $challengeName for $targetAmount SDG',
      );
    } catch (e) {
      debugPrint('[SavingsChallenge] Error creating challenge: $e');
      rethrow;
    }
  }

  /// Get all active challenges for user
  Future<List<Map<String, dynamic>>> getActiveChallenges(String userId) async {
    try {
      final response = await _supabase
          .from('savings_challenges')
          .select()
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', ascending: false);

      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('[SavingsChallenge] Error fetching challenges: $e');
      return [];
    }
  }

  /// Get all challenges including completed
  Future<List<Map<String, dynamic>>> getAllChallenges(String userId) async {
    try {
      final response = await _supabase
          .from('savings_challenges')
          .select()
          .eq('user_id', userId)
          .order('created_at', ascending: false);

      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('[SavingsChallenge] Error fetching all challenges: $e');
      return [];
    }
  }

  /// Add savings to a challenge
  Future<void> addSavings({
    required String userId,
    required String challengeId,
    required double amount,
  }) async {
    try {
      // Get current challenge
      final challenge = await _supabase
          .from('savings_challenges')
          .select()
          .eq('id', challengeId)
          .single();

      final currentAmount =
          (challenge['current_amount'] as num?)?.toDouble() ?? 0;
      final newAmount = currentAmount + amount;
      final targetAmount =
          (challenge['target_amount'] as num?)?.toDouble() ?? 0;

      // Update challenge
      await _supabase
          .from('savings_challenges')
          .update({
            'current_amount': newAmount,
            'status': newAmount >= targetAmount ? 'completed' : 'active',
          })
          .eq('id', challengeId);

      // Create wallet transaction
      await _supabase.from('wallet_transactions').insert({
        'user_id': userId,
        'type': 'challenge_savings',
        'amount': -amount,
        'description': 'Added to ${challenge['challenge_name']}',
        'balance_after': newAmount,
        'created_at': DateTime.now().toIso8601String(),
        'reference_id': challengeId,
      });

      debugPrint('[SavingsChallenge] Added $amount SDG to challenge');
    } catch (e) {
      debugPrint('[SavingsChallenge] Error adding savings: $e');
      rethrow;
    }
  }

  /// Get challenge progress
  Future<Map<String, dynamic>> getChallengeProgress(String challengeId) async {
    try {
      final challenge = await _supabase
          .from('savings_challenges')
          .select()
          .eq('id', challengeId)
          .single();

      final currentAmount =
          (challenge['current_amount'] as num?)?.toDouble() ?? 0;
      final targetAmount =
          (challenge['target_amount'] as num?)?.toDouble() ?? 0;
      final endDate = DateTime.parse(challenge['end_date'] as String);
      final now = DateTime.now();
      final daysLeft = endDate.difference(now).inDays;

      return {
        'challenge_id': challengeId,
        'challenge_name': challenge['challenge_name'],
        'current_amount': currentAmount,
        'target_amount': targetAmount,
        'progress_percent': targetAmount > 0
            ? (currentAmount / targetAmount * 100).clamp(0, 100)
            : 0,
        'days_left': daysLeft.clamp(0, double.infinity),
        'status': challenge['status'],
        'is_completed': currentAmount >= targetAmount,
      };
    } catch (e) {
      debugPrint('[SavingsChallenge] Error getting progress: $e');
      return {};
    }
  }

  /// Cancel challenge
  Future<void> cancelChallenge(String challengeId) async {
    try {
      await _supabase
          .from('savings_challenges')
          .update({'status': 'cancelled'})
          .eq('id', challengeId);

      debugPrint('[SavingsChallenge] Challenge cancelled');
    } catch (e) {
      debugPrint('[SavingsChallenge] Error cancelling challenge: $e');
      rethrow;
    }
  }

  /// Get total savings across all active challenges
  Future<double> getTotalActiveSavings(String userId) async {
    try {
      final challenges = await getActiveChallenges(userId);
      return challenges.fold<double>(0.0, (sum, c) {
        final amount = (c['current_amount'] as num?)?.toDouble() ?? 0;
        return sum + amount;
      });
    } catch (e) {
      debugPrint('[SavingsChallenge] Error getting total: $e');
      return 0;
    }
  }
}
