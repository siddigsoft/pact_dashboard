import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import 'signature_verification_badge.dart';

/// A single signature history item
class SignatureHistoryItem {
  final String id;
  final String type; // 'transaction' or 'document'
  final String title;
  final String? description;
  final SignatureMethod signatureMethod;
  final SignatureStatus status;
  final DateTime? signedAt;
  final DateTime? verifiedAt;
  final double? amount;
  final String? currency;
  final String? signerName;
  final String? documentType;

  const SignatureHistoryItem({
    required this.id,
    required this.type,
    required this.title,
    this.description,
    required this.signatureMethod,
    required this.status,
    this.signedAt,
    this.verifiedAt,
    this.amount,
    this.currency,
    this.signerName,
    this.documentType,
  });

  factory SignatureHistoryItem.fromJson(Map<String, dynamic> json) {
    return SignatureHistoryItem(
      id: json['id'] ?? '',
      type: json['type'] ?? 'document',
      title: json['title'] ?? '',
      description: json['description'],
      signatureMethod: SignatureMethod.values.firstWhere(
        (m) => m.name == (json['signature_method'] ?? 'uuid'),
        orElse: () => SignatureMethod.uuid,
      ),
      status: SignatureStatus.values.firstWhere(
        (s) => s.name == (json['status'] ?? 'pending'),
        orElse: () => SignatureStatus.pending,
      ),
      signedAt: json['signed_at'] != null
          ? DateTime.tryParse(json['signed_at'])
          : null,
      verifiedAt: json['verified_at'] != null
          ? DateTime.tryParse(json['verified_at'])
          : null,
      amount: json['amount']?.toDouble(),
      currency: json['currency'],
      signerName: json['signer_name'],
      documentType: json['document_type'],
    );
  }
}

/// Widget displaying a list of signature history items
class SignatureHistoryWidget extends StatefulWidget {
  final List<SignatureHistoryItem> signatures;
  final bool isLoading;
  final String title;
  final String description;
  final double maxHeight;
  final bool showViewAll;
  final bool isArabic;
  final VoidCallback? onViewAll;
  final Function(String id)? onViewSignature;
  final Future<void> Function()? onRefresh;

  const SignatureHistoryWidget({
    super.key,
    required this.signatures,
    this.isLoading = false,
    this.title = 'Signature History',
    this.description = 'Your recent digital signatures',
    this.maxHeight = 400,
    this.showViewAll = false,
    this.isArabic = false,
    this.onViewAll,
    this.onViewSignature,
    this.onRefresh,
  });

  @override
  State<SignatureHistoryWidget> createState() => _SignatureHistoryWidgetState();
}

class _SignatureHistoryWidgetState extends State<SignatureHistoryWidget> {
  String? _expandedId;

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  }

  String _formatAmount(double amount, String currency) {
    return '${amount.toStringAsFixed(2)} $currency';
  }

  Widget _buildSignatureCard(SignatureHistoryItem signature) {
    final isExpanded = _expandedId == signature.id;
    final isMonetary =
        signature.type == 'transaction' && signature.amount != null;

    final methodLabels = widget.isArabic
        ? {
            SignatureMethod.uuid: 'توقيع سريع',
            SignatureMethod.phone: 'رمز الهاتف',
            SignatureMethod.email: 'رمز البريد',
            SignatureMethod.handwriting: 'توقيع يدوي',
            SignatureMethod.biometric: 'بصمة',
          }
        : {
            SignatureMethod.uuid: 'Quick Sign',
            SignatureMethod.phone: 'Phone OTP',
            SignatureMethod.email: 'Email OTP',
            SignatureMethod.handwriting: 'Handwriting',
            SignatureMethod.biometric: 'Biometric',
          };

    final methodIcons = {
      SignatureMethod.uuid: Icons.shield,
      SignatureMethod.phone: Icons.phone,
      SignatureMethod.email: Icons.email,
      SignatureMethod.handwriting: Icons.edit,
      SignatureMethod.biometric: Icons.fingerprint,
    };

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: isExpanded
              ? AppColors.primaryBlue.withValues(alpha: 0.3)
              : Colors.transparent,
        ),
      ),
      color: isExpanded ? AppColors.primaryBlue.withValues(alpha: 0.05) : null,
      child: InkWell(
        onTap: () {
          setState(() {
            _expandedId = isExpanded ? null : signature.id;
          });
        },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header Row
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Icon
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: signature.status == SignatureStatus.verified
                          ? Colors.green.withValues(alpha: 0.1)
                          : signature.status == SignatureStatus.signed
                          ? Colors.blue.withValues(alpha: 0.1)
                          : Colors.grey.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(
                      isMonetary ? Icons.attach_money : Icons.description,
                      size: 20,
                      color: signature.status == SignatureStatus.verified
                          ? Colors.green
                          : signature.status == SignatureStatus.signed
                          ? Colors.blue
                          : Colors.grey,
                    ),
                  ),
                  const SizedBox(width: 12),

                  // Content
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                signature.title,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w500,
                                  fontSize: 14,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const SizedBox(width: 8),
                            SignatureVerificationBadge(
                              status: signature.status,
                              method: signature.signatureMethod,
                              size: SignatureBadgeSize.sm,
                              isArabic: widget.isArabic,
                            ),
                          ],
                        ),

                        if (isMonetary &&
                            signature.amount != null &&
                            signature.currency != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(
                              _formatAmount(
                                signature.amount!,
                                signature.currency!,
                              ),
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.bold,
                                color: Colors.green[600],
                              ),
                            ),
                          ),

                        if (signature.signedAt != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Row(
                              children: [
                                Icon(
                                  Icons.schedule,
                                  size: 12,
                                  color: Colors.grey[500],
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  _formatDate(signature.signedAt!),
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: Colors.grey[500],
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),

                  // Expand Icon
                  Icon(
                    isExpanded
                        ? Icons.keyboard_arrow_up
                        : Icons.keyboard_arrow_down,
                    color: Colors.grey,
                  ),
                ],
              ),

              // Expanded Content
              if (isExpanded) ...[
                const Divider(height: 24),

                if (signature.description != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      signature.description!,
                      style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                    ),
                  ),

                Wrap(
                  spacing: 16,
                  runSpacing: 8,
                  children: [
                    // Method
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          methodIcons[signature.signatureMethod],
                          size: 16,
                          color: Colors.grey[600],
                        ),
                        const SizedBox(width: 4),
                        Text(
                          methodLabels[signature.signatureMethod]!,
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey[600],
                          ),
                        ),
                      ],
                    ),

                    // Signer
                    if (signature.signerName != null)
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            widget.isArabic ? 'بواسطة:' : 'By:',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey[500],
                            ),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            signature.signerName!,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),

                    // Document Type
                    if (signature.documentType != null)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.grey.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          signature.documentType!.replaceAll('_', ' '),
                          style: const TextStyle(fontSize: 11),
                        ),
                      ),
                  ],
                ),

                if (signature.verifiedAt != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Row(
                      children: [
                        Icon(
                          Icons.verified,
                          size: 16,
                          color: Colors.green[600],
                        ),
                        const SizedBox(width: 4),
                        Text(
                          '${widget.isArabic ? 'تم التحقق:' : 'Verified:'} ${_formatDate(signature.verifiedAt!)}',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.green[600],
                          ),
                        ),
                      ],
                    ),
                  ),

                if (widget.onViewSignature != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: OutlinedButton.icon(
                      onPressed: () => widget.onViewSignature!(signature.id),
                      icon: const Icon(Icons.open_in_new, size: 16),
                      label: Text(
                        widget.isArabic ? 'عرض التفاصيل' : 'View Details',
                      ),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                        textStyle: const TextStyle(fontSize: 12),
                      ),
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final labels = widget.isArabic
        ? {
            'title': 'سجل التوقيعات',
            'description': 'توقيعاتك الرقمية الأخيرة',
            'empty': 'لا توجد توقيعات بعد',
            'emptyDesc': 'ستظهر المستندات الموقعة هنا',
            'viewAll': 'عرض الكل',
          }
        : {
            'title': widget.title,
            'description': widget.description,
            'empty': 'No signatures yet',
            'emptyDesc': 'Your signed documents will appear here',
            'viewAll': 'View All',
          };

    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          Icons.history,
                          color: AppColors.primaryBlue,
                          size: 20,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          labels['title']!,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      labels['description']!,
                      style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                    ),
                  ],
                ),
                if (widget.showViewAll &&
                    widget.onViewAll != null &&
                    widget.signatures.isNotEmpty)
                  TextButton(
                    onPressed: widget.onViewAll,
                    child: Text(labels['viewAll']!),
                  ),
              ],
            ),
          ),

          const Divider(height: 1),

          // Content
          if (widget.isLoading)
            Padding(
              padding: const EdgeInsets.all(24),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.primaryBlue),
              ),
            )
          else if (widget.signatures.isEmpty)
            Padding(
              padding: const EdgeInsets.all(32),
              child: Center(
                child: Column(
                  children: [
                    Icon(
                      Icons.edit_off,
                      size: 48,
                      color: Colors.grey.withValues(alpha: 0.3),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      labels['empty']!,
                      style: const TextStyle(fontWeight: FontWeight.w500),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      labels['emptyDesc']!,
                      style: TextStyle(fontSize: 13, color: Colors.grey[500]),
                    ),
                  ],
                ),
              ),
            )
          else
            ConstrainedBox(
              constraints: BoxConstraints(maxHeight: widget.maxHeight),
              child: widget.onRefresh != null
                  ? RefreshIndicator(
                      onRefresh: widget.onRefresh!,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(12),
                        itemCount: widget.signatures.length,
                        itemBuilder: (context, index) {
                          return _buildSignatureCard(widget.signatures[index]);
                        },
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(12),
                      itemCount: widget.signatures.length,
                      itemBuilder: (context, index) {
                        return _buildSignatureCard(widget.signatures[index]);
                      },
                    ),
            ),
        ],
      ),
    );
  }
}
