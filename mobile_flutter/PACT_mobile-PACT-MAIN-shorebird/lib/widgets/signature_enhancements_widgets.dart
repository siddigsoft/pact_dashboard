import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class TypedSignatureWidget extends StatefulWidget {
  final Function(String name, String font) onGenerate;
  final List<String> availableFonts;
  final String locale;

  const TypedSignatureWidget({
    super.key,
    required this.onGenerate,
    required this.availableFonts,
    this.locale = 'en',
  });

  @override
  State<TypedSignatureWidget> createState() => _TypedSignatureWidgetState();
}

class _TypedSignatureWidgetState extends State<TypedSignatureWidget> {
  final TextEditingController _nameController = TextEditingController();
  String _selectedFont = 'Dancing Script';

  @override
  void initState() {
    super.initState();
    if (widget.availableFonts.isNotEmpty) {
      _selectedFont = widget.availableFonts.first;
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = widget.locale == 'ar';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          isArabic ? 'أدخل اسمك' : 'Enter your name',
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _nameController,
          decoration: InputDecoration(
            hintText: isArabic ? 'اسمك الكامل' : 'Your full name',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 12,
              vertical: 12,
            ),
          ),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 16),
        Text(
          isArabic ? 'اختر نمط الخط' : 'Choose font style',
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 50,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            itemCount: widget.availableFonts.length,
            itemBuilder: (context, index) {
              final font = widget.availableFonts[index];
              final isSelected = font == _selectedFont;

              return GestureDetector(
                onTap: () => setState(() => _selectedFont = font),
                child: Container(
                  margin: const EdgeInsets.only(right: 8),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: isSelected
                        ? AppColors.primaryBlue
                        : Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: isSelected
                          ? AppColors.primaryBlue
                          : Colors.grey.shade300,
                    ),
                  ),
                  child: Center(
                    child: Text(
                      'Aa',
                      style: TextStyle(
                        fontFamily: font,
                        fontSize: 20,
                        color: isSelected ? Colors.white : Colors.black,
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 16),
        if (_nameController.text.isNotEmpty) ...[
          Text(
            isArabic ? 'معاينة' : 'Preview',
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
          ),
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.grey.shade300),
            ),
            child: Center(
              child: Text(
                _nameController.text,
                style: TextStyle(
                  fontFamily: _selectedFont,
                  fontSize: 32,
                  color: Colors.black,
                ),
              ),
            ),
          ),
        ],
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _nameController.text.isEmpty
                ? null
                : () => widget.onGenerate(_nameController.text, _selectedFont),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryBlue,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            child: Text(
              isArabic ? 'إنشاء التوقيع' : 'Generate Signature',
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class InitialsSignatureWidget extends StatefulWidget {
  final Function(String initials, bool circular) onGenerate;
  final String locale;

  const InitialsSignatureWidget({
    super.key,
    required this.onGenerate,
    this.locale = 'en',
  });

  @override
  State<InitialsSignatureWidget> createState() =>
      _InitialsSignatureWidgetState();
}

class _InitialsSignatureWidgetState extends State<InitialsSignatureWidget> {
  final TextEditingController _initialsController = TextEditingController();
  bool _isCircular = true;

  @override
  void dispose() {
    _initialsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = widget.locale == 'ar';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          isArabic ? 'أدخل الأحرف الأولى' : 'Enter your initials',
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _initialsController,
          maxLength: 3,
          textCapitalization: TextCapitalization.characters,
          decoration: InputDecoration(
            hintText: isArabic ? 'مثال: م.أ' : 'e.g., JD',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 12,
              vertical: 12,
            ),
            counterText: '',
          ),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Text(
              isArabic ? 'شكل دائري' : 'Circular shape',
              style: const TextStyle(fontSize: 14),
            ),
            const Spacer(),
            Switch(
              value: _isCircular,
              onChanged: (value) => setState(() => _isCircular = value),
              thumbColor: WidgetStateProperty.resolveWith((states) => states.contains(WidgetState.selected) ? AppColors.primaryBlue : null),
            ),
          ],
        ),
        const SizedBox(height: 16),
        if (_initialsController.text.isNotEmpty) ...[
          Center(
            child: Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: Colors.white,
                shape: _isCircular ? BoxShape.circle : BoxShape.rectangle,
                borderRadius: _isCircular ? null : BorderRadius.circular(8),
                border: Border.all(color: Colors.black, width: 2),
              ),
              child: Center(
                child: Text(
                  _initialsController.text.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: Colors.black,
                  ),
                ),
              ),
            ),
          ),
        ],
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _initialsController.text.isEmpty
                ? null
                : () =>
                      widget.onGenerate(_initialsController.text, _isCircular),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryBlue,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            child: Text(
              isArabic ? 'إنشاء الأحرف الأولى' : 'Generate Initials',
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class SignatureVerificationBadge extends StatelessWidget {
  final bool isVerified;
  final String signerName;
  final DateTime signedAt;
  final String locale;

  const SignatureVerificationBadge({
    super.key,
    required this.isVerified,
    required this.signerName,
    required this.signedAt,
    this.locale = 'en',
  });

  @override
  Widget build(BuildContext context) {
    final isArabic = locale == 'ar';

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isVerified ? Colors.green.shade50 : Colors.red.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: isVerified ? Colors.green : Colors.red),
      ),
      child: Row(
        children: [
          Icon(
            isVerified ? Icons.verified : Icons.warning,
            color: isVerified ? Colors.green : Colors.red,
            size: 24,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isVerified
                      ? (isArabic ? 'توقيع موثق' : 'Verified Signature')
                      : (isArabic ? 'توقيع غير موثق' : 'Unverified Signature'),
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: isVerified
                        ? Colors.green.shade700
                        : Colors.red.shade700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  isArabic ? 'بواسطة $signerName' : 'By $signerName',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                ),
                Text(
                  _formatDate(signedAt, isArabic),
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(DateTime date, bool isArabic) {
    final day = date.day.toString().padLeft(2, '0');
    final month = date.month.toString().padLeft(2, '0');
    final year = date.year.toString();
    final hour = date.hour.toString().padLeft(2, '0');
    final minute = date.minute.toString().padLeft(2, '0');

    return '$day/$month/$year $hour:$minute';
  }
}

class BatchSigningProgress extends StatelessWidget {
  final int total;
  final int completed;
  final int failed;
  final String locale;

  const BatchSigningProgress({
    super.key,
    required this.total,
    required this.completed,
    this.failed = 0,
    this.locale = 'en',
  });

  @override
  Widget build(BuildContext context) {
    final isArabic = locale == 'ar';
    final progress = total > 0 ? (completed + failed) / total : 0.0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              isArabic ? 'تقدم التوقيع' : 'Signing Progress',
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
            ),
            Text(
              '${completed + failed}/$total',
              style: TextStyle(fontSize: 14, color: Colors.grey.shade600),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: progress,
            backgroundColor: Colors.grey.shade200,
            valueColor: AlwaysStoppedAnimation<Color>(
              failed > 0 ? Colors.orange : AppColors.primaryBlue,
            ),
            minHeight: 8,
          ),
        ),
        if (failed > 0) ...[
          const SizedBox(height: 8),
          Text(
            isArabic
                ? '$failed من $total فشل التوقيع'
                : '$failed of $total failed to sign',
            style: TextStyle(fontSize: 12, color: Colors.red.shade600),
          ),
        ],
      ],
    );
  }
}

class SignaturePlacementWidget extends StatefulWidget {
  final Uint8List signatureImage;
  final double containerWidth;
  final double containerHeight;
  final Function(double x, double y, double width, double height) onPlaced;

  const SignaturePlacementWidget({
    super.key,
    required this.signatureImage,
    required this.containerWidth,
    required this.containerHeight,
    required this.onPlaced,
  });

  @override
  State<SignaturePlacementWidget> createState() =>
      _SignaturePlacementWidgetState();
}

class _SignaturePlacementWidgetState extends State<SignaturePlacementWidget> {
  double _x = 50;
  double _y = 50;
  double _width = 150;
  double _height = 50;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Container(
          width: widget.containerWidth,
          height: widget.containerHeight,
          color: Colors.grey.shade100,
        ),
        Positioned(
          left: _x,
          top: _y,
          child: GestureDetector(
            onPanUpdate: (details) {
              setState(() {
                _x = (_x + details.delta.dx).clamp(
                  0,
                  widget.containerWidth - _width,
                );
                _y = (_y + details.delta.dy).clamp(
                  0,
                  widget.containerHeight - _height,
                );
              });
            },
            onPanEnd: (_) {
              widget.onPlaced(_x, _y, _width, _height);
            },
            child: Container(
              width: _width,
              height: _height,
              decoration: BoxDecoration(
                border: Border.all(color: AppColors.primaryBlue, width: 2),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Image.memory(widget.signatureImage, fit: BoxFit.contain),
            ),
          ),
        ),
        Positioned(
          left: _x + _width - 12,
          top: _y + _height - 12,
          child: GestureDetector(
            onPanUpdate: (details) {
              setState(() {
                _width = (_width + details.delta.dx).clamp(50, 300);
                _height = (_height + details.delta.dy).clamp(20, 100);
              });
            },
            child: Container(
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                color: AppColors.primaryBlue,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.open_in_full,
                color: Colors.white,
                size: 14,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
