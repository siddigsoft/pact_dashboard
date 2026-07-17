// lib/models/chat_contact.dart

class ChatContact {
  final String id;
  final String userId; // Current user's ID
  final String contactUserId; // The other person's ID
  final String? customName; // Custom name set by user
  final String? defaultName; // Default name from user profile
  final DateTime createdAt;
  final DateTime lastModified;

  ChatContact({
    required this.id,
    required this.userId,
    required this.contactUserId,
    this.customName,
    this.defaultName,
    required this.createdAt,
    required this.lastModified,
  });

  /// Get the display name (custom name if set, otherwise default name)
  String get displayName => customName ?? defaultName ?? 'Unknown User';

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'contact_user_id': contactUserId,
      'custom_name': customName,
      'default_name': defaultName,
      'created_at': createdAt.toIso8601String(),
      'last_modified': lastModified.toIso8601String(),
    };
  }

  factory ChatContact.fromJson(Map<String, dynamic> json) {
    return ChatContact(
      id: json['id'] as String,
      userId: json['user_id'] as String,
      contactUserId: json['contact_user_id'] as String,
      customName: json['custom_name'] as String?,
      defaultName: json['default_name'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
      lastModified: DateTime.parse(json['last_modified'] as String),
    );
  }

  ChatContact copyWith({
    String? id,
    String? userId,
    String? contactUserId,
    String? customName,
    String? defaultName,
    DateTime? createdAt,
    DateTime? lastModified,
  }) {
    return ChatContact(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      contactUserId: contactUserId ?? this.contactUserId,
      customName: customName ?? this.customName,
      defaultName: defaultName ?? this.defaultName,
      createdAt: createdAt ?? this.createdAt,
      lastModified: lastModified ?? this.lastModified,
    );
  }
}
