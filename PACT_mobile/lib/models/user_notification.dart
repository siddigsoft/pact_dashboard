class UserNotification {
  final String id;
  final String userId;
  final String title;
  final String titleAr;
  final String message;
  final String messageAr;
  final String type;
  final String priority;
  final String? eventType;
  final bool isRead;
  final DateTime createdAt;
  final String? link;
  final String? relatedEntityId;
  final String? relatedEntityType;

  UserNotification({
    required this.id,
    required this.userId,
    required this.title,
    this.titleAr = '',
    required this.message,
    this.messageAr = '',
    required this.type,
    this.priority = 'normal',
    this.eventType,
    required this.isRead,
    required this.createdAt,
    this.link,
    this.relatedEntityId,
    this.relatedEntityType,
  });

  bool get isBroadcast =>
      eventType == 'broadcast' || relatedEntityType == 'broadcast_batch';

  factory UserNotification.fromJson(Map<String, dynamic> json) {
    final rawUserId = json['user_id'] ?? json['recipient_id'];
    final userId = (rawUserId?.toString() ?? '').trim();

    final title =
        (json['title'] as String?)?.trim() ??
        (json['title_en'] as String?)?.trim() ??
        '';

    final titleAr = (json['title_ar'] as String?)?.trim() ?? '';

    final message =
        (json['message'] as String?)?.trim() ??
        (json['message_en'] as String?)?.trim() ??
        '';

    final messageAr = (json['message_ar'] as String?)?.trim() ?? '';

    final rawId = json['id'];
    final id = rawId != null ? rawId.toString() : '';

    final rawCreatedAt = json['created_at'];
    DateTime createdAt;
    if (rawCreatedAt == null) {
      createdAt = DateTime.now();
    } else if (rawCreatedAt is String) {
      try {
        createdAt = DateTime.parse(rawCreatedAt);
      } catch (_) {
        createdAt = DateTime.now();
      }
    } else if (rawCreatedAt is DateTime) {
      createdAt = rawCreatedAt;
    } else {
      createdAt = DateTime.now();
    }

    return UserNotification(
      id: id,
      userId: userId,
      title: title,
      titleAr: titleAr,
      message: message,
      messageAr: messageAr,
      type: (json['type'] as String?)?.trim() ?? 'info',
      priority: (json['priority'] as String?)?.trim() ?? 'normal',
      eventType: (json['event_type'] as String?)?.trim(),
      isRead: json['is_read'] == true,
      createdAt: createdAt,
      link:
          (json['link'] as String?)?.trim() ??
          (json['action_url'] as String?)?.trim(),
      relatedEntityId: json['related_entity_id']?.toString(),
      relatedEntityType:
          (json['related_entity_type'] as String?)?.trim() ??
          (json['entity_type'] as String?)?.trim(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'title': title,
      'title_ar': titleAr,
      'message': message,
      'message_ar': messageAr,
      'type': type,
      'priority': priority,
      'event_type': eventType,
      'is_read': isRead,
      'created_at': createdAt.toIso8601String(),
      'link': link,
      'related_entity_id': relatedEntityId,
      'related_entity_type': relatedEntityType,
    };
  }

  UserNotification copyWith({
    String? title,
    String? titleAr,
    String? message,
    String? messageAr,
    String? type,
    String? priority,
    String? eventType,
    bool? isRead,
    String? link,
    String? relatedEntityId,
    String? relatedEntityType,
  }) {
    return UserNotification(
      id: id,
      userId: userId,
      title: title ?? this.title,
      titleAr: titleAr ?? this.titleAr,
      message: message ?? this.message,
      messageAr: messageAr ?? this.messageAr,
      type: type ?? this.type,
      priority: priority ?? this.priority,
      eventType: eventType ?? this.eventType,
      isRead: isRead ?? this.isRead,
      createdAt: createdAt,
      link: link ?? this.link,
      relatedEntityId: relatedEntityId ?? this.relatedEntityId,
      relatedEntityType: relatedEntityType ?? this.relatedEntityType,
    );
  }
}
