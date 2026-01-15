import 'package:json_annotation/json_annotation.dart';

part 'notification_models.g.dart';

// ==================== ENUMS ====================

enum NotificationCategory {
  @JsonValue('assignments')
  assignments,
  @JsonValue('approvals')
  approvals,
  @JsonValue('financial')
  financial,
  @JsonValue('team')
  team,
  @JsonValue('system')
  system,
  @JsonValue('signatures')
  signatures,
  @JsonValue('calls')
  calls,
  @JsonValue('messages')
  messages,
}

enum NotificationPriority {
  @JsonValue('low')
  low,
  @JsonValue('medium')
  medium,
  @JsonValue('high')
  high,
  @JsonValue('urgent')
  urgent,
}

enum NotificationType {
  @JsonValue('info')
  info,
  @JsonValue('success')
  success,
  @JsonValue('warning')
  warning,
  @JsonValue('error')
  error,
}

enum RelatedEntityType {
  @JsonValue('siteVisit')
  siteVisit,
  @JsonValue('mmpFile')
  mmpFile,
  @JsonValue('transaction')
  transaction,
  @JsonValue('chat')
  chat,
  @JsonValue('call')
  call,
  @JsonValue('signature')
  signature,
  @JsonValue('document')
  document,
  @JsonValue('user')
  user,
}

// ==================== NOTIFICATION MODELS ====================

@JsonSerializable()
class AppNotification {
  final String id;
  final String userId;
  final String title;
  final String message;
  @JsonKey(fromJson: _notificationTypeFromJson, toJson: _notificationTypeToJson)
  final NotificationType type;
  @JsonKey(name: 'is_read')
  final bool isRead;
  @JsonKey(name: 'created_at')
  final DateTime createdAt;
  final String? link;
  @JsonKey(name: 'related_entity_id')
  final String? relatedEntityId;
  @JsonKey(name: 'related_entity_type', fromJson: _relatedEntityTypeFromJson, toJson: _relatedEntityTypeToJson)
  final RelatedEntityType? relatedEntityType;
  @JsonKey(fromJson: _notificationCategoryFromJson, toJson: _notificationCategoryToJson)
  final NotificationCategory? category;
  @JsonKey(fromJson: _notificationPriorityFromJson, toJson: _notificationPriorityToJson)
  final NotificationPriority? priority;
  @JsonKey(name: 'target_roles')
  final List<String>? targetRoles;
  @JsonKey(name: 'project_id')
  final String? projectId;

  AppNotification({
    required this.id,
    required this.userId,
    required this.title,
    required this.message,
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
      _$AppNotificationFromJson(json);

  Map<String, dynamic> toJson() => _$AppNotificationToJson(this);

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
      priority == NotificationPriority.urgent || priority == NotificationPriority.high;
}

// ==================== NOTIFICATION PREFERENCES ====================

@JsonSerializable()
class NotificationPreferences {
  final bool enabled;
  final bool email;
  final bool sound;
  @JsonKey(name: 'browser_push')
  final bool browserPush;
  final bool vibration;
  final Map<String, bool> categories;
  @JsonKey(name: 'quiet_hours')
  final QuietHours? quietHours;
  final String frequency; // 'instant', 'hourly', 'daily', 'weekly'
  @JsonKey(name: 'auto_delete_days')
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
  }) : categories = categories ??
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
      _$NotificationPreferencesFromJson(json);

  Map<String, dynamic> toJson() => _$NotificationPreferencesToJson(this);

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

@JsonSerializable()
class QuietHours {
  final bool enabled;
  @JsonKey(name: 'start_hour')
  final int startHour;
  @JsonKey(name: 'end_hour')
  final int endHour;
  final String? timezone;

  QuietHours({
    required this.enabled,
    required this.startHour,
    required this.endHour,
    this.timezone,
  });

  factory QuietHours.fromJson(Map<String, dynamic> json) =>
      _$QuietHoursFromJson(json);

  Map<String, dynamic> toJson() => _$QuietHoursToJson(this);

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

@JsonSerializable()
class NotificationTriggerOptions {
  final String userId;
  final String title;
  final String message;
  final NotificationType type;
  final NotificationCategory category;
  final NotificationPriority priority;
  final String? link;
  @JsonKey(name: 'related_entity_id')
  final String? relatedEntityId;
  @JsonKey(name: 'related_entity_type')
  final RelatedEntityType? relatedEntityType;
  @JsonKey(name: 'target_roles')
  final List<String>? targetRoles;
  @JsonKey(name: 'project_id')
  final String? projectId;
  @JsonKey(name: 'send_email')
  final bool sendEmail;
  @JsonKey(name: 'email_action_url')
  final String? emailActionUrl;
  @JsonKey(name: 'email_action_label')
  final String? emailActionLabel;

  NotificationTriggerOptions({
    required this.userId,
    required this.title,
    required this.message,
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

  factory NotificationTriggerOptions.fromJson(Map<String, dynamic> json) =>
      _$NotificationTriggerOptionsFromJson(json);

  Map<String, dynamic> toJson() => _$NotificationTriggerOptionsToJson(this);
}

// ==================== NOTIFICATION STATS ====================

@JsonSerializable()
class NotificationStats {
  final int total;
  final int unread;
  final int byCategory;
  @JsonKey(name: 'last_read_at')
  final DateTime? lastReadAt;

  NotificationStats({
    required this.total,
    required this.unread,
    required this.byCategory,
    this.lastReadAt,
  });

  factory NotificationStats.fromJson(Map<String, dynamic> json) =>
      _$NotificationStatsFromJson(json);

  Map<String, dynamic> toJson() => _$NotificationStatsToJson(this);
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
