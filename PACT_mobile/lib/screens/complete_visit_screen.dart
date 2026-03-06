import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:convert';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart' hide Provider;
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:uuid/uuid.dart';
import 'package:path_provider/path_provider.dart' as path_provider;
import '../theme/app_colors.dart';
import '../theme/app_design_system.dart';
import '../widgets/app_widgets.dart';
import '../providers/active_visit_provider.dart';
import '../providers/site_visit_provider.dart';
import '../providers/offline_provider.dart';
import '../providers/locale_provider.dart';
import '../models/site_visit.dart';
import '../services/offline/models.dart';
import '../services/local_storage_service.dart';
import '../services/visit_location_settings.dart';

class CompleteVisitScreen extends ConsumerStatefulWidget {
  final SiteVisit visit;
  final VoidCallback? onCompleteSuccess;

  const CompleteVisitScreen({
    super.key,
    required this.visit,
    this.onCompleteSuccess,
  });

  @override
  ConsumerState<CompleteVisitScreen> createState() =>
      _CompleteVisitScreenState();
}

class _CompleteVisitScreenState extends ConsumerState<CompleteVisitScreen> {
  final _notesController = TextEditingController();
  final _activitiesController = TextEditingController();
  final List<XFile> _photos = [];
  final ImagePicker _picker = ImagePicker();
  bool _isSubmitting = false;
  bool _isSavingDraft = false;
  Position? _currentLocation;
  bool _isLocationLocked = false;
  String? _locationError;
  bool _isOnline = true;
  late Stream<List<ConnectivityResult>> _connectivityStream;

  // Multiple activity selection (instead of single _selectedActivityType)
  final Set<String> _selectedActivities = {};

  int _pdmQuestionnaires = 0;
  final TextEditingController _pdmQController = TextEditingController();
  final TextEditingController _marketNameController = TextEditingController();

  static const int _pdmQPerVisit = 7;
  final LocalStorageService _localStorageService = LocalStorageService();
  late double _requiredLocationAccuracyMeters;
  String get _locationLockMetadataKey =>
      'visit_locked_location_${widget.visit.id}';

  // MMP flags from site data
  bool _hasPdmTool = false;
  bool _hasMarketDiversion = false;
  bool _hasWarehouseMonitoring = false;
  String _warehouseName = ''; // Store warehouse name for WHM activity

  bool get _isArabic => Localizations.localeOf(context).languageCode == 'ar';

  String _bi(String en, String ar) =>
      '\u2066$en\u2069 \u200B|\u200B \u2067$ar\u2069';

  bool _isYesValue(dynamic value) {
    final normalized = value?.toString().trim().toLowerCase() ?? '';
    return normalized == 'yes' ||
        normalized == 'y' ||
        normalized == 'true' ||
        normalized == '1';
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

  String get _resolvedMainActivity {
    final additionalData = widget.visit.additionalData ?? {};
    final candidates = [
      widget.visit.mainActivity,
      widget.visit.activity,
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

  /// Check if activity selector should be shown based on main activity
  bool _showActivitySelector() {
    return _getAvailableActivities().isNotEmpty;
  }

  /// Backward-compatible flag used by validation logic
  bool get _isGfaSite => _baseActivityCode == 'GFA';

  int get _pdmSiteVisits => (_pdmQuestionnaires / _pdmQPerVisit).floor();

  /// Calculate total visit fees based on selected activities
  int get _totalVisitFees {
    int total = 0;
    for (final activity in _selectedActivities) {
      if (activity == 'PDM') {
        total += _pdmSiteVisits > 0 ? _pdmSiteVisits : 1;
      } else if (activity == 'MDM') {
        total += 2; // MDM always = 2 visits
      } else if (activity == 'WHM') {
        total += 2; // Warehouse Monitoring = 2 visits
      } else {
        total += 1; // GFA, CBT = 1 visit each
      }
    }
    return total;
  }

  void _initActivityType() {
    _selectedActivities.clear();

    // Extract MMP flags from additionalData
    final additionalData = widget.visit.additionalData ?? {};
    _hasPdmTool =
        (additionalData['tool_to_be_used']?.toString().toUpperCase() ?? '') ==
        'PDM';
    _hasMarketDiversion =
        _isYesValue(additionalData['use_market_diversion']) ||
        _isYesValue(additionalData['use_market_diversion_monitoring']) ||
        _isYesValue(additionalData['market_diversion']) ||
        _isYesValue(additionalData['market_diversion_monitoring']);
    _hasWarehouseMonitoring =
        _isYesValue(additionalData['use_warehouse_monitoring']) ||
        _isYesValue(additionalData['use_warehouse']) ||
        _isYesValue(additionalData['warehouse_monitoring']) ||
        _isYesValue(additionalData['warehouse_monitoring_flag']);

    // Extract warehouse name for WHM activity
    _warehouseName =
        additionalData['warehouse_name']?.toString() ??
        additionalData['whm_warehouse_name']?.toString() ??
        additionalData['warehouse']?.toString() ??
        '';

    final availableActivities = _getAvailableActivities();

    if (availableActivities.isNotEmpty) {
      // Always include base activity
      _selectedActivities.add(availableActivities.first);

      // Add-on activities are auto-enabled when corresponding upload flags are Yes
      if (_hasMarketDiversion && _isDmMainActivity) {
        _selectedActivities.add('MDM');
      }
      if (_hasWarehouseMonitoring &&
          (_isDmMainActivity || _isAimMainActivity)) {
        _selectedActivities.add('WHM');
      }
    }
  }

  // Storage bucket configured in Supabase migrations:
  // supabase/migrations/20250127_add_site_visit_photos_bucket.sql
  static const String _reportPhotosBucket = 'site-visit-photos';

  @override
  void initState() {
    super.initState();
    _requiredLocationAccuracyMeters = VisitLocationSettings
        .defaultLocationAccuracyThresholdMeters
        .toDouble();
    _loadLocationAccuracyThreshold();
    _initActivityType();
    _checkConnectivity();
    _initializeLockedLocation();
  }

  void _loadLocationAccuracyThreshold() {
    final configured = _localStorageService.getAppSetting(
      VisitLocationSettings.locationAccuracyThresholdMetersSettingKey,
    );
    final normalized = VisitLocationSettings.normalizeThreshold(configured);
    _requiredLocationAccuracyMeters = normalized.toDouble();
  }

  Future<void> _initializeLockedLocation() async {
    try {
      await _loadDraftData();

      if (_isLocationLocked && _currentLocation != null) {
        return;
      }

      final db = ref.read(offlineDbProvider);
      final persistedLock = db.getMetadataValue(_locationLockMetadataKey);
      if (persistedLock is Map) {
        final persistedPosition = _positionFromLocationMap(
          Map<String, dynamic>.from(persistedLock),
        );
        if (persistedPosition != null) {
          if (mounted) {
            setState(() {
              _applyLockedLocation(persistedPosition);
            });
          } else {
            _applyLockedLocation(persistedPosition);
          }
          return;
        }
      }

      _seedLocationFromActiveVisit();
      if (_isLocationLocked && _currentLocation != null) {
        return;
      }

      await _getCurrentLocation();
    } catch (e) {
      debugPrint('Error initializing locked location: $e');
    }
  }

  @override
  void dispose() {
    _notesController.dispose();
    _activitiesController.dispose();
    _pdmQController.dispose();
    _marketNameController.dispose();
    super.dispose();
  }

  /// Check initial connectivity and listen for changes
  Future<void> _checkConnectivity() async {
    final connectivity = await Connectivity().checkConnectivity();
    setState(() {
      _isOnline = connectivity.first != ConnectivityResult.none;
    });

    // Listen for connectivity changes
    _connectivityStream = Connectivity().onConnectivityChanged;
    _connectivityStream.listen((results) {
      if (mounted) {
        setState(() {
          _isOnline =
              results.isNotEmpty && results.first != ConnectivityResult.none;
        });
      }
    });
  }

  /// Load any existing draft data for this visit
  Future<void> _loadDraftData() async {
    try {
      final db = ref.read(offlineDbProvider);
      final drafts = db
          .getAllSiteVisits()
          .where((v) => v.siteEntryId == widget.visit.id && v.status == 'draft')
          .toList();

      if (drafts.isNotEmpty) {
        drafts.sort((a, b) => b.startedAt.compareTo(a.startedAt));
        final draft = drafts.first;

        // Keep only the latest draft to avoid stale reloads.
        if (drafts.length > 1) {
          for (final staleDraft in drafts.skip(1)) {
            await db.deleteSiteVisit(staleDraft.id);
          }
        }

        // Parse combined draft content (notes/activities/metadata)
        final parsed = _parseDraftContent(draft.notes);
        final metadata = parsed['metadata'] as Map<String, dynamic>;

        // Restore notes
        if ((parsed['notes'] as String).isNotEmpty) {
          _notesController.text = parsed['notes'] as String;
        }

        // Restore activities
        if ((parsed['activities'] as String).isNotEmpty) {
          _activitiesController.text = parsed['activities'] as String;
        }

        // Restore activity selections and related fields
        final availableActivities = _getAvailableActivities().toSet();
        final savedActivities = (metadata['selected_activities'] as List?)
            ?.map((e) => e.toString())
            .where((e) => availableActivities.contains(e))
            .toSet();
        if (savedActivities != null && savedActivities.isNotEmpty) {
          _selectedActivities
            ..clear()
            ..addAll(savedActivities);
        }

        _pdmQuestionnaires =
            (metadata['pdm_questionnaires'] as num?)?.toInt() ??
            _pdmQuestionnaires;
        if (_pdmQuestionnaires > 0) {
          _pdmQController.text = _pdmQuestionnaires.toString();
        }

        final marketName = metadata['market_name']?.toString().trim() ?? '';
        if (marketName.isNotEmpty) {
          _marketNameController.text = marketName;
        }

        final warehouseName =
            metadata['warehouse_name']?.toString().trim() ?? '';
        if (warehouseName.isNotEmpty) {
          _warehouseName = warehouseName;
        }

        // Restore locked location (from metadata first, then draft endLocation fallback)
        final locationFromMetadata = metadata['locked_location'] is Map
            ? Map<String, dynamic>.from(metadata['locked_location'] as Map)
            : null;
        final restoredLocation =
            _positionFromLocationMap(locationFromMetadata) ??
            _positionFromLocationMap(draft.endLocation);
        if (restoredLocation != null) {
          _applyLockedLocation(restoredLocation);
          if (_isLocationLocked) {
            await _persistLockedLocation();
          }
        }

        // Restore photos from base64 strings
        if (draft.photos != null && draft.photos!.isNotEmpty) {
          _photos.clear();
          await _restorePhotosFromDraft(draft.photos!);
        }

        if (mounted) {
          setState(() {});
          AppSnackBar.show(
            context,
            message: _bi(
              'Draft loaded with ${_photos.length} photos. Continue where you left off!',
              'تم تحميل المسودة مع ${_photos.length} صور. أكمل من حيث توقفت!',
            ),
            type: SnackBarType.info,
          );
        }
      }
    } catch (e) {
      debugPrint('Error loading draft: $e');
    }
  }

  /// Restore photos from base64 encoded strings saved in draft
  Future<void> _restorePhotosFromDraft(List<String> photoData) async {
    if (kIsWeb) {
      debugPrint('Photo restoration not supported on web platform');
      return;
    }

    try {
      // Use app-specific cache directory that persists across restarts
      final cacheDir = await path_provider.getApplicationCacheDirectory();
      final draftsDir = Directory('${cacheDir.path}/draft_photos');

      // Create drafts directory if it doesn't exist
      if (!await draftsDir.exists()) {
        await draftsDir.create(recursive: true);
      }

      for (int i = 0; i < photoData.length; i++) {
        try {
          final data = photoData[i];

          // Check if it's a file path that still exists
          if (!data.startsWith('data:') &&
              !data.contains('base64') &&
              File(data).existsSync()) {
            _photos.add(XFile(data));
            continue;
          }

          // Check if it's base64 encoded
          if (data.startsWith('data:image') ||
              data.contains('base64') ||
              _isBase64(data)) {
            // Extract base64 content
            String base64Str = data;
            if (data.contains(',')) {
              base64Str = data.split(',').last;
            }

            // Decode base64 to bytes
            final bytes = base64Decode(base64Str);

            // Save to persistent cache directory with unique name based on site visit
            final fileName = 'draft_${widget.visit.id}_photo_$i.jpg';
            final photoFile = File('${draftsDir.path}/$fileName');
            await photoFile.writeAsBytes(bytes);

            // Add to photos list
            _photos.add(XFile(photoFile.path));
          }
        } catch (e) {
          debugPrint('Error restoring photo $i: $e');
        }
      }
    } catch (e) {
      debugPrint('Error restoring photos from draft: $e');
    }
  }

  /// Check if a string is valid base64
  bool _isBase64(String str) {
    try {
      if (str.length % 4 != 0) return false;
      base64Decode(str);
      return true;
    } catch (e) {
      return false;
    }
  }

  /// Separator used to combine notes and activities in draft storage
  static const String _draftSeparator = '|||ACTIVITIES|||';
  static const String _draftMetaSeparator = '|||META|||';

  /// Combine notes, activities, and metadata into a single string for draft storage
  String _combineDraftContent(
    String notes,
    String activities,
    Map<String, dynamic> metadata,
  ) {
    final base = activities.isEmpty
        ? notes
        : '$notes$_draftSeparator$activities';
    if (metadata.isEmpty) {
      return base;
    }

    return '$base$_draftMetaSeparator${jsonEncode(metadata)}';
  }

  /// Parse combined draft string into notes, activities, and metadata.
  Map<String, dynamic> _parseDraftContent(String? combined) {
    if (combined == null || combined.isEmpty) {
      return {'notes': '', 'activities': '', 'metadata': <String, dynamic>{}};
    }

    String content = combined;
    Map<String, dynamic> metadata = <String, dynamic>{};

    if (combined.contains(_draftMetaSeparator)) {
      final parts = combined.split(_draftMetaSeparator);
      content = parts.first;
      if (parts.length > 1 && parts[1].trim().isNotEmpty) {
        try {
          final decoded = jsonDecode(parts[1]);
          if (decoded is Map) {
            metadata = Map<String, dynamic>.from(decoded);
          }
        } catch (_) {
          metadata = <String, dynamic>{};
        }
      }
    }

    if (content.contains(_draftSeparator)) {
      final parts = content.split(_draftSeparator);
      return {
        'notes': parts[0],
        'activities': parts.length > 1 ? parts[1] : '',
        'metadata': metadata,
      };
    }

    return {'notes': content, 'activities': '', 'metadata': metadata};
  }

  Map<String, dynamic> _buildActivityDetails() {
    final Map<String, dynamic> activityDetails = {};

    for (final activity in _selectedActivities) {
      if (activity == 'PDM' && _pdmQuestionnaires > 0) {
        activityDetails['PDM'] = {
          'questionnaires': _pdmQuestionnaires,
          'site_visits': _pdmSiteVisits,
        };
      } else if (activity == 'MDM' && _marketNameController.text.isNotEmpty) {
        activityDetails['MDM'] = {
          'market_name': _marketNameController.text.trim(),
          'site_visits': 2,
        };
      } else if (activity == 'WHM' && _warehouseName.isNotEmpty) {
        activityDetails['WHM'] = {
          'warehouse_name': _warehouseName.trim(),
          'site_visits': 2,
        };
      } else {
        activityDetails[activity] = {'site_visits': activity == 'WHM' ? 2 : 1};
      }
    }

    return activityDetails;
  }

  Map<String, dynamic>? _effectiveLocationMap() {
    final position = _currentLocation;
    if (position == null) {
      return null;
    }

    return {
      'lat': position.latitude,
      'lng': position.longitude,
      'latitude': position.latitude,
      'longitude': position.longitude,
      'accuracy': position.accuracy,
    };
  }

  bool _hasAcceptableAccuracy(Position position) {
    return position.accuracy <= _requiredLocationAccuracyMeters;
  }

  void _applyLockedLocation(Position position) {
    if (!_hasAcceptableAccuracy(position)) {
      _currentLocation = position;
      _isLocationLocked = false;
      _locationError = _bi(
        'Low GPS accuracy (${position.accuracy.toStringAsFixed(0)}m). Please retry to capture ≤ ${_requiredLocationAccuracyMeters.toStringAsFixed(0)}m.',
        'دقة GPS منخفضة (${position.accuracy.toStringAsFixed(0)}م). يرجى إعادة المحاولة لالتقاط ≤ ${_requiredLocationAccuracyMeters.toStringAsFixed(0)}م.',
      );
      return;
    }

    _currentLocation = position;
    _isLocationLocked = true;
    _locationError = null;
  }

  Future<void> _persistLockedLocation() async {
    final locationMap = _effectiveLocationMap();
    if (locationMap == null) return;

    final db = ref.read(offlineDbProvider);
    await db.setMetadataValue(_locationLockMetadataKey, locationMap);
  }

  void _seedLocationFromActiveVisit() {
    final activeVisitState = ref.read(activeVisitProvider);

    Position? candidate = activeVisitState.lockedStartGPS;

    if (candidate == null && activeVisitState.locationHistory.isNotEmpty) {
      candidate = activeVisitState.locationHistory.first;
    }

    candidate ??= activeVisitState.currentLocation;

    if (candidate != null) {
      setState(() {
        _applyLockedLocation(candidate!);
      });
      if (_isLocationLocked) {
        unawaited(_persistLockedLocation());
      }
    }
  }

  Position? _positionFromLocationMap(Map<String, dynamic>? location) {
    if (location == null) {
      return null;
    }

    final latRaw = location['lat'] ?? location['latitude'];
    final lngRaw = location['lng'] ?? location['longitude'];
    final accuracyRaw = location['accuracy'];

    if (latRaw is! num || lngRaw is! num) {
      return null;
    }

    return Position(
      latitude: latRaw.toDouble(),
      longitude: lngRaw.toDouble(),
      timestamp: DateTime.now(),
      accuracy: accuracyRaw is num ? accuracyRaw.toDouble() : 0,
      altitude: 0,
      altitudeAccuracy: 0,
      heading: 0,
      headingAccuracy: 0,
      speed: 0,
      speedAccuracy: 0,
    );
  }

  Future<void> _getCurrentLocation() async {
    if (_isLocationLocked && _currentLocation != null) {
      return;
    }

    try {
      // On web this may trigger a browser permission prompt.
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        throw Exception('Location services are disabled');
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied) {
        throw Exception('Location permission denied');
      }
      if (permission == LocationPermission.deniedForever) {
        throw Exception('Location permission permanently denied');
      }

      // Try last known first (often available instantly), then fall back to a fresh fix.
      // NOTE: getLastKnownPosition is NOT supported on web platform
      Position? lastKnown;
      if (!kIsWeb) {
        lastKnown = await Geolocator.getLastKnownPosition();
      }

      const timeout = kIsWeb ? Duration(seconds: 60) : Duration(seconds: 20);

      Position position;
      if (lastKnown != null) {
        position = lastKnown;
      } else {
        // On web, getCurrentPosition can hang; use a short stream fallback.
        position =
            await Geolocator.getCurrentPosition(
              desiredAccuracy: LocationAccuracy.high,
            ).timeout(
              timeout,
              onTimeout: () async {
                const streamTimeout = kIsWeb
                    ? Duration(seconds: 15)
                    : Duration(seconds: 10);
                return await Geolocator.getPositionStream(
                  locationSettings: const LocationSettings(
                    accuracy: LocationAccuracy.high,
                    distanceFilter: 0,
                  ),
                ).first.timeout(streamTimeout);
              },
            );
      }

      if (!mounted) return;

      setState(() {
        _applyLockedLocation(position);
      });
      if (_isLocationLocked) {
        await _persistLockedLocation();
      }
    } catch (e) {
      debugPrint('Error getting location: $e');
      if (!mounted) return;
      setState(() {
        _locationError = e.toString();
      });
    }
  }

  Future<void> _pickPhotos() async {
    try {
      final List<XFile> images = await _picker.pickMultiImage(
        imageQuality: 80,
        maxWidth: 1920,
        maxHeight: 1080,
      );

      if (images.isNotEmpty && mounted) {
        setState(() {
          _photos.addAll(images);
        });
      }
    } catch (e) {
      debugPrint('Error picking images: $e');
      if (mounted) {
        AppSnackBar.show(
          context,
          message: 'Failed to pick images: $e',
          type: SnackBarType.error,
        );
      }
    }
  }

  Future<void> _takePhoto() async {
    try {
      final XFile? image = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 80,
        maxWidth: 1920,
        maxHeight: 1080,
      );

      if (image != null && mounted) {
        setState(() {
          _photos.add(image);
        });
      }
    } catch (e) {
      debugPrint('Error taking photo: $e');
      if (mounted) {
        AppSnackBar.show(
          context,
          message: 'Failed to take photo: $e',
          type: SnackBarType.error,
        );
      }
    }
  }

  void _removePhoto(int index) {
    setState(() {
      _photos.removeAt(index);
    });
  }

  Future<void> _submitReport() async {
    if (_notesController.text.trim().isEmpty) {
      AppSnackBar.show(
        context,
        message: _bi(
          'Please add notes about your visit',
          'يرجى إضافة ملاحظات حول زيارتك',
        ),
        type: SnackBarType.warning,
      );
      return;
    }

    // Validate that at least one activity is selected whenever activity selector applies
    if (_showActivitySelector() && _selectedActivities.isEmpty) {
      AppSnackBar.show(
        context,
        message: _bi(
          'Please select at least one activity',
          'يرجى اختيار نشاط واحد على الأقل',
        ),
        type: SnackBarType.warning,
      );
      return;
    }

    if (_selectedActivities.contains('MDM') &&
        _marketNameController.text.trim().isEmpty) {
      AppSnackBar.show(
        context,
        message: _bi(
          'Please enter the market name for Market Diversion Monitoring.',
          'يرجى إدخال اسم السوق لأنشطة رصد انحراف السوق.',
        ),
        type: SnackBarType.warning,
      );
      return;
    }

    if (_selectedActivities.contains('WHM') && _warehouseName.trim().isEmpty) {
      AppSnackBar.show(
        context,
        message: _bi(
          'Please enter the warehouse name for Warehouse Monitoring.',
          'يرجى إدخال اسم المستودع لأنشطة رصد المستودع.',
        ),
        type: SnackBarType.warning,
      );
      return;
    }

    if (_currentLocation == null || !_isLocationLocked) {
      await _getCurrentLocation();
    }
    if (_currentLocation == null || !_isLocationLocked) {
      AppSnackBar.show(
        context,
        message: _bi(
          'A locked high-accuracy final location is required. Please tap Retry.',
          'موقع نهائي ثابت وعالي الدقة مطلوب. يرجى الضغط على إعادة المحاولة.',
        ),
        type: SnackBarType.warning,
      );
      return;
    }

    setState(() {
      _isSubmitting = true;
    });

    try {
      final supabase = Supabase.instance.client;
      final userId = supabase.auth.currentUser?.id;

      if (userId == null) {
        throw Exception('User not authenticated');
      }

      // Check connectivity
      final connectivity = await Connectivity().checkConnectivity();
      final hasConnection = connectivity.first != ConnectivityResult.none;

      if (!hasConnection) {
        // OFFLINE MODE: Save locally and queue for sync
        await _saveOfflineCompletion(userId);
        return;
      }

      // Get current location if not already obtained
      if (_currentLocation == null || !_isLocationLocked) {
        await _getCurrentLocation();
      }

      // Calculate visit duration
      final activeVisitState = ref.read(activeVisitProvider);
      final startTime = activeVisitState.startedAt;
      final durationMinutes = startTime != null
          ? DateTime.now().difference(startTime).inMinutes
          : null;

      // 1. Create the report with activities data
      final locationMap = _effectiveLocationMap();
      final coordinates = locationMap != null
          ? {
              'latitude': locationMap['latitude'],
              'longitude': locationMap['longitude'],
              'accuracy': locationMap['accuracy'],
            }
          : <String, dynamic>{};

      double toDouble(dynamic value) {
        if (value is num) return value.toDouble();
        if (value is String) return double.tryParse(value.trim()) ?? 0.0;
        return 0.0;
      }

      final additionalData = Map<String, dynamic>.from(
        widget.visit.additionalData ?? const <String, dynamic>{},
      );
      final feeMultiplier = _totalVisitFees > 0 ? _totalVisitFees : 1;
      final baseEnumeratorFee = toDouble(
        additionalData['base_enumerator_fee'] ?? widget.visit.enumeratorFee,
      );
      final transportFee = toDouble(widget.visit.transportFee);
      final adjustedEnumeratorFee = baseEnumeratorFee > 0
          ? baseEnumeratorFee * feeMultiplier
          : 0.0;
      final adjustedTotalCost = adjustedEnumeratorFee > 0
          ? adjustedEnumeratorFee + transportFee
          : toDouble(widget.visit.cost);

      // Build activity details JSON for storage
      final activityDetails = _buildActivityDetails();

      final reportResponse = await supabase
          .from('reports')
          .insert({
            'site_visit_id': widget.visit.id,
            'selected_activities': _selectedActivities
                .toList(), // Save selected activities as array
            'activity_details':
                activityDetails, // Save detailed activity data (questionnaires, market name, etc.)
            'total_visit_fees':
                _totalVisitFees, // Save calculated total visit fees
            'notes': _notesController.text.trim(),
            'activities': _activitiesController.text.trim().isEmpty
                ? null
                : _activitiesController.text.trim(),
            'duration_minutes': durationMinutes,
            'coordinates': coordinates,
            'submitted_by': userId,
            'is_synced': true,
          })
          .select('id')
          .single();

      final reportId = reportResponse['id'] as String;

      // 2. Upload photos and create report_photos entries
      for (int i = 0; i < _photos.length; i++) {
        final photo = _photos[i];
        // Keep folder layout consistent with web app docs:
        // reports/{site_id}/...
        final fileName =
            '${DateTime.now().millisecondsSinceEpoch}-$i-${photo.name}';
        final storagePath = 'reports/${widget.visit.id}/$fileName';

        // Upload to storage
        Uint8List bytes;
        if (kIsWeb) {
          bytes = await photo.readAsBytes();
        } else {
          bytes = await File(photo.path).readAsBytes();
        }

        try {
          await supabase.storage
              .from(_reportPhotosBucket)
              .uploadBinary(
                storagePath,
                bytes,
                fileOptions: const FileOptions(
                  contentType: 'image/jpeg',
                  upsert: true,
                ),
              );
        } on StorageException catch (e) {
          // Make the bucket setup issue crystal clear.
          if (e.statusCode == 404 ||
              e.message.toLowerCase().contains('bucket not found')) {
            throw Exception(
              'Storage bucket "$_reportPhotosBucket" not found in Supabase. Create it (Storage → Buckets) or run the migration that adds it, then retry.',
            );
          }
          rethrow;
        }

        // Get public URL
        final photoUrl = supabase.storage
            .from(_reportPhotosBucket)
            .getPublicUrl(storagePath);

        // Create report_photos entry
        await supabase.from('report_photos').insert({
          'report_id': reportId,
          'photo_url': photoUrl,
          'storage_path': storagePath,
          'is_synced': true,
        });
      }

      // 3. Store final location in site_locations table
      // Matches actual schema: site_id/user_id/recorded_at/notes (unique_site_actual_location on site_id)
      await supabase.from('site_locations').upsert({
        'site_id': widget.visit.id,
        'user_id': userId,
        'latitude': coordinates['latitude'],
        'longitude': coordinates['longitude'],
        'accuracy': coordinates['accuracy'],
        'recorded_at': DateTime.now().toIso8601String(),
        'notes': 'Location recorded at visit completion',
      }, onConflict: 'site_id');

      // 4. Update mmp_site_entries to mark as completed
      // Selecting ensures we can confirm the row was updated (and surfaces RLS issues).
      await supabase
          .from('mmp_site_entries')
          .update({
            'status': 'completed',
            'visit_completed_at': DateTime.now().toIso8601String(),
            'visit_completed_by': userId,
            if (adjustedEnumeratorFee > 0)
              'enumerator_fee': adjustedEnumeratorFee,
            if (adjustedEnumeratorFee > 0) 'cost': adjustedTotalCost,
            'additional_data': {
              ...additionalData,
              'selected_activities': _selectedActivities.toList(),
              'activity_details': activityDetails,
              'total_visit_fees': feeMultiplier,
              'fee_multiplier': feeMultiplier,
              if (baseEnumeratorFee > 0)
                'base_enumerator_fee': baseEnumeratorFee,
              if (adjustedEnumeratorFee > 0)
                'adjusted_enumerator_fee': adjustedEnumeratorFee,
              if (feeMultiplier > 1) 'fee_adjusted_for_addon_activities': true,
            },
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', widget.visit.id)
          .select('id')
          .single();

      // 5. Stop active visit tracking
      await ref
          .read(activeVisitProvider.notifier)
          .completeVisit(
            notes: _notesController.text,
            photos: _photos.map((p) => p.path).toList(),
          );

      widget.onCompleteSuccess?.call();

      // 6. Refresh visit lists so tiles update immediately
      ref.invalidate(assignedSiteVisitsStreamProvider);
      ref.invalidate(availableSiteVisitsStreamProvider);
      ref.invalidate(acceptedSiteVisitsStreamProvider);
      ref.invalidate(ongoingSiteVisitsStreamProvider);
      ref.invalidate(completedSiteVisitsStreamProvider);

      if (mounted) {
        AppSnackBar.show(
          context,
          message: _bi(
            'Visit completed and report submitted successfully!',
            'تم إكمال الزيارة وإرسال التقرير بنجاح!',
          ),
          type: SnackBarType.success,
        );
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      debugPrint('Error submitting report: $e');
      if (mounted) {
        AppSnackBar.show(
          context,
          message: _bi('Failed to submit report: $e', 'فشل إرسال التقرير: $e'),
          type: SnackBarType.error,
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  /// Save visit completion data locally when offline
  Future<void> _saveOfflineCompletion(String userId) async {
    try {
      final db = ref.read(offlineDbProvider);
      const uuid = Uuid();
      final now = DateTime.now();

      // Calculate visit duration
      final activeVisitState = ref.read(activeVisitProvider);
      final startTime = activeVisitState.startedAt;
      final durationMinutes = startTime != null
          ? now.difference(startTime).inMinutes
          : null;

      if (_currentLocation == null || !_isLocationLocked) {
        await _getCurrentLocation();
      }
      if (_currentLocation == null || !_isLocationLocked) {
        throw Exception('A locked high-accuracy location is required');
      }

      final locationMap = _effectiveLocationMap();
      final activityDetails = _buildActivityDetails();

      // Convert photos to base64 for local storage
      final List<String> photoDataList = [];
      for (final photo in _photos) {
        try {
          final bytes = kIsWeb
              ? await photo.readAsBytes()
              : await File(photo.path).readAsBytes();
          final base64 = base64Encode(bytes);
          photoDataList.add('data:image/jpeg;base64,$base64');
        } catch (e) {
          debugPrint('Error encoding photo: $e');
          // Store file path as fallback for mobile
          if (!kIsWeb) {
            photoDataList.add(photo.path);
          }
        }
      }

      // Create offline site visit record
      // Use first location in history as start location
      final startLocation = activeVisitState.locationHistory.isNotEmpty
          ? activeVisitState.locationHistory.first
          : null;

      final offlineVisit = OfflineSiteVisit(
        id: uuid.v4(),
        siteEntryId: widget.visit.id,
        siteName: widget.visit.siteName,
        siteCode: widget.visit.siteCode,
        state: widget.visit.state,
        locality: widget.visit.locality,
        status: 'completed',
        startedAt: startTime ?? now,
        completedAt: now,
        startLocation: startLocation != null
            ? {
                'lat': startLocation.latitude,
                'lng': startLocation.longitude,
                'accuracy': startLocation.accuracy,
              }
            : null,
        endLocation: _currentLocation != null ? locationMap : null,
        photos: photoDataList,
        notes: _notesController.text.trim(),
        synced: false,
      );

      await db.saveSiteVisitOffline(offlineVisit);

      // Also create a pending sync action for the completion
      final syncAction = PendingSyncAction(
        id: uuid.v4(),
        type: 'site_visit_complete',
        payload: {
          'visit_id': widget.visit.id,
          'site_visit_id': widget.visit.id,
          'notes': _notesController.text.trim(),
          'activities': _activitiesController.text.trim().isEmpty
              ? null
              : _activitiesController.text.trim(),
          'selected_activities': _selectedActivities.toList(),
          'activity_details': activityDetails,
          'total_visit_fees': _totalVisitFees,
          'duration_minutes': durationMinutes,
          'coordinates': locationMap != null
              ? {
                  'latitude': locationMap['latitude'],
                  'longitude': locationMap['longitude'],
                  'accuracy': locationMap['accuracy'],
                }
              : null,
          'submitted_by': userId,
          'photos': photoDataList,
          'offline_visit_id': offlineVisit.id,
        },
        timestamp: now.millisecondsSinceEpoch,
      );

      await db.addPendingSync(syncAction);

      // Stop active visit tracking
      await ref
          .read(activeVisitProvider.notifier)
          .completeVisit(
            notes: _notesController.text,
            photos: _photos.map((p) => p.path).toList(),
          );

      widget.onCompleteSuccess?.call();

      if (mounted) {
        AppSnackBar.show(
          context,
          message: _bi(
            'Visit saved offline! Will upload when you have internet.',
            'تم حفظ الزيارة بدون اتصال! ستُرفع عند توفر الإنترنت.',
          ),
          type: SnackBarType.success,
          duration: const Duration(seconds: 4),
        );
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      debugPrint('Error saving offline completion: $e');
      if (mounted) {
        AppSnackBar.show(
          context,
          message: _bi(
            'Failed to save offline: $e',
            'فشل الحفظ بدون اتصال: $e',
          ),
          type: SnackBarType.error,
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  /// Save visit as draft - stores all data locally without completing
  /// User can return later to continue and complete the visit
  Future<void> _saveDraft() async {
    if (_isSavingDraft) return;

    setState(() {
      _isSavingDraft = true;
    });

    try {
      final db = ref.read(offlineDbProvider);
      const uuid = Uuid();
      final now = DateTime.now();
      final userId = Supabase.instance.client.auth.currentUser?.id;

      if (userId == null) {
        throw Exception('User not authenticated');
      }

      if (_currentLocation == null || !_isLocationLocked) {
        _seedLocationFromActiveVisit();
      }
      if (_currentLocation == null || !_isLocationLocked) {
        await _getCurrentLocation();
      }

      // Get or create draft ID - reuse existing draft if present
      String draftId;
      final existingDrafts = db
          .getAllSiteVisits()
          .where((v) => v.siteEntryId == widget.visit.id && v.status == 'draft')
          .toList();

      if (existingDrafts.isNotEmpty) {
        existingDrafts.sort((a, b) => b.startedAt.compareTo(a.startedAt));
        draftId = existingDrafts.first.id;

        // Remove any stale duplicate drafts for this site.
        for (final staleDraft in existingDrafts.skip(1)) {
          await db.deleteSiteVisit(staleDraft.id);
        }
      } else {
        draftId = uuid.v4();
      }

      // Convert photos to base64 for local storage
      final List<String> photoDataList = [];
      for (final photo in _photos) {
        try {
          final bytes = kIsWeb
              ? await photo.readAsBytes()
              : await File(photo.path).readAsBytes();
          final base64Data = base64Encode(bytes);
          photoDataList.add('data:image/jpeg;base64,$base64Data');
        } catch (e) {
          debugPrint('Error encoding photo: $e');
          // Store file path as fallback for mobile
          if (!kIsWeb) {
            photoDataList.add(photo.path);
          }
        }
      }

      // Get location info from active visit
      final activeVisitState = ref.read(activeVisitProvider);
      final startTime = activeVisitState.startedAt;
      final startLocation = activeVisitState.locationHistory.isNotEmpty
          ? activeVisitState.locationHistory.first
          : null;

      final locationMap = _effectiveLocationMap();

      final draftMetadata = <String, dynamic>{
        'selected_activities': _selectedActivities.toList(),
        'pdm_questionnaires': _pdmQuestionnaires,
        'market_name': _marketNameController.text.trim(),
        'warehouse_name': _warehouseName.trim(),
        if (locationMap != null) 'locked_location': locationMap,
      };

      // Combine notes/activities with metadata for full draft restoration.
      final combinedNotes = _combineDraftContent(
        _notesController.text.trim(),
        _activitiesController.text.trim(),
        draftMetadata,
      );

      // Create draft record
      final draftVisit = OfflineSiteVisit(
        id: draftId,
        siteEntryId: widget.visit.id,
        siteName: widget.visit.siteName,
        siteCode: widget.visit.siteCode,
        state: widget.visit.state,
        locality: widget.visit.locality,
        status: 'draft', // Draft status - not complete, not synced
        startedAt: startTime ?? now,
        completedAt: null, // Not completed yet
        startLocation: startLocation != null
            ? {
                'lat': startLocation.latitude,
                'lng': startLocation.longitude,
                'accuracy': startLocation.accuracy,
              }
            : null,
        endLocation: _currentLocation != null ? locationMap : null,
        photos: photoDataList,
        notes: combinedNotes,
        synced: false,
      );

      await db.saveSiteVisitOffline(draftVisit);
      await db.setMetadataValue(_locationLockMetadataKey, locationMap);

      if (mounted) {
        AppSnackBar.show(
          context,
          message: _bi(
            'Draft saved! You can continue later.',
            'تم حفظ المسودة! يمكنك المتابعة لاحقاً.',
          ),
          type: SnackBarType.success,
          duration: const Duration(seconds: 3),
        );
        Navigator.of(context).pop(false);
      }
    } catch (e) {
      debugPrint('Error saving draft: $e');
      if (mounted) {
        AppSnackBar.show(
          context,
          message: _bi('Failed to save draft: $e', 'فشل حفظ المسودة: $e'),
          type: SnackBarType.error,
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSavingDraft = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final activityType = _resolvedMainActivity;
    final isGfa = activityType.toUpperCase() == 'GFA';

    return Directionality(
      textDirection: _isArabic ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        appBar: AppBar(
          title: Text(_bi('Complete Visit', 'إكمال الزيارة')),
          backgroundColor: AppColors.primaryOrange,
          foregroundColor: Colors.white,
          actions: [
            // Language Toggle Button
            Tooltip(
              message: _bi('Toggle Language', 'تبديل اللغة'),
              child: IconButton(
                onPressed: () {
                  // Toggle the app language between English and Arabic
                  if (mounted) {
                    // Using context.read() to access the LocaleProvider
                    // ignore: use_build_context_synchronously
                    final localeProvider = context.read<LocaleProvider>();
                    localeProvider.toggleLocale();
                  }
                },
                icon: Text(
                  _isArabic ? 'EN' : 'ع',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ],
        ),
        body: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.visit.siteName,
                          style: AppTextStyles.headlineSmall,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${widget.visit.state} • ${widget.visit.locality}',
                          style: AppTextStyles.bodySmall.copyWith(
                            color: AppColors.textSecondary,
                          ),
                        ),
                        if (widget.visit.siteCode.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            _bi(
                              'Code: ${widget.visit.siteCode}',
                              'الرمز: ${widget.visit.siteCode}',
                            ),
                            style: AppTextStyles.bodySmall.copyWith(
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ],
                        if (activityType.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: isGfa
                                  ? Colors.green.shade50
                                  : Colors.grey.shade50,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: isGfa
                                    ? Colors.green.shade300
                                    : Colors.grey.shade300,
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  isGfa
                                      ? Icons.verified_outlined
                                      : Icons.location_on_outlined,
                                  size: 14,
                                  color: isGfa
                                      ? Colors.green.shade700
                                      : Colors.grey.shade600,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  _bi(
                                    'Site Type: $activityType',
                                    'نوع الموقع: $activityType',
                                  ),
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: isGfa
                                        ? Colors.green.shade700
                                        : Colors.grey.shade600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 24),

                _buildLocationStatus(),

                const SizedBox(height: 24),

                _buildMmpDetails(),

                const SizedBox(height: 24),

                // Enumerator Fee Note
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.red.shade300, width: 1.5),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(
                            Icons.info_outlined,
                            color: Colors.red.shade700,
                            size: 18,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _bi('Enumerator Fee Note', 'ملاحظة رسوم الفنيين'),
                              style: AppTextStyles.labelLarge.copyWith(
                                color: Colors.red.shade700,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _bi(
                          '• If site has 2 activities (e.g., GFA + MDM):',
                          '• في حالة وجود نشاطين (مثل: GFA + MDM):',
                        ),
                        style: AppTextStyles.bodySmall.copyWith(
                          color: Colors.red.shade700,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _bi(
                          '⚠️ You MUST confirm with supervisor & coordinator first',
                          '⚠️ يجب عليك تأكيد الموافقة مع المشرف والمنسق أولاً',
                        ),
                        style: AppTextStyles.bodySmall.copyWith(
                          color: Colors.red.shade700,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _bi(
                          '✓ Clearly: Will you cover 2 activities at this site?',
                          '✓ بوضوح: هل سيتم تغطية كلا النشاطين في هذه الزيارة؟',
                        ),
                        style: AppTextStyles.bodySmall.copyWith(
                          color: Colors.red.shade700,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _bi(
                          '✓ Without confirmation = Only 1 site fee allowed',
                          '✓ بدون تأكيد = زيارة موقع واحدة فقط مسموح',
                        ),
                        style: AppTextStyles.bodySmall.copyWith(
                          color: Colors.red.shade700,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Divider(color: Colors.red.shade300, height: 1),
                      const SizedBox(height: 12),
                      Text(
                        _bi(
                          '• For Post-Distribution Monitoring (PDM):',
                          '• في نشاط رصد ما بعد التوزيع (PDM):',
                        ),
                        style: AppTextStyles.bodySmall.copyWith(
                          color: Colors.red.shade700,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _bi(
                          '⚠️ Total number of questionnaires MUST be agreed with WFP AO and Focal Point',
                          '⚠️ العدد الإجمالي للاستبيانات يجب أن يكون متفقاً عليه من WFP AO والنقطة البؤرية',
                        ),
                        style: AppTextStyles.bodySmall.copyWith(
                          color: Colors.red.shade700,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _bi(
                          '✓ Do NOT determine the number yourself - Get approval first',
                          '✓ لا تحدد العدد بنفسك - يجب الموافقة أولاً',
                        ),
                        style: AppTextStyles.bodySmall.copyWith(
                          color: Colors.red.shade700,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),

                if (_showActivitySelector()) ...[
                  const SizedBox(height: 24),
                  _buildActivityTypeSelector(),
                ],

                const SizedBox(height: 16),

                Row(
                  children: [
                    Icon(
                      Icons.note_outlined,
                      size: 20,
                      color: AppColors.primaryOrange,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        _bi('Visit Notes *', 'ملاحظات الزيارة *'),
                        style: AppTextStyles.titleMedium.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _notesController,
                  decoration: InputDecoration(
                    hintText: _bi(
                      'Describe what you observed and did during the visit...',
                      'صف ما لاحظته وما قمت به أثناء الزيارة...',
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    filled: true,
                    fillColor: Colors.grey.shade50,
                  ),
                  maxLines: 5,
                  textInputAction: TextInputAction.newline,
                ),

                const SizedBox(height: 16),

                Row(
                  children: [
                    Icon(
                      Icons.assignment_outlined,
                      size: 20,
                      color: AppColors.primaryOrange,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        _bi(
                          'Activities Performed (optional)',
                          'الأنشطة المنفذة (اختياري)',
                        ),
                        style: AppTextStyles.titleMedium.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _activitiesController,
                  decoration: InputDecoration(
                    hintText: _bi(
                      'List the activities you performed...',
                      'اذكر الأنشطة التي قمت بها....',
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    filled: true,
                    fillColor: Colors.grey.shade50,
                  ),
                  maxLines: 3,
                  textInputAction: TextInputAction.newline,
                ),

                const SizedBox(height: 24),

                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Icon(
                          Icons.image_outlined,
                          size: 20,
                          color: AppColors.primaryOrange,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '${_bi('Photos', 'الصور')} (${_photos.length})',
                          style: AppTextStyles.titleMedium.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    Row(
                      children: [
                        if (!kIsWeb)
                          IconButton(
                            onPressed: _takePhoto,
                            icon: const Icon(Icons.camera_alt),
                            tooltip: _bi('Take Photo', 'التقاط صورة'),
                            color: AppColors.primaryOrange,
                          ),
                        IconButton(
                          onPressed: _pickPhotos,
                          icon: const Icon(Icons.photo_library),
                          tooltip: _bi('Pick from Gallery', 'اختيار من المعرض'),
                          color: AppColors.primaryOrange,
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 8),

                if (_photos.isEmpty)
                  Container(
                    height: 120,
                    width: double.infinity,
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: Colors.grey.shade300,
                        style: BorderStyle.solid,
                      ),
                      borderRadius: BorderRadius.circular(12),
                      color: Colors.grey.shade50,
                    ),
                    child: InkWell(
                      onTap: _pickPhotos,
                      borderRadius: BorderRadius.circular(12),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.add_photo_alternate,
                            size: 48,
                            color: Colors.grey.shade400,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _bi('Tap to add photos', 'اضغط لإضافة صور'),
                            style: TextStyle(color: Colors.grey.shade600),
                          ),
                        ],
                      ),
                    ),
                  )
                else
                  SizedBox(
                    height: 120,
                    child: ListView.builder(
                      scrollDirection: Axis.horizontal,
                      itemCount: _photos.length + 1,
                      itemBuilder: (context, index) {
                        if (index == _photos.length) {
                          return Container(
                            width: 100,
                            margin: const EdgeInsets.only(right: 8),
                            decoration: BoxDecoration(
                              border: Border.all(color: Colors.grey.shade300),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: InkWell(
                              onTap: _pickPhotos,
                              borderRadius: BorderRadius.circular(12),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    Icons.add,
                                    size: 32,
                                    color: Colors.grey.shade400,
                                  ),
                                  Text(
                                    _bi('Add more', 'إضافة المزيد'),
                                    style: TextStyle(
                                      color: Colors.grey.shade600,
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }

                        return Stack(
                          children: [
                            Container(
                              width: 100,
                              margin: const EdgeInsets.only(right: 8),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(12),
                                image: DecorationImage(
                                  image: kIsWeb
                                      ? NetworkImage(_photos[index].path)
                                            as ImageProvider
                                      : FileImage(File(_photos[index].path)),
                                  fit: BoxFit.cover,
                                ),
                              ),
                            ),
                            Positioned(
                              top: 4,
                              right: 12,
                              child: GestureDetector(
                                onTap: () => _removePhoto(index),
                                child: Container(
                                  padding: const EdgeInsets.all(4),
                                  decoration: const BoxDecoration(
                                    color: Colors.red,
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(
                                    Icons.close,
                                    size: 16,
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

                const SizedBox(height: 32),

                if (!_isOnline) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: Colors.orange.shade50,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.orange.shade300),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.wifi_off, color: Colors.orange.shade700),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            _bi(
                              'You are offline. Save as Draft to continue later, or Complete to sync when back online.',
                              'أنت غير متصل بالإنترنت. احفظ كمسودة للمتابعة لاحقاً، أو أكمل للمزامنة عند الاتصال.',
                            ),
                            style: TextStyle(
                              color: Colors.orange.shade800,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],

                if (!_isOnline) ...[
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: OutlinedButton.icon(
                      onPressed: (_isSavingDraft || _isSubmitting)
                          ? null
                          : _saveDraft,
                      icon: _isSavingDraft
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.save_outlined),
                      label: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          _isSavingDraft
                              ? _bi('Saving Draft...', 'جاري حفظ المسودة...')
                              : _bi('Save as Draft', 'حفظ كمسودة'),
                          maxLines: 1,
                          softWrap: false,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.primaryBlue,
                        side: const BorderSide(
                          color: AppColors.primaryBlue,
                          width: 2,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],

                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton.icon(
                    onPressed: (_isSubmitting || _isSavingDraft)
                        ? null
                        : _submitReport,
                    icon: _isSubmitting
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
                        : const Icon(Icons.check_circle),
                    label: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        _isSubmitting
                            ? _bi('Submitting...', 'جاري الإرسال...')
                            : (_isOnline
                                  ? _bi('Submit Report', 'إرسال التقرير')
                                  : _bi(
                                      'Complete (Sync Later)',
                                      'إكمال (مزامنة لاحقاً)',
                                    )),
                        maxLines: 1,
                        softWrap: false,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.success,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 16),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildActivityTypeSelector() {
    final availableActivities = _getAvailableActivities();

    final showWhmDetails =
        _selectedActivities.contains('WHM') ||
        (availableActivities.length == 1 && availableActivities.first == 'WHM');

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.primaryOrange.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppColors.primaryOrange.withValues(alpha: 0.3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              Icon(
                Icons.check_circle_outlined,
                color: AppColors.primaryOrange,
                size: 20,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  _bi('SELECT ACTIVITIES *', 'اختر نشاط واحد أو أكثر *'),
                  style: AppTextStyles.titleSmall.copyWith(
                    color: AppColors.primaryOrange,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Activity checkboxes
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: availableActivities.map((activity) {
              final isSelected = _selectedActivities.contains(activity);
              final isMDM = activity == 'MDM';
              final isWHM = activity == 'WHM';
              final isPDM = activity == 'PDM';

              Color chipColor = AppColors.primaryOrange;
              if (isMDM) chipColor = Colors.blue.shade700;
              if (isWHM) chipColor = Colors.purple.shade600;

              return GestureDetector(
                onTap: () => setState(() {
                  if (isSelected) {
                    _selectedActivities.remove(activity);
                    // Clear related inputs
                    if (isPDM) {
                      _pdmQuestionnaires = 0;
                      _pdmQController.clear();
                    }
                    if (isMDM) {
                      _marketNameController.clear();
                    }
                  } else {
                    _selectedActivities.add(activity);
                  }
                }),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(
                    vertical: 6,
                    horizontal: 10,
                  ),
                  decoration: BoxDecoration(
                    color: isSelected ? chipColor : Colors.white,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      color: isSelected ? chipColor : Colors.grey.shade300,
                      width: isSelected ? 2 : 1.5,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        isSelected
                            ? Icons.check_circle
                            : Icons.radio_button_unchecked,
                        size: 16,
                        color: isSelected ? Colors.white : chipColor,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        activity,
                        style: AppTextStyles.labelSmall.copyWith(
                          color: isSelected ? Colors.white : chipColor,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if ((isMDM || isWHM) && isSelected) ...[
                        const SizedBox(width: 4),
                        Text(
                          '×2\n×٢',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              );
            }).toList(),
          ),

          // Fee summary
          if (_selectedActivities.isNotEmpty) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.accentGreen.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: AppColors.accentGreen.withValues(alpha: 0.3),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.info_rounded,
                    size: 16,
                    color: AppColors.accentGreen,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _bi(
                        'Expected fees: $_totalVisitFees site visit(s)',
                        'إجمالي الرسوم المتوقعة: $_totalVisitFees زيارة موقع',
                      ),
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.accentGreen,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],

          // WHM warehouse name input (appears before PDM to be more visible)
          if (showWhmDetails) ...[
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
                        size: 16,
                        color: Colors.purple.shade700,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _bi(
                            'Warehouse Monitoring — × 2 visits',
                            'رصد المستودع — × ٢ زيارة',
                          ),
                          style: AppTextStyles.labelLarge.copyWith(
                            color: Colors.purple.shade700,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _bi('Warehouse Name *', 'اسم المستودع *'),
                    style: AppTextStyles.labelLarge.copyWith(
                      color: Colors.purple.shade800,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    onChanged: (value) => setState(() {
                      _warehouseName = value;
                    }),
                    textDirection: _isArabic
                        ? TextDirection.rtl
                        : TextDirection.ltr,
                    decoration: InputDecoration(
                      hintText: _bi(
                        'Enter warehouse name...',
                        'أدخل اسم المستودع...',
                      ),
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
                  ),
                ],
              ),
            ),
          ],

          // PDM questionnaire input
          if (_selectedActivities.contains('PDM')) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.primaryOrange.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppColors.primaryOrange.withValues(alpha: 0.3),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.quiz_outlined,
                        size: 16,
                        color: AppColors.primaryOrange,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _bi(
                          'Questionnaires Submitted *',
                          'عدد الاستبيانات المقدمة *',
                        ),
                        style: AppTextStyles.labelLarge.copyWith(
                          color: AppColors.primaryOrange,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _bi(
                      'Every 7 questionnaires = 1 visit fee',
                      'كل 7 استبيانات = زيارة موقع واحدة',
                    ),
                    style: AppTextStyles.bodySmall.copyWith(
                      color: AppColors.primaryOrange.withValues(alpha: 0.8),
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _pdmQController,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      hintText: _bi('Enter count', 'أدخل العدد'),
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
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.accentGreen.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        _bi(
                          '$_pdmQuestionnaires ÷ $_pdmQPerVisit = $_pdmSiteVisits visit(s)',
                          '$_pdmQuestionnaires ÷ $_pdmQPerVisit = $_pdmSiteVisits زيارة',
                        ),
                        style: AppTextStyles.bodySmall.copyWith(
                          color: AppColors.accentGreen,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],

          // MDM market name input
          if (_selectedActivities.contains('MDM')) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.blue.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.blue.withValues(alpha: 0.3)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.store_outlined,
                        size: 16,
                        color: Colors.blue.shade700,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _bi(
                            'Market Diversion Monitoring — × 2 visits',
                            'رصد انحراف السوق — × ٢ زيارة',
                          ),
                          style: AppTextStyles.labelLarge.copyWith(
                            color: Colors.blue.shade700,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _bi('Market Name Covered *', 'اسم السوق المُغطى *'),
                    style: AppTextStyles.labelLarge.copyWith(
                      color: Colors.blue.shade800,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _marketNameController,
                    textDirection: _isArabic
                        ? TextDirection.rtl
                        : TextDirection.ltr,
                    decoration: InputDecoration(
                      hintText: _bi(
                        'Enter market name...',
                        'أدخل اسم السوق...',
                      ),
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
        ],
      ),
    );
  }

  Widget _buildMmpDetails() {
    final mainActivity = _resolvedMainActivity.isNotEmpty
        ? _resolvedMainActivity
        : 'N/A';

    final siteCode = widget.visit.siteCode.isNotEmpty
        ? widget.visit.siteCode
        : 'N/A';

    final locality = widget.visit.locality.isNotEmpty
        ? widget.visit.locality
        : 'N/A';

    final additionalData = widget.visit.additionalData ?? {};
    final hubOffice = additionalData['hub_office']?.toString() ?? 'N/A';
    final visitType = additionalData['visit_type']?.toString() ?? 'N/A';

    return Container(
      padding: const EdgeInsets.all(16),
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
              Icon(Icons.info_outline, color: Colors.orange.shade700, size: 20),
              const SizedBox(width: 8),
              Text(
                _bi('SITE DETAILS', 'تفاصيل الموقع'),
                style: AppTextStyles.labelMedium.copyWith(
                  color: Colors.orange.shade700,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Row 1: Site Code and Activity
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _bi('Site Code', 'رمز الموقع'),
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.textSecondary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      siteCode,
                      style: AppTextStyles.titleSmall.copyWith(
                        color: Colors.orange.shade700,
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      _bi('Main Activity', 'النشاط الرئيسي'),
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.textSecondary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      mainActivity,
                      style: AppTextStyles.titleSmall.copyWith(
                        color: Colors.orange.shade700,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Row 2: Locality and Visit Type
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _bi('Locality', 'المحلية'),
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.textSecondary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      locality,
                      style: AppTextStyles.titleSmall.copyWith(
                        color: Colors.orange.shade700,
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      _bi('Visit Type', 'نوع الزيارة'),
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.textSecondary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      visitType,
                      style: AppTextStyles.titleSmall.copyWith(
                        color: Colors.orange.shade700,
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Row 3: Hub Office and Status
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _bi('Hub Office', 'مكتب المركز'),
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.textSecondary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      hubOffice,
                      style: AppTextStyles.titleSmall.copyWith(
                        color: Colors.orange.shade700,
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      _bi('Status', 'الحالة'),
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.textSecondary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.green.shade50,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.green.shade300),
                      ),
                      child: Text(
                        _bi('Active', 'نشط'),
                        style: AppTextStyles.bodySmall.copyWith(
                          color: Colors.green.shade700,
                          fontWeight: FontWeight.w600,
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

  Widget _buildLocationStatus() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(
              _currentLocation != null
                  ? Icons.location_on
                  : _locationError != null
                  ? Icons.location_off
                  : Icons.location_searching,
              color: _currentLocation != null
                  ? AppColors.success
                  : _locationError != null
                  ? Colors.red
                  : AppColors.primaryOrange,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _bi('Final Location', 'الموقع النهائي'),
                    style: AppTextStyles.titleSmall,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _currentLocation != null
                        ? _bi(
                            _isLocationLocked
                                ? 'Locked • Lat: ${_currentLocation!.latitude.toStringAsFixed(6)}, Lon: ${_currentLocation!.longitude.toStringAsFixed(6)}'
                                : 'Lat: ${_currentLocation!.latitude.toStringAsFixed(6)}, Lon: ${_currentLocation!.longitude.toStringAsFixed(6)}',
                            _isLocationLocked
                                ? 'ثابت • خط العرض: ${_currentLocation!.latitude.toStringAsFixed(6)}، خط الطول: ${_currentLocation!.longitude.toStringAsFixed(6)}'
                                : 'خط العرض: ${_currentLocation!.latitude.toStringAsFixed(6)}، خط الطول: ${_currentLocation!.longitude.toStringAsFixed(6)}',
                          )
                        : _locationError ??
                              _bi(
                                'Getting location...',
                                'جاري الحصول على الموقع...',
                              ),
                    style: AppTextStyles.bodySmall.copyWith(
                      color: _locationError != null
                          ? Colors.red
                          : AppColors.textSecondary,
                    ),
                  ),
                  if (_currentLocation != null)
                    Text(
                      _bi(
                        'Accuracy: ${_currentLocation!.accuracy.toStringAsFixed(0)}m',
                        'الدقة: ${_currentLocation!.accuracy.toStringAsFixed(0)}م',
                      ),
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                ],
              ),
            ),
            if (_locationError != null && !_isLocationLocked)
              IconButton(
                onPressed: _getCurrentLocation,
                icon: const Icon(Icons.refresh),
                tooltip: _bi('Retry', 'إعادة المحاولة'),
              ),
          ],
        ),
      ),
    );
  }
}
