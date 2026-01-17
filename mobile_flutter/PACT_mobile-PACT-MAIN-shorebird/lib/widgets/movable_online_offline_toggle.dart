// lib/widgets/movable_online_offline_toggle.dart

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'online_offline_toggle.dart';

class MovableOnlineOfflineToggle extends ConsumerStatefulWidget {
  final ToggleVariant variant;
  final Offset? initialPosition;
  final bool
  snappy; // If true, disables drag-time animations for maximum responsiveness

  const MovableOnlineOfflineToggle({
    super.key,
    this.variant = ToggleVariant.uber,
    this.initialPosition,
    this.snappy = false,
  });

  @override
  ConsumerState<MovableOnlineOfflineToggle> createState() =>
      _MovableOnlineOfflineToggleState();
}

class _MovableOnlineOfflineToggleState
    extends ConsumerState<MovableOnlineOfflineToggle> {
  Offset _position = const Offset(20, 100); // Initialize with default value
  bool _isDragging = false;
  final String _positionKey = 'movable_toggle_position';
  Size? _lastScreenSize;
  bool _positionInitialized = false;

  @override
  void initState() {
    super.initState();
    _loadPosition();
  }

  Offset _getDefaultPosition(Size screenSize) {
    // Calculate a good default position based on screen size
    const double padding = 20.0;
    const double toggleWidth = 140.0; // Pill variant is smaller

    // Position it in the bottom-left area, above the bottom navigation
    final defaultX = padding;
    final defaultY = screenSize.height - 180.0; // Above bottom nav bar

    return Offset(defaultX, defaultY);
  }

  Future<void> _loadPosition() async {
    if (widget.initialPosition != null) {
      setState(() {
        _position = widget.initialPosition!;
      });
      return;
    }

    try {
      final prefs = await SharedPreferences.getInstance();
      final x = prefs.getDouble('${_positionKey}_x');
      final y = prefs.getDouble('${_positionKey}_y');

      if (x != null && y != null) {
        setState(() {
          _position = Offset(x, y);
          _positionInitialized = true;
        });
      } else {
        // No saved position, use default
        // We'll set it properly in build() when we have screen size
        setState(() {
          _position = const Offset(20, 100); // Temporary default
        });
      }
    } catch (e) {
      // Default position if loading fails
      setState(() {
        _position = const Offset(20, 100);
      });
    }
  }

  Future<void> _savePosition(Offset position) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setDouble('${_positionKey}_x', position.dx);
      await prefs.setDouble('${_positionKey}_y', position.dy);
    } catch (e) {
      // Silently fail if saving fails
    }
  }

  Offset _validateAndAdjustPosition(Offset position, Size screenSize) {
    // Constrain to screen bounds with some padding
    const double padding = 10.0;
    const double toggleWidth = 200.0; // Approximate width of the toggle
    const double toggleHeight = 56.0; // Height of uber variant

    final maxX = screenSize.width - toggleWidth - padding;
    final maxY = screenSize.height - toggleHeight - padding;

    final constrainedX = position.dx.clamp(
      padding,
      maxX > padding ? maxX : padding,
    );
    final constrainedY = position.dy.clamp(
      padding,
      maxY > padding ? maxY : padding,
    );

    return Offset(constrainedX, constrainedY);
  }

  void _updatePosition(Offset newPosition, Size screenSize) {
    final constrainedPosition = _validateAndAdjustPosition(
      newPosition,
      screenSize,
    );

    // Apply new position immediately for responsive dragging.
    // Persisting to storage each frame is expensive; save once onPanEnd instead.
    setState(() {
      _position = constrainedPosition;
    });
  }

  void _handleScreenSizeChange(Size newScreenSize) {
    // Avoid calling setState directly during build. Schedule updates after frame.
    if (_lastScreenSize == null && !_positionInitialized) {
      // First time we have a real screen size: if we don't have a saved position,
      // set a sensible default based on screen size.
      if (_position == const Offset(20, 100)) {
        final defaultPosition = _getDefaultPosition(newScreenSize);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          setState(() {
            _position = defaultPosition;
            _positionInitialized = true;
          });
          _savePosition(defaultPosition);
        });
      } else {
        _positionInitialized = true;
      }
    } else if (_lastScreenSize != null && _lastScreenSize != newScreenSize) {
      // Screen size changed, validate current position and adjust if necessary.
      final adjustedPosition = _validateAndAdjustPosition(
        _position,
        newScreenSize,
      );
      if (adjustedPosition != _position) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          setState(() {
            _position = adjustedPosition;
          });
          _savePosition(adjustedPosition);
        });
      }
    }
    _lastScreenSize = newScreenSize;
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final screenSize = Size(constraints.maxWidth, constraints.maxHeight);

        // Handle screen size changes
        _handleScreenSizeChange(screenSize);

        // Ensure position is always valid for current screen size
        // Only validate if position has been initialized
        final validPosition = _positionInitialized
            ? _validateAndAdjustPosition(_position, screenSize)
            : _position;

        return Stack(
          children: [
            // Use Positioned while dragging for immediate response; use AnimatedPositioned otherwise
            if (_isDragging)
              Positioned(
                left: validPosition.dx,
                top: validPosition.dy,
                child: GestureDetector(
                  onPanStart: (_) {
                    setState(() {
                      _isDragging = true;
                    });
                  },
                  onPanUpdate: (details) {
                    // Use current _position for delta updates to avoid clamping/jitter
                    _updatePosition(_position + details.delta, screenSize);
                  },
                  onPanEnd: (_) {
                    setState(() {
                      _isDragging = false;
                    });
                    // Save once after drag ends
                    _savePosition(_position);
                  },
                  onDoubleTap: () {
                    final defaultPosition = _getDefaultPosition(screenSize);
                    setState(() {
                      _position = defaultPosition;
                    });
                    _savePosition(defaultPosition);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Toggle position reset to default'),
                        duration: Duration(seconds: 2),
                      ),
                    );
                  },
                  child: widget.snappy
                      ? Transform.scale(
                          scale: 1.03,
                          child: Opacity(
                            opacity: 0.95,
                            child: OnlineOfflineToggle(
                              variant: widget.variant,
                              mobileBottomOffset: false,
                            ),
                          ),
                        )
                      : AnimatedOpacity(
                          duration: const Duration(milliseconds: 150),
                          opacity: 0.85,
                          child: AnimatedScale(
                            duration: const Duration(milliseconds: 150),
                            scale: 1.05,
                            child: OnlineOfflineToggle(
                              variant: widget.variant,
                              mobileBottomOffset: false,
                            ),
                          ),
                        ),
                ),
              )
            else
              AnimatedPositioned(
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOut,
                left: validPosition.dx,
                top: validPosition.dy,
                child: GestureDetector(
                  onPanStart: (_) {
                    setState(() {
                      _isDragging = true;
                    });
                  },
                  onPanUpdate: (details) {
                    _updatePosition(_position + details.delta, screenSize);
                  },
                  onPanEnd: (_) {
                    setState(() {
                      _isDragging = false;
                    });
                    // Save once after drag ends
                    _savePosition(_position);
                  },
                  onDoubleTap: () {
                    final defaultPosition = _getDefaultPosition(screenSize);
                    setState(() {
                      _position = defaultPosition;
                    });
                    _savePosition(defaultPosition);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Toggle position reset to default'),
                        duration: Duration(seconds: 2),
                      ),
                    );
                  },
                  child: AnimatedOpacity(
                    duration: const Duration(milliseconds: 150),
                    opacity: 1.0,
                    child: AnimatedScale(
                      duration: const Duration(milliseconds: 150),
                      scale: 1.0,
                      child: OnlineOfflineToggle(
                        variant: widget.variant,
                        mobileBottomOffset: false,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
