/// Model for visit report stored in database
class VisitReport {
  final String siteId;
  final String activities; // Stored as string in database
  final String notes;
  final int durationMinutes;
  final double? latitude;
  final double? longitude;
  final double? accuracy;
  final List<String> photoUrls;
  final DateTime submittedAt;

  VisitReport({
    required this.siteId,
    required this.activities,
    required this.notes,
    required this.durationMinutes,
    this.latitude,
    this.longitude,
    this.accuracy,
    required this.photoUrls,
    required this.submittedAt,
  });

  Map<String, dynamic> toJson({String? submittedBy}) {
    return {
      'site_id': siteId,
      'submitted_by': submittedBy,
      'activities': activities,
      'notes': notes,
      'duration_minutes': durationMinutes,
      'latitude': latitude,
      'longitude': longitude,
      'accuracy': accuracy,
      'photo_urls': photoUrls,
      'submitted_at': submittedAt.toIso8601String(),
      'created_at': DateTime.now().toIso8601String(),
    };
  }
}
