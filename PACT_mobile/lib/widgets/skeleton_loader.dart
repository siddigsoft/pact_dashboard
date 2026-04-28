import 'package:flutter/material.dart';

/// Shimmer skeleton loader for smooth loading states
class SkeletonLoader extends StatefulWidget {
  final double width;
  final double height;
  final BorderRadius? borderRadius;
  final EdgeInsets padding;

  const SkeletonLoader({
    super.key,
    this.width = double.infinity,
    this.height = 20,
    this.borderRadius,
    this.padding = EdgeInsets.zero,
  });

  @override
  State<SkeletonLoader> createState() => _SkeletonLoaderState();
}

class _SkeletonLoaderState extends State<SkeletonLoader>
    with SingleTickerProviderStateMixin {
  late AnimationController _animationController;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat();
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: widget.padding,
      child: AnimatedBuilder(
        animation: _animationController,
        builder: (context, child) {
          return Container(
            width: widget.width,
            height: widget.height,
            decoration: BoxDecoration(
              borderRadius: widget.borderRadius ?? BorderRadius.circular(8),
              gradient: LinearGradient(
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
                colors: [
                  Colors.grey.shade300,
                  Colors.grey.shade200,
                  Colors.grey.shade300,
                ],
                stops: [
                  _animationController.value - 0.2,
                  _animationController.value,
                  _animationController.value + 0.2,
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Card-shaped skeleton loader with header and body
class SkeletonCard extends StatefulWidget {
  final double? height;
  final int lines;
  final bool showHeader;

  const SkeletonCard({
    super.key,
    this.height,
    this.lines = 3,
    this.showHeader = true,
  });

  @override
  State<SkeletonCard> createState() => _SkeletonCardState();
}

class _SkeletonCardState extends State<SkeletonCard> {
  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (widget.showHeader) ...[
              SkeletonLoader(
                width: 150,
                height: 18,
                borderRadius: BorderRadius.circular(6),
                padding: const EdgeInsets.only(bottom: 12),
              ),
            ],
            ...List.generate(
              widget.lines,
              (index) => SkeletonLoader(
                width: index == widget.lines - 1 ? 200 : double.infinity,
                height: 14,
                borderRadius: BorderRadius.circular(6),
                padding: const EdgeInsets.only(bottom: 8),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Balance card skeleton (mimics actual balance card shape)
class SkeletonBalanceCard extends StatelessWidget {
  const SkeletonBalanceCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey.shade200,
        borderRadius: BorderRadius.circular(20),
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SkeletonLoader(
                    width: 120,
                    height: 13,
                    borderRadius: BorderRadius.circular(6),
                    padding: const EdgeInsets.only(bottom: 8),
                  ),
                  SkeletonLoader(
                    width: 100,
                    height: 11,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ],
              ),
              SkeletonLoader(
                width: 44,
                height: 44,
                borderRadius: BorderRadius.circular(12),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SkeletonLoader(
            width: 200,
            height: 36,
            borderRadius: BorderRadius.circular(8),
            padding: const EdgeInsets.only(bottom: 8),
          ),
          SkeletonLoader(
            width: 100,
            height: 12,
            borderRadius: BorderRadius.circular(6),
            padding: const EdgeInsets.only(bottom: 16),
          ),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: SkeletonLoader(borderRadius: BorderRadius.circular(12)),
          ),
        ],
      ),
    );
  }
}

/// Transaction list skeleton (multiple cards)
class SkeletonTransactionsList extends StatelessWidget {
  final int itemCount;

  const SkeletonTransactionsList({super.key, this.itemCount = 5});

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      itemCount: itemCount,
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemBuilder: (context, index) {
        return SkeletonCard(showHeader: index == 0, lines: 2);
      },
    );
  }
}
