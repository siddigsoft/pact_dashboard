import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:google_fonts/google_fonts.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import '../theme/app_colors.dart';
import '../models/visit_report_data.dart';
import '../services/location_service.dart';
import '../services/offline/offline_db.dart';

class VisitReportDialog extends StatefulWidget {
  final Map<String, dynamic> site;
  const VisitReportDialog({super.key, required this.site});

  @override
  State<VisitReportDialog> createState() => _VisitReportDialogState();
}

class _VisitReportDialogState extends State<VisitReportDialog> {
  final _formKey = GlobalKey<FormState>();
  final _activitiesController = TextEditingController();
  final _notesController = TextEditingController();

  final List<String> _photoPaths = [];
  int _durationMinutes = 0;
  Position? _coordinates;
  bool _isGettingLocation = false;
  bool _locationEnabled = false;
  String? _locationError;
  bool _isSubmitting = false;

  DateTime? _visitStartTime;
  StreamSubscription<Position>? _positionStream;

  String? _selectedActivityType;
  int _pdmQuestionnaires = 0;
  final TextEditingController _pdmQController = TextEditingController();
  final TextEditingController _marketNameController = TextEditingController();
  String _warehouseName = '';

  bool _hasMarketDiversion = false;
  bool _hasWarehouseMonitoring = false;

  static const int _pdmQPerVisit = 7;

  // Activity Type selector: GFA In-Kind, CBT, PDM, MDM, and WHM
  static const Map<String, String> _activityTypesEn = {
    'GFA': 'GFA In-Kind',
    'CBT': 'Cash Based\nTransfer',
    'PDM': 'Post-Distribution\nMonitoring',
    'MDM': 'Market Diversion\nMonitoring',
    'WHM': 'Warehouse\nMonitoring',
  };

  static const Map<String, String> _activityTypesAr = {
    'GFA': 'مساعدة غذائية نقدية',
    'CBT': 'تحويل مالي نقدي',
    'PDM': 'رصد ما بعد التوزيع',
    'MDM': 'رصد انحراف السوق',
    'WHM': 'رصد المستودع',
  };

  bool get _isArabic => Localizations.localeOf(context).languageCode == 'ar';

  bool _isYesValue(dynamic value) {
    final normalized = value?.toString().trim().toLowerCase() ?? '';
    return normalized == 'yes' ||
        normalized == 'y' ||
        normalized == 'true' ||
        normalized == '1';
  }

  Map<String, dynamic> get _additionalData {
    return _safeAdditionalData(widget.site['additional_data']) ?? {};
  }

  String get _resolvedMainActivity {
    final additionalData = _additionalData;
    final candidates = [
      widget.site['main_activity']?.toString(),
      widget.site['activity_type']?.toString(),
      widget.site['activity']?.toString(),
      additionalData['main_activity']?.toString(),
      additionalData['activity_at_site']?.toString(),
      additionalData['activity_type']?.toString(),
    ];

    for (final candidate in candidates) {
      final value = candidate?.trim().toUpperCase() ?? '';
      if (value.isNotEmpty &&
          value != 'N/A' &&
          value != 'NA' &&
          value != 'NULL') {
        return value;
      }
    }

    return '';
  }

  String get _normalizedMainActivity => _resolvedMainActivity
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim()
      .toUpperCase();

  bool get _isDmMainActivity =>
      _normalizedMainActivity.startsWith('GFA') ||
      _normalizedMainActivity.contains('BSFP') ||
      _normalizedMainActivity == 'DM';

  bool get _isAimMainActivity =>
      _normalizedMainActivity == 'AIM' ||
      _normalizedMainActivity == 'TSFP' ||
      _normalizedMainActivity == 'PSN' ||
      _normalizedMainActivity == 'FFA' ||
      _normalizedMainActivity == 'SF' ||
      _normalizedMainActivity == 'THR' ||
      _normalizedMainActivity == 'PHL';

  String get _baseActivityCode {
    if (_normalizedMainActivity == 'PDM') return 'PDM';
    if (_normalizedMainActivity == 'MDM') return 'MDM';
    if (_normalizedMainActivity == 'WHM') return 'WHM';

    if (_isDmMainActivity) {
      return _normalizedMainActivity.contains('CBT') ? 'CBT' : 'GFA';
    }

    if (_isAimMainActivity) {
      return _normalizedMainActivity;
    }

    return _normalizedMainActivity;
  }

  List<String> _getAvailableActivities() {
    final activities = <String>[];

    if (_baseActivityCode.isNotEmpty) {
      activities.add(_baseActivityCode);
    }

    if (_hasMarketDiversion &&
        _isDmMainActivity &&
        !activities.contains('MDM')) {
      activities.add('MDM');
    }

    if (_hasWarehouseMonitoring &&
        (_isDmMainActivity || _isAimMainActivity) &&
        !activities.contains('WHM')) {
      activities.add('WHM');
    }

    return activities;
  }

  bool _showActivitySelector() => _getAvailableActivities().isNotEmpty;

  /// True if MDM is selected (market diversion = 2 visits)
  bool get _hasMDM => _selectedActivityType == 'MDM';

  int get _pdmSiteVisits => (_pdmQuestionnaires / _pdmQPerVisit).floor();
  int get _pdmRemainder => _pdmQuestionnaires % _pdmQPerVisit;

  @override
  void initState() {
    super.initState();
    _loadDraftData();
    _startVisitTimer();
    _startLocationMonitoring();
  }

  @override
  void dispose() {
    _activitiesController.dispose();
    _notesController.dispose();
    _pdmQController.dispose();
    _marketNameController.dispose();
    _positionStream?.cancel();
    super.dispose();
  }

  static Map<String, dynamic>? _safeAdditionalData(dynamic data) {
    if (data == null) return null;
    if (data is String) {
      try {
        final decoded = jsonDecode(data);
        return decoded is Map ? Map<String, dynamic>.from(decoded) : null;
      } catch (_) {
        return null;
      }
    }
    if (data is Map) {
      return Map<String, dynamic>.from(data);
    }
    return null;
  }

  void _loadDraftData() {
    final additionalData = _safeAdditionalData(widget.site['additional_data']);

    _hasMarketDiversion =
        _isYesValue(widget.site['use_market_diversion']) ||
        _isYesValue(widget.site['use_market_diversion_monitoring']) ||
        _isYesValue(widget.site['market_diversion']) ||
        _isYesValue(widget.site['market_diversion_monitoring']);
    _hasWarehouseMonitoring =
        _isYesValue(widget.site['use_warehouse_monitoring']) ||
        _isYesValue(widget.site['use_warehouse']) ||
        _isYesValue(widget.site['warehouse_monitoring']) ||
        _isYesValue(widget.site['warehouse_monitoring_flag']);

    if (additionalData != null && additionalData.isNotEmpty) {
      _hasMarketDiversion =
          _hasMarketDiversion ||
          _isYesValue(additionalData['use_market_diversion']) ||
          _isYesValue(additionalData['use_market_diversion_monitoring']) ||
          _isYesValue(additionalData['market_diversion']) ||
          _isYesValue(additionalData['market_diversion_monitoring']);
      _hasWarehouseMonitoring =
          _hasWarehouseMonitoring ||
          _isYesValue(additionalData['use_warehouse_monitoring']) ||
          _isYesValue(additionalData['use_warehouse']) ||
          _isYesValue(additionalData['warehouse_monitoring']) ||
          _isYesValue(additionalData['warehouse_monitoring_flag']);

      _activitiesController.text = additionalData['draft_activities'] ?? '';
      _notesController.text = additionalData['draft_notes'] ?? '';
      _durationMinutes = additionalData['draft_visit_duration'] ?? 0;
      _selectedActivityType = additionalData['draft_activity_type'];
      _warehouseName =
          (additionalData['draft_warehouse_name']?.toString() ??
                  additionalData['warehouse_name']?.toString() ??
                  additionalData['whm_warehouse_name']?.toString() ??
                  additionalData['warehouse']?.toString() ??
                  '')
              .trim();
      final draftQ =
          (additionalData['draft_pdm_questionnaires'] as num?)?.toInt() ?? 0;
      if (draftQ > 0) {
        _pdmQuestionnaires = draftQ;
        _pdmQController.text = draftQ.toString();
      }

      final rawCoords = additionalData['draft_coordinates'];
      if (rawCoords != null && rawCoords is Map) {
        final coords = Map<String, dynamic>.from(rawCoords);
        final lat = (coords['latitude'] as num?)?.toDouble() ?? 0.0;
        final lng = (coords['longitude'] as num?)?.toDouble() ?? 0.0;
        final acc = (coords['accuracy'] as num?)?.toDouble() ?? 0.0;
        _coordinates = Position(
          latitude: lat,
          longitude: lng,
          timestamp: DateTime.now(),
          accuracy: acc,
          altitude: 0.0,
          heading: 0.0,
          speed: 0.0,
          speedAccuracy: 0.0,
          altitudeAccuracy: 0.0,
          headingAccuracy: 0.0,
        );
        _locationEnabled = true;
      }
    }

    final siteId = widget.site['id']?.toString() ?? '';
    if (siteId.isNotEmpty) {
      try {
        final offlineDb = OfflineDb();
        final cached = offlineDb.getCachedItem(
          OfflineDb.siteCacheBox,
          'visit_draft_$siteId',
        );
        if (cached?.data != null) {
          final draft = cached!.data;
          if (draft['draft_activities'] != null) {
            _activitiesController.text =
                (draft['draft_activities'] as String?) ?? '';
          }
          if (draft['draft_notes'] != null) {
            _notesController.text = (draft['draft_notes'] as String?) ?? '';
          }
          if (draft['draft_visit_duration'] != null) {
            _durationMinutes =
                (draft['draft_visit_duration'] as num?)?.toInt() ?? 0;
          }
          if (draft['draft_activity_type'] != null) {
            _selectedActivityType = draft['draft_activity_type'] as String?;
          }
          if (draft['draft_warehouse_name'] != null) {
            _warehouseName =
                (draft['draft_warehouse_name'] as String?)?.trim() ?? '';
          }
          final draftQ2 =
              (draft['draft_pdm_questionnaires'] as num?)?.toInt() ?? 0;
          if (draftQ2 > 0) {
            _pdmQuestionnaires = draftQ2;
            _pdmQController.text = draftQ2.toString();
          }
          final rawCoords = draft['draft_coordinates'];
          if (rawCoords != null && rawCoords is Map) {
            final coords = Map<String, dynamic>.from(rawCoords);
            final lat = (coords['latitude'] as num?)?.toDouble() ?? 0.0;
            final lng = (coords['longitude'] as num?)?.toDouble() ?? 0.0;
            final acc = (coords['accuracy'] as num?)?.toDouble() ?? 0.0;
            _coordinates = Position(
              latitude: lat,
              longitude: lng,
              timestamp: DateTime.now(),
              accuracy: acc,
              altitude: 0.0,
              heading: 0.0,
              speed: 0.0,
              speedAccuracy: 0.0,
              altitudeAccuracy: 0.0,
              headingAccuracy: 0.0,
            );
            _locationEnabled = true;
          }
          final paths = draft['draft_photo_paths'] as List?;
          if (paths != null && paths.isNotEmpty) {
            for (final p in paths) {
              if (p is String && File(p).existsSync()) {
                _photoPaths.add(p);
              }
            }
          }
        }
      } catch (e) {
        debugPrint('[_loadDraftData] Error loading local draft: $e');
      }
    }

    final availableActivities = _getAvailableActivities();
    if (availableActivities.isNotEmpty) {
      if (_selectedActivityType == null ||
          !availableActivities.contains(_selectedActivityType)) {
        _selectedActivityType = availableActivities.first;
      }
    }

    final visitStartedAt = widget.site['visit_started_at'] as String?;
    if (visitStartedAt != null) {
      _visitStartTime = DateTime.tryParse(visitStartedAt);
    } else {
      _visitStartTime = DateTime.now();
    }
  }

  void _startVisitTimer() {
    if (_visitStartTime != null) {
      final now = DateTime.now();
      final duration = now.difference(_visitStartTime!);
      setState(() {
        _durationMinutes = duration.inMinutes;
      });

      Future.delayed(const Duration(minutes: 1), () {
        if (mounted) {
          _startVisitTimer();
        }
      });
    }
  }

  Future<void> _startLocationMonitoring() async {
    try {
      setState(() => _isGettingLocation = true);
      _locationError = null;

      final hasPermission = await LocationService.checkPermissions();
      if (!hasPermission) {
        setState(() {
          _isGettingLocation = false;
          _locationError = _isArabic
              ? 'تم رفض إذن الموقع'
              : 'Location permission denied';
        });
        return;
      }

      final position = await LocationService.getCurrentLocation();
      if (position != null) {
        setState(() {
          _coordinates = position;
          _locationEnabled = true;
          _isGettingLocation = false;
        });
      }

      _positionStream =
          Geolocator.getPositionStream(
            locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.high,
              distanceFilter: 10,
            ),
          ).listen((position) {
            setState(() {
              _coordinates = position;
              _locationEnabled = true;
            });
          });
    } catch (e) {
      setState(() {
        _isGettingLocation = false;
        _locationError = e.toString();
      });
    }
  }

  Future<void> _refreshLocation() async {
    setState(() => _isGettingLocation = true);
    try {
      final position = await LocationService.getCurrentLocation();
      if (position != null) {
        setState(() {
          _coordinates = position;
          _locationEnabled = true;
          _isGettingLocation = false;
        });
      } else {
        setState(() {
          _isGettingLocation = false;
          _locationError = _isArabic
              ? 'تعذر الحصول على الموقع'
              : 'Could not get location';
        });
      }
    } catch (e) {
      setState(() {
        _isGettingLocation = false;
        _locationError = e.toString();
      });
    }
  }

  Future<void> _addPhoto() async {
    final ImagePicker picker = ImagePicker();

    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: Text(_isArabic ? 'التقاط صورة' : 'Take Photo'),
              onTap: () => Navigator.pop(context, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: Text(
                _isArabic ? 'اختيار من المعرض' : 'Choose from Gallery',
              ),
              onTap: () => Navigator.pop(context, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );

    if (source == null) return;

    try {
      final XFile? image = await picker.pickImage(
        source: source,
        imageQuality: 85,
        maxWidth: 1920,
      );

      if (image != null) {
        setState(() {
          _photoPaths.add(image.path);
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _isArabic
                  ? 'خطأ في اختيار الصورة: $e'
                  : 'Error picking image: $e',
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _removePhoto(int index) {
    setState(() {
      _photoPaths.removeAt(index);
    });
  }

  String _formatDuration(int minutes) {
    final hours = minutes ~/ 60;
    final mins = minutes % 60;
    if (hours > 0) {
      return _isArabic ? '$hoursس $minsد' : '${hours}h ${mins}m';
    }
    return _isArabic ? '$minsد' : '${mins}m';
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    if (!_locationEnabled || _coordinates == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _isArabic
                ? 'الوصول إلى الموقع مطلوب لإكمال زيارة الموقع.'
                : 'Location access is required to complete the site visit.',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_activitiesController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _isArabic
                ? 'يرجى وصف الأنشطة التي تمت خلال الزيارة.'
                : 'Please describe the activities performed during the visit.',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_showActivitySelector() &&
        (_selectedActivityType == null || _selectedActivityType!.isEmpty)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _isArabic
                ? 'يرجى اختيار نشاط واحد على الأقل.'
                : 'Please select at least one activity.',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_selectedActivityType == 'MDM' &&
        _marketNameController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _isArabic
                ? 'يرجى إدخال اسم السوق لأنشطة رصد انحراف السوق.'
                : 'Please enter the market name for Market Diversion Monitoring.',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_selectedActivityType == 'WHM' && _warehouseName.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _isArabic
                ? 'يرجى إدخال اسم المستودع لأنشطة رصد المستودع.'
                : 'Please enter the warehouse name for Warehouse Monitoring.',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_photoPaths.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _isArabic
                ? 'مطلوب صورة واحدة على الأقل لإكمال زيارة الموقع.'
                : 'At least one photo is required to complete the site visit.',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      final reportData = VisitReportData(
        activities: _activitiesController.text.trim(),
        notes: _notesController.text.trim(),
        photos: _photoPaths,
        durationMinutes: _durationMinutes,
        coordinates: _coordinates,
        activityType: _selectedActivityType,
        pdmQuestionnaires: _pdmQuestionnaires,
        hasMarketDiversion: _hasMDM,
        marketName: _marketNameController.text.trim().isEmpty
            ? null
            : _marketNameController.text.trim(),
        warehouseName: _warehouseName.trim().isEmpty
            ? null
            : _warehouseName.trim(),
      );

      if (mounted) {
        Navigator.of(context).pop(reportData);
      }
    } catch (e) {
      debugPrint('Error submitting report: $e');
      if (mounted) {
        setState(() => _isSubmitting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${_isArabic ? 'خطأ' : 'Error'}: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _saveDraft() async {
    final siteId = widget.site['id']?.toString() ?? '';
    if (siteId.isEmpty) return;

    try {
      final draft = <String, dynamic>{
        'draft_activities': _activitiesController.text.trim(),
        'draft_notes': _notesController.text.trim(),
        'draft_visit_duration': _durationMinutes,
        'draft_photo_paths': List<String>.from(_photoPaths),
        'draft_activity_type': _selectedActivityType,
        'draft_warehouse_name': _warehouseName.trim(),
        if (_pdmQuestionnaires > 0)
          'draft_pdm_questionnaires': _pdmQuestionnaires,
      };
      if (_coordinates != null) {
        draft['draft_coordinates'] = {
          'latitude': _coordinates!.latitude,
          'longitude': _coordinates!.longitude,
          'accuracy': _coordinates!.accuracy,
        };
      }

      final offlineDb = OfflineDb();
      await offlineDb.cacheItem(
        OfflineDb.siteCacheBox,
        'visit_draft_$siteId',
        data: draft,
        ttl: const Duration(days: 30),
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _isArabic
                  ? 'تم حفظ المسودة. يمكنك المتابعة لاحقاً.'
                  : 'Draft saved. You can continue later.',
            ),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      debugPrint('Error saving draft: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '${_isArabic ? 'تعذر حفظ المسودة' : 'Could not save draft'}: ${e.toString()}',
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final siteName =
        widget.site['site_name'] ??
        widget.site['siteName'] ??
        (_isArabic ? 'موقع غير معروف' : 'Unknown Site');
    final siteCode =
        widget.site['site_code'] ??
        widget.site['siteCode'] ??
        widget.site['id']?.toString().substring(0, 8) ??
        '';
    final locality = widget.site['locality'] ?? '';
    final state = widget.site['state'] ?? '';

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      child: Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.92,
          maxWidth: 500,
        ),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.15),
              blurRadius: 30,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Professional Header with Gradient
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF1976D2), Color(0xFF1565C0)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(24),
                  topRight: Radius.circular(24),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: const BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.check_circle,
                          color: Color(0xFF1976D2),
                          size: 28,
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _isArabic
                                  ? 'إكمال زيارة الموقع'
                                  : 'Complete Site Visit',
                              style: GoogleFonts.poppins(
                                fontSize: 22,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              siteName,
                              style: GoogleFonts.poppins(
                                fontSize: 12,
                                color: Colors.white70,
                                fontWeight: FontWeight.w500,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            Expanded(
              child: Form(
                key: _formKey,
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildLocationStatusCard(),

                      const SizedBox(height: 20),

                      _buildMmpDetailsCard(),

                      const SizedBox(height: 20),

                      _buildSiteInfoCard(siteCode, locality, state),

                      const SizedBox(height: 20),

                      _buildActivityTypeSelector(),

                      const SizedBox(height: 20),

                      _buildActivitiesField(),

                      const SizedBox(height: 20),

                      _buildNotesField(),

                      const SizedBox(height: 20),

                      _buildPhotosSection(),
                    ],
                  ),
                ),
              ),
            ),

            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                border: Border(
                  top: BorderSide(color: Colors.grey.withOpacity(0.1)),
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _isSubmitting
                          ? null
                          : () => Navigator.of(context).pop(),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        side: BorderSide(
                          color: Colors.grey.withOpacity(0.3),
                          width: 1.5,
                        ),
                      ),
                      child: Text(
                        _isArabic ? 'إلغاء' : 'Cancel',
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFF333333),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _isSubmitting ? null : _saveDraft,
                      icon: const Icon(Icons.save_outlined, size: 18),
                      label: Text(_isArabic ? 'مسودة' : 'Draft'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFFFF9800),
                        side: const BorderSide(
                          color: Color(0xFFFF9800),
                          width: 1.5,
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: _isSubmitting ? null : _submit,
                      icon: _isSubmitting
                          ? const SizedBox.shrink()
                          : const Icon(Icons.check_circle, size: 20),
                      label: _isSubmitting
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(
                                  Colors.white,
                                ),
                              ),
                            )
                          : Text(
                              _isArabic ? 'إكمال الزيارة' : 'Complete Visit',
                              style: GoogleFonts.poppins(
                                fontSize: 14,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF1976D2),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 2,
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

  Widget _buildActivityTypeSelector() {
    final availableActivities = _getAvailableActivities();
    if (availableActivities.isEmpty) {
      return const SizedBox.shrink();
    }

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFFF8F9FA),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.withOpacity(0.1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _isArabic ? 'نوع النشاط *' : 'ACTIVITY TYPE *',
            style: GoogleFonts.poppins(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: const Color(0xFF666666),
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 16),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            children: availableActivities.map((key) {
              final isSelected = _selectedActivityType == key;
              final isMDM = key == 'MDM';
              final isPDM = key == 'PDM';
              final isGFA = key == 'GFA';
              final isWHM = key == 'WHM';

              Color chipColor = const Color(0xFFFF9800); // Orange default
              if (isMDM) chipColor = const Color(0xFF1976D2); // Blue for MDM
              if (isPDM) chipColor = const Color(0xFFFF9800); // Orange for PDM
              if (isGFA) chipColor = AppColors.primaryOrange; // Orange for GFA
              if (isWHM) chipColor = Colors.purple.shade600; // Purple for WHM

              final enText = _activityTypesEn[key] ?? '';
              final arText = _activityTypesAr[key] ?? '';

              return GestureDetector(
                onTap: () => setState(() {
                  final previous = _selectedActivityType;
                  _selectedActivityType = key;
                  if (previous == 'PDM' && key != 'PDM') {
                    _pdmQuestionnaires = 0;
                    _pdmQController.clear();
                  }
                  if (previous == 'MDM' && key != 'MDM') {
                    _marketNameController.clear();
                  }
                  if (previous == 'WHM' && key != 'WHM') {
                    _warehouseName = '';
                  }
                }),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(
                    vertical: 12,
                    horizontal: 8,
                  ),
                  decoration: BoxDecoration(
                    color: isSelected ? chipColor : Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: isSelected ? chipColor : Colors.grey.shade300,
                      width: isSelected ? 2 : 1.5,
                    ),
                    boxShadow: isSelected
                        ? [
                            BoxShadow(
                              color: chipColor.withOpacity(0.2),
                              blurRadius: 8,
                              offset: const Offset(0, 3),
                            ),
                          ]
                        : [],
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        isMDM
                            ? Icons.store_outlined
                            : isPDM
                            ? Icons.fact_check_outlined
                            : isWHM
                            ? Icons.warehouse_outlined
                            : Icons.shopping_bag_outlined,
                        size: 24,
                        color: isSelected ? Colors.white : chipColor,
                      ),
                      const SizedBox(height: 6),
                      // Activity code (GFA, CBT, etc.)
                      Text(
                        key,
                        style: GoogleFonts.poppins(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: isSelected ? Colors.white : chipColor,
                        ),
                      ),
                      const SizedBox(height: 2),
                      // English Description
                      Text(
                        enText,
                        textAlign: TextAlign.center,
                        style: GoogleFonts.poppins(
                          fontSize: 8,
                          height: 1.1,
                          fontWeight: FontWeight.w500,
                          color: isSelected
                              ? Colors.white.withValues(alpha: 0.9)
                              : Colors.grey.shade700,
                        ),
                      ),
                      const SizedBox(height: 1),
                      // Arabic Description
                      Text(
                        arText,
                        textAlign: TextAlign.center,
                        style: GoogleFonts.poppins(
                          fontSize: 7.5,
                          height: 1.1,
                          fontWeight: FontWeight.w400,
                          color: isSelected
                              ? Colors.white.withValues(alpha: 0.8)
                              : Colors.grey.shade600,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),

          // ── Fee Information Section for PDM/MDM ─────────────────────────────
          if (_selectedActivityType == 'PDM' ||
              _selectedActivityType == 'MDM') ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: _selectedActivityType == 'PDM'
                    ? Colors.orange.shade50
                    : Colors.blue.shade50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _selectedActivityType == 'PDM'
                      ? Colors.orange.shade200
                      : Colors.blue.shade200,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.info_rounded,
                    size: 18,
                    color: _selectedActivityType == 'PDM'
                        ? Colors.orange.shade700
                        : Colors.blue.shade700,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _isArabic
                              ? 'ملحوظة بشأن أتعاب المحقق'
                              : 'Enumerator Fee Note',
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: _selectedActivityType == 'PDM'
                                ? Colors.orange.shade900
                                : Colors.blue.shade900,
                          ),
                        ),
                        const SizedBox(height: 4),
                        if (_selectedActivityType == 'PDM')
                          Text(
                            _isArabic
                                ? 'سيتم احتساب أتعابك بناءً على عدد الاستبيانات المقدمة. كل 7 استبيانات = رسم زيارة واحد'
                                : 'Your enumerator fee will be calculated based on questionnaires submitted. Every 7 questionnaires = 1 visit fee',
                            style: GoogleFonts.poppins(
                              fontSize: 10,
                              color: _selectedActivityType == 'PDM'
                                  ? Colors.orange.shade700
                                  : Colors.blue.shade700,
                              height: 1.3,
                            ),
                          )
                        else
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _isArabic
                                    ? '⚠️ إذا كان بالموقع نشاطين (مثل GFA + MDM):'
                                    : '⚠️ If site has 2 activities (e.g., GFA + MDM):',
                                style: GoogleFonts.poppins(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                  color: _selectedActivityType == 'PDM'
                                      ? Colors.orange.shade900
                                      : Colors.blue.shade900,
                                  height: 1.4,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                _isArabic
                                    ? '1️⃣ يجب عليك استشارة المشرف والمنسق أولاً\n2️⃣ توضيح: سيتم تغطية نشاط واحد أو اثنين في نفس الموقع؟\n3️⃣ بدون تأكيد = لن تحصل على رسوم موقع واحد فقط'
                                    : '1️⃣ You MUST confirm with supervisor & coordinator first\n2️⃣ Clarify: Will you cover 1 or 2 activities at this site?\n3️⃣ Without confirmation = Only 1 site fee allowed',
                                style: GoogleFonts.poppins(
                                  fontSize: 9.5,
                                  color: Colors.red.shade700,
                                  height: 1.5,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],

          // ── PDM: questionnaire count input ────────────────────────────────
          if (_selectedActivityType == 'PDM') ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.orange.shade50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.orange.shade200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.quiz_outlined,
                        size: 15,
                        color: Colors.orange.shade700,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        _isArabic
                            ? 'عدد الاستبيانات المقدمة *'
                            : 'Questionnaires Submitted *',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                          color: Colors.orange.shade800,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    _isArabic
                        ? 'كل 7 استبيانات = زيارة موقع واحدة'
                        : 'Every 7 questionnaires = 1 site visit fee',
                    style: GoogleFonts.poppins(
                      fontSize: 10,
                      color: Colors.orange.shade600,
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _pdmQController,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      hintText: _isArabic
                          ? 'أدخل عدد الاستبيانات'
                          : 'Enter count',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      isDense: true,
                      filled: true,
                      fillColor: Colors.white,
                    ),
                    onChanged: (v) => setState(() {
                      _pdmQuestionnaires = int.tryParse(v) ?? 0;
                    }),
                  ),
                  if (_pdmQuestionnaires > 0) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.orange.shade100,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '$_pdmQuestionnaires ÷ $_pdmQPerVisit = $_pdmSiteVisits ${_isArabic ? 'زيارة مدفوعة' : 'site visit fee(s)'}',
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                              color: Colors.orange.shade900,
                            ),
                          ),
                          if (_pdmRemainder > 0)
                            Text(
                              _isArabic
                                  ? '$_pdmRemainder/$_pdmQPerVisit نحو الزيارة التالية'
                                  : '$_pdmRemainder/$_pdmQPerVisit toward next visit',
                              style: GoogleFonts.poppins(
                                fontSize: 10,
                                color: Colors.orange.shade700,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],

          // ── MDM: market name + 2-visit badge ─────────────────────────────
          if (_selectedActivityType == 'MDM') ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.blue.shade200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.store_outlined,
                        size: 15,
                        color: Colors.blue.shade700,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _isArabic
                              ? 'رصد انحراف السوق — × ٢ زيارة'
                              : 'Market Diversion Monitoring — × 2 visits',
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                            color: Colors.blue.shade800,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.blue.shade600,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          _isArabic ? '× ٢' : '× 2',
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _isArabic ? 'اسم السوق المُغطى *' : 'Market Name Covered *',
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w600,
                      fontSize: 11,
                      color: Colors.blue.shade800,
                    ),
                  ),
                  const SizedBox(height: 6),
                  TextField(
                    controller: _marketNameController,
                    decoration: InputDecoration(
                      hintText: _isArabic
                          ? 'أدخل اسم السوق...'
                          : 'Enter market name...',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      isDense: true,
                      filled: true,
                      fillColor: Colors.white,
                      prefixIcon: Icon(
                        Icons.storefront,
                        size: 18,
                        color: Colors.blue.shade400,
                      ),
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                ],
              ),
            ),
          ],

          // ── WHM: warehouse name + 2-visit badge ─────────────────────────
          if (_selectedActivityType == 'WHM') ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.purple.shade50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.purple.shade200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.warehouse_outlined,
                        size: 15,
                        color: Colors.purple.shade700,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _isArabic
                              ? 'رصد المستودع — × ٢ زيارة'
                              : 'Warehouse Monitoring — × 2 visits',
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                            color: Colors.purple.shade800,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.purple.shade600,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          _isArabic ? '× ٢' : '× 2',
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _isArabic ? 'اسم المستودع *' : 'Warehouse Name *',
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w600,
                      fontSize: 11,
                      color: Colors.purple.shade800,
                    ),
                  ),
                  const SizedBox(height: 6),
                  TextFormField(
                    textDirection: _isArabic
                        ? TextDirection.rtl
                        : TextDirection.ltr,
                    initialValue: _warehouseName,
                    decoration: InputDecoration(
                      hintText: _isArabic
                          ? 'أدخل اسم المستودع...'
                          : 'Enter warehouse name...',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      isDense: true,
                      filled: true,
                      fillColor: Colors.white,
                      prefixIcon: Icon(
                        Icons.home_work_outlined,
                        size: 18,
                        color: Colors.purple.shade400,
                      ),
                    ),
                    onChanged: (value) => setState(() {
                      _warehouseName = value;
                    }),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildLocationStatusCard() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.backgroundGray,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color:
                          _coordinates != null && (_coordinates!.accuracy <= 10)
                          ? Colors.black
                          : Colors.black.withValues(alpha: 0.3),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.navigation,
                      color: _coordinates != null
                          ? Colors.white
                          : Colors.white.withValues(alpha: 0.5),
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _isArabic ? 'حالة الموقع' : 'Location Status',
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: AppColors.textDark,
                        ),
                      ),
                      if (_coordinates != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          _isArabic
                              ? 'الدقة: ${_coordinates!.accuracy.toStringAsFixed(1)}م'
                              : 'Accuracy: ${_coordinates!.accuracy.toStringAsFixed(1)}m',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: _coordinates!.accuracy <= 10
                                ? Colors.green
                                : Colors.orange,
                          ),
                        ),
                      ] else if (_locationError != null)
                        Text(
                          _locationError!,
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: Colors.red,
                          ),
                        )
                      else if (_isGettingLocation)
                        Text(
                          _isArabic
                              ? 'جاري الحصول على الموقع...'
                              : 'Getting location...',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: AppColors.textLight,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          if (_coordinates == null && !_isGettingLocation) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _refreshLocation,
                icon: const Icon(Icons.refresh, size: 18),
                label: Text(_isArabic ? 'إعادة المحاولة' : 'Retry'),
                style: OutlinedButton.styleFrom(
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(Icons.timer, size: 18, color: Colors.black54),
                  const SizedBox(width: 8),
                  Text(
                    _isArabic ? 'مدة الزيارة' : 'Visit Duration',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: AppColors.textLight,
                    ),
                  ),
                ],
              ),
              Text(
                _formatDuration(_durationMinutes),
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: AppColors.textDark,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMmpDetailsCard() {
    final mainActivity =
        (widget.site['main_activity'] ??
                widget.site['activity_at_site'] ??
                widget.site['activity_type'] ??
                widget.site['activity'] ??
                '')
            .toString()
            .toUpperCase();
    final mmpStatus = widget.site['mmp_status'] ?? 'Active';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.primaryOrange.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppColors.primaryOrange.withValues(alpha: 0.3),
          width: 1.5,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.info_rounded,
                color: AppColors.primaryOrange,
                size: 20,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  _isArabic ? 'تفاصيل الخطة' : 'MMP DETAILS',
                  style: GoogleFonts.poppins(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: AppColors.primaryOrange,
                    letterSpacing: 1,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _isArabic ? 'النشاط الرئيسي' : 'Main Activity',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: Colors.grey[600],
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      mainActivity.isEmpty ? 'N/A' : mainActivity,
                      style: GoogleFonts.poppins(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppColors.primaryOrange,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _isArabic ? 'الحالة' : 'Status',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: Colors.grey[600],
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.accentGreen.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        mmpStatus,
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: AppColors.accentGreen,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSiteInfoCard(String siteCode, String locality, String state) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.backgroundGray,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _isArabic ? 'معلومات الموقع' : 'SITE INFORMATION',
            style: GoogleFonts.poppins(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: AppColors.textLight,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _isArabic ? 'رمز الموقع' : 'Site Code',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: AppColors.textLight,
                      ),
                    ),
                    Text(
                      siteCode,
                      style: GoogleFonts.poppins(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _isArabic ? 'المحلية' : 'Locality',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: AppColors.textLight,
                      ),
                    ),
                    Text(
                      locality.isNotEmpty
                          ? locality
                          : (state.isNotEmpty ? state : 'N/A'),
                      style: GoogleFonts.poppins(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildActivitiesField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              _isArabic ? 'الأنشطة المنفذة' : 'ACTIVITIES PERFORMED',
              style: GoogleFonts.poppins(
                fontSize: 10,
                fontWeight: FontWeight.bold,
                color: AppColors.textLight,
                letterSpacing: 1.2,
              ),
            ),
            const SizedBox(width: 4),
            const Text('*', style: TextStyle(color: Colors.red, fontSize: 14)),
          ],
        ),
        const SizedBox(height: 8),
        TextFormField(
          controller: _activitiesController,
          maxLines: 4,
          validator: (value) {
            if (value == null || value.trim().isEmpty) {
              return _isArabic
                  ? 'يرجى وصف الأنشطة المنفذة'
                  : 'Please describe the activities performed';
            }
            return null;
          },
          decoration: InputDecoration(
            hintText: _isArabic
                ? 'وصف الأنشطة التي تمت خلال الزيارة...'
                : 'Describe the activities performed during the visit...',
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide.none,
            ),
            filled: true,
            fillColor: AppColors.backgroundGray,
          ),
        ),
      ],
    );
  }

  Widget _buildNotesField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _isArabic ? 'ملاحظات إضافية' : 'ADDITIONAL NOTES',
          style: GoogleFonts.poppins(
            fontSize: 10,
            fontWeight: FontWeight.bold,
            color: AppColors.textLight,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: 8),
        TextFormField(
          controller: _notesController,
          maxLines: 3,
          decoration: InputDecoration(
            hintText: _isArabic
                ? 'أي ملاحظات أو مشكلات أو توصيات إضافية...'
                : 'Any additional observations, issues, or recommendations...',
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide.none,
            ),
            filled: true,
            fillColor: AppColors.backgroundGray,
          ),
        ),
      ],
    );
  }

  Widget _buildPhotosSection() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.backgroundGray,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    _isArabic ? 'صور الموقع' : 'SITE PHOTOS',
                    style: GoogleFonts.poppins(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: AppColors.textLight,
                      letterSpacing: 1.2,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Text(
                    '*',
                    style: TextStyle(color: Colors.red, fontSize: 14),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                _isArabic
                    ? 'مطلوب صورة واحدة على الأقل'
                    : 'At least one photo required',
                style: GoogleFonts.poppins(
                  fontSize: 11,
                  color: AppColors.textLight,
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _addPhoto,
                  icon: const Icon(Icons.camera_alt, size: 18),
                  label: Text(_isArabic ? 'إضافة صورة' : 'Add Photo'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.black,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ),
            ],
          ),
          if (_photoPaths.isNotEmpty) ...[
            const SizedBox(height: 16),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                crossAxisSpacing: 8,
                mainAxisSpacing: 8,
              ),
              itemCount: _photoPaths.length,
              itemBuilder: (context, index) {
                final photoPath = _photoPaths[index];

                if (photoPath.startsWith('http://') ||
                    photoPath.startsWith('https://')) {
                  return const SizedBox.shrink();
                }

                if (kIsWeb) {
                  return Container(
                    decoration: BoxDecoration(
                      color: AppColors.backgroundGray,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Center(
                      child: Icon(Icons.image_not_supported, size: 24),
                    ),
                  );
                }

                final file = File(photoPath);

                return Stack(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.file(
                        file,
                        width: double.infinity,
                        height: double.infinity,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) {
                          return Container(
                            color: AppColors.backgroundGray,
                            child: const Icon(Icons.broken_image, size: 32),
                          );
                        },
                      ),
                    ),
                    Positioned(
                      top: 4,
                      right: 4,
                      child: GestureDetector(
                        onTap: () => _removePhoto(index),
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: const BoxDecoration(
                            color: Colors.black,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.close,
                            color: Colors.white,
                            size: 16,
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      bottom: 4,
                      left: 4,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.black,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          '${index + 1}',
                          style: GoogleFonts.poppins(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.check_circle, size: 16, color: Colors.black),
                const SizedBox(width: 8),
                Text(
                  _isArabic
                      ? '${_photoPaths.length} ${_photoPaths.length != 1 ? 'صور' : 'صورة'} مضافة'
                      : '${_photoPaths.length} photo${_photoPaths.length != 1 ? 's' : ''} added',
                  style: GoogleFonts.poppins(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
