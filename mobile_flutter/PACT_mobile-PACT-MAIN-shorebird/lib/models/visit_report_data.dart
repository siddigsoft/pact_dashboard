import 'package:geolocator/geolocator.dart';

/// Data class for visit report submission
class VisitReportData {
  final String activities;
  final String notes;
  final List<String> photos;
  final int durationMinutes;
  final Position? coordinates;
  final String? activityType;

  VisitReportData({
    required this.activities,
    required this.notes,
    required this.photos,
    required this.durationMinutes,
    this.coordinates,
    this.activityType,
  });
}

