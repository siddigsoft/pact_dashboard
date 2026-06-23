class UserModel {
  final String id;
  final String email;
  final String? name;
  final String? role;
  final String? defaultRole;
  final String? hub;
  final String? state;
  final String? avatarUrl;
  final String? phone;
  final String? status;
  final Map<String, dynamic>? location;
  final String? locationUpdatedAt;

  const UserModel({
    required this.id,
    required this.email,
    this.name,
    this.role,
    this.defaultRole,
    this.hub,
    this.state,
    this.avatarUrl,
    this.phone,
    this.status,
    this.location,
    this.locationUpdatedAt,
  });

  factory UserModel.fromMap(Map<String, dynamic> map) {
    return UserModel(
      id: map['id'] as String? ?? '',
      email: map['email'] as String? ?? '',
      name: map['name'] as String?,
      role: map['role'] as String?,
      defaultRole: map['default_role'] as String?,
      hub: map['hub'] as String?,
      state: map['state'] as String?,
      avatarUrl: map['avatar_url'] as String?,
      phone: map['phone'] as String?,
      status: map['status'] as String?,
      location: map['location'] != null
          ? Map<String, dynamic>.from(map['location'] as Map)
          : null,
      locationUpdatedAt: map['location_updated_at'] as String?,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'email': email,
      'name': name,
      'role': role,
      'default_role': defaultRole,
      'hub': hub,
      'state': state,
      'avatar_url': avatarUrl,
      'phone': phone,
      'status': status,
      'location': location,
      'location_updated_at': locationUpdatedAt,
    };
  }

  String get displayName => name ?? email.split('@').first;

  String get effectiveRole => defaultRole ?? role ?? '';

  bool get isDataCollector {
    final r = effectiveRole.toLowerCase();
    return r.contains('datacollector') || r == 'datacollector' || r == 'data_collector' || r == 'enumerator';
  }

  bool get isCoordinator {
    final r = effectiveRole.toLowerCase();
    return r.contains('coordinator') && !isSupervisor && !isFOM && !isAdmin;
  }

  bool get isSupervisor {
    final r = effectiveRole.toLowerCase();
    return (r.contains('supervisor') || r.contains('hubsupervisor')) && !isFOM && !isAdmin;
  }

  bool get isFOM {
    final r = effectiveRole.toLowerCase();
    return r.contains('fom') || r.contains('field operation manager') || r.contains('field_operation_manager');
  }

  bool get isDataTeam {
    final r = effectiveRole.toLowerCase();
    return r.contains('datateam') || r.contains('data_team');
  }

  bool get isAdmin {
    final r = effectiveRole.toLowerCase();
    return r == 'admin' || r == 'super admin' || r == 'superadmin' || r == 'super_admin' || r == 'ict';
  }

  String get roleBadgeLabel {
    if (isDataCollector) return 'Data Collector';
    if (isSupervisor) return 'Supervisor';
    if (isCoordinator) return 'Coordinator';
    if (isFOM) return 'FOM';
    if (isDataTeam) return 'Data Team';
    if (isAdmin) return 'Admin';
    return effectiveRole;
  }

  UserModel copyWith({
    String? name,
    String? role,
    String? defaultRole,
    String? hub,
    String? state,
    String? avatarUrl,
    String? phone,
    String? status,
    Map<String, dynamic>? location,
    String? locationUpdatedAt,
  }) {
    return UserModel(
      id: id,
      email: email,
      name: name ?? this.name,
      role: role ?? this.role,
      defaultRole: defaultRole ?? this.defaultRole,
      hub: hub ?? this.hub,
      state: state ?? this.state,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      phone: phone ?? this.phone,
      status: status ?? this.status,
      location: location ?? this.location,
      locationUpdatedAt: locationUpdatedAt ?? this.locationUpdatedAt,
    );
  }
}
