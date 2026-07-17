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

  // Backwards-compatible fields expected by older tests/code
  String? title;
  String? description;
  String? status;
  DateTime? dueDate;
  String? assignedTo;
  String? priority;

  Task({
    required this.id,
    this.userId = '',
    String? siteName,
    String? siteAddress,
    this.arrivalTime,
    this.departureTime,
    String? visitStatus,
    this.notes,
    this.journeyPath,
    DateTime? createdAt,
    DateTime? updatedAt,
    // legacy params
    this.title,
    this.description,
    this.status,
    this.dueDate,
    this.assignedTo,
    this.priority,
  }) : siteName = siteName ?? (title ?? ''),
       siteAddress = siteAddress ?? (description ?? ''),
       visitStatus = visitStatus ?? (status ?? 'pending'),
       createdAt = createdAt ?? DateTime.now(),
       updatedAt = updatedAt ?? DateTime.now();

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
      // legacy keys
      'title': title ?? siteName,
      'description': description ?? notes,
      'status': status ?? visitStatus,
      'dueDate': dueDate?.toIso8601String(),
      'assignedTo': assignedTo,
      'priority': priority,
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
      arrivalTime: json['arrival_time'] != null
          ? parseDate(json['arrival_time'])
          : null,
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
      // legacy fields
      title: json['title'] != null ? asString(json['title']) : null,
      description: json['description'] != null
          ? asString(json['description'])
          : null,
      status: json['status'] != null ? asString(json['status']) : null,
      dueDate: json['dueDate'] != null ? parseDate(json['dueDate']) : null,
      assignedTo: json['assignedTo'] != null
          ? asString(json['assignedTo'])
          : null,
      priority: json['priority'] != null ? asString(json['priority']) : null,
    );
  }
}
