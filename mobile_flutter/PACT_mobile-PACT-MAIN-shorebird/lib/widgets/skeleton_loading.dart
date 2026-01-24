// lib/widgets/skeleton_loading.dart

import 'package:flutter/material.dart';

class SkeletonLoading extends StatefulWidget {
  final double width;
  final double height;
  final BorderRadius? borderRadius;
  final bool isCircle;

  const SkeletonLoading({
    super.key,
    this.width = double.infinity,
    required this.height,
    this.borderRadius,
    this.isCircle = false,
  });

  @override
  State<SkeletonLoading> createState() => _SkeletonLoadingState();
}

class _SkeletonLoadingState extends State<SkeletonLoading>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat();

    _animation = Tween<double>(begin: -2, end: 2).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOutSine),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _animation,
      builder: (context, child) {
        return Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            shape: widget.isCircle ? BoxShape.circle : BoxShape.rectangle,
            borderRadius: widget.isCircle
                ? null
                : widget.borderRadius ?? BorderRadius.circular(8),
            gradient: LinearGradient(
              begin: Alignment(_animation.value, 0),
              end: Alignment(_animation.value + 1, 0),
              colors: [
                Colors.grey.shade200,
                Colors.grey.shade100,
                Colors.grey.shade200,
              ],
            ),
          ),
        );
      },
    );
  }
}

class SkeletonListTile extends StatelessWidget {
  final bool hasAvatar;
  final bool hasSubtitle;
  final bool hasTrailing;

  const SkeletonListTile({
    super.key,
    this.hasAvatar = true,
    this.hasSubtitle = true,
    this.hasTrailing = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          if (hasAvatar) ...[
            const SkeletonLoading(
              width: 48,
              height: 48,
              isCircle: true,
            ),
            const SizedBox(width: 12),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonLoading(
                  width: MediaQuery.of(context).size.width * 0.4,
                  height: 16,
                ),
                if (hasSubtitle) ...[
                  const SizedBox(height: 8),
                  SkeletonLoading(
                    width: MediaQuery.of(context).size.width * 0.6,
                    height: 12,
                  ),
                ],
              ],
            ),
          ),
          if (hasTrailing) ...[
            const SizedBox(width: 12),
            const SkeletonLoading(
              width: 60,
              height: 24,
              borderRadius: BorderRadius.all(Radius.circular(12)),
            ),
          ],
        ],
      ),
    );
  }
}

class SkeletonCard extends StatelessWidget {
  final double? width;
  final double height;
  final bool hasImage;
  final bool hasActions;

  const SkeletonCard({
    super.key,
    this.width,
    this.height = 200,
    this.hasImage = true,
    this.hasActions = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      margin: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (hasImage)
            SkeletonLoading(
              height: height * 0.5,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(12),
                topRight: Radius.circular(12),
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SkeletonLoading(width: 150, height: 16),
                const SizedBox(height: 8),
                const SkeletonLoading(width: double.infinity, height: 12),
                const SizedBox(height: 4),
                const SkeletonLoading(width: 200, height: 12),
                if (hasActions) ...[
                  const SizedBox(height: 12),
                  Row(
                    children: const [
                      SkeletonLoading(
                        width: 80,
                        height: 32,
                        borderRadius: BorderRadius.all(Radius.circular(16)),
                      ),
                      SizedBox(width: 8),
                      SkeletonLoading(
                        width: 80,
                        height: 32,
                        borderRadius: BorderRadius.all(Radius.circular(16)),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class SkeletonGrid extends StatelessWidget {
  final int itemCount;
  final int crossAxisCount;
  final double childAspectRatio;

  const SkeletonGrid({
    super.key,
    this.itemCount = 6,
    this.crossAxisCount = 2,
    this.childAspectRatio = 1,
  });

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: crossAxisCount,
        childAspectRatio: childAspectRatio,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
      ),
      itemCount: itemCount,
      itemBuilder: (context, index) {
        return SkeletonLoading(
          height: 100,
          borderRadius: BorderRadius.circular(12),
        );
      },
    );
  }
}

class SkeletonSiteVisitCard extends StatelessWidget {
  const SkeletonSiteVisitCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: const [
              SkeletonLoading(width: 40, height: 40, isCircle: true),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SkeletonLoading(width: 150, height: 16),
                    SizedBox(height: 6),
                    SkeletonLoading(width: 100, height: 12),
                  ],
                ),
              ),
              SkeletonLoading(
                width: 70,
                height: 24,
                borderRadius: BorderRadius.all(Radius.circular(12)),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Row(
            children: [
              SkeletonLoading(width: 16, height: 16),
              SizedBox(width: 8),
              SkeletonLoading(width: 120, height: 14),
            ],
          ),
          const SizedBox(height: 8),
          const Row(
            children: [
              SkeletonLoading(width: 16, height: 16),
              SizedBox(width: 8),
              SkeletonLoading(width: 150, height: 14),
            ],
          ),
          const SizedBox(height: 16),
          const Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              SkeletonLoading(
                width: 100,
                height: 36,
                borderRadius: BorderRadius.all(Radius.circular(8)),
              ),
              SkeletonLoading(
                width: 100,
                height: 36,
                borderRadius: BorderRadius.all(Radius.circular(8)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class SkeletonProfileHeader extends StatelessWidget {
  const SkeletonProfileHeader({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: const [
          SkeletonLoading(width: 100, height: 100, isCircle: true),
          SizedBox(height: 16),
          SkeletonLoading(width: 150, height: 24),
          SizedBox(height: 8),
          SkeletonLoading(width: 200, height: 16),
          SizedBox(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              Column(
                children: [
                  SkeletonLoading(width: 40, height: 20),
                  SizedBox(height: 4),
                  SkeletonLoading(width: 60, height: 14),
                ],
              ),
              Column(
                children: [
                  SkeletonLoading(width: 40, height: 20),
                  SizedBox(height: 4),
                  SkeletonLoading(width: 60, height: 14),
                ],
              ),
              Column(
                children: [
                  SkeletonLoading(width: 40, height: 20),
                  SizedBox(height: 4),
                  SkeletonLoading(width: 60, height: 14),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}
