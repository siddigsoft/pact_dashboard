import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

/// Reusable gesture animation widgets
class GestureAnimations {
  /// Scale animation on tap
  static Widget scaleOnTap({
    required VoidCallback onTap,
    required Widget child,
    Duration duration = const Duration(milliseconds: 300),
    double scaleStart = 0.95,
    double scaleEnd = 1.0,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: child
          .animate()
          .scale(begin: Offset(1.0, 1.0))
          .custom(
            duration: duration,
            builder: (context, value, child) {
              return Transform.scale(
                scale: scaleStart + ((scaleEnd - scaleStart) * value),
                child: child,
              );
            },
          ),
    );
  }

  /// Fade and slide animation on tap
  static Widget fadeSlideOnTap({
    required VoidCallback onTap,
    required Widget child,
    Duration duration = const Duration(milliseconds: 400),
  }) {
    return GestureDetector(
      onTap: onTap,
      child: child
          .animate()
          .fadeIn(duration: duration)
          .slideY(begin: 0.2, duration: duration),
    );
  }

  /// Bounce animation on tap
  static Widget bounceOnTap({
    required VoidCallback onTap,
    required Widget child,
    Duration duration = const Duration(milliseconds: 600),
  }) {
    return GestureDetector(
      onTap: onTap,
      child: child
          .animate(
            onComplete: (controller) {
              controller.repeat();
            },
          )
          .scaleXY(begin: 1.0, end: 1.1, duration: duration * 0.3)
          .then()
          .scaleXY(begin: 1.1, end: 1.0, duration: duration * 0.3),
    );
  }

  /// Rotation animation
  static Widget rotateOnTap({
    required VoidCallback onTap,
    required Widget child,
    Duration duration = const Duration(milliseconds: 500),
    double rotationAngle = 2 * 3.14159,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: child.animate().rotate(
        begin: 0,
        end: rotationAngle,
        duration: duration,
      ),
    );
  }

  /// Shimmer loading animation
  static Widget shimmerLoading({
    required double width,
    required double height,
    Color? baseColor,
    Color? highlightColor,
    Duration duration = const Duration(seconds: 2),
  }) {
    baseColor ??= Colors.grey[300]!;
    highlightColor ??= Colors.grey[100]!;

    return Container(
          width: width,
          height: height,
          decoration: BoxDecoration(
            color: baseColor,
            borderRadius: BorderRadius.circular(4),
          ),
          child: ShaderMask(
            shaderCallback: (bounds) {
              return LinearGradient(
                colors: [baseColor!, highlightColor!, baseColor],
                stops: const [0.0, 0.5, 1.0],
              ).createShader(Rect.fromLTWH(0, 0, bounds.width, bounds.height));
            },
            child: Container(color: baseColor),
          ),
        )
        .animate(
          onComplete: (controller) {
            controller.repeat();
          },
        )
        .slideX(begin: -2.0, end: 2.0, duration: duration);
  }

  /// Elastic scroll physics for list
  static ScrollPhysics elasticScroll() {
    return const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics());
  }

  /// Animated button with ripple
  static Widget animatedButton({
    required VoidCallback onPressed,
    required Widget child,
    Color? backgroundColor,
    Color? foregroundColor,
    Duration duration = const Duration(milliseconds: 300),
    BorderRadius? borderRadius,
    double elevation = 2,
  }) {
    return Material(
      borderRadius: borderRadius ?? BorderRadius.circular(8),
      elevation: elevation,
      child: InkWell(
        onTap: onPressed,
        borderRadius: borderRadius ?? BorderRadius.circular(8),
        splashColor: (foregroundColor ?? Colors.white).withOpacity(0.3),
        highlightColor: (foregroundColor ?? Colors.white).withOpacity(0.1),
        child: Container(
          decoration: BoxDecoration(
            color: backgroundColor ?? Colors.blue,
            borderRadius: borderRadius ?? BorderRadius.circular(8),
          ),
          child: DefaultTextStyle(
            style: TextStyle(color: foregroundColor ?? Colors.white),
            child: child,
          ),
        ),
      ),
    );
  }

  /// Swipe-to-dismiss animation
  static Widget dismissibleAnimation({
    required Key key,
    required Widget child,
    required DismissDirectionCallback onDismissed,
    DismissDirection direction = DismissDirection.horizontal,
    Color? backgroundColor,
    Widget? secondaryBackground,
  }) {
    return Dismissible(
      key: key,
      direction: direction,
      background: Container(
        color: backgroundColor ?? Colors.red,
        alignment: Alignment.centerLeft,
        padding: EdgeInsets.only(left: 16),
        child: Icon(Icons.delete, color: Colors.white),
      ),
      secondaryBackground:
          secondaryBackground ??
          Container(
            color: backgroundColor ?? Colors.red,
            alignment: Alignment.centerRight,
            padding: EdgeInsets.only(right: 16),
            child: Icon(Icons.delete, color: Colors.white),
          ),
      onDismissed: onDismissed,
      child: child,
    );
  }

  /// Floating action button animation
  static Widget floatingActionButtonAnimation({
    required VoidCallback onPressed,
    required IconData icon,
    bool isExpanded = false,
    List<FloatingActionButtonAction>? actions,
  }) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (isExpanded && actions != null)
          ...actions.map((action) {
            return Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: FloatingActionButton.small(
                onPressed: action.onPressed,
                backgroundColor: action.backgroundColor,
                child: Icon(action.icon),
              ),
            );
          }),
        SizedBox(height: 12),
        FloatingActionButton(onPressed: onPressed, child: Icon(icon)),
      ],
    );
  }

  /// Animated list item with staggered animation
  static Widget staggeredListItem({
    required Widget child,
    required int index,
    Duration delay = const Duration(milliseconds: 100),
  }) {
    return child
        .animate()
        .fadeIn(
          begin: 0.0,
          duration: Duration(milliseconds: 500),
          delay: delay * index,
        )
        .slideY(
          begin: 0.3,
          duration: Duration(milliseconds: 500),
          delay: delay * index,
        );
  }

  /// Bubble wave animation
  static Widget bubbleWaveAnimation({required Size size, Color? color}) {
    return SizedBox(
      width: size.width,
      height: size.height,
      child: Stack(
        children: [
          ...[0, 1, 2].map((i) {
            return Center(
              child:
                  Container(
                        width: size.width * 0.5,
                        height: size.height * 0.5,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: (color ?? Colors.blue).withOpacity(0.3),
                            width: 2,
                          ),
                        ),
                      )
                      .animate(
                        onComplete: (controller) {
                          controller.repeat();
                        },
                      )
                      .scaleXY(
                        begin: 0.0,
                        end: 1.5,
                        duration: Duration(milliseconds: 1500),
                        delay: Duration(milliseconds: i * 500),
                      )
                      .fadeOut(
                        duration: Duration(milliseconds: 1500),
                        delay: Duration(milliseconds: i * 500),
                      ),
            );
          }),
        ],
      ),
    );
  }

  /// Pulse animation for attention
  static Widget pulseAnimation({
    required Widget child,
    Color? pulseColor,
    Duration duration = const Duration(milliseconds: 1000),
  }) {
    return child
        .animate(
          onComplete: (controller) {
            controller.repeat();
          },
        )
        .scale(
          begin: Offset(1.0, 1.0),
          end: Offset(1.1, 1.1),
          duration: duration * 0.5,
        )
        .then()
        .scale(
          begin: Offset(1.1, 1.1),
          end: Offset(1.0, 1.0),
          duration: duration * 0.5,
        );
  }

  /// Micro-interaction feedback with haptic
  static Future<void> triggerMicroInteraction() async {
    // Can integrate with haptc feedback if needed
    // HapticFeedback.lightImpact();
  }
}

/// Floating action button action model
class FloatingActionButtonAction {
  final IconData icon;
  final VoidCallback onPressed;
  final Color? backgroundColor;

  FloatingActionButtonAction({
    required this.icon,
    required this.onPressed,
    this.backgroundColor,
  });
}

/// Animated splash screen
class AnimatedSplash extends StatefulWidget {
  final Duration duration;
  final Widget nextScreen;

  const AnimatedSplash({
    super.key,
    this.duration = const Duration(seconds: 3),
    required this.nextScreen,
  });

  @override
  State<AnimatedSplash> createState() => _AnimatedSplashState();
}

class _AnimatedSplashState extends State<AnimatedSplash>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(duration: widget.duration, vsync: this);

    _controller.forward();

    Future.delayed(widget.duration, () {
      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (context) => widget.nextScreen),
        );
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            ScaleTransition(
              scale: Tween(begin: 0.0, end: 1.0).animate(
                CurvedAnimation(parent: _controller, curve: Curves.elasticOut),
              ),
              child: Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Theme.of(context).primaryColor,
                ),
                child: Icon(Icons.check, color: Colors.white, size: 40),
              ),
            ),
            SizedBox(height: 24),
            FadeTransition(
              opacity: Tween(begin: 0.0, end: 1.0).animate(
                CurvedAnimation(
                  parent: _controller,
                  curve: Interval(0.5, 1.0, curve: Curves.easeIn),
                ),
              ),
              child: Text(
                'Loading...',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
