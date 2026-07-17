import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart' show debugPrint;

/// Investment portfolio tracking and analysis
class InvestmentPortfolioService {
  static final InvestmentPortfolioService _instance =
      InvestmentPortfolioService._internal();

  factory InvestmentPortfolioService() {
    return _instance;
  }

  InvestmentPortfolioService._internal();

  final _supabase = Supabase.instance.client;

  /// Add investment to portfolio
  Future<bool> addInvestment(
    String userId,
    String assetName,
    double amount,
    String assetType,
    double currentPrice, {
    String notes = '',
  }) async {
    try {
      await _supabase.from('investments').insert({
        'user_id': userId,
        'asset_name': assetName,
        'amount': amount,
        'asset_type': assetType,
        'purchase_price': currentPrice,
        'current_price': currentPrice,
        'notes': notes,
        'status': 'active',
        'created_at': DateTime.now().toIso8601String(),
      });

      debugPrint('[InvestmentPortfolio] Investment added: $assetName');
      return true;
    } catch (e) {
      debugPrint('[InvestmentPortfolio] Error adding investment: $e');
      return false;
    }
  }

  /// Get user's portfolio
  Future<List<Map<String, dynamic>>> getPortfolio(String userId) async {
    try {
      final investments = await _supabase
          .from('investments')
          .select()
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', ascending: false);

      return investments.cast<Map<String, dynamic>>();
    } catch (e) {
      debugPrint('[InvestmentPortfolio] Error getting portfolio: $e');
      return [];
    }
  }

  /// Calculate portfolio performance
  Future<Map<String, dynamic>> getPortfolioPerformance(String userId) async {
    try {
      final investments = await getPortfolio(userId);

      if (investments.isEmpty) {
        return {
          'total_invested': 0,
          'current_value': 0,
          'total_gain': 0,
          'gain_percentage': 0,
          'investments_count': 0,
        };
      }

      double totalInvested = 0;
      double currentValue = 0;

      for (final investment in investments) {
        final amount = (investment['amount'] as num?)?.toDouble() ?? 0;
        final purchasePrice =
            (investment['purchase_price'] as num?)?.toDouble() ?? 0;
        final currentPrice =
            (investment['current_price'] as num?)?.toDouble() ?? purchasePrice;
        final quantity = amount / purchasePrice;

        totalInvested += amount;
        currentValue += quantity * currentPrice;
      }

      final totalGain = currentValue - totalInvested;
      final gainPercentage = totalInvested > 0
          ? (totalGain / totalInvested) * 100
          : 0;

      return {
        'total_invested': totalInvested,
        'current_value': currentValue,
        'total_gain': totalGain,
        'gain_percentage': gainPercentage,
        'investments_count': investments.length,
      };
    } catch (e) {
      debugPrint('[InvestmentPortfolio] Error calculating performance: $e');
      return {
        'total_invested': 0,
        'current_value': 0,
        'total_gain': 0,
        'gain_percentage': 0,
        'investments_count': 0,
      };
    }
  }

  /// Get portfolio by asset type
  Future<Map<String, double>> getPortfolioByType(String userId) async {
    try {
      final investments = await getPortfolio(userId);
      final byType = <String, double>{};

      for (final investment in investments) {
        final type = (investment['asset_type'] as String?) ?? 'Other';
        final amount = (investment['amount'] as num?)?.toDouble() ?? 0;
        byType[type] = (byType[type] ?? 0) + amount;
      }

      return byType;
    } catch (e) {
      debugPrint('[InvestmentPortfolio] Error getting portfolio by type: $e');
      return {};
    }
  }

  /// Track dividend income
  Future<bool> recordDividend(
    String userId,
    String investmentId,
    double amount, {
    String notes = '',
  }) async {
    try {
      await _supabase.from('dividends').insert({
        'user_id': userId,
        'investment_id': investmentId,
        'amount': amount,
        'notes': notes,
        'received_at': DateTime.now().toIso8601String(),
      });

      // Create transaction record
      await _supabase.from('wallet_transactions').insert({
        'user_id': userId,
        'amount': amount,
        'type': 'dividend_income',
        'category': 'investments',
        'description': 'Dividend received from investment #$investmentId',
        'created_at': DateTime.now().toIso8601String(),
      });

      debugPrint('[InvestmentPortfolio] Dividend recorded: $amount');
      return true;
    } catch (e) {
      debugPrint('[InvestmentPortfolio] Error recording dividend: $e');
      return false;
    }
  }

  /// Get investment recommendations
  List<Map<String, dynamic>> getRecommendations(
    double walletBalance, {
    bool isArabic = false,
  }) {
    final recommendations = <Map<String, dynamic>>[];

    if (walletBalance > 50000) {
      recommendations.add({
        'title': isArabic ? '📈 استثمر الفائض' : '📈 Invest Surplus',
        'description': isArabic
            ? 'لديك رصيد زائد يمكن استثماره'
            : 'Consider investing your surplus balance',
        'priority': 'medium',
        'action': 'start_investing',
      });
    }

    if (walletBalance > 100000) {
      recommendations.add({
        'title': isArabic ? '💼 تنويع المحفظة' : '💼 Diversify Portfolio',
        'description': isArabic
            ? 'وزع الاستثمارات على أصول مختلفة'
            : 'Spread investments across different asset types',
        'priority': 'high',
        'action': 'diversify',
      });
    }

    return recommendations;
  }

  /// Update investment price
  Future<bool> updateInvestmentPrice(
    String investmentId,
    double newPrice,
  ) async {
    try {
      await _supabase
          .from('investments')
          .update({
            'current_price': newPrice,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', investmentId);

      return true;
    } catch (e) {
      debugPrint('[InvestmentPortfolio] Error updating price: $e');
      return false;
    }
  }

  /// Sell investment
  Future<bool> sellInvestment(
    String userId,
    String investmentId,
    double sellingPrice, {
    String notes = '',
  }) async {
    try {
      // Get investment details
      final investment = await _supabase
          .from('investments')
          .select()
          .eq('id', investmentId)
          .single();

      final amount = (investment['amount'] as num?)?.toDouble() ?? 0;
      final purchasePrice =
          (investment['purchase_price'] as num?)?.toDouble() ?? 0;
      final quantity = amount / purchasePrice;
      final saleProceeds = quantity * sellingPrice;
      final gain = saleProceeds - amount;

      // Update investment status
      await _supabase
          .from('investments')
          .update({
            'status': 'sold',
            'selling_price': sellingPrice,
            'sold_at': DateTime.now().toIso8601String(),
          })
          .eq('id', investmentId);

      // Create transaction record
      await _supabase.from('wallet_transactions').insert({
        'user_id': userId,
        'amount': saleProceeds,
        'type': 'investment_sale',
        'category': 'investments',
        'description':
            'Sold investment with ${gain >= 0 ? 'gain' : 'loss'}: '
            '${gain.toStringAsFixed(2)} SDG',
        'created_at': DateTime.now().toIso8601String(),
      });

      debugPrint('[InvestmentPortfolio] Investment sold: $investmentId');
      return true;
    } catch (e) {
      debugPrint('[InvestmentPortfolio] Error selling investment: $e');
      return false;
    }
  }
}
