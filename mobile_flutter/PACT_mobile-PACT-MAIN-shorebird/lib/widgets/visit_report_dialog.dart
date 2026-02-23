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

  static const List<String> _dmActivities = ['GFA', 'CBT', 'EBSFP'];

  static const Map<String, String> _activityTypesEn = {
    'PDM': 'Post-Distribution Monitoring',
    'DM': 'Distribution Monitoring',
    'Assessment': 'Assessment',
    'Monitoring': 'Monitoring',
    'Supervision': 'Supervision',
    'Verification': 'Verification',
    'Other': 'Other',
  };

  static const Map<String, String> _activityTypesAr = {
    'PDM': 'رصد ما بعد التوزيع',
    'DM': 'رصد التوزيع',
    'Assessment': 'تقييم',
    'Monitoring': 'مراقبة',
    'Supervision': 'إشراف',
    'Verification': 'تحقق',
    'Other': 'أخرى',
  };

  bool get _isArabic => Localizations.localeOf(context).languageCode == 'ar';

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
    _positionStream?.cancel();
    super.dispose();
  }

  static Map<String, dynamic>? _safeAdditionalData(dynamic data) {
    if (data == null) return null;
    if (data is String) {
      try {
        final decoded = jsonDecode(data);
        return decoded is Map
            ? Map<String, dynamic>.from(decoded as Map)
            : null;
      } catch (_) {
        return null;
      }
    }
    if (data is Map) {
      return Map<String, dynamic>.from(data as Map);
    }
    return null;
  }

  void _loadDraftData() {
    final additionalData =
        _safeAdditionalData(widget.site['additional_data']);
    if (additionalData != null && additionalData.isNotEmpty) {
      _activitiesController.text = additionalData['draft_activities'] ?? '';
      _notesController.text = additionalData['draft_notes'] ?? '';
      _durationMinutes = additionalData['draft_visit_duration'] ?? 0;
      _selectedActivityType = additionalData['draft_activity_type'];

      final rawCoords = additionalData['draft_coordinates'];
      if (rawCoords != null && rawCoords is Map) {
        final coords = Map<String, dynamic>.from(rawCoords as Map);
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

    final siteActivityType = widget.site['activity_type'] ?? widget.site['main_activity'];
    if (_selectedActivityType == null && siteActivityType != null) {
      final act = siteActivityType.toString().toUpperCase();
      if (_dmActivities.contains(act)) {
        _selectedActivityType = 'DM';
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
          final rawCoords = draft['draft_coordinates'];
          if (rawCoords != null && rawCoords is Map) {
            final coords = Map<String, dynamic>.from(rawCoords as Map);
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
          _locationError = _isArabic ? 'تم رفض إذن الموقع' : 'Location permission denied';
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

      _positionStream = Geolocator.getPositionStream(
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
          _locationError = _isArabic ? 'تعذر الحصول على الموقع' : 'Could not get location';
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
              title: Text(_isArabic ? 'اختيار من المعرض' : 'Choose from Gallery'),
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
            content: Text(_isArabic ? 'خطأ في اختيار الصورة: $e' : 'Error picking image: $e'),
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
      return _isArabic ? '${hours}س ${mins}د' : '${hours}h ${mins}m';
    }
    return _isArabic ? '${mins}د' : '${mins}m';
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    if (!_locationEnabled || _coordinates == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _isArabic ? 'الوصول إلى الموقع مطلوب لإكمال زيارة الموقع.' : 'Location access is required to complete the site visit.',
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
            _isArabic ? 'يرجى وصف الأنشطة التي تمت خلال الزيارة.' : 'Please describe the activities performed during the visit.',
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
            _isArabic ? 'مطلوب صورة واحدة على الأقل لإكمال زيارة الموقع.' : 'At least one photo is required to complete the site visit.',
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
            content: Text(_isArabic ? 'تم حفظ المسودة. يمكنك المتابعة لاحقاً.' : 'Draft saved. You can continue later.'),
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
            content: Text('${_isArabic ? 'تعذر حفظ المسودة' : 'Could not save draft'}: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final siteName =
        widget.site['site_name'] ?? widget.site['siteName'] ?? (_isArabic ? 'موقع غير معروف' : 'Unknown Site');
    final siteCode = widget.site['site_code'] ??
        widget.site['siteCode'] ??
        widget.site['id']?.toString().substring(0, 8) ??
        '';
    final locality = widget.site['locality'] ?? '';
    final state = widget.site['state'] ?? '';

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      child: Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.9,
          maxWidth: 600,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: const BoxDecoration(
                color: Colors.black,
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(24),
                  topRight: Radius.circular(24),
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.directions_car,
                      color: Colors.black,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _isArabic ? 'إكمال زيارة الموقع' : 'Complete Site Visit',
                          style: GoogleFonts.poppins(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                        Text(
                          siteName,
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: Colors.white.withOpacity(0.7),
                          ),
                        ),
                      ],
                    ),
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
              decoration: const BoxDecoration(
                border: Border(
                  top: BorderSide(color: AppColors.backgroundGray),
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
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(24),
                        ),
                      ),
                      child: Text(_isArabic ? 'إلغاء' : 'Cancel'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _isSubmitting ? null : _saveDraft,
                      label: Text(_isArabic ? 'مسودة' : 'Draft'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.orange.shade800,
                        side: BorderSide(color: Colors.orange.shade700),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(24),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton(
                      onPressed: _isSubmitting ? null : _submit,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.black,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(24),
                        ),
                      ),
                      child: _isSubmitting
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
                          : FittedBox(
                              fit: BoxFit.scaleDown,
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  const SizedBox(width: 8),
                                  Text(
                                    _isArabic ? 'إكمال الزيارة' : 'Complete Visit',
                                    style: GoogleFonts.poppins(
                                      fontSize: 14,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ],
                              ),
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
    final activityTypes = _isArabic ? _activityTypesAr : _activityTypesEn;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.backgroundGray,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                _isArabic ? 'نوع النشاط' : 'ACTIVITY TYPE',
                style: GoogleFonts.poppins(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: AppColors.textLight,
                  letterSpacing: 1.2,
                ),
              ),
              const SizedBox(width: 4),
              Text(
                _isArabic ? '(PDM/DM)' : '(PDM/DM)',
                style: GoogleFonts.poppins(
                  fontSize: 10,
                  color: AppColors.textLight,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: activityTypes.entries.map((entry) {
              final isSelected = _selectedActivityType == entry.key;
              final isPdmDm = entry.key == 'PDM' || entry.key == 'DM';
              final selectedColor = isPdmDm
                  ? (entry.key == 'DM' ? Colors.blue.shade700 : Colors.orange.shade700)
                  : Colors.black;
              return GestureDetector(
                onTap: () => setState(() => _selectedActivityType = entry.key),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: isSelected ? selectedColor : Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: isSelected ? selectedColor : Colors.grey.shade300,
                      width: isSelected ? 2 : 1,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (isPdmDm) ...[
                        Icon(
                          entry.key == 'PDM' ? Icons.fact_check : Icons.local_shipping,
                          size: 14,
                          color: isSelected ? Colors.white : (entry.key == 'DM' ? Colors.blue.shade600 : Colors.orange.shade600),
                        ),
                        const SizedBox(width: 4),
                      ],
                      Text(
                        '${entry.key} - ${entry.value}',
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                          color: isSelected ? Colors.white : AppColors.textDark,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
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
            color: Colors.black.withOpacity(0.05),
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
                              : Colors.black.withOpacity(0.3),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.navigation,
                      color: _coordinates != null
                          ? Colors.white
                          : Colors.white.withOpacity(0.5),
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
                          _isArabic ? 'جاري الحصول على الموقع...' : 'Getting location...',
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
                      locality.isNotEmpty ? locality : (state.isNotEmpty ? state : 'N/A'),
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
            const Text(
              '*',
              style: TextStyle(color: Colors.red, fontSize: 14),
            ),
          ],
        ),
        const SizedBox(height: 8),
        TextFormField(
          controller: _activitiesController,
          maxLines: 4,
          validator: (value) {
            if (value == null || value.trim().isEmpty) {
              return _isArabic ? 'يرجى وصف الأنشطة المنفذة' : 'Please describe the activities performed';
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
                _isArabic ? 'مطلوب صورة واحدة على الأقل' : 'At least one photo required',
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
