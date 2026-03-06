class VisitLocationSettings {
  static const String locationAccuracyThresholdMetersSettingKey =
      'visit_location_accuracy_threshold_meters';

  static const int defaultLocationAccuracyThresholdMeters = 50;

  static int normalizeThreshold(dynamic value) {
    if (value is num) {
      final parsed = value.toInt();
      if (parsed >= 5 && parsed <= 200) {
        return parsed;
      }
    }
    return defaultLocationAccuracyThresholdMeters;
  }
}
