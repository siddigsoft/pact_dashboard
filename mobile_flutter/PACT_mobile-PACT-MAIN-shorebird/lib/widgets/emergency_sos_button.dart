// lib/widgets/emergency_sos_button.dart

import 'dart:async';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/emergency_sos_service.dart';
import '../theme/app_colors.dart';

class EmergencySOSButton extends StatefulWidget {
  final bool isArabic;
  final VoidCallback? onSOSTriggered;
  final bool showLabel;

  const EmergencySOSButton({
    super.key,
    this.isArabic = false,
    this.onSOSTriggered,
    this.showLabel = true,
  });

  @override
  State<EmergencySOSButton> createState() => _EmergencySOSButtonState();
}

class _EmergencySOSButtonState extends State<EmergencySOSButton>
    with SingleTickerProviderStateMixin {
  final _sosService = EmergencySOSService();
  
  late AnimationController _animationController;
  Timer? _holdTimer;
  double _holdProgress = 0.0;
  bool _isHolding = false;
  bool _sosTriggered = false;

  static const Duration _holdDuration = Duration(seconds: 3);

  @override
  void initState() {
    super.initState();
    _sosService.initialize();
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );
  }

  @override
  void dispose() {
    _holdTimer?.cancel();
    _animationController.dispose();
    super.dispose();
  }

  void _startHold() {
    if (_sosTriggered) return;

    setState(() {
      _isHolding = true;
      _holdProgress = 0.0;
    });

    HapticFeedback.heavyImpact();

    const updateInterval = Duration(milliseconds: 50);
    final totalUpdates = _holdDuration.inMilliseconds / updateInterval.inMilliseconds;
    int updates = 0;

    _holdTimer = Timer.periodic(updateInterval, (timer) {
      updates++;
      setState(() {
        _holdProgress = updates / totalUpdates;
      });

      if (updates % 10 == 0) {
        HapticFeedback.lightImpact();
      }

      if (_holdProgress >= 1.0) {
        timer.cancel();
        _triggerSOS();
      }
    });
  }

  void _cancelHold() {
    _holdTimer?.cancel();
    if (!_sosTriggered) {
      setState(() {
        _isHolding = false;
        _holdProgress = 0.0;
      });
    }
  }

  Future<void> _triggerSOS() async {
    setState(() => _sosTriggered = true);
    
    HapticFeedback.heavyImpact();
    
    _animationController.repeat(reverse: true);

    final alert = await _sosService.triggerSOS();
    
    if (alert != null && mounted) {
      widget.onSOSTriggered?.call();
      _showSOSConfirmation();
    }
  }

  void _showSOSConfirmation() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => Directionality(
        textDirection: widget.isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
        child: AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.red.withOpacity(0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.emergency, color: Colors.red),
              ),
              const SizedBox(width: 12),
              Text(
                widget.isArabic ? 'تم إرسال SOS' : 'SOS Sent',
                style: GoogleFonts.poppins(fontWeight: FontWeight.bold),
              ),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.isArabic
                    ? 'تم إرسال تنبيه الطوارئ الخاص بك. سيتم إخطار جهات الاتصال في حالات الطوارئ بموقعك.'
                    : 'Your emergency alert has been sent. Your emergency contacts will be notified with your location.',
                style: GoogleFonts.poppins(),
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: () => _sosService.callEmergencyNumber(),
                icon: const Icon(Icons.phone, color: Colors.red),
                label: Text(
                  widget.isArabic ? 'اتصل بجهة الطوارئ' : 'Call Emergency Contact',
                  style: const TextStyle(color: Colors.red),
                ),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Colors.red),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(context);
                setState(() {
                  _sosTriggered = false;
                  _holdProgress = 0.0;
                });
                _animationController.stop();
              },
              child: Text(widget.isArabic ? 'إغلاق' : 'Close'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: widget.isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          GestureDetector(
            onTapDown: (_) => _startHold(),
          onTapUp: (_) => _cancelHold(),
          onTapCancel: _cancelHold,
          child: AnimatedBuilder(
            animation: _animationController,
            builder: (context, child) {
              return Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      Colors.red.shade400,
                      Colors.red.shade700,
                    ],
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.red.withOpacity(
                        _sosTriggered ? 0.3 + (_animationController.value * 0.3) : 0.3,
                      ),
                      blurRadius: _sosTriggered ? 20 : 10,
                      spreadRadius: _sosTriggered ? 5 : 0,
                    ),
                  ],
                ),
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    if (_isHolding && !_sosTriggered)
                      SizedBox(
                        width: 76,
                        height: 76,
                        child: CircularProgressIndicator(
                          value: _holdProgress,
                          strokeWidth: 4,
                          backgroundColor: Colors.white.withOpacity(0.3),
                          valueColor: const AlwaysStoppedAnimation<Color>(Colors.white),
                        ),
                      ),
                    Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          _sosTriggered ? Icons.check : Icons.emergency,
                          color: Colors.white,
                          size: 28,
                        ),
                        Text(
                          'SOS',
                          style: GoogleFonts.poppins(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            },
          ),
        ),
          if (widget.showLabel) ...[
            const SizedBox(height: 8),
            Text(
              _isHolding
                  ? (widget.isArabic ? 'استمر بالضغط...' : 'Hold to activate...')
                  : (widget.isArabic ? 'اضغط مطولاً 3 ثوانٍ' : 'Hold 3 seconds'),
              style: GoogleFonts.poppins(
                fontSize: 11,
                color: Colors.grey.shade600,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class EmergencyContactsDialog extends StatefulWidget {
  final bool isArabic;

  const EmergencyContactsDialog({super.key, this.isArabic = false});

  @override
  State<EmergencyContactsDialog> createState() => _EmergencyContactsDialogState();
}

class _EmergencyContactsDialogState extends State<EmergencyContactsDialog> {
  final _sosService = EmergencySOSService();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _sosService.initialize();
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: widget.isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
      child: Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: Container(
          constraints: const BoxConstraints(maxWidth: 400, maxHeight: 500),
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.red.withOpacity(0.1),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.contact_emergency, color: Colors.red),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    widget.isArabic ? 'جهات اتصال الطوارئ' : 'Emergency Contacts',
                    style: GoogleFonts.poppins(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            const SizedBox(height: 16),
            Flexible(
              child: _sosService.contacts.isEmpty
                  ? Center(
                      child: Text(
                        widget.isArabic
                            ? 'لا توجد جهات اتصال للطوارئ'
                            : 'No emergency contacts',
                        style: GoogleFonts.poppins(color: Colors.grey),
                      ),
                    )
                  : ListView.builder(
                      shrinkWrap: true,
                      itemCount: _sosService.contacts.length,
                      itemBuilder: (context, index) {
                        final contact = _sosService.contacts[index];
                        return ListTile(
                          leading: CircleAvatar(
                            backgroundColor: contact.isPrimary
                                ? Colors.red.withOpacity(0.1)
                                : Colors.grey.withOpacity(0.1),
                            child: Icon(
                              Icons.person,
                              color: contact.isPrimary ? Colors.red : Colors.grey,
                            ),
                          ),
                          title: Text(contact.name),
                          subtitle: Text(contact.phone),
                          trailing: IconButton(
                            icon: const Icon(Icons.delete, color: Colors.red),
                            onPressed: () async {
                              await _sosService.removeContact(contact.id);
                              setState(() {});
                            },
                          ),
                        );
                      },
                    ),
            ),
            const Divider(),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _nameController,
                    decoration: InputDecoration(
                      hintText: widget.isArabic ? 'الاسم' : 'Name',
                      isDense: true,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _phoneController,
                    decoration: InputDecoration(
                      hintText: widget.isArabic ? 'الهاتف' : 'Phone',
                      isDense: true,
                    ),
                    keyboardType: TextInputType.phone,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.add_circle, color: AppColors.primaryBlue),
                  onPressed: () async {
                    if (_nameController.text.isNotEmpty &&
                        _phoneController.text.isNotEmpty) {
                      await _sosService.addContact(EmergencyContact(
                        id: DateTime.now().millisecondsSinceEpoch.toString(),
                        name: _nameController.text,
                        phone: _phoneController.text,
                        isPrimary: _sosService.contacts.isEmpty,
                      ));
                      _nameController.clear();
                      _phoneController.clear();
                      setState(() {});
                    }
                  },
                ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
