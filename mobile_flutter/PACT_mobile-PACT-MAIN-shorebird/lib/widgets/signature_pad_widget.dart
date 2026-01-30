import 'package:flutter/material.dart';
import 'dart:ui' as ui;
import 'dart:typed_data';
import 'dart:convert';
import '../theme/app_colors.dart';

/// Reusable signature pad widget for drawing handwriting signatures
class SignaturePadWidget extends StatefulWidget {
  final double? width;
  final double? height;
  final Color strokeColor;
  final double strokeWidth;
  final Color backgroundColor;
  final bool showControls;
  final String placeholder;
  final bool isArabic;
  final Function(String signatureData, int strokeCount)? onSignatureCapture;
  final VoidCallback? onClear;

  const SignaturePadWidget({
    super.key,
    this.width,
    this.height,
    this.strokeColor = const Color(0xFF1a1a2e),
    this.strokeWidth = 2.5,
    this.backgroundColor = Colors.white,
    this.showControls = true,
    this.placeholder = 'Draw your signature here',
    this.isArabic = false,
    this.onSignatureCapture,
    this.onClear,
  });

  @override
  State<SignaturePadWidget> createState() => _SignaturePadWidgetState();
}

class _SignaturePadWidgetState extends State<SignaturePadWidget> {
  final List<List<Offset>> _strokes = [];
  List<Offset> _currentStroke = [];
  bool _hasSignature = false;
  final GlobalKey _canvasKey = GlobalKey();

  void _startStroke(Offset point) {
    setState(() {
      _currentStroke = [point];
      _hasSignature = true;
    });
  }

  void _continueStroke(Offset point) {
    setState(() {
      _currentStroke.add(point);
    });
  }

  void _endStroke() {
    if (_currentStroke.isNotEmpty) {
      setState(() {
        _strokes.add(List.from(_currentStroke));
        _currentStroke = [];
      });
    }
  }

  void _clearSignature() {
    setState(() {
      _strokes.clear();
      _currentStroke.clear();
      _hasSignature = false;
    });
    widget.onClear?.call();
  }

  Future<void> _captureSignature() async {
    if (!_hasSignature || _strokes.isEmpty) return;

    try {
      final RenderBox? renderBox = _canvasKey.currentContext?.findRenderObject() as RenderBox?;
      if (renderBox == null) return;

      final size = renderBox.size;
      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder);

      // Draw background
      canvas.drawRect(
        Rect.fromLTWH(0, 0, size.width, size.height),
        Paint()..color = widget.backgroundColor,
      );

      // Draw strokes
      final paint = Paint()
        ..color = widget.strokeColor
        ..strokeWidth = widget.strokeWidth
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..style = PaintingStyle.stroke;

      for (final stroke in _strokes) {
        if (stroke.length < 2) continue;
        final path = Path();
        path.moveTo(stroke.first.dx, stroke.first.dy);
        for (int i = 1; i < stroke.length; i++) {
          path.lineTo(stroke[i].dx, stroke[i].dy);
        }
        canvas.drawPath(path, paint);
      }

      final picture = recorder.endRecording();
      final img = await picture.toImage(size.width.toInt(), size.height.toInt());
      final byteData = await img.toByteData(format: ui.ImageByteFormat.png);
      
      if (byteData != null) {
        final base64String = base64Encode(byteData.buffer.asUint8List());
        widget.onSignatureCapture?.call('data:image/png;base64,$base64String', _strokes.length);
      }
    } catch (e) {
      debugPrint('Error capturing signature: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final labels = widget.isArabic
        ? {'clear': 'مسح', 'confirm': 'تأكيد التوقيع', 'strokes': 'ضربات'}
        : {'clear': 'Clear', 'confirm': 'Confirm Signature', 'strokes': 'strokes'};

    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Icon(Icons.edit, color: AppColors.primaryBlue, size: 20),
                    const SizedBox(width: 8),
                    Text(
                      widget.isArabic ? 'التوقيع الرقمي' : 'Digital Signature',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
                if (_hasSignature && _strokes.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.primaryBlue.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.check, size: 14, color: AppColors.primaryBlue),
                        const SizedBox(width: 4),
                        Text(
                          '${_strokes.length} ${labels['strokes']}',
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.primaryBlue,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              widget.placeholder,
              style: TextStyle(
                fontSize: 13,
                color: Colors.grey[600],
              ),
            ),
            const SizedBox(height: 12),

            // Signature Canvas
            Container(
              key: _canvasKey,
              width: widget.width ?? double.infinity,
              height: widget.height ?? 150,
              decoration: BoxDecoration(
                color: widget.backgroundColor,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: _hasSignature 
                      ? AppColors.primaryBlue.withOpacity(0.5)
                      : Colors.grey.withOpacity(0.3),
                  width: 2,
                  style: BorderStyle.solid,
                ),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: GestureDetector(
                  onPanStart: (details) => _startStroke(details.localPosition),
                  onPanUpdate: (details) => _continueStroke(details.localPosition),
                  onPanEnd: (_) => _endStroke(),
                  child: CustomPaint(
                    painter: _SignaturePainter(
                      strokes: _strokes,
                      currentStroke: _currentStroke,
                      strokeColor: widget.strokeColor,
                      strokeWidth: widget.strokeWidth,
                    ),
                    child: !_hasSignature
                        ? Center(
                            child: Text(
                              widget.isArabic ? 'وقّع هنا' : 'Sign here',
                              style: TextStyle(
                                color: Colors.grey.withOpacity(0.4),
                                fontSize: 14,
                              ),
                            ),
                          )
                        : null,
                  ),
                ),
              ),
            ),

            // Controls
            if (widget.showControls) ...[
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  OutlinedButton.icon(
                    onPressed: _hasSignature ? _clearSignature : null,
                    icon: const Icon(Icons.cleaning_services, size: 18),
                    label: Text(labels['clear']!),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.grey[700],
                    ),
                  ),
                  ElevatedButton.icon(
                    onPressed: _hasSignature ? _captureSignature : null,
                    icon: const Icon(Icons.check, size: 18),
                    label: Text(labels['confirm']!),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primaryBlue,
                      foregroundColor: Colors.white,
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _SignaturePainter extends CustomPainter {
  final List<List<Offset>> strokes;
  final List<Offset> currentStroke;
  final Color strokeColor;
  final double strokeWidth;

  _SignaturePainter({
    required this.strokes,
    required this.currentStroke,
    required this.strokeColor,
    required this.strokeWidth,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = strokeColor
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;

    // Draw completed strokes
    for (final stroke in strokes) {
      if (stroke.length < 2) continue;
      final path = Path();
      path.moveTo(stroke.first.dx, stroke.first.dy);
      for (int i = 1; i < stroke.length; i++) {
        path.lineTo(stroke[i].dx, stroke[i].dy);
      }
      canvas.drawPath(path, paint);
    }

    // Draw current stroke
    if (currentStroke.length >= 2) {
      final path = Path();
      path.moveTo(currentStroke.first.dx, currentStroke.first.dy);
      for (int i = 1; i < currentStroke.length; i++) {
        path.lineTo(currentStroke[i].dx, currentStroke[i].dy);
      }
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _SignaturePainter oldDelegate) {
    return strokes != oldDelegate.strokes || currentStroke != oldDelegate.currentStroke;
  }
}