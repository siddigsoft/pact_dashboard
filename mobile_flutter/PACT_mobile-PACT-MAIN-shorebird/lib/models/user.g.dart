// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UserLocation _$UserLocationFromJson(Map<String, dynamic> json) => UserLocation(
  latitude: (json['latitude'] as num?)?.toDouble(),
  longitude: (json['longitude'] as num?)?.toDouble(),
  accuracy: (json['accuracy'] as num?)?.toDouble(),
  region: json['region'] as String?,
  address: json['address'] as String?,
  isSharing: json['isSharing'] as bool? ?? false,
  lastUpdated: json['lastUpdated'] as String?,
);

Map<String, dynamic> _$UserLocationToJson(UserLocation instance) =>
    <String, dynamic>{
      'latitude': instance.latitude,
      'longitude': instance.longitude,
      'accuracy': instance.accuracy,
      'region': instance.region,
      'address': instance.address,
      'isSharing': instance.isSharing,
      'lastUpdated': instance.lastUpdated,
    };

UserPerformance _$UserPerformanceFromJson(Map<String, dynamic> json) =>
    UserPerformance(
      rating: (json['rating'] as num?)?.toDouble() ?? 0,
      totalCompletedTasks: (json['totalCompletedTasks'] as num?)?.toInt() ?? 0,
      onTimeCompletion: (json['onTimeCompletion'] as num?)?.toDouble() ?? 0,
      currentWorkload: (json['currentWorkload'] as num?)?.toInt(),
    );

Map<String, dynamic> _$UserPerformanceToJson(UserPerformance instance) =>
    <String, dynamic>{
      'rating': instance.rating,
      'totalCompletedTasks': instance.totalCompletedTasks,
      'onTimeCompletion': instance.onTimeCompletion,
      'currentWorkload': instance.currentWorkload,
    };

NotificationPreferences _$NotificationPreferencesFromJson(
  Map<String, dynamic> json,
) => NotificationPreferences(
  email: json['email'] as bool? ?? true,
  push: json['push'] as bool? ?? true,
  sms: json['sms'] as bool? ?? false,
);

Map<String, dynamic> _$NotificationPreferencesToJson(
  NotificationPreferences instance,
) => <String, dynamic>{
  'email': instance.email,
  'push': instance.push,
  'sms': instance.sms,
};

UserSettings _$UserSettingsFromJson(Map<String, dynamic> json) => UserSettings(
  language: json['language'] as String? ?? 'en',
  notificationPreferences: json['notificationPreferences'] == null
      ? null
      : NotificationPreferences.fromJson(
          json['notificationPreferences'] as Map<String, dynamic>,
        ),
  theme: json['theme'] as String? ?? 'system',
  defaultPage: json['defaultPage'] as String?,
  shareLocationWithTeam: json['shareLocationWithTeam'] as bool? ?? false,
  displayPersonalMetrics: json['displayPersonalMetrics'] as bool? ?? true,
);

Map<String, dynamic> _$UserSettingsToJson(UserSettings instance) =>
    <String, dynamic>{
      'language': instance.language,
      'notificationPreferences': instance.notificationPreferences,
      'theme': instance.theme,
      'defaultPage': instance.defaultPage,
      'shareLocationWithTeam': instance.shareLocationWithTeam,
      'displayPersonalMetrics': instance.displayPersonalMetrics,
    };

BankAccount _$BankAccountFromJson(Map<String, dynamic> json) => BankAccount(
  accountName: json['accountName'] as String,
  accountNumber: json['accountNumber'] as String,
  branch: json['branch'] as String,
);

Map<String, dynamic> _$BankAccountToJson(BankAccount instance) =>
    <String, dynamic>{
      'accountName': instance.accountName,
      'accountNumber': instance.accountNumber,
      'branch': instance.branch,
    };

UserClassification _$UserClassificationFromJson(Map<String, dynamic> json) =>
    UserClassification(
      level: json['level'] as String,
      roleScope: json['roleScope'] as String,
      hasRetainer: json['hasRetainer'] as bool? ?? false,
      retainerAmountCents: (json['retainerAmountCents'] as num?)?.toInt() ?? 0,
      retainerCurrency: json['retainerCurrency'] as String? ?? 'SDG',
      effectiveFrom: json['effectiveFrom'] as String,
      effectiveUntil: json['effectiveUntil'] as String?,
    );

Map<String, dynamic> _$UserClassificationToJson(UserClassification instance) =>
    <String, dynamic>{
      'level': instance.level,
      'roleScope': instance.roleScope,
      'hasRetainer': instance.hasRetainer,
      'retainerAmountCents': instance.retainerAmountCents,
      'retainerCurrency': instance.retainerCurrency,
      'effectiveFrom': instance.effectiveFrom,
      'effectiveUntil': instance.effectiveUntil,
    };

User _$UserFromJson(Map<String, dynamic> json) => User(
  id: json['id'] as String,
  name: json['name'] as String,
  email: json['email'] as String,
  password: json['password'] as String?,
  phone: json['phone'] as String?,
  status: json['status'] as String?,
  role: json['role'] as String,
  createdAt: json['createdAt'] as String?,
  updatedAt: json['updatedAt'] as String?,
  isApproved: json['isApproved'] as bool?,
  employeeId: json['employeeId'] as String?,
  phoneVerified: json['phoneVerified'] as bool? ?? false,
  phoneVerifiedAt: json['phoneVerifiedAt'] as String?,
  emailVerified: json['emailVerified'] as bool? ?? false,
  emailVerifiedAt: json['emailVerifiedAt'] as String?,
  stateId: json['stateId'] as String?,
  localityId: json['localityId'] as String?,
  hubId: json['hubId'] as String?,
  avatar: json['avatar'] as String?,
  username: json['username'] as String?,
  fullName: json['fullName'] as String?,
  lastActive: json['lastActive'] as String,
  performance: json['performance'] == null
      ? null
      : UserPerformance.fromJson(json['performance'] as Map<String, dynamic>),
  location: json['location'] == null
      ? null
      : UserLocation.fromJson(json['location'] as Map<String, dynamic>),
  settings: json['settings'] == null
      ? null
      : UserSettings.fromJson(json['settings'] as Map<String, dynamic>),
  availability: json['availability'] as String,
  roles: (json['roles'] as List<dynamic>?)
      ?.map((e) => $enumDecode(_$AppRoleEnumMap, e))
      .toList(),
  classification: json['classification'] == null
      ? null
      : UserClassification.fromJson(
          json['classification'] as Map<String, dynamic>,
        ),
  bankAccount: json['bankAccount'] == null
      ? null
      : BankAccount.fromJson(json['bankAccount'] as Map<String, dynamic>),
);

Map<String, dynamic> _$UserToJson(User instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'email': instance.email,
  'password': instance.password,
  'phone': instance.phone,
  'status': instance.status,
  'role': instance.role,
  'createdAt': instance.createdAt,
  'updatedAt': instance.updatedAt,
  'isApproved': instance.isApproved,
  'employeeId': instance.employeeId,
  'phoneVerified': instance.phoneVerified,
  'phoneVerifiedAt': instance.phoneVerifiedAt,
  'emailVerified': instance.emailVerified,
  'emailVerifiedAt': instance.emailVerifiedAt,
  'stateId': instance.stateId,
  'localityId': instance.localityId,
  'hubId': instance.hubId,
  'avatar': instance.avatar,
  'username': instance.username,
  'fullName': instance.fullName,
  'lastActive': instance.lastActive,
  'performance': instance.performance,
  'location': instance.location,
  'settings': instance.settings,
  'availability': instance.availability,
  'roles': instance.roles?.map((e) => _$AppRoleEnumMap[e]!).toList(),
  'classification': instance.classification,
  'bankAccount': instance.bankAccount,
};

const _$AppRoleEnumMap = {
  AppRole.dataCollector: 'dataCollector',
  AppRole.coordinator: 'coordinator',
  AppRole.supervisor: 'supervisor',
  AppRole.fieldOpManager: 'fieldOpManager',
  AppRole.fom: 'fom',
  AppRole.admin: 'admin',
};

UserRegister _$UserRegisterFromJson(Map<String, dynamic> json) => UserRegister(
  email: json['email'] as String,
  password: json['password'] as String,
  name: json['name'] as String,
  phone: json['phone'] as String?,
  role: json['role'] as String? ?? 'dataCollector',
  stateId: json['stateId'] as String?,
  localityId: json['localityId'] as String?,
  hubId: json['hubId'] as String?,
  avatar: json['avatar'] as String?,
  employeeId: json['employeeId'] as String?,
);

Map<String, dynamic> _$UserRegisterToJson(UserRegister instance) =>
    <String, dynamic>{
      'email': instance.email,
      'password': instance.password,
      'name': instance.name,
      'phone': instance.phone,
      'role': instance.role,
      'stateId': instance.stateId,
      'localityId': instance.localityId,
      'hubId': instance.hubId,
      'avatar': instance.avatar,
      'employeeId': instance.employeeId,
    };

UserLogin _$UserLoginFromJson(Map<String, dynamic> json) => UserLogin(
  email: json['email'] as String,
  password: json['password'] as String,
);

Map<String, dynamic> _$UserLoginToJson(UserLogin instance) => <String, dynamic>{
  'email': instance.email,
  'password': instance.password,
};

UserUpdateRequest _$UserUpdateRequestFromJson(Map<String, dynamic> json) =>
    UserUpdateRequest(
      name: json['name'] as String?,
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      role: json['role'] as String?,
      status: json['status'] as String?,
      avatar: json['avatar'] as String?,
      settings: json['settings'] == null
          ? null
          : UserSettings.fromJson(json['settings'] as Map<String, dynamic>),
      availability: json['availability'] as String?,
      location: json['location'] == null
          ? null
          : UserLocation.fromJson(json['location'] as Map<String, dynamic>),
      bankAccount: json['bankAccount'] == null
          ? null
          : BankAccount.fromJson(json['bankAccount'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$UserUpdateRequestToJson(UserUpdateRequest instance) =>
    <String, dynamic>{
      'name': instance.name,
      'email': instance.email,
      'phone': instance.phone,
      'role': instance.role,
      'status': instance.status,
      'avatar': instance.avatar,
      'settings': instance.settings,
      'availability': instance.availability,
      'location': instance.location,
      'bankAccount': instance.bankAccount,
    };
