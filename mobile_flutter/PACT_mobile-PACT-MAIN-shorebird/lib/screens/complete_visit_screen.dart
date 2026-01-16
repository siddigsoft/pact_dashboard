import 'dart:io';
import 'dart:typed_data';
import 'dart:convert';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
import '../models/site_visit.dart';
import '../services/offline/models.dart';

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
  String? _locationError;
  bool _isOnline = true;
  late Stream<List<ConnectivityResult>> _connectivityStream;

  // Storage bucket configured in Supabase migrations:
  // supabase/migrations/20250127_add_site_visit_photos_bucket.sql
  static const String _reportPhotosBucket = 'site-visit-photos';

  @override
  void initState() {
    super.initState();
    _getCurrentLocation();
    _checkConnectivity();
    _loadDraftData();
  }

  @override
  void dispose() {
    _notesController.dispose();
    _activitiesController.dispose();
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
        final draft = drafts.first;
        
        // Parse combined notes and activities
        final parsed = _parseNotesAndActivities(draft.notes);
        
        // Restore notes
        if (parsed['notes']!.isNotEmpty) {
          _notesController.text = parsed['notes']!;
        }
        
        // Restore activities
        if (parsed['activities']!.isNotEmpty) {
          _activitiesController.text = parsed['activities']!;
        }
        
        // Restore photos from base64 strings
        if (draft.photos != null && draft.photos!.isNotEmpty) {
          await _restorePhotosFromDraft(draft.photos!);
        }
        
        if (mounted) {
          setState(() {});
          AppSnackBar.show(
            context,
            message: 'Draft loaded with ${_photos.length} photos. Continue where you left off!',
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
          if (!data.startsWith('data:') && !data.contains('base64') && File(data).existsSync()) {
            _photos.add(XFile(data));
            continue;
          }
          
          // Check if it's base64 encoded
          if (data.startsWith('data:image') || data.contains('base64') || _isBase64(data)) {
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
  
  /// Combine notes and activities into a single string for storage
  String _combineNotesAndActivities(String notes, String activities) {
    if (activities.isEmpty) {
      return notes;
    }
    return '$notes$_draftSeparator$activities';
  }
  
  /// Parse combined notes string into separate notes and activities
  Map<String, String> _parseNotesAndActivities(String? combined) {
    if (combined == null || combined.isEmpty) {
      return {'notes': '', 'activities': ''};
    }
    
    if (combined.contains(_draftSeparator)) {
      final parts = combined.split(_draftSeparator);
      return {
        'notes': parts[0],
        'activities': parts.length > 1 ? parts[1] : '',
      };
    }
    
    return {'notes': combined, 'activities': ''};
  }

  Future<void> _getCurrentLocation() async {
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

      final timeout = kIsWeb
          ? const Duration(seconds: 60)
          : const Duration(seconds: 20);

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
                final streamTimeout = kIsWeb
                    ? const Duration(seconds: 15)
                    : const Duration(seconds: 10);
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
        _currentLocation = position;
        _locationError = null;
      });
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
        message: 'Please add notes about your visit',
        type: SnackBarType.warning,
      );
      return;
    }

    // Ensure we have a final location before submitting.
    if (_currentLocation == null) {
      await _getCurrentLocation();
    }
    if (_currentLocation == null) {
      AppSnackBar.show(
        context,
        message:
            'Final location is required. Please tap Retry to capture location.',
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
      if (_currentLocation == null) {
        await _getCurrentLocation();
      }

      // Calculate visit duration
      final activeVisitState = ref.read(activeVisitProvider);
      final startTime = activeVisitState.startedAt;
      final durationMinutes = startTime != null
          ? DateTime.now().difference(startTime).inMinutes
          : null;

      // 1. Create the report
      final coordinates = _currentLocation != null
          ? {
              'latitude': _currentLocation!.latitude,
              'longitude': _currentLocation!.longitude,
              'accuracy': _currentLocation!.accuracy,
            }
          : <String, dynamic>{};

      final reportResponse = await supabase
          .from('reports')
          .insert({
            'site_visit_id': widget.visit.id,
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
        'latitude': _currentLocation!.latitude,
        'longitude': _currentLocation!.longitude,
        'accuracy': _currentLocation!.accuracy,
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
          message: 'Visit completed and report submitted successfully!',
          type: SnackBarType.success,
        );
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      debugPrint('Error submitting report: $e');
      if (mounted) {
        AppSnackBar.show(
          context,
          message: 'Failed to submit report: $e',
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
      final uuid = const Uuid();
      final now = DateTime.now();

      // Calculate visit duration
      final activeVisitState = ref.read(activeVisitProvider);
      final startTime = activeVisitState.startedAt;
      final durationMinutes = startTime != null
          ? now.difference(startTime).inMinutes
          : null;

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
        endLocation: _currentLocation != null
            ? {
                'lat': _currentLocation!.latitude,
                'lng': _currentLocation!.longitude,
                'accuracy': _currentLocation!.accuracy,
              }
            : null,
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
          'site_visit_id': widget.visit.id,
          'notes': _notesController.text.trim(),
          'activities': _activitiesController.text.trim().isEmpty
              ? null
              : _activitiesController.text.trim(),
          'duration_minutes': durationMinutes,
          'coordinates': _currentLocation != null
              ? {
                  'latitude': _currentLocation!.latitude,
                  'longitude': _currentLocation!.longitude,
                  'accuracy': _currentLocation!.accuracy,
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
          message: 'Visit saved offline! Will upload when you have internet.',
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
          message: 'Failed to save offline: $e',
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
      final uuid = const Uuid();
      final now = DateTime.now();
      final userId = Supabase.instance.client.auth.currentUser?.id;

      if (userId == null) {
        throw Exception('User not authenticated');
      }

      // Get or create draft ID - reuse existing draft if present
      String draftId;
      final existingDrafts = db
          .getAllSiteVisits()
          .where((v) => v.siteEntryId == widget.visit.id && v.status == 'draft')
          .toList();

      if (existingDrafts.isNotEmpty) {
        draftId = existingDrafts.first.id;
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

      // Combine notes and activities with separator for storage
      // Format: notes|||activities (can be parsed later on load)
      final combinedNotes = _combineNotesAndActivities(
        _notesController.text.trim(),
        _activitiesController.text.trim(),
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
        endLocation: _currentLocation != null
            ? {
                'lat': _currentLocation!.latitude,
                'lng': _currentLocation!.longitude,
                'accuracy': _currentLocation!.accuracy,
              }
            : null,
        photos: photoDataList,
        notes: combinedNotes,
        synced: false,
      );

      await db.saveSiteVisitOffline(draftVisit);

      if (mounted) {
        AppSnackBar.show(
          context,
          message: 'Draft saved! You can continue later.',
          type: SnackBarType.success,
          duration: const Duration(seconds: 3),
        );
        Navigator.of(context).pop(false); // false = not completed, just drafted
      }
    } catch (e) {
      debugPrint('Error saving draft: $e');
      if (mounted) {
        AppSnackBar.show(
          context,
          message: 'Failed to save draft: $e',
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('Complete Visit'),
        backgroundColor: AppColors.primaryOrange,
        foregroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Site info card
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
                        'Code: ${widget.visit.siteCode}',
                        style: AppTextStyles.bodySmall.copyWith(
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),

            const SizedBox(height: 24),

            // Location status
            _buildLocationStatus(),

            const SizedBox(height: 24),

            // Notes field
            Text('Visit Notes *', style: AppTextStyles.titleMedium),
            const SizedBox(height: 8),
            TextField(
              controller: _notesController,
              decoration: InputDecoration(
                hintText:
                    'Describe what you observed and did during the visit...',
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

            // Activities field
            Text(
              'Activities Performed (optional)',
              style: AppTextStyles.titleMedium,
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _activitiesController,
              decoration: InputDecoration(
                hintText: 'List the activities you performed...',
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

            // Photos section
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Photos (${_photos.length})',
                  style: AppTextStyles.titleMedium,
                ),
                Row(
                  children: [
                    if (!kIsWeb)
                      IconButton(
                        onPressed: _takePhoto,
                        icon: const Icon(Icons.camera_alt),
                        tooltip: 'Take Photo',
                        color: AppColors.primaryOrange,
                      ),
                    IconButton(
                      onPressed: _pickPhotos,
                      icon: const Icon(Icons.photo_library),
                      tooltip: 'Pick from Gallery',
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
                        'Tap to add photos',
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
                      // Add more button
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
                                'Add more',
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

            // Offline indicator
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
                        'You are offline. Save as Draft to continue later, or Complete to sync when back online.',
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

            // Draft button (only shown when offline)
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
                  label: Text(
                    _isSavingDraft ? 'Saving Draft...' : 'Save as Draft',
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.primaryBlue,
                    side: BorderSide(color: AppColors.primaryBlue, width: 2),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],

            // Submit/Complete button
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
                label: Text(
                  _isSubmitting
                      ? 'Submitting...'
                      : (_isOnline ? 'Submit Report' : 'Complete (Sync Later)'),
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
                  Text('Final Location', style: AppTextStyles.titleSmall),
                  const SizedBox(height: 2),
                  Text(
                    _currentLocation != null
                        ? 'Lat: ${_currentLocation!.latitude.toStringAsFixed(6)}, Lon: ${_currentLocation!.longitude.toStringAsFixed(6)}'
                        : _locationError ?? 'Getting location...',
                    style: AppTextStyles.bodySmall.copyWith(
                      color: _locationError != null
                          ? Colors.red
                          : AppColors.textSecondary,
                    ),
                  ),
                  if (_currentLocation != null)
                    Text(
                      'Accuracy: ${_currentLocation!.accuracy.toStringAsFixed(0)}m',
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                ],
              ),
            ),
            if (_locationError != null)
              IconButton(
                onPressed: _getCurrentLocation,
                icon: const Icon(Icons.refresh),
                tooltip: 'Retry',
              ),
          ],
        ),
      ),
    );
  }
}
