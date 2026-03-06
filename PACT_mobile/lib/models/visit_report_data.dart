import 'package:geolocator/geolocator.dart';

/// Data class for visit report submission
class VisitReportData {
  final String activities;
  final String notes;
  final List<String> photos;
  final int durationMinutes;
  final Position? coordinates;
  final String? activityType;
  final List<String> selectedActivityTypes;

  /// Number of PDM questionnaires submitted (only relevant when activityType == 'PDM')
  final int pdmQuestionnaires;

  /// Whether this DM site has market diversion — counts as 2 visit fees
  final bool hasMarketDiversion;

  /// Market name covered for MDM activity, when provided.
  final String? marketName;

  /// Warehouse name covered for WHM activity, when provided.
  final String? warehouseName;

  VisitReportData({
    required this.activities,
    required this.notes,
    required this.photos,
    required this.durationMinutes,
    this.coordinates,
    this.activityType,
    this.selectedActivityTypes = const [],
    this.pdmQuestionnaires = 0,
    this.hasMarketDiversion = false,
    this.marketName,
    this.warehouseName,
  });

  /// How many site-visit fees this report represents
  int get visitFeeMultiplier {
    final activities = selectedActivityTypes.isNotEmpty
        ? selectedActivityTypes.map((item) => item.toUpperCase()).toSet()
        : {
            if (activityType != null && activityType!.trim().isNotEmpty)
              activityType!.trim().toUpperCase(),
          };

    if (activities.contains('MDM')) return 2;

    if (activities.contains('PDM') && pdmQuestionnaires > 0) {
      final visits = (pdmQuestionnaires / 7).floor();
      return visits > 0 ? visits : 1;
    }
    return 1;
  }
}
