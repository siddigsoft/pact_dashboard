class ProfileOption {
  final String id;
  final String name;
  final String? email;
  final String? role;
  final String? departmentId;

  const ProfileOption({
    required this.id,
    required this.name,
    this.email,
    this.role,
    this.departmentId,
  });

  factory ProfileOption.fromJson(Map<String, dynamic> json) {
    return ProfileOption(
      id: json['id']?.toString() ?? '',
      name: json['full_name']?.toString() ??
          json['name']?.toString() ??
          json['email']?.toString() ??
          'User',
      email: json['email']?.toString(),
      role: json['role']?.toString(),
      departmentId: json['department_id']?.toString(),
    );
  }

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return '${parts.first[0]}${parts[1][0]}'.toUpperCase();
  }
}
