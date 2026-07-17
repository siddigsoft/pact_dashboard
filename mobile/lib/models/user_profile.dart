class UserProfile {
  String id;
  String userId;
  String fullName;
  String email;
  String role; // 'admin', 'manager', 'worker'
  String department;
  DateTime createdAt;
  DateTime updatedAt;

  UserProfile({
    required this.id,
    required this.userId,
    required this.fullName,
    required this.email,
    required this.role,
    required this.department,
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'full_name': fullName,
      'email': email,
      'role': role,
      'department': department,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    // Defensive parsing: handle nulls and unexpected types gracefully
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

    return UserProfile(
      id: asString(json['id']),
      userId: asString(json['user_id']),
      fullName: asString(json['full_name']),
      email: asString(json['email']),
      role: asString(json['role'], fallback: 'worker'),
      department: asString(json['department']),
      createdAt: parseDate(json['created_at']),
      updatedAt: parseDate(json['updated_at']),
    );
  }
}
