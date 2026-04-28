import 'package:json_annotation/json_annotation.dart';

// ==================== ENUMS ====================

enum NotificationCategory {
  assignments,
  approvals,
  financial,
  team,
  system,
  signatures,
  calls,
  messages,
}

enum NotificationPriority { low, medium, high, urgent }

enum NotificationType { info, success, warning, error }

enum RelatedEntityType {
  siteVisit,
  mmpFile,
  transaction,
  chat,
  call,
  signature,
  document,
  user,
  @JsonValue('costSubmission')
  costSubmission,
  @JsonValue('wallet')
  wallet,
  @JsonValue('downPayment')
  downPayment,
  @JsonValue('retainer')
  retainer,
  @JsonValue('account')
  account,
  @JsonValue('recovery')
  recovery,
}

// ==================== NOTIFICATION MODELS ====================

class AppNotification {
  final String id;
  final String userId;
  final String title;
  final String? titleAr;
  final String message;
  final String? messageAr;
  final NotificationType type;
  final bool isRead;
  final DateTime createdAt;
  final String? link;
  final String? relatedEntityId;
  @JsonKey(name: 'related_entity_type')
  final RelatedEntityType? relatedEntityType;
  @JsonKey(name: 'category')
  final NotificationCategory? category;
  @JsonKey(name: 'priority')
  final NotificationPriority? priority;
  final List<String>? targetRoles;
  final String? projectId;

  AppNotification({
    required this.id,
    required this.userId,
    required this.title,
    this.titleAr,
    required this.message,
    this.messageAr,
    this.type = NotificationType.info,
    this.isRead = false,
    required this.createdAt,
    this.link,
    this.relatedEntityId,
    this.relatedEntityType,
    this.category,
    this.priority = NotificationPriority.medium,
    this.targetRoles,
    this.projectId,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) =>
      AppNotification(
        id: json['id'] as String,
        userId: json['userId'] as String,
        title: json['title'] as String,
        titleAr: json['title_ar'] as String?,
        message: json['message'] as String,
        messageAr: json['message_ar'] as String?,
        type: json['type'] == null
            ? NotificationType.info
            : _notificationTypeFromJson(json['type'] as String?),
        isRead: json['is_read'] as bool? ?? false,
        createdAt: DateTime.parse(json['created_at'] as String),
        link: json['link'] as String?,
        relatedEntityId: json['related_entity_id'] as String?,
        relatedEntityType: _relatedEntityTypeFromJson(
          json['related_entity_type'] as String?,
        ),
        category: _notificationCategoryFromJson(json['category'] as String?),
        priority: json['priority'] == null
            ? NotificationPriority.medium
            : _notificationPriorityFromJson(json['priority'] as String?),
        targetRoles: (json['target_roles'] as List<dynamic>?)
            ?.map((e) => e as String)
            .toList(),
        projectId: json['project_id'] as String?,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
    'id': id,
    'userId': userId,
    'title': title,
    if (titleAr != null) 'title_ar': titleAr,
    'message': message,
    if (messageAr != null) 'message_ar': messageAr,
    'type': _notificationTypeToJson(type),
    'is_read': isRead,
    'created_at': createdAt.toIso8601String(),
    'link': link,
    'related_entity_id': relatedEntityId,
    'related_entity_type': _relatedEntityTypeToJson(relatedEntityType),
    'category': _notificationCategoryToJson(category),
    'priority': _notificationPriorityToJson(priority),
    'target_roles': targetRoles,
    'project_id': projectId,
  };

  AppNotification copyWith({
    String? id,
    String? userId,
    String? title,
    String? message,
    NotificationType? type,
    bool? isRead,
    DateTime? createdAt,
    String? link,
    String? relatedEntityId,
    RelatedEntityType? relatedEntityType,
    NotificationCategory? category,
    NotificationPriority? priority,
    List<String>? targetRoles,
    String? projectId,
  }) {
    return AppNotification(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      title: title ?? this.title,
      message: message ?? this.message,
      type: type ?? this.type,
      isRead: isRead ?? this.isRead,
      createdAt: createdAt ?? this.createdAt,
      link: link ?? this.link,
      relatedEntityId: relatedEntityId ?? this.relatedEntityId,
      relatedEntityType: relatedEntityType ?? this.relatedEntityType,
      category: category ?? this.category,
      priority: priority ?? this.priority,
      targetRoles: targetRoles ?? this.targetRoles,
      projectId: projectId ?? this.projectId,
    );
  }

  bool get isUrgent => priority == NotificationPriority.urgent;
  bool get isHighPriority =>
      priority == NotificationPriority.urgent ||
      priority == NotificationPriority.high;
}

// ==================== NOTIFICATION PREFERENCES ====================

class NotificationPreferences {
  final bool enabled;
  final bool email;
  final bool sound;
  final bool browserPush;
  final bool vibration;
  final Map<String, bool> categories;
  final QuietHours? quietHours;
  final String frequency; // 'instant', 'hourly', 'daily', 'weekly'
  final int autoDeleteDays;

  NotificationPreferences({
    this.enabled = true,
    this.email = true,
    this.sound = true,
    this.browserPush = true,
    this.vibration = true,
    Map<String, bool>? categories,
    this.quietHours,
    this.frequency = 'instant',
    this.autoDeleteDays = 30,
  }) : categories =
           categories ??
           {
             'assignments': true,
             'approvals': true,
             'financial': true,
             'team': true,
             'system': true,
             'signatures': true,
             'calls': true,
             'messages': true,
           };

  factory NotificationPreferences.fromJson(Map<String, dynamic> json) =>
      NotificationPreferences(
        enabled: json['enabled'] as bool? ?? true,
        email: json['email'] as bool? ?? true,
        sound: json['sound'] as bool? ?? true,
        browserPush: json['browser_push'] as bool? ?? true,
        vibration: json['vibration'] as bool? ?? true,
        categories:
            (json['categories'] as Map<String, dynamic>?)?.map(
              (k, e) => MapEntry(k, e as bool),
            ) ??
            {
              'assignments': true,
              'approvals': true,
              'financial': true,
              'team': true,
              'system': true,
              'signatures': true,
              'calls': true,
              'messages': true,
            },
        quietHours: json['quiet_hours'] == null
            ? null
            : QuietHours.fromJson(json['quiet_hours'] as Map<String, dynamic>),
        frequency: json['frequency'] as String? ?? 'instant',
        autoDeleteDays: (json['auto_delete_days'] as num?)?.toInt() ?? 30,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
    'enabled': enabled,
    'email': email,
    'sound': sound,
    'browser_push': browserPush,
    'vibration': vibration,
    'categories': categories,
    'quiet_hours': quietHours,
    'frequency': frequency,
    'auto_delete_days': autoDeleteDays,
  };

  NotificationPreferences copyWith({
    bool? enabled,
    bool? email,
    bool? sound,
    bool? browserPush,
    bool? vibration,
    Map<String, bool>? categories,
    QuietHours? quietHours,
    String? frequency,
    int? autoDeleteDays,
  }) {
    return NotificationPreferences(
      enabled: enabled ?? this.enabled,
      email: email ?? this.email,
      sound: sound ?? this.sound,
      browserPush: browserPush ?? this.browserPush,
      vibration: vibration ?? this.vibration,
      categories: categories ?? this.categories,
      quietHours: quietHours ?? this.quietHours,
      frequency: frequency ?? this.frequency,
      autoDeleteDays: autoDeleteDays ?? this.autoDeleteDays,
    );
  }

  bool isCategoryEnabled(NotificationCategory category) {
    final key = category.toString().split('.').last;
    return categories[key] ?? true;
  }
}

class QuietHours {
  final bool enabled;
  final int startHour;
  final int endHour;
  final String? timezone;

  QuietHours({
    required this.enabled,
    required this.startHour,
    required this.endHour,
    this.timezone,
  });

  factory QuietHours.fromJson(Map<String, dynamic> json) => QuietHours(
    enabled: json['enabled'] as bool,
    startHour: (json['start_hour'] as num).toInt(),
    endHour: (json['end_hour'] as num).toInt(),
    timezone: json['timezone'] as String?,
  );

  Map<String, dynamic> toJson() => <String, dynamic>{
    'enabled': enabled,
    'start_hour': startHour,
    'end_hour': endHour,
    'timezone': timezone,
  };

  bool isWithinQuietHours() {
    if (!enabled) return false;

    final now = DateTime.now();
    final currentHour = now.hour;

    if (startHour <= endHour) {
      return currentHour >= startHour && currentHour < endHour;
    } else {
      // Quiet hours span midnight
      return currentHour >= startHour || currentHour < endHour;
    }
  }
}

// ==================== NOTIFICATION TRIGGER OPTIONS ====================

class NotificationTriggerOptions {
  final String userId;
  final String title;
  final String? titleAr;
  final String message;
  final String? messageAr;
  final NotificationType type;
  final NotificationCategory category;
  final NotificationPriority priority;
  final String? link;
  final String? relatedEntityId;
  final RelatedEntityType? relatedEntityType;
  final List<String>? targetRoles;
  final String? projectId;
  final bool sendEmail;
  final String? emailActionUrl;
  final String? emailActionLabel;

  NotificationTriggerOptions({
    required this.userId,
    required this.title,
    this.titleAr,
    required this.message,
    this.messageAr,
    this.type = NotificationType.info,
    this.category = NotificationCategory.system,
    this.priority = NotificationPriority.medium,
    this.link,
    this.relatedEntityId,
    this.relatedEntityType,
    this.targetRoles,
    this.projectId,
    this.sendEmail = false,
    this.emailActionUrl,
    this.emailActionLabel,
  });

  factory NotificationTriggerOptions.fromJson(Map<String, dynamic> json) {
    NotificationType type = NotificationType.info;
    if (json['type'] != null) {
      type = _notificationTypeFromJson(json['type'] as String?);
    }
    NotificationCategory category = NotificationCategory.system;
    if (json['category'] != null) {
      category = _notificationCategoryFromJson(json['category'] as String?)!;
    }
    NotificationPriority priority = NotificationPriority.medium;
    if (json['priority'] != null) {
      priority = _notificationPriorityFromJson(json['priority'] as String?)!;
    }
    RelatedEntityType? relatedEntityType = _relatedEntityTypeFromJson(
      json['related_entity_type'] as String?,
    );
    return NotificationTriggerOptions(
      userId: json['userId'] as String,
      title: json['title'] as String,
      titleAr: json['title_ar'] as String?,
      message: json['message'] as String,
      messageAr: json['message_ar'] as String?,
      type: type,
      category: category,
      priority: priority,
      link: json['link'] as String?,
      relatedEntityId: json['related_entity_id'] as String?,
      relatedEntityType: relatedEntityType,
      targetRoles: (json['target_roles'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      projectId: json['project_id'] as String?,
      sendEmail: json['send_email'] as bool? ?? false,
      emailActionUrl: json['email_action_url'] as String?,
      emailActionLabel: json['email_action_label'] as String?,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
    'userId': userId,
    'title': title,
    'title_ar': titleAr,
    'message': message,
    'message_ar': messageAr,
    'type': _notificationTypeToJson(type),
    'category': _notificationCategoryToJson(category)!,
    'priority': _notificationPriorityToJson(priority)!,
    'link': link,
    'related_entity_id': relatedEntityId,
    'related_entity_type': _relatedEntityTypeToJson(relatedEntityType),
    'target_roles': targetRoles,
    'project_id': projectId,
    'send_email': sendEmail,
    'email_action_url': emailActionUrl,
    'email_action_label': emailActionLabel,
  };
}

// ==================== NOTIFICATION STATS ====================

class NotificationStats {
  final int total;
  final int unread;
  final int byCategory;
  final DateTime? lastReadAt;

  NotificationStats({
    required this.total,
    required this.unread,
    required this.byCategory,
    this.lastReadAt,
  });

  factory NotificationStats.fromJson(Map<String, dynamic> json) =>
      NotificationStats(
        total: (json['total'] as num).toInt(),
        unread: (json['unread'] as num).toInt(),
        byCategory: (json['byCategory'] as num).toInt(),
        lastReadAt: json['last_read_at'] == null
            ? null
            : DateTime.parse(json['last_read_at'] as String),
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
    'total': total,
    'unread': unread,
    'byCategory': byCategory,
    'last_read_at': lastReadAt?.toIso8601String(),
  };
}

// ==================== JSON CONVERSION HELPERS ====================

NotificationType _notificationTypeFromJson(String? value) {
  return NotificationType.values.firstWhere(
    (e) => e.toString().split('.').last == value,
    orElse: () => NotificationType.info,
  );
}

String _notificationTypeToJson(NotificationType type) {
  return type.toString().split('.').last;
}

RelatedEntityType? _relatedEntityTypeFromJson(String? value) {
  if (value == null) return null;
  return RelatedEntityType.values.firstWhere(
    (e) => e.toString().split('.').last == value,
    orElse: () => RelatedEntityType.document,
  );
}

String? _relatedEntityTypeToJson(RelatedEntityType? type) {
  return type?.toString().split('.').last;
}

NotificationCategory? _notificationCategoryFromJson(String? value) {
  if (value == null) return null;
  return NotificationCategory.values.firstWhere(
    (e) => e.toString().split('.').last == value,
    orElse: () => NotificationCategory.system,
  );
}

String? _notificationCategoryToJson(NotificationCategory? category) {
  return category?.toString().split('.').last;
}

NotificationPriority? _notificationPriorityFromJson(String? value) {
  if (value == null) return null;
  return NotificationPriority.values.firstWhere(
    (e) => e.toString().split('.').last == value,
    orElse: () => NotificationPriority.medium,
  );
}

String? _notificationPriorityToJson(NotificationPriority? priority) {
  return priority?.toString().split('.').last;
}
