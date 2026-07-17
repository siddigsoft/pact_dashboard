import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Animated counter that smoothly transitions between numbers
class AnimatedCounter extends StatefulWidget {
  final double value;
  final TextStyle? textStyle;
  final String prefix;
  final String suffix;
  final Duration duration;

  const AnimatedCounter({
    super.key,
    required this.value,
    this.textStyle,
    this.prefix = '',
    this.suffix = '',
    this.duration = const Duration(milliseconds: 1000),
  });

  @override
  State<AnimatedCounter> createState() => _AnimatedCounterState();
}

class _AnimatedCounterState extends State<AnimatedCounter>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;
  double _previousValue = 0;

  @override
  void initState() {
    super.initState();
    _previousValue = widget.value;
    _setupAnimation();
  }

  @override
  void didUpdateWidget(AnimatedCounter oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value != widget.value) {
      _previousValue = oldWidget.value;
      _setupAnimation();
    }
  }

  void _setupAnimation() {
    _controller = AnimationController(duration: widget.duration, vsync: this);

    _animation = Tween<double>(
      begin: _previousValue,
      end: widget.value,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic));

    _controller.forward();
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
        return Text(
          '${widget.prefix}${_animation.value.toStringAsFixed(2)}${widget.suffix}',
          style: widget.textStyle,
        );
      },
    );
  }
}

/// Animated percentage bar (grows/shrinks smoothly)
class AnimatedProgressBar extends StatefulWidget {
  final double progress;
  final Color color;
  final double height;
  final Duration duration;

  const AnimatedProgressBar({
    super.key,
    required this.progress,
    this.color = Colors.blue,
    this.height = 8,
    this.duration = const Duration(milliseconds: 800),
  });

  @override
  State<AnimatedProgressBar> createState() => _AnimatedProgressBarState();
}

class _AnimatedProgressBarState extends State<AnimatedProgressBar>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(duration: widget.duration, vsync: this);
  }

  @override
  void didUpdateWidget(AnimatedProgressBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.progress != widget.progress) {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(widget.height / 2),
      child: LinearProgressIndicator(
        minHeight: widget.height,
        value: widget.progress,
        backgroundColor: Colors.grey.shade300,
        valueColor: AlwaysStoppedAnimation<Color>(widget.color),
      ),
    );
  }
}

/// Bounce animation for balance changes
class BalanceBounceAnimation extends StatefulWidget {
  final double balance;
  final TextStyle? titleStyle;
  final TextStyle? balanceStyle;

  const BalanceBounceAnimation({
    super.key,
    required this.balance,
    this.titleStyle,
    this.balanceStyle,
  });

  @override
  State<BalanceBounceAnimation> createState() => _BalanceBounceAnimationState();
}

class _BalanceBounceAnimationState extends State<BalanceBounceAnimation>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 600),
      vsync: this,
    );

    _scaleAnimation = Tween<double>(
      begin: 1.0,
      end: 1.05,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.elasticOut));

    _controller.forward();
  }

  @override
  void didUpdateWidget(BalanceBounceAnimation oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.balance != widget.balance) {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: _scaleAnimation,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Available Balance', style: widget.titleStyle),
          const SizedBox(height: 8),
          AnimatedCounter(
            value: widget.balance,
            suffix: ' SDG',
            textStyle: widget.balanceStyle,
            duration: const Duration(milliseconds: 1000),
          ),
        ],
      ),
    );
  }
}

/// Slide-in animation for new items
class SlideInAnimation extends StatefulWidget {
  final Widget child;
  final Duration duration;
  final Curve curve;

  const SlideInAnimation({
    super.key,
    required this.child,
    this.duration = const Duration(milliseconds: 500),
    this.curve = Curves.easeOut,
  });

  @override
  State<SlideInAnimation> createState() => _SlideInAnimationState();
}

class _SlideInAnimationState extends State<SlideInAnimation>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<Offset> _offsetAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(duration: widget.duration, vsync: this);

    _offsetAnimation = Tween<Offset>(
      begin: const Offset(0.0, 0.1),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _controller, curve: widget.curve));

    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SlideTransition(
      position: _offsetAnimation,
      child: FadeTransition(opacity: _controller, child: widget.child),
    );
  }
}

/// Pop in animation (scale + fade)
class PopInAnimation extends StatefulWidget {
  final Widget child;
  final Duration duration;

  const PopInAnimation({
    super.key,
    required this.child,
    this.duration = const Duration(milliseconds: 400),
  });

  @override
  State<PopInAnimation> createState() => _PopInAnimationState();
}

class _PopInAnimationState extends State<PopInAnimation>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(duration: widget.duration, vsync: this);

    _scaleAnimation = Tween<double>(
      begin: 0.0,
      end: 1.0,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.elasticOut));

    _fadeAnimation = Tween<double>(
      begin: 0.0,
      end: 1.0,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOut));

    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: _scaleAnimation,
      child: FadeTransition(opacity: _fadeAnimation, child: widget.child),
    );
  }
}
