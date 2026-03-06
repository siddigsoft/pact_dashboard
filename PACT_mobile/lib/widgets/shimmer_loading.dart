import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../theme/app_colors.dart';

class ShimmerBox extends StatelessWidget {
  final double height;
  final double? width;
  final double radius;

  const ShimmerBox({
    super.key,
    this.height = 16,
    this.width,
    this.radius = 8,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      width: width,
      decoration: BoxDecoration(
        color: Colors.grey.shade300,
        borderRadius: BorderRadius.circular(radius),
      ),
    )
        .animate(onPlay: (c) => c.repeat())
        .shimmer(duration: 1200.ms, color: Colors.white.withOpacity(0.6));
  }
}

class ShimmerCard extends StatelessWidget {
  final bool hasAvatar;
  final bool hasSubtitle;
  final bool hasTrailing;

  const ShimmerCard({
    super.key,
    this.hasAvatar = false,
    this.hasSubtitle = true,
    this.hasTrailing = false,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            if (hasAvatar) ...[
              ShimmerBox(height: 44, width: 44, radius: 22),
              const SizedBox(width: 12),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ShimmerBox(height: 14, width: double.infinity),
                  if (hasSubtitle) ...[
                    const SizedBox(height: 8),
                    ShimmerBox(height: 12, width: 180),
                  ],
                ],
              ),
            ),
            if (hasTrailing) ...[
              const SizedBox(width: 12),
              ShimmerBox(height: 32, width: 64, radius: 16),
            ],
          ],
        ),
      ),
    );
  }
}

class ShimmerList extends StatelessWidget {
  final int itemCount;
  final bool hasAvatar;
  final bool hasSubtitle;
  final bool hasTrailing;

  const ShimmerList({
    super.key,
    this.itemCount = 6,
    this.hasAvatar = false,
    this.hasSubtitle = true,
    this.hasTrailing = false,
  });

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      physics: const NeverScrollableScrollPhysics(),
      shrinkWrap: true,
      itemCount: itemCount,
      itemBuilder: (_, __) => ShimmerCard(
        hasAvatar: hasAvatar,
        hasSubtitle: hasSubtitle,
        hasTrailing: hasTrailing,
      ),
    );
  }
}

class ShimmerStatsRow extends StatelessWidget {
  final int count;

  const ShimmerStatsRow({super.key, this.count = 3});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: List.generate(
        count,
        (i) => Expanded(
          child: Card(
            margin: EdgeInsets.only(
              left: i == 0 ? 16 : 8,
              right: i == count - 1 ? 16 : 0,
              bottom: 12,
            ),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  ShimmerBox(height: 28, width: 50),
                  const SizedBox(height: 8),
                  ShimmerBox(height: 12, width: 60),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class ShimmerBody extends StatelessWidget {
  final bool hasStats;
  final bool hasAvatar;
  final int listItems;

  const ShimmerBody({
    super.key,
    this.hasStats = false,
    this.hasAvatar = false,
    this.listItems = 6,
  });

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 12),
          if (hasStats) ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: ShimmerStatsRow(count: 3),
            ),
          ],
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: ShimmerBox(height: 44, width: double.infinity, radius: 12),
          ),
          const SizedBox(height: 12),
          ShimmerList(
              itemCount: listItems, hasAvatar: hasAvatar, hasSubtitle: true),
        ],
      ),
    );
  }
}

class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: Colors.orange.shade700,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: const Row(
        children: [
          Icon(Icons.wifi_off, color: Colors.white, size: 16),
          SizedBox(width: 8),
          Text(
            'Showing cached data — you are offline',
            style: TextStyle(
                color: Colors.white, fontSize: 12, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}
