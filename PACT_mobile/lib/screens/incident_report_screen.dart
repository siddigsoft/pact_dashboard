import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'dart:convert';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import '../models/incident_report.dart';
import '../services/local_storage_service.dart';
import '../services/auth_service.dart';
import '../providers/sync_provider.dart';
import '../theme/app_colors.dart';
import '../widgets/standard_back_button.dart';
import '../widgets/reusable_app_bar.dart';

class IncidentReportScreen extends StatefulWidget {
  const IncidentReportScreen({super.key});

  @override
  State<IncidentReportScreen> createState() => _IncidentReportScreenState();
}

class _IncidentReportScreenState extends State<IncidentReportScreen> {
  late LocalStorageService _localStorage;
  late AuthService _authService;
  List<IncidentReport> _reports = [];
  bool _isLoading = true;

  bool get _isArabic => Localizations.localeOf(context).languageCode == 'ar';

  String _bi(String en, String ar) => _isArabic ? ar : en;

  String _incidentTypeLabel(String type) {
    switch (type) {
      case 'harassment':
        return _bi('Harassment', 'تحرش');
      case 'theft':
        return _bi('Theft', 'سرقة');
      case 'accident':
        return _bi('Accident', 'حادث');
      case 'medicalEmergency':
        return _bi('Medical Emergency', 'حالة طبية طارئة');
      case 'naturalDisaster':
        return _bi('Natural Disaster', 'كارثة طبيعية');
      default:
        return _bi('Other', 'أخرى');
    }
  }

  @override
  void initState() {
    super.initState();
    _initializeService();
  }

  Future<void> _initializeService() async {
    _localStorage = LocalStorageService();
    _authService = AuthService();
    _loadReports();

    // Trigger sync when screen loads if online
    final syncProvider = Provider.of<SyncProvider>(context, listen: false);
    if (syncProvider.isOnline) {
      syncProvider.syncIncidentReports();
    }
  }

  Future<void> _loadReports() async {
    setState(() => _isLoading = true);
    final reports = _localStorage.getAllIncidentReports();
    setState(() {
      _reports = reports;
      _isLoading = false;
    });
  }

  Future<void> _showNewReportForm() async {
    final locationController = TextEditingController();
    final descriptionController = TextEditingController();
    final witnessesController = TextEditingController();
    final actionController = TextEditingController();
    final picker = ImagePicker();
    String selectedType = 'other';
    bool requiresImmediate = false;
    final List<Uint8List> evidenceImages = [];
    final List<String> evidenceBase64 = [];

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => Scaffold(
          backgroundColor: Colors.white,
          appBar: AppBar(
            backgroundColor: Colors.teal.shade600,
            elevation: 0,
            leading: IconButton(
              icon: const Icon(Icons.close, color: Colors.white),
              onPressed: () => Navigator.pop(context),
            ),
            title: Text(
              _bi('Report Incident', 'تقرير حادثة'),
              style: GoogleFonts.poppins(
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
            centerTitle: true,
          ),
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Incident Type
                Text(
                  _bi('Incident Type', 'نوع الحادثة'),
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                    color: AppColors.textDark,
                  ),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: selectedType,
                  items:
                      [
                            'harassment',
                            'theft',
                            'accident',
                            'medicalEmergency',
                            'naturalDisaster',
                            'other',
                          ]
                          .map(
                            (type) => DropdownMenuItem(
                              value: type,
                              child: Text(_incidentTypeLabel(type)),
                            ),
                          )
                          .toList(),
                  onChanged: (value) {
                    if (value != null) {
                      setDialogState(() => selectedType = value);
                    }
                  },
                  decoration: InputDecoration(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 12,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFFE0E0E0)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFFE0E0E0)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(
                        color: Colors.teal.shade600,
                        width: 2,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                // Location
                Text(
                  _bi('Location', 'الموقع'),
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                    color: AppColors.textDark,
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: locationController,
                  decoration: InputDecoration(
                    hintText: _bi(
                      'Enter incident location',
                      'أدخل موقع الحادثة',
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 12,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFFE0E0E0)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFFE0E0E0)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(
                        color: Colors.teal.shade600,
                        width: 2,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                // Description
                Text(
                  _bi('Description', 'الوصف'),
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                    color: AppColors.textDark,
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: descriptionController,
                  decoration: InputDecoration(
                    hintText: _bi('Describe what happened', 'اشرح ما حدث'),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 12,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFFE0E0E0)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFFE0E0E0)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(
                        color: Colors.teal.shade600,
                        width: 2,
                      ),
                    ),
                  ),
                  maxLines: 3,
                ),
                const SizedBox(height: 16),
                // Witnesses
                Text(
                  _bi('Witnesses', 'الشهود'),
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                    color: AppColors.textDark,
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: witnessesController,
                  decoration: InputDecoration(
                    hintText: _bi(
                      'List witnesses (comma-separated)',
                      'اكتب أسماء الشهود (مفصولة بفواصل)',
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 12,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFFE0E0E0)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFFE0E0E0)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(
                        color: Colors.teal.shade600,
                        width: 2,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                // Action Taken
                Text(
                  _bi('Action Taken', 'الإجراء المتخذ'),
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                    color: AppColors.textDark,
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: actionController,
                  decoration: InputDecoration(
                    hintText: _bi(
                      'Describe any immediate action taken',
                      'اذكر أي إجراء فوري تم اتخاذه',
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 12,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFFE0E0E0)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFFE0E0E0)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(
                        color: Colors.teal.shade600,
                        width: 2,
                      ),
                    ),
                  ),
                  maxLines: 2,
                ),
                const SizedBox(height: 16),
                // Evidence Photos
                Text(
                  _bi('Evidence Photos', 'الصور أو الأدلة'),
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                    color: AppColors.textDark,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final image = await picker.pickImage(
                            source: ImageSource.camera,
                            imageQuality: 80,
                          );
                          if (image == null) return;
                          final bytes = await image.readAsBytes();
                          setDialogState(() {
                            evidenceImages.add(bytes);
                            evidenceBase64.add(base64Encode(bytes));
                          });
                        },
                        icon: const Icon(
                          Icons.photo_camera,
                          color: Color(0xFFFFA500),
                        ),
                        label: Text(
                          _bi('Camera', 'الكاميرا'),
                          style: GoogleFonts.poppins(
                            color: const Color(0xFFFFA500),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(
                            color: Color(0xFFFFA500),
                            width: 1.5,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final image = await picker.pickImage(
                            source: ImageSource.gallery,
                            imageQuality: 80,
                          );
                          if (image == null) return;
                          final bytes = await image.readAsBytes();
                          setDialogState(() {
                            evidenceImages.add(bytes);
                            evidenceBase64.add(base64Encode(bytes));
                          });
                        },
                        icon: const Icon(
                          Icons.photo_library,
                          color: Color(0xFFFFA500),
                        ),
                        label: Text(
                          _bi('Gallery', 'المعرض'),
                          style: GoogleFonts.poppins(
                            color: const Color(0xFFFFA500),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(
                            color: Color(0xFFFFA500),
                            width: 1.5,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                if (evidenceImages.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      _bi(
                        'Attached Photos (${evidenceImages.length})',
                        'الصور المرفقة (${evidenceImages.length})',
                      ),
                      style: GoogleFonts.poppins(
                        fontWeight: FontWeight.w600,
                        color: AppColors.textDark,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 78,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: evidenceImages.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 8),
                      itemBuilder: (context, index) {
                        return Stack(
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.memory(
                                evidenceImages[index],
                                width: 78,
                                height: 78,
                                fit: BoxFit.cover,
                              ),
                            ),
                            Positioned(
                              right: 0,
                              top: 0,
                              child: InkWell(
                                onTap: () {
                                  setDialogState(() {
                                    evidenceImages.removeAt(index);
                                    evidenceBase64.removeAt(index);
                                  });
                                },
                                child: Container(
                                  decoration: const BoxDecoration(
                                    color: Colors.black54,
                                    shape: BoxShape.circle,
                                  ),
                                  padding: const EdgeInsets.all(2),
                                  child: const Icon(
                                    Icons.close,
                                    size: 14,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        );
                      },
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                // Requires Immediate Attention
                Container(
                  decoration: BoxDecoration(
                    color: Colors.teal.shade50,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.teal.shade100),
                  ),
                  child: CheckboxListTile(
                    title: Text(
                      _bi(
                        'Requires Immediate Attention',
                        'يتطلب اهتمامًا فوريًا',
                      ),
                      style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                    ),
                    value: requiresImmediate,
                    onChanged: (value) => setDialogState(
                      () => requiresImmediate = value ?? false,
                    ),
                    activeColor: Colors.teal.shade600,
                  ),
                ),
                const SizedBox(height: 24),
                // Action Buttons
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => Navigator.pop(context),
                        style: OutlinedButton.styleFrom(
                          side: BorderSide(color: Colors.grey.shade300),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                        child: Text(
                          _bi('Cancel', 'إلغاء'),
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w600,
                            color: AppColors.textDark,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () async {
                          final syncProvider = Provider.of<SyncProvider>(
                            context,
                            listen: false,
                          );
                          final isOnlineNow = syncProvider.isOnline;

                          if (locationController.text.isNotEmpty &&
                              descriptionController.text.isNotEmpty) {
                            final report = IncidentReport(
                              id: DateTime.now().millisecondsSinceEpoch
                                  .toString(),
                              userId: _authService.currentUser?.id ?? '',
                              incidentType: selectedType,
                              description: descriptionController.text,
                              severity: requiresImmediate
                                  ? 'critical'
                                  : 'moderate',
                              location: locationController.text,
                              incidentDate: DateTime.now(),
                              witnesses: witnessesController.text
                                  .split(',')
                                  .map((e) => e.trim())
                                  .where((e) => e.isNotEmpty)
                                  .toList(),
                              immediateActionTaken:
                                  actionController.text.isNotEmpty
                                  ? actionController.text
                                  : null,
                              evidencePhotosBase64: evidenceBase64.isEmpty
                                  ? null
                                  : List<String>.from(evidenceBase64),
                              requiresFollowUp: !requiresImmediate,
                              createdAt: DateTime.now(),
                              updatedAt: DateTime.now(),
                            );

                            await _localStorage.saveIncidentReport(report);

                            if (isOnlineNow) {
                              await syncProvider.syncIncidentReports();
                            }

                            await _loadReports();
                            if (mounted && dialogContext.mounted) {
                              Navigator.of(dialogContext).pop();
                              ScaffoldMessenger.of(this.context).showSnackBar(
                                SnackBar(
                                  content: Text(
                                    isOnlineNow
                                        ? _bi(
                                            'Incident saved and synced.',
                                            'تم حفظ الحادثة ومزامنتها.',
                                          )
                                        : _bi(
                                            'Incident saved offline. It will sync when online.',
                                            'تم حفظ الحادثة دون اتصال. ستتم مزامنتها عند توفر الإنترنت.',
                                          ),
                                  ),
                                  backgroundColor: Colors.teal.shade600,
                                  duration: const Duration(seconds: 2),
                                ),
                              );
                            }
                          } else {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  _bi(
                                    'Please fill location and description.',
                                    'يرجى ملء الموقع والوصف.',
                                  ),
                                ),
                                backgroundColor: Colors.red.shade600,
                              ),
                            );
                          }
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.teal.shade600,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                        child: Text(
                          _bi('Submit', 'إرسال'),
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.backgroundGray,
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: _bi('Incident Reports', 'تقارير الحوادث'),
              showBackButton: true,
            ),
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : _reports.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.warning_amber_outlined,
                            size: 64,
                            color: Colors.grey.shade400,
                          ),
                          const SizedBox(height: 16),
                          Text(
                            _bi(
                              'No incident reports yet',
                              'لا توجد تقارير حوادث حتى الآن',
                            ),
                            style: GoogleFonts.poppins(
                              fontSize: 16,
                              color: Colors.grey.shade600,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _reports.length,
                      itemBuilder: (context, index) {
                        final report = _reports[index];
                        return Card(
                          margin: const EdgeInsets.only(bottom: 12),
                          elevation: 2,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: ListTile(
                            contentPadding: const EdgeInsets.all(16),
                            leading: Container(
                              width: 56,
                              height: 56,
                              decoration: BoxDecoration(
                                color: report.severity == 'critical'
                                    ? Colors.red.shade100
                                    : Colors.teal.shade100,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Icon(
                                report.severity == 'critical'
                                    ? Icons.warning
                                    : Icons.info,
                                color: report.severity == 'critical'
                                    ? Colors.red.shade600
                                    : Colors.teal.shade600,
                              ),
                            ),
                            title: Text(
                              _incidentTypeLabel(report.incidentType),
                              style: GoogleFonts.poppins(
                                fontWeight: FontWeight.w600,
                                fontSize: 15,
                              ),
                            ),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const SizedBox(height: 4),
                                Text(
                                  '${_bi('Location', 'الموقع')}: ${report.location}',
                                  style: GoogleFonts.poppins(fontSize: 13),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${_bi('Date', 'التاريخ')}: ${report.incidentDate.toString().split('.')[0]}',
                                  style: GoogleFonts.poppins(
                                    fontSize: 12,
                                    color: Colors.grey.shade600,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 4,
                                      ),
                                      decoration: BoxDecoration(
                                        color:
                                            _localStorage.isSynced(
                                              'incidentReports',
                                              report.id,
                                            )
                                            ? Colors.green.shade50
                                            : Colors.orange.shade50,
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Text(
                                        _localStorage.isSynced(
                                              'incidentReports',
                                              report.id,
                                            )
                                            ? _bi('✓ Synced', '✓ تمت المزامنة')
                                            : _bi('⚠ Offline', '⚠ دون اتصال'),
                                        style: GoogleFonts.poppins(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600,
                                          color:
                                              _localStorage.isSynced(
                                                'incidentReports',
                                                report.id,
                                              )
                                              ? Colors.green.shade700
                                              : Colors.orange.shade700,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    if ((report
                                            .evidencePhotosBase64
                                            ?.isNotEmpty ??
                                        false))
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 8,
                                          vertical: 4,
                                        ),
                                        decoration: BoxDecoration(
                                          color: Colors.blue.shade50,
                                          borderRadius: BorderRadius.circular(
                                            6,
                                          ),
                                        ),
                                        child: Text(
                                          _bi(
                                            '📷 ${report.evidencePhotosBase64!.length}',
                                            '📷 ${report.evidencePhotosBase64!.length}',
                                          ),
                                          style: GoogleFonts.poppins(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w600,
                                            color: Colors.blue.shade700,
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                              ],
                            ),
                            onTap: () {
                              // Show detailed view
                              showModalBottomSheet(
                                context: context,
                                isScrollControlled: true,
                                shape: const RoundedRectangleBorder(
                                  borderRadius: BorderRadius.vertical(
                                    top: Radius.circular(24),
                                  ),
                                ),
                                builder: (context) => Scaffold(
                                  backgroundColor: Colors.white,
                                  appBar: AppBar(
                                    backgroundColor: Colors.teal.shade600,
                                    elevation: 0,
                                    leading: IconButton(
                                      icon: const Icon(
                                        Icons.close,
                                        color: Colors.white,
                                      ),
                                      onPressed: () => Navigator.pop(context),
                                    ),
                                    title: Text(
                                      _incidentTypeLabel(report.incidentType),
                                      style: GoogleFonts.poppins(
                                        fontWeight: FontWeight.w600,
                                        color: Colors.white,
                                      ),
                                    ),
                                    centerTitle: true,
                                  ),
                                  body: SingleChildScrollView(
                                    padding: const EdgeInsets.all(16),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        _buildDetailItem(
                                          _bi('Location', 'الموقع'),
                                          report.location,
                                        ),
                                        _buildDetailItem(
                                          _bi('Date', 'التاريخ'),
                                          report.incidentDate.toString().split(
                                            '.',
                                          )[0],
                                        ),
                                        _buildDetailItem(
                                          _bi('Description', 'الوصف'),
                                          report.description,
                                        ),
                                        if (report.witnesses != null &&
                                            report.witnesses!.isNotEmpty)
                                          _buildDetailItem(
                                            _bi('Witnesses', 'الشهود'),
                                            report.witnesses!.join(', '),
                                          ),
                                        if (report.immediateActionTaken != null)
                                          _buildDetailItem(
                                            _bi(
                                              'Immediate Action Taken',
                                              'الإجراء الفوري المتخذ',
                                            ),
                                            report.immediateActionTaken!,
                                          ),
                                        _buildDetailItem(
                                          _bi('Severity', 'الخطورة'),
                                          _bi(
                                            report.severity == 'critical'
                                                ? 'Critical'
                                                : 'Moderate',
                                            report.severity == 'critical'
                                                ? 'حرج'
                                                : 'معتدل',
                                          ),
                                        ),
                                        _buildDetailItem(
                                          _bi(
                                            'Requires Follow-up',
                                            'يتطلب متابعة',
                                          ),
                                          report.requiresFollowUp
                                              ? _bi('Yes', 'نعم')
                                              : _bi('No', 'لا'),
                                        ),
                                        if ((report
                                                .evidencePhotosBase64
                                                ?.isNotEmpty ??
                                            false)) ...[
                                          const SizedBox(height: 16),
                                          Text(
                                            _bi(
                                              'Attached Photos',
                                              'الصور المرفقة',
                                            ),
                                            style: GoogleFonts.poppins(
                                              fontWeight: FontWeight.w600,
                                              color: AppColors.textDark,
                                              fontSize: 14,
                                            ),
                                          ),
                                          const SizedBox(height: 12),
                                          Wrap(
                                            spacing: 8,
                                            runSpacing: 8,
                                            children: report
                                                .evidencePhotosBase64!
                                                .take(6)
                                                .map(
                                                  (img64) => ClipRRect(
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                          8,
                                                        ),
                                                    child: Image.memory(
                                                      base64Decode(img64),
                                                      width: 74,
                                                      height: 74,
                                                      fit: BoxFit.cover,
                                                    ),
                                                  ),
                                                )
                                                .toList(),
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                        ).animate().fadeIn(duration: 300.ms);
                      },
                    ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          HapticFeedback.mediumImpact();
          _showNewReportForm();
        },
        backgroundColor: Colors.teal.shade600,
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }

  Widget _buildDetailItem(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: GoogleFonts.poppins(
              fontWeight: FontWeight.w600,
              color: AppColors.textLight,
            ),
          ),
          Text(
            value,
            style: GoogleFonts.poppins(fontSize: 16, color: AppColors.textDark),
          ),
        ],
      ),
    );
  }
}
