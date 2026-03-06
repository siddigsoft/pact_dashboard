import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../theme/app_colors.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Core shimmer primitive — single left-to-right gradient sweep across a shape
// ─────────────────────────────────────────────────────────────────────────────

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
    return _ShimmerBase(
      child: Container(
        height: height,
        width: width ?? double.infinity,
        decoration: BoxDecoration(
          color: Colors.grey.shade300,
          borderRadius: BorderRadius.circular(radius),
        ),
      ),
    );
  }
}

class ShimmerCircle extends StatelessWidget {
  final double size;

  const ShimmerCircle({super.key, this.size = 44});

  @override
  Widget build(BuildContext context) {
    return _ShimmerBase(
      child: Container(
        width: size,
        height: size,
        decoration: const BoxDecoration(
          color: Color(0xFFE0E0E0),
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}

// Internal animated base — sweeps a highlight across any child
class _ShimmerBase extends StatelessWidget {
  final Widget child;
  const _ShimmerBase({required this.child});

  @override
  Widget build(BuildContext context) {
    return child
        .animate(onPlay: (c) => c.repeat())
        .shimmer(
          duration: 1400.ms,
          color: Colors.white.withOpacity(0.65),
          angle: 0,
        );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic card skeleton
// ─────────────────────────────────────────────────────────────────────────────

class ShimmerCard extends StatelessWidget {
  final bool hasAvatar;
  final bool hasSubtitle;
  final bool hasTrailing;
  final bool hasProgressBar;

  const ShimmerCard({
    super.key,
    this.hasAvatar = false,
    this.hasSubtitle = true,
    this.hasTrailing = false,
    this.hasProgressBar = false,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (hasAvatar) ...[
                  ShimmerCircle(size: 42),
                  const SizedBox(width: 12),
                ],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ShimmerBox(height: 14),
                      if (hasSubtitle) ...[
                        const SizedBox(height: 8),
                        ShimmerBox(height: 11, width: 160),
                      ],
                    ],
                  ),
                ),
                if (hasTrailing) ...[
                  const SizedBox(width: 12),
                  ShimmerBox(height: 26, width: 56, radius: 13),
                ],
              ],
            ),
            if (hasProgressBar) ...[
              const SizedBox(height: 12),
              ShimmerBox(height: 8, radius: 4),
              const SizedBox(height: 4),
              ShimmerBox(height: 10, width: 100),
            ],
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Staff directory skeleton — avatar circle + name + role badge + hub line
// ─────────────────────────────────────────────────────────────────────────────

class ShimmerStaffCard extends StatelessWidget {
  const ShimmerStaffCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            ShimmerCircle(size: 46),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ShimmerBox(height: 14, width: 160),
                  const SizedBox(height: 6),
                  ShimmerBox(height: 11, width: 220),
                  const SizedBox(height: 7),
                  Row(
                    children: [
                      ShimmerBox(height: 18, width: 72, radius: 9),
                      const SizedBox(width: 8),
                      ShimmerBox(height: 11, width: 80),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            ShimmerBox(height: 32, width: 32, radius: 16),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MMP card skeleton — code line + status badge + coverage bar
// ─────────────────────────────────────────────────────────────────────────────

class ShimmerMmpCard extends StatelessWidget {
  const ShimmerMmpCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const SizedBox(width: 4),
                Expanded(child: ShimmerBox(height: 15, width: 180)),
                const SizedBox(width: 12),
                ShimmerBox(height: 24, width: 70, radius: 12),
              ],
            ),
            const SizedBox(height: 8),
            ShimmerBox(height: 11, width: 140),
            const SizedBox(height: 4),
            ShimmerBox(height: 11, width: 90),
            const SizedBox(height: 12),
            ShimmerBox(height: 6, radius: 3),
            const SizedBox(height: 5),
            ShimmerBox(height: 10, width: 110),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Budget card skeleton — 3 number columns + progress bar
// ─────────────────────────────────────────────────────────────────────────────

class ShimmerBudgetCard extends StatelessWidget {
  const ShimmerBudgetCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ShimmerBox(height: 14, width: 150),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  ShimmerBox(height: 10, width: 55),
                  const SizedBox(height: 5),
                  ShimmerBox(height: 20, width: 80),
                ])),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  ShimmerBox(height: 10, width: 40),
                  const SizedBox(height: 5),
                  ShimmerBox(height: 20, width: 70),
                ])),
              ],
            ),
            const SizedBox(height: 12),
            ShimmerBox(height: 7, radius: 4),
            const SizedBox(height: 5),
            ShimmerBox(height: 10, width: 80),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats row skeleton — N equal-width stat tiles
// ─────────────────────────────────────────────────────────────────────────────

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
              left: i == 0 ? 14 : 6,
              right: i == count - 1 ? 14 : 0,
              bottom: 12,
            ),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                children: [
                  ShimmerBox(height: 26, width: 48),
                  const SizedBox(height: 8),
                  ShimmerBox(height: 10, width: 58),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard grid skeleton — 2×2 stat tiles (coordinators screen style)
// ─────────────────────────────────────────────────────────────────────────────

class ShimmerStatGrid extends StatelessWidget {
  const ShimmerStatGrid({super.key});

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      childAspectRatio: 1.5,
      padding: const EdgeInsets.symmetric(horizontal: 14),
      children: List.generate(4, (_) => Card(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        elevation: 1,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            ShimmerBox(height: 24, width: 24, radius: 4),
            const Spacer(),
            ShimmerBox(height: 22, width: 50),
            const SizedBox(height: 5),
            ShimmerBox(height: 10, width: 80),
          ]),
        ),
      )),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hub card skeleton — expand-style card with leading circle icon
// ─────────────────────────────────────────────────────────────────────────────

class ShimmerHubCard extends StatelessWidget {
  const ShimmerHubCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        child: Row(
          children: [
            ShimmerCircle(size: 40),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              ShimmerBox(height: 14, width: 160),
              const SizedBox(height: 7),
              ShimmerBox(height: 11, width: 100),
            ])),
            ShimmerBox(height: 20, width: 20, radius: 4),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Retainer card skeleton — avatar + name/role + amount + status badge
// ─────────────────────────────────────────────────────────────────────────────

class ShimmerRetainerCard extends StatelessWidget {
  const ShimmerRetainerCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            ShimmerCircle(size: 40),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              ShimmerBox(height: 14, width: 140),
              const SizedBox(height: 5),
              ShimmerBox(height: 11, width: 70),
              const SizedBox(height: 7),
              ShimmerBox(height: 16, width: 90),
            ])),
            ShimmerBox(height: 26, width: 68, radius: 13),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Search result skeleton — icon circle + title + type chip
// ─────────────────────────────────────────────────────────────────────────────

class ShimmerSearchResult extends StatelessWidget {
  const ShimmerSearchResult({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            ShimmerCircle(size: 38),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              ShimmerBox(height: 14, width: 180),
              const SizedBox(height: 7),
              Row(children: [
                ShimmerBox(height: 17, width: 60, radius: 8),
                const SizedBox(width: 8),
                ShimmerBox(height: 11, width: 80),
              ]),
            ])),
            ShimmerBox(height: 18, width: 18, radius: 4),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Full-screen shimmer body — picks the right card variant automatically
// ─────────────────────────────────────────────────────────────────────────────

enum ShimmerLayout {
  generic,       // default — generic card list
  staff,         // staff directory
  mmp,           // MMP / monitoring plan
  budget,        // budget line items
  hub,           // hub management
  retainer,      // retainer payments
  searchResult,  // global search
  statGrid,      // coordinator dashboard 2×2 grid
}

class ShimmerBody extends StatelessWidget {
  final bool hasStats;
  final bool hasAvatar;
  final int listItems;
  final ShimmerLayout layout;

  const ShimmerBody({
    super.key,
    this.hasStats = false,
    this.hasAvatar = false,
    this.listItems = 6,
    this.layout = ShimmerLayout.generic,
  });

  Widget _buildItem() {
    switch (layout) {
      case ShimmerLayout.staff:       return const ShimmerStaffCard();
      case ShimmerLayout.mmp:         return const ShimmerMmpCard();
      case ShimmerLayout.budget:      return const ShimmerBudgetCard();
      case ShimmerLayout.hub:         return const ShimmerHubCard();
      case ShimmerLayout.retainer:    return const ShimmerRetainerCard();
      case ShimmerLayout.searchResult: return const ShimmerSearchResult();
      case ShimmerLayout.statGrid:    return const SizedBox.shrink();
      case ShimmerLayout.generic:
        return ShimmerCard(hasAvatar: hasAvatar, hasTrailing: true, hasProgressBar: hasStats);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (layout == ShimmerLayout.statGrid) {
      return SingleChildScrollView(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Column(children: [
          const ShimmerStatGrid(),
          const SizedBox(height: 14),
          ...List.generate(3, (_) => const ShimmerCard(hasTrailing: true)),
        ]),
      );
    }

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 12),
          if (hasStats) ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: ShimmerStatsRow(count: 3),
            ),
          ],
          if (layout == ShimmerLayout.generic || layout == ShimmerLayout.budget) ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: ShimmerBox(height: 44, width: double.infinity, radius: 10),
            ),
            const SizedBox(height: 12),
          ],
          ...List.generate(listItems, (_) => _buildItem()),
          const SizedBox(height: 20),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline banner
// ─────────────────────────────────────────────────────────────────────────────

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
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
