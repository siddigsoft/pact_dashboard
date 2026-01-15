// lib/models/comprehensive_safety_checklist.dart

class ComprehensiveSafetyChecklist {
  final String id;
  final DateTime createdAt;
  final String userId;
  
  // Enumerator & Site Details
  final String enumeratorName;
  final String enumeratorContact;
  final String teamLeader;
  
  // Site Information
  final String locationHub;
  final String siteNameId;
  final DateTime visitDate;
  final String visitTime;
  final List<String> activitiesMonitored; // AM, DM, PDM, MDM, PHL
  
  // Activity Monitoring (AM) - with Low/Med/High priority
  final Map<String, String> activityMonitoring; // question -> answer
  final Map<String, String> activityPriorities; // question -> priority (Low/Med/High)
  final List<String> activityPhotos;
  
  // Distribution Monitoring (DM)
  final Map<String, String> distributionMonitoring;
  final List<String> distributionPhotos;
  
  // Post-Distribution Monitoring (PDM)
  final Map<String, String> postDistributionMonitoring;
  final List<String> postDistributionPhotos;
  
  // Post-Harvest Loss (PHL)
  final Map<String, String> postHarvestLoss;
  final List<String> postHarvestPhotos;
  
  // Market Diversion Monitoring (MDM)
  final Map<String, String> marketDiversionMonitoring;
  final List<String> marketDiversionPhotos;
  
  // Additional notes
  final String additionalNotes;
  
  // Sync status
  final bool isSynced;
  final DateTime lastModified;

  ComprehensiveSafetyChecklist({
    required this.id,
    required this.createdAt,
    required this.userId,
    required this.enumeratorName,
    required this.enumeratorContact,
    required this.teamLeader,
    required this.locationHub,
    required this.siteNameId,
    required this.visitDate,
    required this.visitTime,
    required this.activitiesMonitored,
    required this.activityMonitoring,
    required this.activityPriorities,
    required this.activityPhotos,
    required this.distributionMonitoring,
    required this.distributionPhotos,
    required this.postDistributionMonitoring,
    required this.postDistributionPhotos,
    required this.postHarvestLoss,
    required this.postHarvestPhotos,
    required this.marketDiversionMonitoring,
    required this.marketDiversionPhotos,
    required this.additionalNotes,
    this.isSynced = false,
    required this.lastModified,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'created_at': createdAt.toIso8601String(),
      'user_id': userId,
      'enumerator_name': enumeratorName,
      'enumerator_contact': enumeratorContact,
      'team_leader': teamLeader,
      'location_hub': locationHub,
      'site_name_id': siteNameId,
      'visit_date': visitDate.toIso8601String(),
      'visit_time': visitTime,
      'activities_monitored': activitiesMonitored,
      'activity_monitoring': activityMonitoring,
      'activity_priorities': activityPriorities,
      'activity_photos': activityPhotos,
      'distribution_monitoring': distributionMonitoring,
      'distribution_photos': distributionPhotos,
      'post_distribution_monitoring': postDistributionMonitoring,
      'post_distribution_photos': postDistributionPhotos,
      'post_harvest_loss': postHarvestLoss,
      'post_harvest_photos': postHarvestPhotos,
      'market_diversion_monitoring': marketDiversionMonitoring,
      'market_diversion_photos': marketDiversionPhotos,
      'additional_notes': additionalNotes,
      'is_synced': isSynced,
      'last_modified': lastModified.toIso8601String(),
    };
  }

  factory ComprehensiveSafetyChecklist.fromJson(Map<String, dynamic> json) {
    return ComprehensiveSafetyChecklist(
      id: json['id'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
      userId: json['user_id'] as String,
      enumeratorName: json['enumerator_name'] as String,
      enumeratorContact: json['enumerator_contact'] as String,
      teamLeader: json['team_leader'] as String,
      locationHub: json['location_hub'] as String,
      siteNameId: json['site_name_id'] as String,
      visitDate: DateTime.parse(json['visit_date'] as String),
      visitTime: json['visit_time'] as String,
      activitiesMonitored: List<String>.from(json['activities_monitored'] as List),
      activityMonitoring: Map<String, String>.from(json['activity_monitoring'] as Map),
      activityPriorities: Map<String, String>.from(json['activity_priorities'] as Map),
      activityPhotos: List<String>.from(json['activity_photos'] as List),
      distributionMonitoring: Map<String, String>.from(json['distribution_monitoring'] as Map),
      distributionPhotos: List<String>.from(json['distribution_photos'] as List),
      postDistributionMonitoring: Map<String, String>.from(json['post_distribution_monitoring'] as Map),
      postDistributionPhotos: List<String>.from(json['post_distribution_photos'] as List),
      postHarvestLoss: Map<String, String>.from(json['post_harvest_loss'] as Map),
      postHarvestPhotos: List<String>.from(json['post_harvest_photos'] as List),
      marketDiversionMonitoring: Map<String, String>.from(json['market_diversion_monitoring'] as Map),
      marketDiversionPhotos: List<String>.from(json['market_diversion_photos'] as List),
      additionalNotes: json['additional_notes'] as String,
      isSynced: json['is_synced'] as bool? ?? false,
      lastModified: DateTime.parse(json['last_modified'] as String),
    );
  }
}
