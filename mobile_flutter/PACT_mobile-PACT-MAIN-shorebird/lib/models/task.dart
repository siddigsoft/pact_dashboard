class Task {
  String id;
  String userId;
  String siteName;
  String siteAddress;
  DateTime? arrivalTime;
  DateTime? departureTime;
  String visitStatus; // 'planned', 'in_progress', 'completed', 'cancelled'
  String? notes;
  List<Map<String, dynamic>>? journeyPath; // GPS coordinates over time
  DateTime createdAt;
  DateTime updatedAt;

  Task({
    required this.id,
    required this.userId,
    required this.siteName,
    required this.siteAddress,
    this.arrivalTime,
    this.departureTime,
    required this.visitStatus,
    this.notes,
    this.journeyPath,
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'site_name': siteName,
      'site_address': siteAddress,
      'arrival_time': arrivalTime?.toIso8601String(),
      'departure_time': departureTime?.toIso8601String(),
      'visit_status': visitStatus,
      'notes': notes,
      'journey_path': journeyPath,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  factory Task.fromJson(Map<String, dynamic> json) {
    String asString(dynamic v, {String fallback = ''}) {
      if (v == null) return fallback;
      if (v is String) return v;
      return v.toString();
    }

    DateTime parseDate(dynamic v) {
      if (v == null) return DateTime.now();
      try {
        return DateTime.parse(v as String);
      } catch (_) {
        return DateTime.now();
      }
    }

    return Task(
      id: asString(json['id']),
      userId: asString(json['user_id']),
      siteName: asString(json['site_name']),
      siteAddress: asString(json['site_address']),
      arrivalTime:
          json['arrival_time'] != null ? parseDate(json['arrival_time']) : null,
      departureTime: json['departure_time'] != null
          ? parseDate(json['departure_time'])
          : null,
      visitStatus: asString(json['visit_status'], fallback: 'planned'),
      notes: json['notes'] == null ? null : asString(json['notes']),
      journeyPath: json['journey_path'] != null
          ? List<Map<String, dynamic>>.from(json['journey_path'])
          : null,
      createdAt: parseDate(json['created_at']),
      updatedAt: parseDate(json['updated_at']),
    );
  }
}
