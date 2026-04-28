import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Investment portfolio display
class InvestmentPortfolioCard extends StatelessWidget {
  final List<Map<String, dynamic>> investments;
  final Map<String, dynamic> performance;
  final bool isArabic;
  final VoidCallback? onAddInvestment;
  final VoidCallback? onViewDetails;

  const InvestmentPortfolioCard({
    super.key,
    required this.investments,
    required this.performance,
    this.isArabic = false,
    this.onAddInvestment,
    this.onViewDetails,
  });

  Color _getGainLossColor(double gain) {
    if (gain > 0) return Colors.green;
    if (gain < 0) return Colors.red;
    return Colors.grey;
  }

  @override
  Widget build(BuildContext context) {
    final totalInvested =
        (performance['total_invested'] as num?)?.toDouble() ?? 0;
    final currentValue =
        (performance['current_value'] as num?)?.toDouble() ?? 0;
    final totalGain = (performance['total_gain'] as num?)?.toDouble() ?? 0;
    final gainPercentage =
        (performance['gain_percentage'] as num?)?.toDouble() ?? 0;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withOpacity(0.1),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  isArabic ? '📈 محفظة الاستثمارات' : '📈 Investment Portfolio',
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (onAddInvestment != null)
                  IconButton(
                    icon: const Icon(Icons.add_circle_outline),
                    onPressed: onAddInvestment,
                    color: AppColors.primaryBlue,
                  ),
              ],
            ),
          ),
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.grey.shade50,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          isArabic ? 'الاستثمار الحالي' : 'Current Value',
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: AppColors.textLight,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${currentValue.toStringAsFixed(0)} SDG',
                          style: GoogleFonts.poppins(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          isArabic ? 'الربح/الخسارة' : 'Gain/Loss',
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: AppColors.textLight,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${totalGain >= 0 ? '+' : ''}${totalGain.toStringAsFixed(0)} SDG',
                          style: GoogleFonts.poppins(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: _getGainLossColor(totalGain),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: totalInvested > 0
                        ? (currentValue / (totalInvested * 1.2)).clamp(0, 1)
                        : 0,
                    minHeight: 6,
                    backgroundColor: Colors.grey.shade300,
                    valueColor: AlwaysStoppedAnimation<Color>(
                      _getGainLossColor(totalGain),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '${gainPercentage.toStringAsFixed(1)}%',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: _getGainLossColor(totalGain),
                      ),
                    ),
                    Text(
                      isArabic
                          ? 'استثمر: ${totalInvested.toStringAsFixed(0)} SDG'
                          : 'Invested: ${totalInvested.toStringAsFixed(0)} SDG',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: AppColors.textLight,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (investments.isNotEmpty) ...[
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                isArabic ? 'الاستثمارات النشطة' : 'Active Investments',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: 8),
            ...investments.take(3).map((inv) {
              final assetName = (inv['asset_name'] as String?) ?? 'Asset';
              final currentPrice =
                  (inv['current_price'] as num?)?.toDouble() ?? 0;
              final purchasePrice =
                  (inv['purchase_price'] as num?)?.toDouble() ?? 0;
              final change =
                  ((currentPrice - purchasePrice) / purchasePrice * 100).clamp(
                    -100,
                    500,
                  );

              return Container(
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey.shade200),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            assetName,
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Price: ${currentPrice.toStringAsFixed(2)} SDG',
                            style: GoogleFonts.poppins(
                              fontSize: 10,
                              color: AppColors.textLight,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: _getGainLossColor(change).withOpacity(0.1),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        '${change >= 0 ? '+' : ''}${change.toStringAsFixed(1)}%',
                        style: GoogleFonts.poppins(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: _getGainLossColor(change),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
          Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: onViewDetails,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primaryBlue,
                ),
                child: Text(
                  isArabic ? 'عرض التفاصيل' : 'View Details',
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
