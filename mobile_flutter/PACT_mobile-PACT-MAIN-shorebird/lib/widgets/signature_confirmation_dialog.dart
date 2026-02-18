import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_colors.dart';
import 'signature_pad_widget.dart';
import 'signature_verification_badge.dart';

/// Transaction details for signature confirmation
class TransactionDetails {
  final String id;
  final String type;
  final String title;
  final String? description;
  final double amount;
  final String currency;
  final String? counterparty;
  final String? date;
  final String? reference;

  const TransactionDetails({
    required this.id,
    required this.type,
    required this.title,
    this.description,
    required this.amount,
    required this.currency,
    this.counterparty,
    this.date,
    this.reference,
  });
}

/// Result returned when signature is completed
class SignatureResult {
  final String signatureId;
  final String signatureHash;
  final SignatureMethod method;
  final DateTime signedAt;

  SignatureResult({
    required this.signatureId,
    required this.signatureHash,
    required this.method,
    required this.signedAt,
  });
}

/// Dialog for confirming transactions with digital signature
class SignatureConfirmationDialog extends StatefulWidget {
  final TransactionDetails transaction;
  final String userId;
  final String userName;
  final String? userEmail;
  final String? userPhone;
  final String? userRole;
  final List<SignatureMethod> allowedMethods;
  final bool isArabic;
  final Future<SignatureResult> Function(
    SignatureMethod method,
    String? signatureData,
    String? otpCode,
  )
  onSign;

  const SignatureConfirmationDialog({
    super.key,
    required this.transaction,
    required this.userId,
    required this.userName,
    this.userEmail,
    this.userPhone,
    this.userRole,
    this.allowedMethods = const [
      SignatureMethod.uuid,
      SignatureMethod.handwriting,
    ],
    this.isArabic = false,
    required this.onSign,
  });

  @override
  State<SignatureConfirmationDialog> createState() =>
      _SignatureConfirmationDialogState();
}

class _SignatureConfirmationDialogState
    extends State<SignatureConfirmationDialog>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  SignatureMethod _selectedMethod = SignatureMethod.uuid;
  String? _signatureData;
  String _otpCode = '';
  bool _otpSent = false;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _selectedMethod = widget.allowedMethods.first;
    _tabController = TabController(
      length: widget.allowedMethods.length,
      vsync: this,
    );
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) {
        setState(() {
          _selectedMethod = widget.allowedMethods[_tabController.index];
        });
      }
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  String _formatAmount(double amount, String currency) {
    return '${amount.toStringAsFixed(2)} $currency';
  }

  Future<void> _sendOtp() async {
    setState(() => _isSubmitting = true);
    await Future.delayed(const Duration(seconds: 1));
    setState(() {
      _otpSent = true;
      _isSubmitting = false;
    });
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.isArabic ? 'تم إرسال رمز التحقق' : 'Verification code sent',
          ),
        ),
      );
    }
  }

  Future<void> _submitSignature() async {
    if (_selectedMethod == SignatureMethod.handwriting &&
        _signatureData == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.isArabic ? 'يرجى رسم توقيعك' : 'Please draw your signature',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if ((_selectedMethod == SignatureMethod.email ||
            _selectedMethod == SignatureMethod.phone) &&
        _otpCode.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.isArabic
                ? 'يرجى إدخال رمز التحقق'
                : 'Please enter verification code',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      final result = await widget.onSign(
        _selectedMethod,
        _signatureData,
        _otpCode.isNotEmpty ? _otpCode : null,
      );
      if (mounted) {
        Navigator.of(context).pop(result);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.isArabic
                  ? 'فشل التوقيع: ${e.toString()}'
                  : 'Signature failed: ${e.toString()}',
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  Widget _buildMethodTab(SignatureMethod method) {
    final labels = {
      SignatureMethod.uuid: widget.isArabic ? 'توقيع سريع' : 'Quick Sign',
      SignatureMethod.handwriting: widget.isArabic ? 'رسم التوقيع' : 'Draw',
      SignatureMethod.email: widget.isArabic ? 'رمز البريد' : 'Email',
      SignatureMethod.phone: widget.isArabic ? 'رمز الهاتف' : 'Phone',
      SignatureMethod.biometric: widget.isArabic ? 'بصمة' : 'Biometric',
    };

    final icons = {
      SignatureMethod.uuid: Icons.shield,
      SignatureMethod.handwriting: Icons.edit,
      SignatureMethod.email: Icons.email,
      SignatureMethod.phone: Icons.phone,
      SignatureMethod.biometric: Icons.fingerprint,
    };

    return Tab(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icons[method], size: 16),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              labels[method]!,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMethodContent(SignatureMethod method) {
    switch (method) {
      case SignatureMethod.uuid:
        return _buildQuickSignContent();
      case SignatureMethod.handwriting:
        return _buildHandwritingContent();
      case SignatureMethod.email:
        return _buildOtpContent(true);
      case SignatureMethod.phone:
        return _buildOtpContent(false);
      case SignatureMethod.biometric:
        return _buildBiometricContent();
    }
  }

  Widget _buildQuickSignContent() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.blue.withOpacity(0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.blue.withOpacity(0.2)),
      ),
      child: Row(
        children: [
          Icon(Icons.shield, color: AppColors.primaryBlue, size: 24),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              widget.isArabic
                  ? 'انقر "توقيع وتأكيد" للتوقيع فوراً باستخدام بيانات حسابك الآمنة'
                  : 'Click "Sign & Confirm" to instantly sign with your secure account credentials.',
              style: TextStyle(fontSize: 13, color: Colors.grey[700]),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHandwritingContent() {
    return SignaturePadWidget(
      height: 120,
      isArabic: widget.isArabic,
      showControls: true,
      onSignatureCapture: (data, count) {
        setState(() => _signatureData = data);
      },
      onClear: () {
        setState(() => _signatureData = null);
      },
    );
  }

  Widget _buildOtpContent(bool isEmail) {
    final destination = isEmail ? widget.userEmail : widget.userPhone;

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.purple.withOpacity(0.05),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.purple.withOpacity(0.2)),
          ),
          child: Row(
            children: [
              Icon(
                isEmail ? Icons.email : Icons.phone,
                color: Colors.purple,
                size: 20,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: RichText(
                  text: TextSpan(
                    style: TextStyle(fontSize: 13, color: Colors.grey[700]),
                    children: [
                      TextSpan(
                        text: widget.isArabic
                            ? 'سنرسل رمز التحقق إلى: '
                            : 'We\'ll send a verification code to: ',
                      ),
                      TextSpan(
                        text: destination ?? 'N/A',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (!_otpSent)
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _isSubmitting ? null : _sendOtp,
              icon: _isSubmitting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(isEmail ? Icons.email : Icons.phone),
              label: Text(
                widget.isArabic ? 'إرسال رمز التحقق' : 'Send Verification Code',
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryBlue,
                foregroundColor: Colors.white,
              ),
            ),
          )
        else
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.isArabic ? 'أدخل رمز التحقق' : 'Enter Verification Code',
                style: const TextStyle(
                  fontWeight: FontWeight.w500,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                onChanged: (value) => setState(() => _otpCode = value),
                keyboardType: TextInputType.number,
                maxLength: 6,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 24,
                  letterSpacing: 8,
                  fontWeight: FontWeight.bold,
                ),
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: InputDecoration(
                  hintText: '000000',
                  counterText: '',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
            ],
          ),
      ],
    );
  }

  Widget _buildBiometricContent() {
    return Container(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          Icon(Icons.fingerprint, size: 64, color: AppColors.primaryBlue),
          const SizedBox(height: 16),
          Text(
            widget.isArabic
                ? 'ضع إصبعك على حساس البصمة'
                : 'Place your finger on the fingerprint sensor',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14, color: Colors.grey[600]),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final transaction = widget.transaction;

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400, maxHeight: 600),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.primaryBlue,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(16),
                  topRight: Radius.circular(16),
                ),
              ),
              child: Row(
                children: [
                  const Icon(Icons.shield, color: Colors.white),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.isArabic
                              ? 'تأكيد الاستلام بالتوقيع'
                              : 'Confirm Receipt with Signature',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                        Text(
                          widget.isArabic
                              ? 'راجع ووقّع لتأكيد هذه المعاملة'
                              : 'Review and sign to confirm this transaction',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.white.withOpacity(0.8),
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),

            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Transaction Summary
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.grey.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Row(
                                children: [
                                  Icon(
                                    Icons.description,
                                    size: 16,
                                    color: Colors.grey[600],
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    transaction.title,
                                    style: TextStyle(
                                      fontSize: 13,
                                      color: Colors.grey[600],
                                    ),
                                  ),
                                ],
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: AppColors.primaryBlue.withOpacity(0.1),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  transaction.type,
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: AppColors.primaryBlue,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const Divider(height: 16),
                          Row(
                            children: [
                              Icon(
                                Icons.attach_money,
                                size: 20,
                                color: Colors.green[600],
                              ),
                              const SizedBox(width: 8),
                              Text(
                                _formatAmount(
                                  transaction.amount,
                                  transaction.currency,
                                ),
                                style: TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.green[600],
                                ),
                              ),
                            ],
                          ),
                          if (transaction.counterparty != null) ...[
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Icon(
                                  Icons.person,
                                  size: 16,
                                  color: Colors.grey[500],
                                ),
                                const SizedBox(width: 8),
                                Text(transaction.counterparty!),
                              ],
                            ),
                          ],
                          if (transaction.description != null) ...[
                            const Divider(height: 16),
                            Text(
                              transaction.description!,
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey[600],
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),

                    const SizedBox(height: 16),

                    // Method Tabs
                    TabBar(
                      controller: _tabController,
                      labelColor: AppColors.primaryBlue,
                      unselectedLabelColor: Colors.grey,
                      indicatorColor: AppColors.primaryBlue,
                      tabs: widget.allowedMethods
                          .map((m) => _buildMethodTab(m))
                          .toList(),
                    ),

                    const SizedBox(height: 16),

                    // Method Content
                    _buildMethodContent(_selectedMethod),

                    const SizedBox(height: 16),

                    // Warning
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.amber.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: Colors.amber.withOpacity(0.3),
                        ),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.warning_amber,
                            size: 20,
                            color: Colors.amber[700],
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              widget.isArabic
                                  ? 'بالتوقيع، أنت تؤكد استلام الأموال وتوافق على صحة هذه المعاملة.'
                                  : 'By signing, you confirm receipt of funds and agree this transaction is valid.',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.amber[800],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Footer Actions
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                border: Border(
                  top: BorderSide(color: Colors.grey.withOpacity(0.2)),
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: Text(widget.isArabic ? 'إلغاء' : 'Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _isSubmitting ? null : _submitSignature,
                      icon: _isSubmitting
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.check_circle),
                      label: Text(
                        widget.isArabic ? 'توقيع وتأكيد' : 'Sign & Confirm',
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryBlue,
                        foregroundColor: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
