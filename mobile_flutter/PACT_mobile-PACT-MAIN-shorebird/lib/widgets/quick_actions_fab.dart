// lib/widgets/quick_actions_fab.dart

import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

class QuickAction {
  final String labelEn;
  final String labelAr;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const QuickAction({
    required this.labelEn,
    required this.labelAr,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  String getLabel(bool isArabic) => isArabic ? labelAr : labelEn;
}

class QuickActionsFAB extends StatefulWidget {
  final List<QuickAction> actions;
  final bool isArabic;
  final Color? mainColor;
  final IconData? mainIcon;

  const QuickActionsFAB({
    super.key,
    required this.actions,
    this.isArabic = false,
    this.mainColor,
    this.mainIcon,
  });

  @override
  State<QuickActionsFAB> createState() => _QuickActionsFABState();
}

class _QuickActionsFABState extends State<QuickActionsFAB>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _expandAnimation;
  bool _isExpanded = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 250),
    );
    _expandAnimation = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOut,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _toggle() {
    HapticFeedback.lightImpact();
    setState(() {
      _isExpanded = !_isExpanded;
      if (_isExpanded) {
        _controller.forward();
      } else {
        _controller.reverse();
      }
    });
  }

  void _onActionTap(QuickAction action) {
    _toggle();
    action.onTap();
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: widget.isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
      child: Stack(
        alignment: widget.isArabic ? Alignment.bottomLeft : Alignment.bottomRight,
        children: [
        if (_isExpanded)
          GestureDetector(
            onTap: _toggle,
            child: Container(
              color: Colors.black.withOpacity(0.3),
            ),
          ),
        Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment:
              widget.isArabic ? CrossAxisAlignment.start : CrossAxisAlignment.end,
          children: [
            ..._buildActionButtons(),
            const SizedBox(height: 8),
            _buildMainFAB(),
          ],
        ),
        ],
      ),
    );
  }

  List<Widget> _buildActionButtons() {
    return List.generate(widget.actions.length, (index) {
      final action = widget.actions[index];
      final reversedIndex = widget.actions.length - 1 - index;

      return AnimatedBuilder(
        animation: _expandAnimation,
        builder: (context, child) {
          final delay = reversedIndex / widget.actions.length;
          final progress = (_expandAnimation.value - delay).clamp(0.0, 1.0) / (1 - delay);

          return Opacity(
            opacity: progress,
            child: Transform.translate(
              offset: Offset(0, 20 * (1 - progress)),
              child: child,
            ),
          );
        },
        child: Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (!widget.isArabic) _buildLabel(action),
              const SizedBox(width: 8),
              _buildActionButton(action),
              if (widget.isArabic) ...[
                const SizedBox(width: 8),
                _buildLabel(action),
              ],
            ],
          ),
        ),
      );
    });
  }

  Widget _buildLabel(QuickAction action) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 8,
          ),
        ],
      ),
      child: Text(
        action.getLabel(widget.isArabic),
        style: GoogleFonts.poppins(
          fontSize: 13,
          fontWeight: FontWeight.w500,
          color: Colors.grey.shade800,
        ),
      ),
    );
  }

  Widget _buildActionButton(QuickAction action) {
    return GestureDetector(
      onTap: () => _onActionTap(action),
      child: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: action.color,
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: action.color.withOpacity(0.3),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Icon(
          action.icon,
          color: Colors.white,
          size: 22,
        ),
      ),
    );
  }

  Widget _buildMainFAB() {
    return GestureDetector(
      onTap: _toggle,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: 56,
        height: 56,
        decoration: BoxDecoration(
          color: widget.mainColor ?? AppColors.primaryOrange,
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: (widget.mainColor ?? AppColors.primaryOrange).withOpacity(0.3),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: AnimatedRotation(
          turns: _isExpanded ? 0.125 : 0,
          duration: const Duration(milliseconds: 200),
          child: Icon(
            _isExpanded ? Icons.close : (widget.mainIcon ?? Icons.add),
            color: Colors.white,
            size: 28,
          ),
        ),
      ),
    );
  }
}

class DataCollectorQuickActions extends StatelessWidget {
  final bool isArabic;
  final VoidCallback onStartVisit;
  final VoidCallback onTakePhoto;
  final VoidCallback onRecordAudio;
  final VoidCallback onViewMap;

  const DataCollectorQuickActions({
    super.key,
    this.isArabic = false,
    required this.onStartVisit,
    required this.onTakePhoto,
    required this.onRecordAudio,
    required this.onViewMap,
  });

  @override
  Widget build(BuildContext context) {
    return QuickActionsFAB(
      isArabic: isArabic,
      mainColor: AppColors.primaryOrange,
      actions: [
        QuickAction(
          labelEn: 'Start Visit',
          labelAr: 'بدء الزيارة',
          icon: Icons.play_circle_outline,
          color: Colors.green,
          onTap: onStartVisit,
        ),
        QuickAction(
          labelEn: 'Take Photo',
          labelAr: 'التقط صورة',
          icon: Icons.camera_alt,
          color: AppColors.primaryBlue,
          onTap: onTakePhoto,
        ),
        QuickAction(
          labelEn: 'Record Audio',
          labelAr: 'تسجيل صوتي',
          icon: Icons.mic,
          color: Colors.purple,
          onTap: onRecordAudio,
        ),
        QuickAction(
          labelEn: 'View Map',
          labelAr: 'عرض الخريطة',
          icon: Icons.map,
          color: AppColors.primaryOrange,
          onTap: onViewMap,
        ),
      ],
    );
  }
}
