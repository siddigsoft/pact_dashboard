import 'package:geolocator/geolocator.dart';

/// Data class for visit report submission
class VisitReportData {
  final String activities;
  final String notes;
  final List<String> photos; // Local file paths for photos (will be uploaded)
  final int durationMinutes;
  final Position? coordinates;

  VisitReportData({
    required this.activities,
    required this.notes,
    required this.photos,
    required this.durationMinutes,
    this.coordinates,
  });
}

