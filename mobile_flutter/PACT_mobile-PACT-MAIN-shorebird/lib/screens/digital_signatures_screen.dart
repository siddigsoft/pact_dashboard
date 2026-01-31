import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;
import '../theme/app_colors.dart';
import '../widgets/custom_drawer_menu.dart';
import '../widgets/signature_pad_widget.dart';
import '../widgets/signature_verification_badge.dart';
import '../widgets/signature_confirmation_dialog.dart';
import '../widgets/signature_history_widget.dart';

class DigitalSignaturesScreen extends StatefulWidget {
  const DigitalSignaturesScreen({super.key});

  @override
  State<DigitalSignaturesScreen> createState() => _DigitalSignaturesScreenState();
}

class _DigitalSignaturesScreenState extends State<DigitalSignaturesScreen>
    with SingleTickerProviderStateMixin {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  late TabController _tabController;

  bool _isLoading = true;
  List<Map<String, dynamic>> _signatures = [];
  List<Map<String, dynamic>> _signatureHistory = [];
  String _currentLocale = 'en';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadSignatures();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadSignatures() async {
    try {
      final userId = Supabase.instance.client.auth.currentUser?.id;
      if (userId == null) return;

      final signaturesResponse = await Supabase.instance.client
          .from('user_signatures')
          .select()
          .eq('user_id', userId)
          .order('created_at', ascending: false);

      final historyResponse = await Supabase.instance.client
          .from('signature_logs')
          .select('*, document:document_id(*)')
          .eq('user_id', userId)
          .order('signed_at', ascending: false)
          .limit(50);

      if (mounted) {
        setState(() {
          _signatures = List<Map<String, dynamic>>.from(signaturesResponse as List);
          _signatureHistory = List<Map<String, dynamic>>.from(historyResponse as List);
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint('Error loading signatures: $e');
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _toggleLanguage() {
    setState(() {
      _currentLocale = _currentLocale == 'en' ? 'ar' : 'en';
    });
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = _currentLocale == 'ar';

    return Directionality(
      textDirection: isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
      child: Scaffold(
        key: _scaffoldKey,
        backgroundColor: AppColors.backgroundGray,
        drawer: CustomDrawerMenu(
          currentUser: Supabase.instance.client.auth.currentUser,
          onClose: () => _scaffoldKey.currentState?.closeDrawer(),
        ),
        appBar: AppBar(
          backgroundColor: AppColors.primaryBlue,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.menu, color: Colors.white),
            onPressed: () => _scaffoldKey.currentState?.openDrawer(),
          ),
          title: Text(
            isArabic ? 'التوقيعات الرقمية' : 'Digital Signatures',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          actions: [
            TextButton.icon(
              onPressed: _toggleLanguage,
              icon: const Icon(Icons.language, color: Colors.white, size: 20),
              label: Text(
                isArabic ? 'EN' : 'عربي',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
          bottom: TabBar(
            controller: _tabController,
            indicatorColor: Colors.white,
            tabs: [
              Tab(
                icon: const Icon(Icons.draw),
                text: isArabic ? 'توقيعاتي' : 'My Signatures',
              ),
              Tab(
                icon: const Icon(Icons.history),
                text: isArabic ? 'سجل التوقيع' : 'Signing History',
              ),
            ],
          ),
        ),
        body: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : TabBarView(
                controller: _tabController,
                children: [
                  _buildSignaturesTab(isArabic),
                  _buildHistoryTab(isArabic),
                ],
              ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () => _showCreateSignatureDialog(isArabic),
          backgroundColor: AppColors.primaryBlue,
          icon: const Icon(Icons.add),
          label: Text(isArabic ? 'إنشاء توقيع' : 'Create Signature'),
        ),
      ),
    );
  }

  Widget _buildSignaturesTab(bool isArabic) {
    if (_signatures.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.draw_outlined, size: 80, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              isArabic ? 'لا توجد توقيعات' : 'No Signatures Yet',
              style: GoogleFonts.poppins(
                fontSize: 20,
                fontWeight: FontWeight.w600,
                color: Colors.grey[600],
              ),
            ),
            const SizedBox(height: 8),
            Text(
              isArabic
                  ? 'أنشئ توقيعك الرقمي للبدء'
                  : 'Create your digital signature to get started',
              style: GoogleFonts.poppins(color: Colors.grey[500]),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _signatures.length,
      itemBuilder: (context, index) {
        return _buildSignatureCard(_signatures[index], isArabic);
      },
    );
  }

  Widget _buildSignatureCard(Map<String, dynamic> signature, bool isArabic) {
    final isDefault = signature['is_default'] == true;
    final signatureData = signature['signature_data'] as String?;
    
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: isDefault
            ? BorderSide(color: AppColors.primaryBlue, width: 2)
            : BorderSide.none,
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            signature['name'] ?? (isArabic ? 'توقيع' : 'Signature'),
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                          if (isDefault) ...[
                            const SizedBox(width: 8),
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
                                isArabic ? 'افتراضي' : 'Default',
                                style: GoogleFonts.poppins(
                                  fontSize: 10,
                                  color: AppColors.primaryBlue,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      Text(
                        _formatDate(signature['created_at'], isArabic),
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          color: Colors.grey[600],
                        ),
                      ),
                    ],
                  ),
                ),
                PopupMenuButton<String>(
                  onSelected: (value) => _handleSignatureAction(value, signature, isArabic),
                  itemBuilder: (context) => [
                    PopupMenuItem(
                      value: 'default',
                      child: Row(
                        children: [
                          const Icon(Icons.star_outline),
                          const SizedBox(width: 8),
                          Text(isArabic ? 'تعيين كافتراضي' : 'Set as Default'),
                        ],
                      ),
                    ),
                    PopupMenuItem(
                      value: 'delete',
                      child: Row(
                        children: [
                          const Icon(Icons.delete_outline, color: Colors.red),
                          const SizedBox(width: 8),
                          Text(
                            isArabic ? 'حذف' : 'Delete',
                            style: const TextStyle(color: Colors.red),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (signatureData != null)
              Container(
                height: 100,
                width: double.infinity,
                decoration: BoxDecoration(
                  color: Colors.grey[100],
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.grey[300]!),
                ),
                child: _buildSignaturePreview(signatureData),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildSignaturePreview(String signatureData) {
    try {
      if (signatureData.startsWith('data:image')) {
        final base64Data = signatureData.split(',').last;
        final bytes = base64Decode(base64Data);
        return ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Image.memory(
            Uint8List.fromList(bytes),
            fit: BoxFit.contain,
          ),
        );
      }
      return Center(
        child: Text(
          signatureData.length > 50 ? '${signatureData.substring(0, 50)}...' : signatureData,
          style: GoogleFonts.poppins(color: Colors.grey[600]),
        ),
      );
    } catch (e) {
      return Center(
        child: Icon(Icons.draw, size: 40, color: Colors.grey[400]),
      );
    }
  }

  Widget _buildHistoryTab(bool isArabic) {
    if (_signatureHistory.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.history, size: 80, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              isArabic ? 'لا يوجد سجل' : 'No Signing History',
              style: GoogleFonts.poppins(
                fontSize: 20,
                fontWeight: FontWeight.w600,
                color: Colors.grey[600],
              ),
            ),
            const SizedBox(height: 8),
            Text(
              isArabic
                  ? 'ستظهر توقيعاتك على المستندات هنا'
                  : 'Your document signatures will appear here',
              style: GoogleFonts.poppins(color: Colors.grey[500]),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _signatureHistory.length,
      itemBuilder: (context, index) {
        return _buildHistoryCard(_signatureHistory[index], isArabic);
      },
    );
  }

  Widget _buildHistoryCard(Map<String, dynamic> history, bool isArabic) {
    final document = history['document'] as Map<String, dynamic>?;
    
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        contentPadding: const EdgeInsets.all(16),
        leading: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.primaryGreen.withOpacity(0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(Icons.check_circle, color: AppColors.primaryGreen),
        ),
        title: Text(
          document?['name'] ?? history['document_type'] ?? (isArabic ? 'مستند' : 'Document'),
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            Text(
              _formatDate(history['signed_at'], isArabic),
              style: GoogleFonts.poppins(fontSize: 12, color: Colors.grey[600]),
            ),
            if (history['ip_address'] != null) ...[
              const SizedBox(height: 2),
              Text(
                'IP: ${history['ip_address']}',
                style: GoogleFonts.poppins(fontSize: 10, color: Colors.grey[500]),
              ),
            ],
          ],
        ),
        trailing: Icon(Icons.chevron_right, color: Colors.grey[400]),
        onTap: () => _showHistoryDetails(history, isArabic),
      ),
    );
  }

  String _formatDate(String? dateStr, bool isArabic) {
    if (dateStr == null) return '';
    try {
      final date = DateTime.parse(dateStr);
      final months = isArabic
          ? ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
          : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return '${date.day} ${months[date.month - 1]} ${date.year}';
    } catch (e) {
      return dateStr;
    }
  }

  void _handleSignatureAction(String action, Map<String, dynamic> signature, bool isArabic) async {
    if (action == 'default') {
      await _setDefaultSignature(signature['id']);
    } else if (action == 'delete') {
      _showDeleteConfirmation(signature, isArabic);
    }
  }

  Future<void> _setDefaultSignature(String signatureId) async {
    try {
      final userId = Supabase.instance.client.auth.currentUser?.id;
      if (userId == null) return;

      await Supabase.instance.client
          .from('user_signatures')
          .update({'is_default': false})
          .eq('user_id', userId);

      await Supabase.instance.client
          .from('user_signatures')
          .update({'is_default': true})
          .eq('id', signatureId);

      await _loadSignatures();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(_currentLocale == 'ar' ? 'تم تعيين التوقيع الافتراضي' : 'Default signature set'),
            backgroundColor: AppColors.primaryGreen,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _showDeleteConfirmation(Map<String, dynamic> signature, bool isArabic) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(isArabic ? 'حذف التوقيع' : 'Delete Signature'),
        content: Text(
          isArabic
              ? 'هل أنت متأكد من حذف هذا التوقيع؟'
              : 'Are you sure you want to delete this signature?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(isArabic ? 'إلغاء' : 'Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(context);
              await _deleteSignature(signature['id']);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: Text(
              isArabic ? 'حذف' : 'Delete',
              style: const TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _deleteSignature(String signatureId) async {
    try {
      await Supabase.instance.client
          .from('user_signatures')
          .delete()
          .eq('id', signatureId);

      await _loadSignatures();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(_currentLocale == 'ar' ? 'تم حذف التوقيع' : 'Signature deleted'),
            backgroundColor: AppColors.primaryGreen,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _showHistoryDetails(Map<String, dynamic> history, bool isArabic) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              isArabic ? 'تفاصيل التوقيع' : 'Signature Details',
              style: GoogleFonts.poppins(
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            _buildDetailRow(
              isArabic ? 'المستند' : 'Document',
              history['document']?['name'] ?? history['document_type'] ?? '-',
            ),
            _buildDetailRow(
              isArabic ? 'تاريخ التوقيع' : 'Signed At',
              _formatDate(history['signed_at'], isArabic),
            ),
            if (history['ip_address'] != null)
              _buildDetailRow('IP Address', history['ip_address']),
            if (history['hash'] != null)
              _buildDetailRow(
                isArabic ? 'التحقق (Hash)' : 'Verification Hash',
                '${history['hash'].toString().substring(0, 20)}...',
              ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: GoogleFonts.poppins(
                color: Colors.grey[600],
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }

  void _showCreateSignatureDialog(bool isArabic) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => SignatureCreationSheet(
        isArabic: isArabic,
        onSignatureCreated: () {
          Navigator.pop(context);
          _loadSignatures();
        },
      ),
    );
  }
}

class SignatureCreationSheet extends StatefulWidget {
  final bool isArabic;
  final VoidCallback onSignatureCreated;

  const SignatureCreationSheet({
    super.key,
    required this.isArabic,
    required this.onSignatureCreated,
  });

  @override
  State<SignatureCreationSheet> createState() => _SignatureCreationSheetState();
}

class _SignatureCreationSheetState extends State<SignatureCreationSheet> {
  final TextEditingController _nameController = TextEditingController();
  final GlobalKey _canvasKey = GlobalKey();
  List<Offset?> _points = [];
  bool _isSaving = false;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 24,
        right: 24,
        top: 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey[300],
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 24),
          Text(
            widget.isArabic ? 'إنشاء توقيع جديد' : 'Create New Signature',
            style: GoogleFonts.poppins(
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _nameController,
            decoration: InputDecoration(
              labelText: widget.isArabic ? 'اسم التوقيع' : 'Signature Name',
              hintText: widget.isArabic ? 'مثال: توقيعي الرسمي' : 'e.g., My Official Signature',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            widget.isArabic ? 'ارسم توقيعك أدناه' : 'Draw your signature below',
            style: GoogleFonts.poppins(
              color: Colors.grey[600],
              fontSize: 14,
            ),
          ),
          const SizedBox(height: 8),
          Container(
            height: 150,
            decoration: BoxDecoration(
              color: Colors.grey[100],
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey[300]!),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: RepaintBoundary(
                key: _canvasKey,
                child: GestureDetector(
                  onPanStart: (details) {
                    setState(() {
                      _points.add(details.localPosition);
                    });
                  },
                  onPanUpdate: (details) {
                    setState(() {
                      _points.add(details.localPosition);
                    });
                  },
                  onPanEnd: (details) {
                    setState(() {
                      _points.add(null);
                    });
                  },
                  child: Container(
                    color: Colors.grey[100],
                    child: CustomPaint(
                      painter: SignaturePainter(points: _points),
                      size: Size.infinite,
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          TextButton.icon(
            onPressed: () {
              setState(() => _points = []);
            },
            icon: const Icon(Icons.refresh),
            label: Text(widget.isArabic ? 'مسح' : 'Clear'),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _isSaving ? null : () => _saveSignature(),
              style: ElevatedButton.styleFrom(
                backgroundColor: _points.where((p) => p != null).isNotEmpty 
                    ? AppColors.primaryBlue 
                    : Colors.grey,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: _isSaving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Text(
                      widget.isArabic ? 'حفظ التوقيع' : 'Save Signature',
                      style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
                    ),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Future<void> _saveSignature() async {
    final hasDrawnPoints = _points.where((p) => p != null).isNotEmpty;
    
    if (!hasDrawnPoints) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(widget.isArabic 
              ? 'يرجى رسم توقيعك أولاً' 
              : 'Please draw your signature first'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    setState(() => _isSaving = true);

    try {
      final userId = Supabase.instance.client.auth.currentUser?.id;
      if (userId == null) {
        throw Exception(widget.isArabic ? 'غير مصرح' : 'Not authenticated');
      }

      debugPrint('Saving signature for user: $userId');

      String signatureData;
      
      try {
        final boundary = _canvasKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
        if (boundary != null) {
          debugPrint('Capturing signature image...');
          final image = await boundary.toImage(pixelRatio: 2.0);
          final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
          if (byteData != null) {
            final bytes = byteData.buffer.asUint8List();
            signatureData = 'data:image/png;base64,${base64Encode(bytes)}';
            debugPrint('Signature captured as PNG image');
          } else {
            debugPrint('Failed to get byte data, using points');
            signatureData = _points
                .map((p) => p != null ? '${p.dx},${p.dy}' : 'null')
                .join(';');
          }
        } else {
          debugPrint('No render boundary found, using points');
          signatureData = _points
              .map((p) => p != null ? '${p.dx},${p.dy}' : 'null')
              .join(';');
        }
      } catch (e) {
        debugPrint('Error capturing image: $e, using points fallback');
        signatureData = _points
            .map((p) => p != null ? '${p.dx},${p.dy}' : 'null')
            .join(';');
      }

      debugPrint('Checking existing signatures...');
      final existingSignatures = await Supabase.instance.client
          .from('user_signatures')
          .select('id')
          .eq('user_id', userId);
      
      final isFirstSignature = (existingSignatures as List).isEmpty;
      debugPrint('Is first signature: $isFirstSignature');

      debugPrint('Inserting signature into database...');
      final signatureName = _nameController.text.isNotEmpty
          ? _nameController.text
          : (widget.isArabic ? 'توقيعي' : 'My Signature');
      
      await Supabase.instance.client.from('user_signatures').insert({
        'user_id': userId,
        'name': signatureName,
        'signature_data': signatureData,
        'is_default': isFirstSignature,
      });

      debugPrint('Signature saved to user_signatures');
      
      // Also sync to digital_signatures for web admin visibility
      try {
        await Supabase.instance.client.from('digital_signatures').insert({
          'user_id': userId,
          'signature_type': 'drawn',
          'signature_data': signatureData,
          'verification_status': 'pending',
          'document_name': '$signatureName (Template)',
          'device_info': 'PACT Mobile App - Signature Template',
        });
        debugPrint('Signature synced to digital_signatures for admin visibility');
      } catch (syncError) {
        debugPrint('Note: Could not sync to digital_signatures: $syncError');
        // Non-critical - signature is still saved in user_signatures
      }

      debugPrint('Signature saved successfully!');
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(widget.isArabic ? 'تم حفظ التوقيع بنجاح' : 'Signature saved successfully'),
            backgroundColor: AppColors.primaryGreen,
            duration: const Duration(seconds: 2),
          ),
        );
      }

      widget.onSignatureCreated();
    } catch (e, stackTrace) {
      debugPrint('Error saving signature: $e');
      debugPrint('Stack trace: $stackTrace');
      
      if (mounted) {
        String errorMessage = e.toString();
        if (errorMessage.contains('user_signatures')) {
          errorMessage = widget.isArabic 
              ? 'خطأ في قاعدة البيانات: تحقق من إعداد الجدول'
              : 'Database error: Check table setup';
        }
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(widget.isArabic ? 'خطأ: $errorMessage' : 'Error: $errorMessage'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }
}

class SignaturePainter extends CustomPainter {
  final List<Offset?> points;

  SignaturePainter({required this.points});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.black
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 3.0;

    for (int i = 0; i < points.length - 1; i++) {
      if (points[i] != null && points[i + 1] != null) {
        canvas.drawLine(points[i]!, points[i + 1]!, paint);
      }
    }
  }

  @override
  bool shouldRepaint(SignaturePainter oldDelegate) => true;
}
