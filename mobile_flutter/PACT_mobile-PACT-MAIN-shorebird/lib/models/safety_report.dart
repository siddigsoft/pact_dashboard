class SafetyReport {
  String id;
  String title;
  String description;
  String status; // 'draft', 'submitted', 'reviewed'
  DateTime createdAt;
  DateTime? submittedAt;
  String location;
  List<String> hazards;
  List<String> recommendations;
  String? incidentType; // For incident reports
  DateTime? incidentDate; // For incident reports
  List<String>? witnesses; // For incident reports
  bool? requiresImmediate; // For incident reports
  String? actionTaken; // For incident reports
  List<String>? mediaUrls; // For incident reports
  String? reportedBy; // For incident reports
  Map<String, dynamic>? metadata;

  SafetyReport({
    required this.id,
    required this.title,
    required this.description,
    required this.status,
    required this.createdAt,
    this.submittedAt,
    required this.location,
    required this.hazards,
    required this.recommendations,
    this.incidentType,
    this.incidentDate,
    this.witnesses,
    this.requiresImmediate,
    this.actionTaken,
    this.mediaUrls,
    this.reportedBy,
    this.metadata,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'description': description,
      'status': status,
      'createdAt': createdAt.toIso8601String(),
      'submittedAt': submittedAt?.toIso8601String(),
      'location': location,
      'hazards': hazards,
      'recommendations': recommendations,
      'incidentType': incidentType,
      'incidentDate': incidentDate?.toIso8601String(),
      'witnesses': witnesses,
      'requiresImmediate': requiresImmediate,
      'actionTaken': actionTaken,
      'mediaUrls': mediaUrls,
      'reportedBy': reportedBy,
      'metadata': metadata,
    };
  }

  factory SafetyReport.fromJson(Map<String, dynamic> json) {
    return SafetyReport(
      id: json['id'],
      title: json['title'],
      description: json['description'],
      status: json['status'],
      createdAt: DateTime.parse(json['createdAt']),
      submittedAt: json['submittedAt'] != null ? DateTime.parse(json['submittedAt']) : null,
      location: json['location'],
      hazards: List<String>.from(json['hazards']),
      recommendations: List<String>.from(json['recommendations']),
      incidentType: json['incidentType'],
      incidentDate: json['incidentDate'] != null ? DateTime.parse(json['incidentDate']) : null,
      witnesses: json['witnesses'] != null ? List<String>.from(json['witnesses']) : null,
      requiresImmediate: json['requiresImmediate'],
      actionTaken: json['actionTaken'],
      mediaUrls: json['mediaUrls'] != null ? List<String>.from(json['mediaUrls']) : null,
      reportedBy: json['reportedBy'],
      metadata: json['metadata'],
    );
  }
}