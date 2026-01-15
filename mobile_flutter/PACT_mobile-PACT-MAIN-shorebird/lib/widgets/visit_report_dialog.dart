import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:google_fonts/google_fonts.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import '../theme/app_colors.dart';
import '../models/visit_report_data.dart';
import '../services/location_service.dart';

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

  void _loadDraftData() {
    final additionalData =
        widget.site['additional_data'] as Map<String, dynamic>?;
    if (additionalData != null) {
      _activitiesController.text = additionalData['draft_activities'] ?? '';
      _notesController.text = additionalData['draft_notes'] ?? '';
      _durationMinutes = additionalData['draft_visit_duration'] ?? 0;

      if (additionalData['draft_coordinates'] != null) {
        final coords =
            additionalData['draft_coordinates'] as Map<String, dynamic>;
        _coordinates = Position(
          latitude: coords['latitude'] ?? 0.0,
          longitude: coords['longitude'] ?? 0.0,
          timestamp: DateTime.now(),
          accuracy: coords['accuracy'] ?? 0.0,
          altitude: 0.0,
          heading: 0.0,
          speed: 0.0,
          speedAccuracy: 0.0,
          altitudeAccuracy: 0.0,
          headingAccuracy: 0.0,
        );
        _locationEnabled = true;
      }

      // Note: Draft photo URLs are not loaded here as they are URLs, not file paths
      // We only load file paths from image picker, not URLs from draft data
      // If you need to display draft photos, handle them separately
    }

    // Get visit start time from site
    final visitStartedAt = widget.site['visit_started_at'] as String?;
    if (visitStartedAt != null) {
      _visitStartTime = DateTime.tryParse(visitStartedAt);
    } else {
      _visitStartTime = DateTime.now();
    }
  }

  void _startVisitTimer() {
    // Calculate duration from visit start time
    if (_visitStartTime != null) {
      final now = DateTime.now();
      final duration = now.difference(_visitStartTime!);
      setState(() {
        _durationMinutes = duration.inMinutes;
      });

      // Update duration every minute
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

      // Request location permission
      final hasPermission = await LocationService.checkPermissions();
      if (!hasPermission) {
        setState(() {
          _isGettingLocation = false;
          _locationError = 'Location permission denied';
        });
        return;
      }

      // Get initial location
      final position = await LocationService.getCurrentLocation();
      if (position != null) {
        setState(() {
          _coordinates = position;
          _locationEnabled = true;
          _isGettingLocation = false;
        });
      }

      // Start location stream for continuous updates
      _positionStream =
          Geolocator.getPositionStream(
            locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.high,
              distanceFilter: 10, // Update every 10 meters
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
          _locationError = 'Could not get location';
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

    // Show options
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: const Text('Take Photo'),
              onTap: () => Navigator.pop(context, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Choose from Gallery'),
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
            content: Text('Error picking image: $e'),
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
      return '${hours}h ${mins}m';
    }
    return '${mins}m';
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    if (!_locationEnabled || _coordinates == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Location access is required to complete the site visit.',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_activitiesController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Please describe the activities performed during the visit.',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_photoPaths.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'At least one photo is required to complete the site visit.',
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
            content: Text('Error: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final siteName =
        widget.site['site_name'] ?? widget.site['siteName'] ?? 'Unknown Site';
    final siteCode =
        widget.site['site_code'] ??
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
            // Header
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
                          'Complete Site Visit',
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

            // Content
            Expanded(
              child: Form(
                key: _formKey,
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Location Status Card
                      _buildLocationStatusCard(),

                      const SizedBox(height: 20),

                      // Site Information Card
                      _buildSiteInfoCard(siteCode, locality, state),

                      const SizedBox(height: 20),

                      // Activities Field
                      _buildActivitiesField(),

                      const SizedBox(height: 20),

                      // Notes Field
                      _buildNotesField(),

                      const SizedBox(height: 20),

                      // Photos Section
                      _buildPhotosSection(),
                    ],
                  ),
                ),
              ),
            ),

            // Footer
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
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
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
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
                          : Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(Icons.check, size: 20),
                                const SizedBox(width: 8),
                                Text(
                                  'Complete Visit',
                                  style: GoogleFonts.poppins(
                                    fontSize: 14,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ],
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
                        'Location Status',
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        _coordinates == null
                            ? 'Acquiring location...'
                            : _coordinates!.accuracy <= 10
                            ? 'Excellent accuracy'
                            : 'Improving accuracy...',
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          color: AppColors.textLight,
                        ),
                      ),
                      if (_locationError != null)
                        Text(
                          _locationError!,
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: Colors.red,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
              if (_coordinates != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8.0),
                  child: TextButton.icon(
                    onPressed: _isGettingLocation ? null : _refreshLocation,
                    icon: const Icon(Icons.refresh, size: 18),
                    label: Text(
                      _isGettingLocation ? 'Refreshing...' : 'Refresh',
                    ),
                  ),
                ),
            ],
          ),
          if (_isGettingLocation && _coordinates == null)
            const Padding(
              padding: EdgeInsets.only(top: 16),
              child: LinearProgressIndicator(),
            ),
          if (_coordinates != null) ...[
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Accuracy',
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          color: AppColors.textLight,
                        ),
                      ),
                      Text(
                        '±${_coordinates!.accuracy.toStringAsFixed(1)}m',
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          fontFeatures: [const FontFeature.tabularFigures()],
                        ),
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
                        'Coordinates',
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          color: AppColors.textLight,
                        ),
                      ),
                      Text(
                        '${_coordinates!.latitude.toStringAsFixed(6)}, ${_coordinates!.longitude.toStringAsFixed(6)}',
                        textAlign: TextAlign.right,
                        softWrap: true,
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          fontFeatures: [const FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
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
            'SITE INFORMATION',
            style: GoogleFonts.poppins(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: AppColors.textLight,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'LOCATION',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: AppColors.textLight,
                      ),
                    ),
                    Text(
                      locality.isNotEmpty ? '$locality, $state' : state,
                      style: GoogleFonts.poppins(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
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
                      'SITE ID',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: AppColors.textLight,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        siteCode,
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ],
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
                      'ACTIVITY',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: AppColors.textLight,
                      ),
                    ),
                    Text(
                      widget.site['site_activity'] ?? 'N/A',
                      style: GoogleFonts.poppins(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
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
                      'DURATION',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: AppColors.textLight,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.access_time, size: 14),
                          const SizedBox(width: 4),
                          Text(
                            _formatDuration(_durationMinutes),
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
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
              'ACTIVITIES PERFORMED',
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
        const SizedBox(height: 12),
        TextFormField(
          controller: _activitiesController,
          maxLines: 4,
          decoration: InputDecoration(
            hintText:
                'Describe the activities performed during the site visit...',
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide.none,
            ),
            filled: true,
            fillColor: AppColors.backgroundGray,
          ),
          validator: (value) {
            if (value == null || value.trim().isEmpty) {
              return 'Activities are required';
            }
            return null;
          },
        ),
      ],
    );
  }

  Widget _buildNotesField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'ADDITIONAL NOTES',
          style: GoogleFonts.poppins(
            fontSize: 10,
            fontWeight: FontWeight.bold,
            color: AppColors.textLight,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _notesController,
          maxLines: 3,
          decoration: InputDecoration(
            hintText:
                'Any additional observations, issues, or recommendations...',
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
                    'SITE PHOTOS',
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
                'At least one photo required',
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
                  label: const Text('Add Photo'),
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

                // Skip if path is a URL (not a local file path)
                if (photoPath.startsWith('http://') ||
                    photoPath.startsWith('https://')) {
                  return const SizedBox.shrink();
                }

                // On web, dart:io File is not supported. Show a simple placeholder
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
                  '${_photoPaths.length} photo${_photoPaths.length != 1 ? 's' : ''} added',
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
