class UserNotification {
  final String id;
  final String userId;
  final String title;
  final String message;
  final String type;
  final bool isRead;
  final DateTime createdAt;
  final String? link;
  final String? relatedEntityId;
  final String? relatedEntityType;

  UserNotification({
    required this.id,
    required this.userId,
    required this.title,
    required this.message,
    required this.type,
    required this.isRead,
    required this.createdAt,
    this.link,
    this.relatedEntityId,
    this.relatedEntityType,
  });

  factory UserNotification.fromJson(Map<String, dynamic> json) {
    // Handle both user_id and recipient_id columns
    // The table has both, so we need to check which one is populated
    final userId = (json['user_id'] as String?) ?? 
                   (json['recipient_id'] as String?) ?? 
                   '';
    
    // Handle title - check both 'title' and 'title_en' columns
    final title = (json['title'] as String?)?.trim() ?? 
                  (json['title_en'] as String?)?.trim() ?? 
                  '';
    
    // Handle message - check both 'message' and 'message_en' columns
    final message = (json['message'] as String?)?.trim() ?? 
                    (json['message_en'] as String?)?.trim() ?? 
                    '';
    
    return UserNotification(
      id: json['id'] as String,
      userId: userId,
      title: title,
      message: message,
      type: (json['type'] as String?)?.trim() ?? 'info',
      isRead: json['is_read'] == true,
      createdAt: DateTime.parse(json['created_at'] as String),
      link: (json['link'] as String?)?.trim() ?? (json['action_url'] as String?)?.trim(),
      relatedEntityId: json['related_entity_id']?.toString(),
      relatedEntityType: (json['related_entity_type'] as String?)?.trim() ?? 
                         (json['entity_type'] as String?)?.trim(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'title': title,
      'message': message,
      'type': type,
      'is_read': isRead,
      'created_at': createdAt.toIso8601String(),
      'link': link,
      'related_entity_id': relatedEntityId,
      'related_entity_type': relatedEntityType,
    };
  }

  UserNotification copyWith({
    String? title,
    String? message,
    String? type,
    bool? isRead,
    String? link,
    String? relatedEntityId,
    String? relatedEntityType,
  }) {
    return UserNotification(
      id: id,
      userId: userId,
      title: title ?? this.title,
      message: message ?? this.message,
      type: type ?? this.type,
      isRead: isRead ?? this.isRead,
      createdAt: createdAt,
      link: link ?? this.link,
      relatedEntityId: relatedEntityId ?? this.relatedEntityId,
      relatedEntityType: relatedEntityType ?? this.relatedEntityType,
    );
  }
}
