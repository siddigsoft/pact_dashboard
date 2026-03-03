/// Cost Stats Cards Widget
/// Displays submission statistics in a horizontal scrollable row
library;

import 'package:flutter/material.dart';
import '../../models/operational_cost_submission.dart';

class CostStatsCards extends StatelessWidget {
  final OperationalCostStats stats;
  final bool isArabic;

  const CostStatsCards({super.key, required this.stats, this.isArabic = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 100,
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          _buildStatCard(
            context,
            icon: Icons.access_time,
            label: isArabic ? 'قيد الانتظار' : 'Pending',
            value: stats.pending.toString(),
            subtitle: isArabic ? 'بانتظار المراجعة' : 'Awaiting review',
            gradient: const [Color(0xFFF59E0B), Color(0xFFEA580C)],
          ),
          const SizedBox(width: 12),
          _buildStatCard(
            context,
            icon: Icons.hourglass_empty,
            label: isArabic ? 'قيد المراجعة' : 'Under Review',
            value: stats.underReview.toString(),
            subtitle: isArabic ? 'جاري المعالجة' : 'Being processed',
            gradient: const [Color(0xFF3B82F6), Color(0xFF1D4ED8)],
          ),
          const SizedBox(width: 12),
          _buildStatCard(
            context,
            icon: Icons.check_circle,
            label: isArabic ? 'موافق عليها' : 'Approved',
            value: stats.approved.toString(),
            subtitle: isArabic ? 'جاهزة للدفع' : 'Ready for payment',
            gradient: const [Color(0xFF22C55E), Color(0xFF059669)],
          ),
          const SizedBox(width: 12),
          _buildStatCard(
            context,
            icon: Icons.cancel,
            label: isArabic ? 'مرفوضة' : 'Rejected',
            value: stats.rejected.toString(),
            subtitle: isArabic ? 'مرفوضة' : 'Declined',
            gradient: const [Color(0xFFEF4444), Color(0xFFDC2626)],
          ),
          const SizedBox(width: 12),
          _buildStatCard(
            context,
            icon: Icons.attach_money,
            label: isArabic ? 'مدفوعة' : 'Paid',
            value: stats.paid.toString(),
            subtitle: isArabic ? 'مكتملة' : 'Completed',
            gradient: const [Color(0xFF8B5CF6), Color(0xFF7C3AED)],
          ),
          const SizedBox(width: 12),
          _buildStatCard(
            context,
            icon: Icons.list_alt,
            label: isArabic ? 'الإجمالي' : 'Total',
            value: stats.total.toString(),
            subtitle: isArabic ? 'جميع الطلبات' : 'All submissions',
            gradient: const [Color(0xFF64748B), Color(0xFF475569)],
          ),
        ],
      ),
    );
  }

  Widget _buildStatCard(
    BuildContext context, {
    required IconData icon,
    required String label,
    required String value,
    required String subtitle,
    required List<Color> gradient,
  }) {
    return Container(
      width: 130,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: gradient,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: gradient.first.withOpacity(0.3),
            blurRadius: 8,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () {},
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        label,
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Icon(icon, color: Colors.white70, size: 16),
                  ],
                ),
                const Spacer(),
                Text(
                  value,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  subtitle,
                  style: const TextStyle(color: Colors.white60, fontSize: 9),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
