/// User role types in the PACT system
enum AppRole {
  dataCollector,
  coordinator,
  supervisor,
  fieldOpManager,
  fom,
  admin,
}

/// Classification levels for cost tracking
enum ClassificationLevel { level1, level2, level3 }

/// Classification role scope
enum ClassificationRoleScope { state, hub, national }

/// User availability status
enum UserAvailability { online, offline, busy }

/// User approval status
enum ApprovalStatus { pending, approved, rejected }

/// Location information with GPS coordinates and tracking
class UserLocation {
  final double? latitude;
  final double? longitude;
  final double? accuracy;
  final String? region;
  final String? address;
  final bool isSharing;
  final String? lastUpdated;

  UserLocation({
    this.latitude,
    this.longitude,
    this.accuracy,
    this.region,
    this.address,
    this.isSharing = false,
    this.lastUpdated,
  });

  factory UserLocation.fromJson(Map<String, dynamic> json) => UserLocation(
    latitude: (json['latitude'] as num?)?.toDouble(),
    longitude: (json['longitude'] as num?)?.toDouble(),
    accuracy: (json['accuracy'] as num?)?.toDouble(),
    region: json['region'] as String?,
    address: json['address'] as String?,
    isSharing: json['isSharing'] as bool? ?? false,
    lastUpdated: json['lastUpdated'] as String?,
  );

  Map<String, dynamic> toJson() => <String, dynamic>{
    'latitude': latitude,
    'longitude': longitude,
    'accuracy': accuracy,
    'region': region,
    'address': address,
    'isSharing': isSharing,
    'lastUpdated': lastUpdated,
  };

  UserLocation copyWith({
    double? latitude,
    double? longitude,
    double? accuracy,
    String? region,
    String? address,
    bool? isSharing,
    String? lastUpdated,
  }) {
    return UserLocation(
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      accuracy: accuracy ?? this.accuracy,
      region: region ?? this.region,
      address: address ?? this.address,
      isSharing: isSharing ?? this.isSharing,
      lastUpdated: lastUpdated ?? this.lastUpdated,
    );
  }
}

/// User performance metrics
class UserPerformance {
  final double rating;
  final int totalCompletedTasks;
  final double onTimeCompletion;
  final int? currentWorkload;

  UserPerformance({
    this.rating = 0,
    this.totalCompletedTasks = 0,
    this.onTimeCompletion = 0,
    this.currentWorkload,
  });

  factory UserPerformance.fromJson(Map<String, dynamic> json) =>
      UserPerformance(
        rating: (json['rating'] as num?)?.toDouble() ?? 0,
        totalCompletedTasks:
            (json['totalCompletedTasks'] as num?)?.toInt() ?? 0,
        onTimeCompletion: (json['onTimeCompletion'] as num?)?.toDouble() ?? 0,
        currentWorkload: (json['currentWorkload'] as num?)?.toInt(),
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
    'rating': rating,
    'totalCompletedTasks': totalCompletedTasks,
    'onTimeCompletion': onTimeCompletion,
    'currentWorkload': currentWorkload,
  };

  UserPerformance copyWith({
    double? rating,
    int? totalCompletedTasks,
    double? onTimeCompletion,
    int? currentWorkload,
  }) {
    return UserPerformance(
      rating: rating ?? this.rating,
      totalCompletedTasks: totalCompletedTasks ?? this.totalCompletedTasks,
      onTimeCompletion: onTimeCompletion ?? this.onTimeCompletion,
      currentWorkload: currentWorkload ?? this.currentWorkload,
    );
  }
}

/// Notification preferences (in user context)
class NotificationPreferences {
  final bool email;
  final bool push;
  final bool sms;

  NotificationPreferences({
    this.email = true,
    this.push = true,
    this.sms = false,
  });

  factory NotificationPreferences.fromJson(Map<String, dynamic> json) =>
      NotificationPreferences(
        email: json['email'] as bool? ?? true,
        push: json['push'] as bool? ?? true,
        sms: json['sms'] as bool? ?? false,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
    'email': email,
    'push': push,
    'sms': sms,
  };

  NotificationPreferences copyWith({bool? email, bool? push, bool? sms}) {
    return NotificationPreferences(
      email: email ?? this.email,
      push: push ?? this.push,
      sms: sms ?? this.sms,
    );
  }
}

/// User application settings
class UserSettings {
  final String? language;
  final NotificationPreferences? notificationPreferences;
  final String theme; // 'light', 'dark', 'system'
  final String? defaultPage;
  final bool shareLocationWithTeam;
  final bool displayPersonalMetrics;

  UserSettings({
    this.language = 'en',
    this.notificationPreferences,
    this.theme = 'system',
    this.defaultPage,
    this.shareLocationWithTeam = false,
    this.displayPersonalMetrics = true,
  });

  factory UserSettings.fromJson(Map<String, dynamic> json) => UserSettings(
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

  Map<String, dynamic> toJson() => <String, dynamic>{
    'language': language,
    'notificationPreferences': notificationPreferences,
    'theme': theme,
    'defaultPage': defaultPage,
    'shareLocationWithTeam': shareLocationWithTeam,
    'displayPersonalMetrics': displayPersonalMetrics,
  };

  UserSettings copyWith({
    String? language,
    NotificationPreferences? notificationPreferences,
    String? theme,
    String? defaultPage,
    bool? shareLocationWithTeam,
    bool? displayPersonalMetrics,
  }) {
    return UserSettings(
      language: language ?? this.language,
      notificationPreferences:
          notificationPreferences ?? this.notificationPreferences,
      theme: theme ?? this.theme,
      defaultPage: defaultPage ?? this.defaultPage,
      shareLocationWithTeam:
          shareLocationWithTeam ?? this.shareLocationWithTeam,
      displayPersonalMetrics:
          displayPersonalMetrics ?? this.displayPersonalMetrics,
    );
  }
}

/// Bank account information for payments
class BankAccount {
  final String accountName;
  final String accountNumber;
  final String branch;

  BankAccount({
    required this.accountName,
    required this.accountNumber,
    required this.branch,
  });

  factory BankAccount.fromJson(Map<String, dynamic> json) => BankAccount(
    accountName: json['accountName'] as String,
    accountNumber: json['accountNumber'] as String,
    branch: json['branch'] as String,
  );

  Map<String, dynamic> toJson() => <String, dynamic>{
    'accountName': accountName,
    'accountNumber': accountNumber,
    'branch': branch,
  };

  BankAccount copyWith({
    String? accountName,
    String? accountNumber,
    String? branch,
  }) {
    return BankAccount(
      accountName: accountName ?? this.accountName,
      accountNumber: accountNumber ?? this.accountNumber,
      branch: branch ?? this.branch,
    );
  }
}

/// User classification for cost and retainer tracking
class UserClassification {
  final String level; // level_1, level_2, level_3
  final String roleScope; // state, hub, national
  final bool hasRetainer;
  final int retainerAmountCents;
  final String retainerCurrency;
  final String effectiveFrom;
  final String? effectiveUntil;

  UserClassification({
    required this.level,
    required this.roleScope,
    this.hasRetainer = false,
    this.retainerAmountCents = 0,
    this.retainerCurrency = 'SDG',
    required this.effectiveFrom,
    this.effectiveUntil,
  });

  factory UserClassification.fromJson(Map<String, dynamic> json) =>
      UserClassification(
        level: json['level'] as String,
        roleScope: json['roleScope'] as String,
        hasRetainer: json['hasRetainer'] as bool? ?? false,
        retainerAmountCents:
            (json['retainerAmountCents'] as num?)?.toInt() ?? 0,
        retainerCurrency: json['retainerCurrency'] as String? ?? 'SDG',
        effectiveFrom: json['effectiveFrom'] as String,
        effectiveUntil: json['effectiveUntil'] as String?,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
    'level': level,
    'roleScope': roleScope,
    'hasRetainer': hasRetainer,
    'retainerAmountCents': retainerAmountCents,
    'retainerCurrency': retainerCurrency,
    'effectiveFrom': effectiveFrom,
    'effectiveUntil': effectiveUntil,
  };

  UserClassification copyWith({
    String? level,
    String? roleScope,
    bool? hasRetainer,
    int? retainerAmountCents,
    String? retainerCurrency,
    String? effectiveFrom,
    String? effectiveUntil,
  }) {
    return UserClassification(
      level: level ?? this.level,
      roleScope: roleScope ?? this.roleScope,
      hasRetainer: hasRetainer ?? this.hasRetainer,
      retainerAmountCents: retainerAmountCents ?? this.retainerAmountCents,
      retainerCurrency: retainerCurrency ?? this.retainerCurrency,
      effectiveFrom: effectiveFrom ?? this.effectiveFrom,
      effectiveUntil: effectiveUntil ?? this.effectiveUntil,
    );
  }
}

/// Main User model representing a PACT system user
class User {
  final String id;
  final String name;
  final String email;
  final String? password;
  final String? phone;
  final String? status;
  final String role;
  final String? createdAt;
  final String? updatedAt;
  final bool? isApproved;
  final String? employeeId;

  /// Phone verification status for signature methods
  final bool phoneVerified;
  final String? phoneVerifiedAt;

  /// Email verification status for signature methods
  final bool emailVerified;
  final String? emailVerifiedAt;

  /// State assignment for team members (data collectors, coordinators)
  final String? stateId;

  /// Locality assignment for team members
  final String? localityId;

  /// HUB-BASED SUPERVISION MODEL
  /// Hub assignment for supervisors and team members.
  /// Each hub manages MULTIPLE states.
  final String? hubId;

  final String? avatar;
  final String? username;
  final String? fullName;
  final String lastActive;
  final UserPerformance? performance;
  final UserLocation? location;
  final UserSettings? settings;
  final String availability; // 'online', 'offline', 'busy'
  final List<AppRole>? roles;

  /// Classification information (for coordinators, data collectors, supervisors)
  final UserClassification? classification;

  /// Bank account information for payments and financial transactions
  final BankAccount? bankAccount;

  User({
    required this.id,
    required this.name,
    required this.email,
    this.password,
    this.phone,
    this.status,
    required this.role,
    this.createdAt,
    this.updatedAt,
    this.isApproved,
    this.employeeId,
    this.phoneVerified = false,
    this.phoneVerifiedAt,
    this.emailVerified = false,
    this.emailVerifiedAt,
    this.stateId,
    this.localityId,
    this.hubId,
    this.avatar,
    this.username,
    this.fullName,
    required this.lastActive,
    this.performance,
    this.location,
    this.settings,
    required this.availability,
    this.roles,
    this.classification,
    this.bankAccount,
  });

  factory User.fromJson(Map<String, dynamic> json) => User(
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
        ?.map((e) => _appRoleFromString(e as String))
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

  Map<String, dynamic> toJson() => <String, dynamic>{
    'id': id,
    'name': name,
    'email': email,
    'password': password,
    'phone': phone,
    'status': status,
    'role': role,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
    'isApproved': isApproved,
    'employeeId': employeeId,
    'phoneVerified': phoneVerified,
    'phoneVerifiedAt': phoneVerifiedAt,
    'emailVerified': emailVerified,
    'emailVerifiedAt': emailVerifiedAt,
    'stateId': stateId,
    'localityId': localityId,
    'hubId': hubId,
    'avatar': avatar,
    'username': username,
    'fullName': fullName,
    'lastActive': lastActive,
    'performance': performance,
    'location': location,
    'settings': settings,
    'availability': availability,
    'roles': roles?.map(User._appRoleToString).toList(),
    'classification': classification,
    'bankAccount': bankAccount,
  };

  User copyWith({
    String? id,
    String? name,
    String? email,
    String? password,
    String? phone,
    String? status,
    String? role,
    String? createdAt,
    String? updatedAt,
    bool? isApproved,
    String? employeeId,
    bool? phoneVerified,
    String? phoneVerifiedAt,
    bool? emailVerified,
    String? emailVerifiedAt,
    String? stateId,
    String? localityId,
    String? hubId,
    String? avatar,
    String? username,
    String? fullName,
    String? lastActive,
    UserPerformance? performance,
    UserLocation? location,
    UserSettings? settings,
    String? availability,
    List<AppRole>? roles,
    UserClassification? classification,
    BankAccount? bankAccount,
  }) {
    return User(
      id: id ?? this.id,
      name: name ?? this.name,
      email: email ?? this.email,
      password: password ?? this.password,
      phone: phone ?? this.phone,
      status: status ?? this.status,
      role: role ?? this.role,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      isApproved: isApproved ?? this.isApproved,
      employeeId: employeeId ?? this.employeeId,
      phoneVerified: phoneVerified ?? this.phoneVerified,
      phoneVerifiedAt: phoneVerifiedAt ?? this.phoneVerifiedAt,
      emailVerified: emailVerified ?? this.emailVerified,
      emailVerifiedAt: emailVerifiedAt ?? this.emailVerifiedAt,
      stateId: stateId ?? this.stateId,
      localityId: localityId ?? this.localityId,
      hubId: hubId ?? this.hubId,
      avatar: avatar ?? this.avatar,
      username: username ?? this.username,
      fullName: fullName ?? this.fullName,
      lastActive: lastActive ?? this.lastActive,
      performance: performance ?? this.performance,
      location: location ?? this.location,
      settings: settings ?? this.settings,
      availability: availability ?? this.availability,
      roles: roles ?? this.roles,
      classification: classification ?? this.classification,
      bankAccount: bankAccount ?? this.bankAccount,
    );
  }

  /// Check if user has a specific role
  bool hasRole(AppRole role) {
    if (this.role == _appRoleToString(role)) return true;
    if (roles != null) {
      return roles!.contains(role);
    }
    return false;
  }

  /// Check if user is an admin
  bool get isAdmin =>
      role == 'admin' || (roles?.contains(AppRole.admin) ?? false);

  /// Check if user is approved
  bool get isApprovedUser => isApproved ?? false;

  /// Check if user is data collector
  bool get isDataCollector =>
      role == 'dataCollector' ||
      (roles?.contains(AppRole.dataCollector) ?? false);

  /// Check if user is supervisor
  bool get isSupervisor =>
      role == 'supervisor' || (roles?.contains(AppRole.supervisor) ?? false);

  /// Check if user is coordinator
  bool get isCoordinator =>
      role == 'coordinator' || (roles?.contains(AppRole.coordinator) ?? false);

  /// Check if user is available
  bool get isAvailable => availability == 'online';

  /// Check if user has location sharing enabled
  bool get sharesLocation => location?.isSharing ?? false;

  /// Get user's display name
  String getDisplayName() {
    if (fullName != null && fullName!.isNotEmpty) return fullName!;
    if (username != null && username!.isNotEmpty) return username!;
    return name;
  }

  /// Helper to convert AppRole to string
  static String _appRoleToString(AppRole role) {
    return role.toString().split('.').last;
  }
}

AppRole _appRoleFromString(String? value) {
  if (value == null) return AppRole.dataCollector;
  return AppRole.values.firstWhere(
    (e) => e.toString().split('.').last == value,
    orElse: () => AppRole.dataCollector,
  );
}

/// Registration request model
class UserRegister {
  final String email;
  final String password;
  final String name;
  final String? phone;
  final String? role;
  final String? stateId;
  final String? localityId;
  final String? hubId;
  final String? avatar;
  final String? employeeId;

  UserRegister({
    required this.email,
    required this.password,
    required this.name,
    this.phone,
    this.role = 'dataCollector',
    this.stateId,
    this.localityId,
    this.hubId,
    this.avatar,
    this.employeeId,
  });

  factory UserRegister.fromJson(Map<String, dynamic> json) => UserRegister(
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

  Map<String, dynamic> toJson() => <String, dynamic>{
    'email': email,
    'password': password,
    'name': name,
    'phone': phone,
    'role': role,
    'stateId': stateId,
    'localityId': localityId,
    'hubId': hubId,
    'avatar': avatar,
    'employeeId': employeeId,
  };
}

/// Login request model
class UserLogin {
  final String email;
  final String password;

  UserLogin({required this.email, required this.password});

  factory UserLogin.fromJson(Map<String, dynamic> json) => UserLogin(
    email: json['email'] as String,
    password: json['password'] as String,
  );

  Map<String, dynamic> toJson() => <String, dynamic>{
    'email': email,
    'password': password,
  };
}

/// User update request model
class UserUpdateRequest {
  final String? name;
  final String? email;
  final String? phone;
  final String? role;
  final String? status;
  final String? avatar;
  final UserSettings? settings;
  final String? availability;
  final UserLocation? location;
  final BankAccount? bankAccount;

  UserUpdateRequest({
    this.name,
    this.email,
    this.phone,
    this.role,
    this.status,
    this.avatar,
    this.settings,
    this.availability,
    this.location,
    this.bankAccount,
  });

  factory UserUpdateRequest.fromJson(Map<String, dynamic> json) =>
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

  Map<String, dynamic> toJson() => <String, dynamic>{
    'name': name,
    'email': email,
    'phone': phone,
    'role': role,
    'status': status,
    'avatar': avatar,
    'settings': settings,
    'availability': availability,
    'location': location,
    'bankAccount': bankAccount,
  };
}

/// Email verification state
class EmailVerificationState {
  final bool pending;
  final String? email;

  EmailVerificationState({this.pending = false, this.email});

  EmailVerificationState copyWith({bool? pending, String? email}) {
    return EmailVerificationState(
      pending: pending ?? this.pending,
      email: email ?? this.email,
    );
  }
}
