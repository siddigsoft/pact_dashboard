class IncidentReport {
  String id;
  String userId;
  String? siteVisitId;
  String incidentType;
  String description;
  String severity; // 'minor', 'moderate', 'major', 'critical'
  String location;
  DateTime incidentDate;
  List<String>? witnesses;
  String? immediateActionTaken;
  bool requiresFollowUp;
  DateTime createdAt;
  DateTime updatedAt;

  IncidentReport({
    required this.id,
    required this.userId,
    this.siteVisitId,
    required this.incidentType,
    required this.description,
    required this.severity,
    required this.location,
    required this.incidentDate,
    this.witnesses,
    this.immediateActionTaken,
    required this.requiresFollowUp,
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'site_visit_id': siteVisitId,
      'incident_type': incidentType,
      'description': description,
      'severity': severity,
      'location': location,
      'incident_date': incidentDate.toIso8601String(),
      'witnesses': witnesses,
      'immediate_action_taken': immediateActionTaken,
      'requires_follow_up': requiresFollowUp,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  factory IncidentReport.fromJson(Map<String, dynamic> json) {
    return IncidentReport(
      id: json['id'],
      userId: json['user_id'],
      siteVisitId: json['site_visit_id'],
      incidentType: json['incident_type'],
      description: json['description'],
      severity: json['severity'],
      location: json['location'],
      incidentDate: DateTime.parse(json['incident_date']),
      witnesses: json['witnesses'] != null ? List<String>.from(json['witnesses']) : null,
      immediateActionTaken: json['immediate_action_taken'],
      requiresFollowUp: json['requires_follow_up'] ?? false,
      createdAt: DateTime.parse(json['created_at']),
      updatedAt: DateTime.parse(json['updated_at']),
    );
  }
}
