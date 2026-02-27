import 'package:flutter/material.dart';

/// Signature status types
enum SignatureStatus { pending, signed, verified, expired, revoked, invalid }

/// Signature method types
enum SignatureMethod { uuid, phone, email, handwriting, biometric }

/// Configuration for signature status display
class _StatusConfig {
  final String label;
  final String labelAr;
  final Color color;
  final Color bgColor;
  final IconData icon;

  const _StatusConfig({
    required this.label,
    required this.labelAr,
    required this.color,
    required this.bgColor,
    required this.icon,
  });
}

/// Reusable badge widget for displaying signature verification status
class SignatureVerificationBadge extends StatelessWidget {
  final SignatureStatus status;
  final SignatureMethod? method;
  final String? signedAt;
  final String? verifiedAt;
  final String? signerName;
  final bool showDetails;
  final SignatureBadgeSize size;
  final bool isArabic;

  const SignatureVerificationBadge({
    super.key,
    required this.status,
    this.method,
    this.signedAt,
    this.verifiedAt,
    this.signerName,
    this.showDetails = false,
    this.size = SignatureBadgeSize.md,
    this.isArabic = false,
  });

  static final Map<SignatureStatus, _StatusConfig> _statusConfigs = {
    SignatureStatus.pending: _StatusConfig(
      label: 'Pending Signature',
      labelAr: 'في انتظار التوقيع',
      color: Colors.orange,
      bgColor: Colors.orange.withValues(alpha: 0.1),
      icon: Icons.schedule,
    ),
    SignatureStatus.signed: _StatusConfig(
      label: 'Signed',
      labelAr: 'موقّع',
      color: Colors.blue,
      bgColor: Colors.blue.withValues(alpha: 0.1),
      icon: Icons.edit,
    ),
    SignatureStatus.verified: _StatusConfig(
      label: 'Verified',
      labelAr: 'مُتحقق',
      color: Colors.green,
      bgColor: Colors.green.withValues(alpha: 0.1),
      icon: Icons.verified_user,
    ),
    SignatureStatus.expired: _StatusConfig(
      label: 'Expired',
      labelAr: 'منتهي الصلاحية',
      color: Colors.deepOrange,
      bgColor: Colors.deepOrange.withValues(alpha: 0.1),
      icon: Icons.timer_off,
    ),
    SignatureStatus.revoked: _StatusConfig(
      label: 'Revoked',
      labelAr: 'ملغى',
      color: Colors.red,
      bgColor: Colors.red.withValues(alpha: 0.1),
      icon: Icons.cancel,
    ),
    SignatureStatus.invalid: _StatusConfig(
      label: 'Invalid',
      labelAr: 'غير صالح',
      color: Colors.red,
      bgColor: Colors.red.withValues(alpha: 0.1),
      icon: Icons.error,
    ),
  };

  static final Map<SignatureMethod, IconData> _methodIcons = {
    SignatureMethod.uuid: Icons.shield,
    SignatureMethod.phone: Icons.phone,
    SignatureMethod.email: Icons.email,
    SignatureMethod.handwriting: Icons.edit,
    SignatureMethod.biometric: Icons.fingerprint,
  };

  static final Map<SignatureMethod, String> _methodLabels = {
    SignatureMethod.uuid: 'Quick Sign',
    SignatureMethod.phone: 'Phone OTP',
    SignatureMethod.email: 'Email OTP',
    SignatureMethod.handwriting: 'Handwriting',
    SignatureMethod.biometric: 'Biometric',
  };

  static final Map<SignatureMethod, String> _methodLabelsAr = {
    SignatureMethod.uuid: 'توقيع سريع',
    SignatureMethod.phone: 'رمز الهاتف',
    SignatureMethod.email: 'رمز البريد',
    SignatureMethod.handwriting: 'توقيع يدوي',
    SignatureMethod.biometric: 'بصمة',
  };

  double get _fontSize {
    switch (size) {
      case SignatureBadgeSize.sm:
        return 11;
      case SignatureBadgeSize.md:
        return 12;
      case SignatureBadgeSize.lg:
        return 14;
    }
  }

  double get _iconSize {
    switch (size) {
      case SignatureBadgeSize.sm:
        return 12;
      case SignatureBadgeSize.md:
        return 14;
      case SignatureBadgeSize.lg:
        return 18;
    }
  }

  EdgeInsets get _padding {
    switch (size) {
      case SignatureBadgeSize.sm:
        return const EdgeInsets.symmetric(horizontal: 6, vertical: 2);
      case SignatureBadgeSize.md:
        return const EdgeInsets.symmetric(horizontal: 8, vertical: 4);
      case SignatureBadgeSize.lg:
        return const EdgeInsets.symmetric(horizontal: 12, vertical: 6);
    }
  }

  String _formatDate(String dateStr) {
    try {
      final date = DateTime.parse(dateStr);
      return '${date.day}/${date.month}/${date.year} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
    } catch (e) {
      return dateStr;
    }
  }

  @override
  Widget build(BuildContext context) {
    final config = _statusConfigs[status]!;
    final label = isArabic ? config.labelAr : config.label;

    Widget badge = Container(
      padding: _padding,
      decoration: BoxDecoration(
        color: config.bgColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: config.color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(config.icon, size: _iconSize, color: config.color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: _fontSize,
              fontWeight: FontWeight.w500,
              color: config.color,
            ),
          ),
          if (method != null) ...[
            const SizedBox(width: 6),
            Icon(
              _methodIcons[method]!,
              size: _iconSize,
              color: config.color.withValues(alpha: 0.7),
            ),
          ],
        ],
      ),
    );

    if (!showDetails) return badge;

    return Tooltip(
      richMessage: TextSpan(
        children: [
          TextSpan(
            text: '$label\n',
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          if (signerName != null)
            TextSpan(
              text: '${isArabic ? 'الموقع:' : 'Signed by:'} $signerName\n',
            ),
          if (method != null)
            TextSpan(
              text:
                  '${isArabic ? 'الطريقة:' : 'Method:'} ${isArabic ? _methodLabelsAr[method]! : _methodLabels[method]!}\n',
            ),
          if (signedAt != null)
            TextSpan(
              text:
                  '${isArabic ? 'التوقيع:' : 'Signed:'} ${_formatDate(signedAt!)}\n',
            ),
          if (verifiedAt != null)
            TextSpan(
              text:
                  '${isArabic ? 'التحقق:' : 'Verified:'} ${_formatDate(verifiedAt!)}',
            ),
        ],
      ),
      child: badge,
    );
  }
}

/// Badge indicating signature is required
class SignatureRequiredBadge extends StatelessWidget {
  final SignatureBadgeSize size;
  final bool isArabic;

  const SignatureRequiredBadge({
    super.key,
    this.size = SignatureBadgeSize.sm,
    this.isArabic = false,
  });

  double get _fontSize {
    switch (size) {
      case SignatureBadgeSize.sm:
        return 10;
      case SignatureBadgeSize.md:
        return 11;
      case SignatureBadgeSize.lg:
        return 13;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: Colors.amber.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.amber.withValues(alpha: 0.5)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.edit, size: 12, color: Colors.amber[700]),
          const SizedBox(width: 4),
          Text(
            isArabic ? 'يتطلب توقيع' : 'Signature Required',
            style: TextStyle(
              fontSize: _fontSize,
              fontWeight: FontWeight.w500,
              color: Colors.amber[700],
            ),
          ),
        ],
      ),
    );
  }
}

enum SignatureBadgeSize { sm, md, lg }
