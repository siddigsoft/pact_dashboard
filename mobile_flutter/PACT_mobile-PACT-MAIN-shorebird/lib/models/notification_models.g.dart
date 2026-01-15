// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'notification_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AppNotification _$AppNotificationFromJson(Map<String, dynamic> json) =>
    AppNotification(
      id: json['id'] as String,
      userId: json['userId'] as String,
      title: json['title'] as String,
      message: json['message'] as String,
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

Map<String, dynamic> _$AppNotificationToJson(
  AppNotification instance,
) => <String, dynamic>{
  'id': instance.id,
  'userId': instance.userId,
  'title': instance.title,
  'message': instance.message,
  'type': _notificationTypeToJson(instance.type),
  'is_read': instance.isRead,
  'created_at': instance.createdAt.toIso8601String(),
  'link': instance.link,
  'related_entity_id': instance.relatedEntityId,
  'related_entity_type': _relatedEntityTypeToJson(instance.relatedEntityType),
  'category': _notificationCategoryToJson(instance.category),
  'priority': _notificationPriorityToJson(instance.priority),
  'target_roles': instance.targetRoles,
  'project_id': instance.projectId,
};

NotificationPreferences _$NotificationPreferencesFromJson(
  Map<String, dynamic> json,
) => NotificationPreferences(
  enabled: json['enabled'] as bool? ?? true,
  email: json['email'] as bool? ?? true,
  sound: json['sound'] as bool? ?? true,
  browserPush: json['browser_push'] as bool? ?? true,
  vibration: json['vibration'] as bool? ?? true,
  categories: (json['categories'] as Map<String, dynamic>?)?.map(
    (k, e) => MapEntry(k, e as bool),
  ),
  quietHours: json['quiet_hours'] == null
      ? null
      : QuietHours.fromJson(json['quiet_hours'] as Map<String, dynamic>),
  frequency: json['frequency'] as String? ?? 'instant',
  autoDeleteDays: (json['auto_delete_days'] as num?)?.toInt() ?? 30,
);

Map<String, dynamic> _$NotificationPreferencesToJson(
  NotificationPreferences instance,
) => <String, dynamic>{
  'enabled': instance.enabled,
  'email': instance.email,
  'sound': instance.sound,
  'browser_push': instance.browserPush,
  'vibration': instance.vibration,
  'categories': instance.categories,
  'quiet_hours': instance.quietHours,
  'frequency': instance.frequency,
  'auto_delete_days': instance.autoDeleteDays,
};

QuietHours _$QuietHoursFromJson(Map<String, dynamic> json) => QuietHours(
  enabled: json['enabled'] as bool,
  startHour: (json['start_hour'] as num).toInt(),
  endHour: (json['end_hour'] as num).toInt(),
  timezone: json['timezone'] as String?,
);

Map<String, dynamic> _$QuietHoursToJson(QuietHours instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'start_hour': instance.startHour,
      'end_hour': instance.endHour,
      'timezone': instance.timezone,
    };

NotificationTriggerOptions _$NotificationTriggerOptionsFromJson(
  Map<String, dynamic> json,
) => NotificationTriggerOptions(
  userId: json['userId'] as String,
  title: json['title'] as String,
  message: json['message'] as String,
  type:
      $enumDecodeNullable(_$NotificationTypeEnumMap, json['type']) ??
      NotificationType.info,
  category:
      $enumDecodeNullable(_$NotificationCategoryEnumMap, json['category']) ??
      NotificationCategory.system,
  priority:
      $enumDecodeNullable(_$NotificationPriorityEnumMap, json['priority']) ??
      NotificationPriority.medium,
  link: json['link'] as String?,
  relatedEntityId: json['related_entity_id'] as String?,
  relatedEntityType: $enumDecodeNullable(
    _$RelatedEntityTypeEnumMap,
    json['related_entity_type'],
  ),
  targetRoles: (json['target_roles'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  projectId: json['project_id'] as String?,
  sendEmail: json['send_email'] as bool? ?? false,
  emailActionUrl: json['email_action_url'] as String?,
  emailActionLabel: json['email_action_label'] as String?,
);

Map<String, dynamic> _$NotificationTriggerOptionsToJson(
  NotificationTriggerOptions instance,
) => <String, dynamic>{
  'userId': instance.userId,
  'title': instance.title,
  'message': instance.message,
  'type': _$NotificationTypeEnumMap[instance.type]!,
  'category': _$NotificationCategoryEnumMap[instance.category]!,
  'priority': _$NotificationPriorityEnumMap[instance.priority]!,
  'link': instance.link,
  'related_entity_id': instance.relatedEntityId,
  'related_entity_type': _$RelatedEntityTypeEnumMap[instance.relatedEntityType],
  'target_roles': instance.targetRoles,
  'project_id': instance.projectId,
  'send_email': instance.sendEmail,
  'email_action_url': instance.emailActionUrl,
  'email_action_label': instance.emailActionLabel,
};

const _$NotificationTypeEnumMap = {
  NotificationType.info: 'info',
  NotificationType.success: 'success',
  NotificationType.warning: 'warning',
  NotificationType.error: 'error',
};

const _$NotificationCategoryEnumMap = {
  NotificationCategory.assignments: 'assignments',
  NotificationCategory.approvals: 'approvals',
  NotificationCategory.financial: 'financial',
  NotificationCategory.team: 'team',
  NotificationCategory.system: 'system',
  NotificationCategory.signatures: 'signatures',
  NotificationCategory.calls: 'calls',
  NotificationCategory.messages: 'messages',
};

const _$NotificationPriorityEnumMap = {
  NotificationPriority.low: 'low',
  NotificationPriority.medium: 'medium',
  NotificationPriority.high: 'high',
  NotificationPriority.urgent: 'urgent',
};

const _$RelatedEntityTypeEnumMap = {
  RelatedEntityType.siteVisit: 'siteVisit',
  RelatedEntityType.mmpFile: 'mmpFile',
  RelatedEntityType.transaction: 'transaction',
  RelatedEntityType.chat: 'chat',
  RelatedEntityType.call: 'call',
  RelatedEntityType.signature: 'signature',
  RelatedEntityType.document: 'document',
  RelatedEntityType.user: 'user',
};

NotificationStats _$NotificationStatsFromJson(Map<String, dynamic> json) =>
    NotificationStats(
      total: (json['total'] as num).toInt(),
      unread: (json['unread'] as num).toInt(),
      byCategory: (json['byCategory'] as num).toInt(),
      lastReadAt: json['last_read_at'] == null
          ? null
          : DateTime.parse(json['last_read_at'] as String),
    );

Map<String, dynamic> _$NotificationStatsToJson(NotificationStats instance) =>
    <String, dynamic>{
      'total': instance.total,
      'unread': instance.unread,
      'byCategory': instance.byCategory,
      'last_read_at': instance.lastReadAt?.toIso8601String(),
    };
